import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'socket.io';

const dossierPublic = fileURLToPath(new URL('../public', import.meta.url));

export function demarrerServeur(port) {
  const app = express();
  const serveurHttp = createServer(app);
  const io = new Server(serveurHttp);

  app.get('/tv', (req, res) => res.sendFile('tv/index.html', { root: dossierPublic }));
  app.get('/joueur', (req, res) => res.sendFile('joueur/index.html', { root: dossierPublic }));
  app.get('/sante', (req, res) => res.json({ ok: true }));
  app.use(express.static(dossierPublic));

  io.on('connection', (socket) => {
    // Provisoire (tranche 1) : relaie un message à tous les clients.
    socket.on('test:message', (texte) => {
      io.emit('test:message', String(texte).slice(0, 200));
    });
  });

  return new Promise((resolve) => {
    serveurHttp.listen(port, '0.0.0.0', () => resolve(serveurHttp));
  });
}

// Démarre le serveur seulement si ce fichier est lancé directement (pas depuis un test).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  await demarrerServeur(port);
  console.log(`Serveur lancé sur http://localhost:${port}`);
}
