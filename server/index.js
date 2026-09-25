import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { journaliser, journaliserErreur } from './journal.js';
import {
  assezDeJoueurs, ajouterJoueur, changerFormat, choisirMode, configurerFormat, creerSalle,
  deconnecterJoueur, deconnecterTv, demarrerPartie, erreur, etapeCourante, nouvelleAventure,
  passerApresPodium, peutRejouer, reconnecterJoueur, reconnecterTv, statistiques,
  synchroniserMinuteur, terminerPartie, trouverHoteParSocket, trouverJoueurParSocket, trouverSalle,
  vueJoueur, vueTv,
} from './salles.js';
import { modes } from './modes/index.js';

const dossierPublic = fileURLToPath(new URL('../public', import.meta.url));

// Par défaut, l'IP du PC sur le Wi-Fi, pour que les téléphones puissent l'ouvrir.
function urlPublique(port) {
  if (process.env.URL_PUBLIQUE) return process.env.URL_PUBLIQUE.replace(/\/$/, '');
  const adresses = Object.values(networkInterfaces()).flat();
  const ipLocale = adresses.find((a) => a.family === 'IPv4' && !a.internal);
  return `http://${ipLocale ? ipLocale.address : 'localhost'}:${port}`;
}

export function demarrerServeur(port) {
  const app = express();
  const serveurHttp = createServer(app);
  // Une coupure réelle (4G perdue, écran verrouillé) est détectée en 20 s au plus,
  // au lieu de 45 s avec les réglages par défaut.
  const io = new Server(serveurHttp, { pingInterval: 10000, pingTimeout: 10000 });
  // Visible dans /sante : si l'heure change, le serveur a redémarré.
  const demarreA = new Date().toISOString();

  const lienJoueur = (code) => `${urlPublique(serveurHttp.address().port)}/joueur?code=${code}`;

  // Dernier état journalisé de chaque salle : une ligne à chaque changement.
  const etatsJournalises = new Map();

  function journaliserEtat(salle) {
    if (etatsJournalises.get(salle.code) === salle.etat) return;
    etatsJournalises.set(salle.code, salle.etat);
    journaliser(salle.code, salle.etat === 'partie' ? `partie ${salle.mode} lancée` : salle.etat);
  }

  function diffuser(salle) {
    journaliserEtat(salle);
    synchroniserMinuteur(salle, diffuser);
    if (salle.tvSocketId) {
      io.to(salle.tvSocketId).emit('salle:etat', { ...vueTv(salle), urlJoueur: lienJoueur(salle.code) });
    }
    for (const joueur of salle.joueurs) {
      if (joueur.connecte) io.to(joueur.socketId).emit('joueur:etat', vueJoueur(salle, joueur));
    }
  }

  // Le journal des tirages permet de vérifier à l'œil qu'aucun contenu ne se répète.
  // Il lit questionsVues, commune à tous les modes, et jamais etatMode.
  function lancerPartie(salle) {
    const dejaVues = new Set(salle.questionsVues);
    demarrerPartie(salle);
    const nouvelles = salle.questionsVues.filter((id) => !dejaVues.has(id));
    journaliser(salle.code, `tirages inédits : ${nouvelles.join(' ')} (${salle.questionsVues.length} vus dans la salle)`);
    diffuser(salle);
  }

  app.get('/tv',(req, res) => res.sendFile('tv/index.html', { root: dossierPublic }));
  app.get('/joueur', (req, res) => res.sendFile('joueur/index.html', { root: dossierPublic }));
  app.get('/sante', (req, res) => res.json({ ok: true, ...statistiques(), demarreA }));
  app.get('/qr/:code.svg', async (req, res) => {
    const salle = trouverSalle(req.params.code);
    if (!salle) return res.sendStatus(404);
    const svg = await QRCode.toString(lienJoueur(salle.code), { type: 'svg', margin: 1 });
    res.type('svg').send(svg);
  });
  app.use(express.static(dossierPublic));

  io.on('connection', (socket) => {
    // Une erreur imprévue dans une action est journalisée : elle ne perd que cette
    // action, jamais le serveur ni les autres salles.
    function surEvenement(nom, action) {
      socket.on(nom, (...donnees) => {
        try {
          action(...donnees);
        } catch (erreurImprevue) {
          journaliserErreur(`événement ${nom}`, erreurImprevue);
        }
      });
    }

    // Sans code ni jeton valides, une nouvelle salle est créée.
    surEvenement('tv:creer', (donnees) => {
      const { code, jetonTv } = donnees ?? {};
      diffuser(reconnecterTv(code, jetonTv, socket.id) ?? creerSalle(socket.id));
    });

    // Un id connu dans la salle : reconnexion. Sinon : nouveau joueur.
    surEvenement('joueur:rejoindre', (donnees) => {
      const { code, id, pseudo } = donnees ?? {};
      const salle = trouverSalle(code);
      if (!salle) return socket.emit('erreur', erreur('salle_introuvable'));

      // Ce socket joue déjà dans la salle (double appui sur « Entrer ») : pas de 2e joueur.
      if (trouverJoueurParSocket(socket.id)?.salle === salle) return diffuser(salle);

      if (!reconnecterJoueur(salle, id, socket.id)) {
        const resultat = ajouterJoueur(salle, pseudo, socket.id);
        if (resultat.erreur) return socket.emit('erreur', resultat.erreur);
      }
      diffuser(salle);
    });

    surEvenement('hote:lancer', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve) return;
      const { salle } = trouve;
      if (salle.etat !== 'lobby' || !assezDeJoueurs(salle)) return;
      lancerPartie(salle);
    });

    surEvenement('hote:choisirMode', (id) => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || !choisirMode(trouve.salle, id)) return;
      diffuser(trouve.salle);
    });

    surEvenement('joueur:repondre', (choix) => {
      const trouve = trouverJoueurParSocket(socket.id);
      if (!trouve) return;
      const { salle, joueur } = trouve;
      if (salle.etat !== 'partie') return;
      const mode = modes[salle.mode];
      if (!mode.enregistrerReponse(salle, joueur.id, choix)) return;
      mode.verifierFinAnticipee(salle);
      diffuser(salle);
    });

    surEvenement('hote:configurer', (format) => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || !configurerFormat(trouve.salle, format)) return;
      diffuser(trouve.salle);
    });

    // Pendant la partie, le « Suivant » du mode. Au podium, le passage au tableau.
    // Le téléphone envoie l'étape qu'il affiche : un « Suivant » d'une étape déjà
    // passée (double appui, chrono écoulé entre-temps) est ignoré.
    surEvenement('hote:suivant', (donnees) => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve) return;
      const { salle } = trouve;
      if (donnees?.etape !== etapeCourante(salle)) return;
      if (salle.etat === 'podium') passerApresPodium(salle);
      else if (salle.etat !== 'partie' || !modes[salle.mode].suivant(salle)) return;
      diffuser(salle);
    });

    surEvenement('hote:terminer', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || !terminerPartie(trouve.salle)) return;
      diffuser(trouve.salle);
    });

    // Depuis le tableau : partie suivante. Depuis le grand gagnant : nouvelle aventure.
    surEvenement('hote:rejouer', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || !peutRejouer(trouve.salle)) return;
      const { salle } = trouve;
      if (salle.etat === 'grandGagnant') nouvelleAventure(salle);
      lancerPartie(salle);
    });

    surEvenement('hote:changerFormat', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || !changerFormat(trouve.salle)) return;
      diffuser(trouve.salle);
    });

    // Un socket remplacé par une reconnexion n'est plus retrouvé : on l'ignore.
    surEvenement('disconnect', () => {
      deconnecterTv(socket.id);
      const trouve = trouverJoueurParSocket(socket.id);
      if (!trouve) return;
      const { salle, joueur } = trouve;
      deconnecterJoueur(salle, joueur, diffuser);
      // Le joueur parti ne doit pas bloquer la manche.
      if (salle.etat === 'partie') modes[salle.mode].verifierFinAnticipee(salle);
      diffuser(salle);
    });
  });

  return new Promise((resolve) => {
    serveurHttp.listen(port, '0.0.0.0', () => resolve(serveurHttp));
  });
}

// Démarre le serveur seulement si ce fichier est lancé directement (pas depuis un test).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Dernier filet : l'erreur complète part dans les logs Render avant l'arrêt.
  process.on('uncaughtException', (erreurFatale) => {
    console.error('[ERREUR FATALE]', erreurFatale);
    process.exit(1);
  });
  // Sans URL_PUBLIQUE, le QR code encoderait l'adresse interne du conteneur Render.
  if (process.env.RENDER && !process.env.URL_PUBLIQUE) {
    console.warn('ATTENTION : URL_PUBLIQUE n\'est pas définie sur Render, le QR code sera inutilisable.');
  }
  const port = Number(process.env.PORT) || 3000;
  const serveur = await demarrerServeur(port);
  console.log(`Serveur lancé sur http://localhost:${port}`);
  console.log(`Adresse pour les téléphones : ${urlPublique(serveur.address().port)}`);
}
