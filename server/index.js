import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import {
  assezDeJoueurs, ajouterJoueur, creerSalle, erreur, retirerJoueur, synchroniserMinuteur,
  trouverHoteParSocket, trouverJoueurParSocket, trouverSalle, vueJoueur, vueTv,
} from './salles.js';
import {
  demarrerPartie, enregistrerReponse, passerALaSuite, reveler, tousOntRepondu,
} from './modes/quiz.js';

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
  const io = new Server(serveurHttp);

  const lienJoueur = (code) => `${urlPublique(serveurHttp.address().port)}/joueur?code=${code}`;

  function diffuser(salle) {
    synchroniserMinuteur(salle, diffuser);
    io.to(salle.tvSocketId).emit('salle:etat', { ...vueTv(salle), urlJoueur: lienJoueur(salle.code) });
    for (const joueur of salle.joueurs) {
      io.to(joueur.socketId).emit('joueur:etat', vueJoueur(salle, joueur));
    }
  }

  // Le journal des questions tirées permet de vérifier à l'œil qu'aucune ne se répète.
  function lancerPartie(salle) {
    demarrerPartie(salle);
    const ids = salle.etatMode.questions.map((question) => question.id);
    console.log(`Salle ${salle.code}, questions tirées : ${ids.join(' ')}`);
    diffuser(salle);
  }

  app.get('/tv',(req, res) => res.sendFile('tv/index.html', { root: dossierPublic }));
  app.get('/joueur', (req, res) => res.sendFile('joueur/index.html', { root: dossierPublic }));
  app.get('/sante', (req, res) => res.json({ ok: true }));
  app.get('/qr/:code.svg', async (req, res) => {
    const salle = trouverSalle(req.params.code);
    if (!salle) return res.sendStatus(404);
    const svg = await QRCode.toString(lienJoueur(salle.code), { type: 'svg', margin: 1 });
    res.type('svg').send(svg);
  });
  app.use(express.static(dossierPublic));

  io.on('connection', (socket) => {
    // Reconnexion à l'ancienne salle : tranche 6. Pour l'instant, toujours une nouvelle salle.
    socket.on('tv:creer', () => {
      diffuser(creerSalle(socket.id));
    });

    socket.on('joueur:rejoindre', (donnees = {}) => {
      const salle = trouverSalle(donnees.code);
      if (!salle) return socket.emit('erreur', erreur('salle_introuvable'));

      const resultat = ajouterJoueur(salle, donnees.pseudo, socket.id);
      if (resultat.erreur) return socket.emit('erreur', resultat.erreur);

      salle.derniereActiviteA = Date.now();
      diffuser(salle);
    });

    socket.on('hote:lancer', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve) return;
      const { salle } = trouve;
      if (salle.etat !== 'lobby' || !assezDeJoueurs(salle)) return;
      lancerPartie(salle);
    });

    socket.on('joueur:repondre', (choix) => {
      const trouve = trouverJoueurParSocket(socket.id);
      if (!trouve) return;
      const { salle, joueur } = trouve;
      if (!enregistrerReponse(salle, joueur.id, choix)) return;
      if (tousOntRepondu(salle)) reveler(salle);
      diffuser(salle);
    });

    socket.on('hote:suivant', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve || trouve.salle.etat !== 'revelation') return;
      passerALaSuite(trouve.salle);
      diffuser(trouve.salle);
    });

    socket.on('hote:rejouer', () => {
      const trouve = trouverHoteParSocket(socket.id);
      if (!trouve) return;
      const { salle } = trouve;
      if (salle.etat !== 'podium' || !assezDeJoueurs(salle)) return;
      lancerPartie(salle);
    });

    // Provisoire (tranche 2) : retrait immédiat. Délai de 10 s et reconnexion : tranche 6.
    socket.on('disconnect', () => {
      const trouve = trouverJoueurParSocket(socket.id);
      if (!trouve) return;
      const { salle, joueur } = trouve;
      retirerJoueur(salle, joueur.id);
      // Le joueur parti ne doit pas bloquer la manche.
      if (tousOntRepondu(salle)) reveler(salle);
      diffuser(salle);
    });
  });

  return new Promise((resolve) => {
    serveurHttp.listen(port, '0.0.0.0', () => resolve(serveurHttp));
  });
}

// Démarre le serveur seulement si ce fichier est lancé directement (pas depuis un test).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const serveur = await demarrerServeur(port);
  console.log(`Serveur lancé sur http://localhost:${port}`);
  console.log(`Adresse pour les téléphones : ${urlPublique(serveur.address().port)}`);
}
