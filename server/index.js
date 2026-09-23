import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import {
  ajouterJoueur, creerSalle, erreur, retirerJoueur,
  trouverJoueurParSocket, trouverSalle, vueJoueur,
} from './salles.js';

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

  function diffuserSalle(salle) {
    io.to(salle.tvSocketId).emit('salle:etat', { ...salle, urlJoueur: lienJoueur(salle.code) });
  }

  app.get('/tv', (req, res) => res.sendFile('tv/index.html', { root: dossierPublic }));
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
      diffuserSalle(creerSalle(socket.id));
    });

    socket.on('joueur:rejoindre', (donnees = {}) => {
      const salle = trouverSalle(donnees.code);
      if (!salle) return socket.emit('erreur', erreur('salle_introuvable'));

      const resultat = ajouterJoueur(salle, donnees.pseudo, socket.id);
      if (resultat.erreur) return socket.emit('erreur', resultat.erreur);

      salle.derniereActiviteA = Date.now();
      socket.emit('joueur:etat', vueJoueur(salle, resultat.joueur));
      diffuserSalle(salle);
    });

    // Provisoire (tranche 2) : retrait immédiat. Délai de 10 s et reconnexion : tranche 6.
    socket.on('disconnect', () => {
      const trouve = trouverJoueurParSocket(socket.id);
      if (!trouve) return;
      const { salle, joueur } = trouve;
      retirerJoueur(salle, joueur.id);
      diffuserSalle(salle);
      for (const autre of salle.joueurs) {
        io.to(autre.socketId).emit('joueur:etat', vueJoueur(salle, autre));
      }
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
