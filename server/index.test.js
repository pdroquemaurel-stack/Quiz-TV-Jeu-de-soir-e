import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerServeur } from './index.js';
import { creerSalle, salles } from './salles.js';

test('/sante répond 200', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();

  const reponse = await fetch(`http://localhost:${port}/sante`);

  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  serveur.close();
});

// Client Socket.IO minimal sur le WebSocket natif de Node, pour éviter d'ajouter
// socket.io-client : « 40 » ouvre la connexion, « 42[...] » porte un événement.
function connecterClient(port) {
  const ws = new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`);
  const client = {
    evenements: [],
    emettre: (nom, donnees) => ws.send('42' + JSON.stringify([nom, donnees])),
    fermer: () => ws.close(),
  };
  return new Promise((resolve) => {
    ws.addEventListener('message', ({ data }) => {
      if (data.startsWith('0')) ws.send('40');
      else if (data.startsWith('40')) resolve(client);
      else if (data === '2') ws.send('3');
      else if (data.startsWith('42')) client.evenements.push(JSON.parse(data.slice(2)));
    });
  });
}

// Attend qu'un client ait reçu un nouvel événement du nom donné.
async function attendre(client, nom) {
  const deja = client.evenements.filter(([n]) => n === nom).length;
  while (client.evenements.filter(([n]) => n === nom).length === deja) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('seul l\'hôte peut terminer la partie', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();
  const salle = creerSalle('tv-test');
  const hote = await connecterClient(port);
  const autre = await connecterClient(port);

  hote.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Hôte' });
  await attendre(hote, 'joueur:etat');
  autre.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Autre' });
  await attendre(autre, 'joueur:etat');
  hote.emettre('hote:lancer');
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.etat, 'question');

  autre.emettre('hote:terminer');
  // L'autre joueur répond ensuite : quand il reçoit la mise à jour de sa réponse,
  // le serveur a forcément déjà traité son hote:terminer (même socket, même ordre).
  autre.emettre('joueur:repondre', 0);
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.etat, 'question');

  hote.emettre('hote:terminer');
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.etat, 'podium');

  // Salle retirée avant la déconnexion : aucun minuteur d'absence ne retient le test.
  delete salles[salle.code];
  hote.fermer();
  autre.fermer();
  await new Promise((resolve) => serveur.close(resolve));
});

test('/qr d\'une salle inconnue répond 404', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();

  const reponse = await fetch(`http://localhost:${port}/qr/ZZZZ.svg`);

  assert.equal(reponse.status, 404);
  serveur.close();
});
