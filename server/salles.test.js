import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COULEURS_JOUEURS, ajouterJoueur, assezDeJoueurs, changerFormat, choisirMode, configurerFormat,
  creerSalle, demarrerPartie, deconnecterJoueur, fermerSalle, nouvelleAventure, passerApresPodium,
  peutRejouer, reconnecterJoueur, retirerJoueur, terminerPartie, trouverHoteParSocket, trouverSalle, vueJoueur, vueTv,
} from './salles.js';
import { modes, modesAVenir } from './modes/index.js';

test('le code de salle fait 4 lettres et deux salles ont des codes différents', () => {
  const a = creerSalle('tv1');
  const b = creerSalle('tv2');
  assert.match(a.code, /^[A-Z]{4}$/);
  assert.notEqual(a.code, b.code);
});

test('une salle se retrouve par son code, quelle que soit la casse', () => {
  const salle = creerSalle('tv');
  assert.equal(trouverSalle(salle.code.toLowerCase()), salle);
  assert.equal(trouverSalle('????'), null);
});

test('le premier joueur devient l\'hôte', () => {
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  ajouterJoueur(salle, 'Léa', 's2');
  assert.equal(salle.hoteId, paul.id);
});

test('les couleurs sont attribuées dans l\'ordre et une couleur libérée est réattribuée', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  assert.equal(a.couleur, COULEURS_JOUEURS[0]);
  assert.equal(b.couleur, COULEURS_JOUEURS[1]);

  retirerJoueur(salle, a.id);
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  assert.equal(c.couleur, COULEURS_JOUEURS[0]);
});

test('un pseudo déjà pris est refusé, sans tenir compte de la casse ni des espaces', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  assert.equal(ajouterJoueur(salle, 'paul', 's2').erreur.code, 'pseudo_pris');
  assert.equal(ajouterJoueur(salle, '  Paul  ', 's3').erreur.code, 'pseudo_pris');
});

test('les espaces autour du pseudo sont retirés', () => {
  const salle = creerSalle('tv');
  assert.equal(ajouterJoueur(salle, '  Léa ', 's1').joueur.pseudo, 'Léa');
});

test('un pseudo vide ou de plus de 12 caractères est refusé', () => {
  const salle = creerSalle('tv');
  assert.equal(ajouterJoueur(salle, '   ', 's1').erreur.code, 'pseudo_invalide');
  assert.equal(ajouterJoueur(salle, 'a'.repeat(13), 's2').erreur.code, 'pseudo_invalide');
  assert.ok(ajouterJoueur(salle, 'a'.repeat(12), 's3').joueur);
});

test('un 11e joueur est refusé, sauf si un joueur est déconnecté', () => {
  const salle = creerSalle('tv');
  for (let i = 1; i <= 10; i++) ajouterJoueur(salle, `J${i}`, `s${i}`);
  assert.equal(ajouterJoueur(salle, 'J11', 's11').erreur.code, 'salle_pleine');

  salle.joueurs[3].connecte = false;
  const { joueur } = ajouterJoueur(salle, 'J11', 's11');
  // Plus de couleur libre : il reprend celle du joueur déconnecté.
  assert.equal(joueur.couleur, salle.joueurs[3].couleur);
});

test('seul le socket de l\'hôte est reconnu comme hôte', () => {
  const salle = creerSalle('tv');
  const { joueur: hote } = ajouterJoueur(salle, 'Hôte', 'socket-hote');
  ajouterJoueur(salle, 'Autre', 'socket-autre');

  assert.equal(trouverHoteParSocket('socket-hote').joueur, hote);
  assert.equal(trouverHoteParSocket('socket-autre'), null);
  assert.equal(trouverHoteParSocket('socket-inconnu'), null);
});

test('il faut 2 joueurs connectés pour lancer, 1 seul en mode développeur', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 's1');
  assert.equal(assezDeJoueurs(salle), false);

  process.env.MODE_DEV = '1';
  assert.equal(assezDeJoueurs(salle), true);
  delete process.env.MODE_DEV;

  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  assert.equal(assezDeJoueurs(salle), true);
  b.connecte = false;
  assert.equal(assezDeJoueurs(salle), false);
});

test('si l\'hôte part, le rôle passe au joueur arrivé le plus tôt', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  b.arriveeA = a.arriveeA + 1;
  c.arriveeA = a.arriveeA + 2;

  retirerJoueur(salle, a.id);
  assert.equal(salle.hoteId, b.id);
  retirerJoueur(salle, b.id);
  retirerJoueur(salle, c.id);
  assert.equal(salle.hoteId, null);
});

test('le minimum de joueurs est celui du mode choisi', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 's1');
  ajouterJoueur(salle, 'B', 's2');
  assert.equal(assezDeJoueurs(salle), true);
  salle.mode = 'fictif';
  modes.fictif = { joueursMin: 3 };
  assert.equal(assezDeJoueurs(salle), false);
  delete modes.fictif;
});

test('lancer passe la salle en partie, terminer la passe au podium', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 's1');
  demarrerPartie(salle);
  assert.equal(salle.etat, 'partie');
  assert.equal(terminerPartie(salle), true);
  assert.equal(salle.etat, 'podium');
  assert.equal(terminerPartie(salle), false);
});

test('le téléphone reçoit le mode, et seul l\'hôte peut terminer, seulement en partie', () => {
  const salle = creerSalle('tv');
  const { joueur: hote } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: autre } = ajouterJoueur(salle, 'B', 's2');
  assert.equal(vueJoueur(salle, hote).mode, 'quiz');
  assert.equal(vueJoueur(salle, hote).peutTerminer, false);

  demarrerPartie(salle);
  assert.equal(vueJoueur(salle, hote).peutTerminer, true);
  assert.equal(vueJoueur(salle, autre).peutTerminer, false);

  terminerPartie(salle);
  assert.equal(vueJoueur(salle, hote).peutTerminer, false);
  assert.equal(vueJoueur(salle, hote).ecran, 'fin');
});

// --- Choix du mode ---

// Mode jouable fictif à 3 joueurs minimum, retiré du registre à la fin du test.
function avecModeFictif(t) {
  modes.fictif = {
    id: 'fictif',
    nom: 'Fictif',
    regleCourte: 'Pour les tests.',
    joueursMin: 3,
    demarrerPartie: (salle) => { salle.etatMode = { lancePar: 'fictif' }; },
    echeance: () => null,
    vueTv: () => ({}),
    vueJoueur: () => ({ ecran: 'fictif' }),
  };
  t.after(() => delete modes.fictif);
}

// Mode prévu fictif (« Bientôt »), retiré de modesAVenir à la fin du test.
function avecModeAVenir(t) {
  modesAVenir.push({
    id: 'futur', nom: 'Futur', regleCourte: 'Pour les tests.', joueursMin: 2,
  });
  t.after(() => modesAVenir.pop());
}

function salleAvec(nombre) {
  const salle = creerSalle('tv');
  const joueurs = [];
  for (let i = 1; i <= nombre; i++) joueurs.push(ajouterJoueur(salle, `J${i}`, `s${i}`).joueur);
  return { salle, joueurs };
}

test('choix du mode : une nouvelle salle est en quiz', () => {
  assert.equal(creerSalle('tv').mode, 'quiz');
});

test('choix du mode : un mode grisé est refusé, puis accepté quand le compte y est', (t) => {
  avecModeFictif(t);
  const { salle } = salleAvec(2);
  assert.equal(choisirMode(salle, 'fictif'), false);
  assert.equal(salle.mode, 'quiz');

  ajouterJoueur(salle, 'J3', 's3');
  assert.equal(choisirMode(salle, 'fictif'), true);
  assert.equal(salle.mode, 'fictif');
});

test('choix du mode : mode inconnu, mode à venir ou valeur bizarre refusés', (t) => {
  avecModeAVenir(t);
  const { salle } = salleAvec(10);
  for (const id of ['inconnu', 'futur', 'toString', '__proto__', null, 3]) {
    assert.equal(choisirMode(salle, id), false, String(id));
  }
  assert.equal(salle.mode, 'quiz');
});

test('choix du mode : refusé pendant une partie et au podium, accepté au tableau', (t) => {
  avecModeFictif(t);
  const { salle } = salleAvec(3);
  demarrerPartie(salle);
  assert.equal(choisirMode(salle, 'fictif'), false);

  terminerPartie(salle);
  assert.equal(choisirMode(salle, 'fictif'), false);
  passerApresPodium(salle);
  assert.equal(choisirMode(salle, 'fictif'), true);
});

test('choix du mode : le mode reste choisi quand un joueur part, et lancer devient impossible', (t) => {
  avecModeFictif(t);
  const { salle, joueurs } = salleAvec(3);
  choisirMode(salle, 'fictif');
  joueurs[2].connecte = false;
  assert.equal(salle.mode, 'fictif');
  assert.equal(assezDeJoueurs(salle), false);
  assert.equal(vueJoueur(salle, joueurs[0]).assezDeJoueurs, false);
});

test('choix du mode : rejouer lance le mode choisi', (t) => {
  avecModeFictif(t);
  const { salle } = salleAvec(3);
  demarrerPartie(salle);
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'fictif');
  demarrerPartie(salle);
  assert.equal(salle.etat, 'partie');
  assert.deepEqual(salle.etatMode, { lancePar: 'fictif' });
});

test('choix du mode : avec MODE_DEV=1, un seul joueur suffit pour tous les modes', (t) => {
  avecModeFictif(t);
  const { salle } = salleAvec(1);
  process.env.MODE_DEV = '1';
  t.after(() => delete process.env.MODE_DEV);
  assert.equal(choisirMode(salle, 'fictif'), true);
});

test('choix du mode : seul l\'hôte reçoit le sélecteur, avec les modes à venir grisés', (t) => {
  avecModeAVenir(t);
  const { salle, joueurs: [hote, autre] } = salleAvec(2);
  const { modes: liste, modeChoisi } = vueJoueur(salle, hote);
  assert.equal(modeChoisi, 'Quiz');
  assert.deepEqual(liste[0], { id: 'quiz', nom: 'Quiz', joueursMin: 2, disponible: true, bientot: false });
  assert.deepEqual(
    liste.slice(1).map((m) => [m.id, m.disponible, m.bientot]),
    [
      ['estimation', false, false], ['qui-de-nous', false, false], ['undercover', false, false],
      ['meme-reponse', false, false], ['bluff', false, false], ['futur', false, true],
    ],
  );
  assert.equal(vueJoueur(salle, autre).modes, undefined);
  assert.equal(vueJoueur(salle, autre).modeChoisi, 'Quiz');
});

test('choix du mode : la TV reçoit le mode choisi hors partie seulement', () => {
  const { salle } = salleAvec(1);
  assert.deepEqual(vueTv(salle).modeChoisi, {
    id: 'quiz',
    nom: 'Quiz',
    regleCourte: '10 questions, 4 choix : plus tu réponds vite, plus tu marques.',
    joueursMin: 2,
    assezDeJoueurs: false,
  });
  demarrerPartie(salle);
  assert.equal(vueTv(salle).modeChoisi, undefined);
  terminerPartie(salle);
  assert.equal(vueTv(salle).modeChoisi.nom, 'Quiz');
});

// --- Format, médailles et points globaux ---

// Partie de quiz terminée par l'hôte avec les scores donnés, dans l'ordre des joueurs.
function finirPartieAvec(salle, ...scores) {
  demarrerPartie(salle);
  salle.joueurs.forEach((joueur, index) => { joueur.score = scores[index]; });
  terminerPartie(salle);
}

test('format : petite partie par défaut, objectif de 3 à 15 en salle d\'attente seulement', () => {
  const { salle } = salleAvec(2);
  assert.deepEqual(salle.format, { type: 'petite', objectif: 5 });
  assert.equal(configurerFormat(salle, { type: 'aventure', objectif: 3 }), true);
  assert.deepEqual(salle.format, { type: 'aventure', objectif: 3 });
  for (const format of [
    { type: 'aventure', objectif: 2 }, { type: 'aventure', objectif: 16 }, { type: 'aventure', objectif: 4.5 },
    { type: 'marathon', objectif: 5 }, { type: 'petite' }, null,
  ]) {
    assert.equal(configurerFormat(salle, format), false, JSON.stringify(format));
  }
  demarrerPartie(salle);
  assert.equal(configurerFormat(salle, { type: 'petite', objectif: 5 }), false);
  assert.deepEqual(salle.format, { type: 'aventure', objectif: 3 });
});

test('fin de partie : médailles, points globaux et numéro de partie', () => {
  const { salle, joueurs: [a, b, c] } = salleAvec(3);
  finirPartieAvec(salle, 900, 900, 0);
  assert.equal(salle.numeroPartie, 1);
  assert.deepEqual(salle.medaillesPartie, { [a.id]: 'or', [b.id]: 'or' });
  assert.deepEqual([a.pointsGlobaux, b.pointsGlobaux, c.pointsGlobaux], [3, 3, 0]);
  assert.deepEqual(a.medailles, { or: 1, argent: 0, bronze: 0 });
  assert.deepEqual(
    [vueJoueur(salle, a).medaille, vueJoueur(salle, a).gain, vueJoueur(salle, c).medaille],
    ['or', 3, null],
  );
});

test('petite partie : podium, tableau, et « Rejouer » garde les points globaux', () => {
  const { salle, joueurs: [a, b] } = salleAvec(2);
  finirPartieAvec(salle, 500, 800);
  assert.equal(peutRejouer(salle), false);
  passerApresPodium(salle);
  assert.equal(salle.etat, 'tableau');
  assert.equal(peutRejouer(salle), true);
  assert.deepEqual(vueJoueur(salle, a).rangGlobal, 2);
  finirPartieAvec(salle, 800, 500);
  assert.deepEqual([a.pointsGlobaux, b.pointsGlobaux], [5, 5]);
  assert.equal(salle.numeroPartie, 2);
});

test('aventure : grand gagnant seul en tête à l\'objectif', () => {
  const { salle, joueurs: [a] } = salleAvec(3);
  configurerFormat(salle, { type: 'aventure', objectif: 3 });
  finirPartieAvec(salle, 300, 200, 100);
  passerApresPodium(salle);
  assert.equal(salle.etat, 'grandGagnant');
  assert.equal(salle.grandGagnantId, a.id);
  assert.equal(vueJoueur(salle, a).estGrandGagnant, true);
});

test('aventure : égalité en tête à l\'objectif, départage au tableau', () => {
  const { salle } = salleAvec(3);
  configurerFormat(salle, { type: 'aventure', objectif: 3 });
  finirPartieAvec(salle, 300, 300, 100);
  passerApresPodium(salle);
  assert.equal(salle.etat, 'tableau');
  assert.equal(vueTv(salle).departage, true);
});

test('aventure : sous l\'objectif, tableau sans départage', () => {
  const { salle } = salleAvec(2);
  configurerFormat(salle, { type: 'aventure', objectif: 5 });
  finirPartieAvec(salle, 300, 100);
  passerApresPodium(salle);
  assert.equal(salle.etat, 'tableau');
  assert.equal(vueTv(salle).departage, false);
  assert.deepEqual(vueTv(salle).tableau.map((ligne) => ligne.ecartAuLeader), [0, 1]);
});

test('nouvelle aventure : points, médailles et numéro de partie remis à 0, même objectif', () => {
  const { salle, joueurs: [a] } = salleAvec(2);
  configurerFormat(salle, { type: 'aventure', objectif: 3 });
  finirPartieAvec(salle, 300, 100);
  passerApresPodium(salle);
  nouvelleAventure(salle);
  assert.deepEqual([a.pointsGlobaux, a.medailles, salle.numeroPartie, salle.grandGagnantId],
    [0, { or: 0, argent: 0, bronze: 0 }, 0, null]);
  assert.deepEqual(salle.format, { type: 'aventure', objectif: 3 });
});

test('changer de format : retour en salle d\'attente, points gardés sauf après un grand gagnant', () => {
  const { salle, joueurs: [a] } = salleAvec(2);
  finirPartieAvec(salle, 300, 100);
  assert.equal(changerFormat(salle), false);
  passerApresPodium(salle);
  assert.equal(changerFormat(salle), true);
  assert.equal(salle.etat, 'lobby');
  assert.equal(a.pointsGlobaux, 3);

  configurerFormat(salle, { type: 'aventure', objectif: 3 });
  finirPartieAvec(salle, 300, 100);
  passerApresPodium(salle);
  assert.equal(salle.etat, 'grandGagnant');
  changerFormat(salle);
  assert.equal(a.pointsGlobaux, 0);
});

test('points globaux : un nouveau venu part de 0, un joueur reconnecté garde les siens', () => {
  const { salle, joueurs: [a] } = salleAvec(2);
  finirPartieAvec(salle, 300, 100);
  passerApresPodium(salle);
  const { joueur: nouveau } = ajouterJoueur(salle, 'Nouveau', 's9');
  assert.deepEqual([nouveau.pointsGlobaux, nouveau.medailles], [0, { or: 0, argent: 0, bronze: 0 }]);
  deconnecterJoueur(salle, a, () => {});
  reconnecterJoueur(salle, a.id, 's1-bis');
  assert.equal(vueJoueur(salle, a).pointsGlobaux, 3);
  fermerSalle(salle);
});
