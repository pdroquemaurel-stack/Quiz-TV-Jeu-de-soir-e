import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerServeur } from './index.js';
import { creerSalle, fermerSalle, salles } from './salles.js';
import { modes } from './modes/index.js';

test('/sante répond 200 avec les salles, les joueurs connectés et l\'heure de démarrage', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();

  const reponse = await fetch(`http://localhost:${port}/sante`);

  assert.equal(reponse.status, 200);
  const sante = await reponse.json();
  assert.equal(sante.ok, true);
  assert.equal(typeof sante.salles, 'number');
  assert.equal(typeof sante.joueursConnectes, 'number');
  assert.ok(!Number.isNaN(Date.parse(sante.demarreA)));
  serveur.close();
});

// Client Socket.IO minimal sur le WebSocket natif de Node, pour éviter d'ajouter
// socket.io-client : « 40 » ouvre la connexion, « 42[...] » porte un événement.
function connecterClient(port) {
  const ws = new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`);
  const client = {
    evenements: [],
    ferme: false,
    emettre: (nom, donnees) => ws.send('42' + JSON.stringify([nom, donnees])),
    fermer: () => ws.close(),
  };
  ws.addEventListener('close', () => { client.ferme = true; });
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

// Attend qu'une condition sur la salle devienne vraie.
async function attendreQue(condition) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
}

const derniereVue = (client) => client.evenements.filter(([nom]) => nom === 'joueur:etat').at(-1)[1];

// Les messages d'un même socket sont traités dans l'ordre : quand cette reconnexion
// renvoie l'état, tout ce que le client a envoyé avant a été traité.
async function synchroniser(client, salle) {
  const { id, cle } = derniereVue(client);
  client.emettre('joueur:rejoindre', { code: salle.code, id, cle });
  await attendre(client, 'joueur:etat');
}

// Serveur, salle et joueurs connectés, tout refermé à la fin du test (même en échec).
async function ouvrirSalle(t, pseudos) {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();
  const salle = creerSalle('tv-test');
  const clients = [];
  t.after(async () => {
    for (const ouverte of Object.values(salles)) fermerSalle(ouverte);
    for (const client of clients) client.fermer();
    await new Promise((resolve) => serveur.close(resolve));
  });
  for (const pseudo of pseudos) {
    const client = await connecterClient(port);
    clients.push(client);
    client.emettre('joueur:rejoindre', { code: salle.code, pseudo });
    await attendre(client, 'joueur:etat');
  }
  return { port, salle, clients };
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
  assert.equal(salle.etat, 'partie');

  autre.emettre('hote:terminer');
  // L'autre joueur répond ensuite : quand il reçoit la mise à jour de sa réponse,
  // le serveur a forcément déjà traité son hote:terminer (même socket, même ordre).
  autre.emettre('joueur:repondre', 0);
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.etat, 'partie');

  hote.emettre('hote:terminer');
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.etat, 'podium');

  // Salle fermée avant la déconnexion : aucun minuteur (absence, podium) ne retient le test.
  fermerSalle(salle);
  hote.fermer();
  autre.fermer();
  await new Promise((resolve) => serveur.close(resolve));
});

// Le lancement passe par index.js : il ne doit dépendre du contenu d'aucun etatMode.
// Délai maximal : si le serveur plante, le test échoue au lieu d'attendre sans fin.
test('chaque mode du registre se lance et se termine par les événements', { timeout: 5000 }, async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();
  const salle = creerSalle('tv-test');
  const clients = [];
  for (const pseudo of ['A', 'B', 'C', 'D']) {
    const client = await connecterClient(port);
    client.emettre('joueur:rejoindre', { code: salle.code, pseudo });
    await attendre(client, 'joueur:etat');
    clients.push(client);
  }
  const [hote] = clients;

  for (const id of Object.keys(modes)) {
    hote.emettre('hote:choisirMode', id);
    await attendre(hote, 'joueur:etat');
    hote.emettre(salle.etat === 'lobby' ? 'hote:lancer' : 'hote:rejouer');
    await attendre(hote, 'joueur:etat');
    assert.equal(salle.etat, 'partie', id);
    assert.equal(salle.mode, id);
    hote.emettre('hote:terminer');
    await attendre(hote, 'joueur:etat');
    assert.equal(salle.etat, 'podium', id);
    hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
    await attendre(hote, 'joueur:etat');
    assert.equal(salle.etat, 'tableau', id);
  }

  fermerSalle(salle);
  for (const client of clients) client.fermer();
  await new Promise((resolve) => serveur.close(resolve));
});

test('/qr d\'une salle inconnue répond 404', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();

  const reponse = await fetch(`http://localhost:${port}/qr/ZZZZ.svg`);

  assert.equal(reponse.status, 404);
  serveur.close();
});

test('seul l\'hôte peut choisir le mode', async (t) => {
  modes.fictif = {
    id: 'fictif', nom: 'Fictif', regleCourte: '', joueursMin: 1, echeance: () => null, vueTv: () => ({}),
  };
  t.after(() => delete modes.fictif);
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();
  const salle = creerSalle('tv-test-mode');
  const hote = await connecterClient(port);
  const autre = await connecterClient(port);

  hote.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Hôte' });
  await attendre(hote, 'joueur:etat');
  autre.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Autre' });
  await attendre(autre, 'joueur:etat');
  const { id: idAutre, cle: cleAutre } = autre.evenements.at(-1)[1];

  autre.emettre('hote:choisirMode', 'fictif');
  // Sa reconnexion provoque une diffusion : quand elle arrive, son choix a été traité.
  autre.emettre('joueur:rejoindre', { code: salle.code, id: idAutre, cle: cleAutre });
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.mode, 'quiz');

  hote.emettre('hote:choisirMode', 'fictif');
  await attendre(autre, 'joueur:etat');
  assert.equal(salle.mode, 'fictif');
  assert.equal(autre.evenements.at(-1)[1].modeChoisi, 'Fictif');

  fermerSalle(salle);
  hote.fermer();
  autre.fermer();
  await new Promise((resolve) => serveur.close(resolve));
});

// --- Fiabilité (tranche 18) ---

const EVENEMENTS = [
  'tv:creer', 'joueur:rejoindre', 'joueur:repondre', 'hote:lancer', 'hote:choisirMode',
  'hote:configurer', 'hote:reglerMode', 'hote:suivant', 'hote:terminer', 'hote:rejouer',
  'hote:changerFormat',
];
const DONNEES_MALFORMEES = [null, 42, [], {}, 'texte', { code: {}, pseudo: [], id: 1, etape: 7 }];
// Envoyés par l'hôte, ceux-là changeraient l'état pour de bon : seul un non-hôte les envoie.
const ACTIONS_SANS_DONNEES = ['hote:lancer', 'hote:terminer', 'hote:rejouer', 'hote:changerFormat'];

test('données malformées sur chaque événement, dans chaque mode : le serveur tient', { timeout: 20000 }, async (t) => {
  const erreurs = t.mock.method(console, 'error', () => {});
  const { port, salle, clients } = await ouvrirSalle(t, ['A', 'B', 'C', 'D']);
  const [hote, autre] = clients;

  for (const id of Object.keys(modes)) {
    hote.emettre('hote:choisirMode', id);
    await attendre(hote, 'joueur:etat');
    hote.emettre(salle.etat === 'lobby' ? 'hote:lancer' : 'hote:rejouer');
    await attendre(hote, 'joueur:etat');
    // En Undercover, les réponses ne comptent qu'au vote.
    if (id === 'undercover') {
      hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
      await attendre(hote, 'joueur:etat');
    }

    for (const nom of EVENEMENTS) {
      for (const donnees of DONNEES_MALFORMEES) {
        autre.emettre(nom, donnees);
        if (!ACTIONS_SANS_DONNEES.includes(nom)) hote.emettre(nom, donnees);
      }
    }
    await synchroniser(autre, salle);
    await synchroniser(hote, salle);
    assert.equal(salle.etat, 'partie', id);
    assert.equal(salle.joueurs.length, 4, id);

    hote.emettre('hote:terminer');
    await attendre(hote, 'joueur:etat');
    hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
    await attendre(hote, 'joueur:etat');
    assert.equal(salle.etat, 'tableau', id);
  }

  // Au-delà de la taille maximale d'un message, Socket.IO coupe ce client, et lui seul.
  const gros = await connecterClient(port);
  clients.push(gros);
  gros.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'x'.repeat(1_000_000) });
  await attendreQue(() => gros.ferme);

  const sante = await (await fetch(`http://localhost:${port}/sante`)).json();
  assert.equal(sante.joueursConnectes, 4);
  assert.equal(erreurs.mock.callCount(), 0, 'aucune erreur imprévue, même rattrapée');
});

test('chaque action hote:* est refusée à un non-hôte', { timeout: 10000 }, async (t) => {
  const { salle, clients: [hote, autre] } = await ouvrirSalle(t, ['Hôte', 'Autre']);

  autre.emettre('hote:configurer', { type: 'aventure', objectif: 5 });
  autre.emettre('hote:reglerMode', { categories: ['sport'], difficulte: 'facile' });
  autre.emettre('hote:lancer');
  await synchroniser(autre, salle);
  assert.equal(salle.etat, 'lobby');
  assert.equal(salle.format.type, 'petite');
  assert.equal(derniereVue(autre).reglages.resume, 'Tous les thèmes · Normal');
  hote.emettre('hote:reglerMode', { categories: ['sport'], difficulte: 'facile' });
  await synchroniser(hote, salle);
  assert.equal(derniereVue(hote).reglages.resume, 'Sport · Facile');

  hote.emettre('hote:lancer');
  await attendreQue(() => salle.etat === 'partie' && salle.etatMode.phase === 'question');
  hote.emettre('joueur:repondre', 0);
  autre.emettre('joueur:repondre', 0);
  await attendreQue(() => salle.etatMode.phase === 'revelation');
  await synchroniser(autre, salle);
  const etapeRevelation = derniereVue(autre).etape;
  autre.emettre('hote:suivant', { etape: etapeRevelation });
  await synchroniser(autre, salle);
  assert.equal(derniereVue(autre).etape, etapeRevelation);

  hote.emettre('hote:terminer');
  await attendreQue(() => salle.etat === 'podium');
  await synchroniser(autre, salle);
  autre.emettre('hote:suivant', { etape: derniereVue(autre).etape });
  await synchroniser(autre, salle);
  assert.equal(salle.etat, 'podium');

  await synchroniser(hote, salle);
  hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
  await attendreQue(() => salle.etat === 'tableau');
  autre.emettre('hote:rejouer');
  autre.emettre('hote:changerFormat');
  await synchroniser(autre, salle);
  assert.equal(salle.etat, 'tableau');
});

test('double « Entrer » puis autre pseudo depuis le même socket : un seul joueur', { timeout: 5000 }, async (t) => {
  const { port, salle, clients } = await ouvrirSalle(t, ['Hôte']);
  const paul = await connecterClient(port);
  clients.push(paul);

  paul.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Paul' });
  paul.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Paul' });
  paul.emettre('joueur:rejoindre', { code: salle.code, pseudo: 'Paul2' });
  await attendreQue(() => paul.evenements.filter(([nom]) => nom === 'joueur:etat').length === 3);

  assert.deepEqual(salle.joueurs.map((joueur) => joueur.pseudo), ['Hôte', 'Paul']);
  assert.ok(!paul.evenements.some(([nom]) => nom === 'erreur'));
});

// --- Clé de reconnexion (tranche 22) ---

test('un intrus qui envoie l\'id d\'un autre joueur est refusé, et ce joueur garde sa place', { timeout: 5000 }, async (t) => {
  const { port, salle, clients } = await ouvrirSalle(t, ['Léa', 'Autre']);
  const [lea] = clients;
  const idLea = derniereVue(lea).id;
  const intrus = await connecterClient(port);
  clients.push(intrus);

  intrus.emettre('joueur:rejoindre', { code: salle.code, id: idLea });
  await attendre(intrus, 'erreur');
  intrus.emettre('joueur:rejoindre', { code: salle.code, id: idLea, cle: 'c_devinee', pseudo: 'Léa' });
  await attendre(intrus, 'erreur');

  assert.deepEqual(intrus.evenements.map(([nom, { code }]) => [nom, code]), [
    ['erreur', 'pseudo_invalide'], ['erreur', 'pseudo_pris'],
  ]);
  const vraieLea = salle.joueurs.find((joueur) => joueur.id === idLea);
  assert.equal(vraieLea.connecte, true);
  assert.equal(salle.hoteId, idLea);
  assert.equal(salle.joueurs.length, 2);
  await synchroniser(lea, salle);
  assert.equal(derniereVue(lea).estHote, true);
});

test('dans chaque mode, la clé d\'un joueur ne part ni vers la TV ni vers les autres', { timeout: 10000 }, async (t) => {
  const { port, salle, clients } = await ouvrirSalle(t, ['A', 'B', 'C', 'D']);
  const joueurs = [...clients];
  const [hote] = joueurs;
  const tv = await connecterClient(port);
  clients.push(tv);
  tv.emettre('tv:creer', { code: salle.code, jetonTv: salle.jetonTv });
  await attendre(tv, 'salle:etat');

  for (const id of Object.keys(modes)) {
    hote.emettre('hote:choisirMode', id);
    await attendre(hote, 'joueur:etat');
    hote.emettre(salle.etat === 'lobby' ? 'hote:lancer' : 'hote:rejouer');
    await attendre(hote, 'joueur:etat');
    hote.emettre('hote:terminer');
    await attendre(hote, 'joueur:etat');
    hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
    await attendre(hote, 'joueur:etat');
    assert.equal(salle.etat, 'tableau', id);
  }
  // Une dernière diffusion, reçue par la TV : tout ce qui précède l'a été aussi.
  const recusParTv = tv.evenements.length;
  await synchroniser(hote, salle);
  await attendreQue(() => tv.evenements.length > recusParTv);

  const recu = (client) => JSON.stringify(client.evenements);
  for (const joueur of salle.joueurs) {
    assert.ok(!recu(tv).includes(joueur.cle), 'TV');
    for (const client of joueurs) {
      const sienne = derniereVue(client).id === joueur.id;
      assert.equal(recu(client).includes(joueur.cle), sienne, joueur.pseudo);
    }
  }
});

// Chaque question est précédée de 2,5 s de transition : 10 questions prennent 25 s.
test('double « Suivant » à la 10e révélation du quiz : le podium n\'est pas sauté', { timeout: 40000 }, async (t) => {
  const { salle, clients } = await ouvrirSalle(t, ['Hôte', 'Autre']);
  const [hote] = clients;
  hote.emettre('hote:lancer');

  for (let numero = 1; numero <= 10; numero++) {
    await attendreQue(() => salle.etat === 'partie' && salle.etatMode.phase === 'question');
    for (const client of clients) client.emettre('joueur:repondre', 0);
    await attendreQue(() => salle.etatMode.phase === 'revelation');
    await synchroniser(hote, salle);
    const { etape } = derniereVue(hote);
    if (numero === 1) {
      // Sans étape (ancienne page en cache) : ignoré.
      hote.emettre('hote:suivant');
      await synchroniser(hote, salle);
      assert.equal(derniereVue(hote).etape, etape);
    }
    hote.emettre('hote:suivant', { etape });
    if (numero === 10) hote.emettre('hote:suivant', { etape });
  }

  await synchroniser(hote, salle);
  assert.equal(salle.etat, 'podium');
});

test('double « Suivant » à l\'élimination en Undercover : le tour de description s\'affiche', { timeout: 10000 }, async (t) => {
  const { salle, clients } = await ouvrirSalle(t, ['A', 'B', 'C', 'D']);
  const [hote] = clients;
  hote.emettre('hote:choisirMode', 'undercover');
  await attendre(hote, 'joueur:etat');
  hote.emettre('hote:lancer');
  await attendre(hote, 'joueur:etat');
  hote.emettre('hote:suivant', { etape: derniereVue(hote).etape });
  await attendreQue(() => salle.etatMode.phase === 'vote');

  // Tous désignent un civil, qui désigne quelqu'un d'autre : 3 civils moins un, la manche continue.
  const idDe = (client) => derniereVue(client).id;
  const cible = clients.find((client) => salle.etatMode.roles[idDe(client)] === 'civil');
  const autreQueCible = clients.find((client) => client !== cible);
  for (const client of clients) client.emettre('joueur:repondre', idDe(client === cible ? autreQueCible : cible));
  await attendreQue(() => salle.etatMode.phase === 'elimination');

  await synchroniser(hote, salle);
  const { etape } = derniereVue(hote);
  hote.emettre('hote:suivant', { etape });
  hote.emettre('hote:suivant', { etape });
  await synchroniser(hote, salle);
  assert.equal(salle.etatMode.phase, 'description');
});
