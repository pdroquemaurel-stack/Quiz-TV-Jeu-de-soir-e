import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COULEURS_JOUEURS, ajouterJoueur, assezDeJoueurs, choisirMode, creerSalle, demarrerPartie,
  retirerJoueur, terminerPartie, trouverHoteParSocket, trouverSalle, vueJoueur, vueTv,
} from './salles.js';
import { modes } from './modes/index.js';

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

test('choix du mode : mode inconnu, mode à venir ou valeur bizarre refusés', () => {
  const { salle } = salleAvec(10);
  for (const id of ['inconnu', 'undercover', 'bluff', 'toString', '__proto__', null, 3]) {
    assert.equal(choisirMode(salle, id), false, String(id));
  }
  assert.equal(salle.mode, 'quiz');
});

test('choix du mode : refusé pendant une partie, accepté au podium', (t) => {
  avecModeFictif(t);
  const { salle } = salleAvec(3);
  demarrerPartie(salle);
  assert.equal(choisirMode(salle, 'fictif'), false);

  terminerPartie(salle);
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

test('choix du mode : seul l\'hôte reçoit le sélecteur, avec les modes à venir grisés', () => {
  const { salle, joueurs: [hote, autre] } = salleAvec(2);
  const { modes: liste, modeChoisi } = vueJoueur(salle, hote);
  assert.equal(modeChoisi, 'Quiz');
  assert.deepEqual(liste[0], { id: 'quiz', nom: 'Quiz', joueursMin: 2, disponible: true, bientot: false });
  assert.deepEqual(
    liste.slice(1).map((m) => [m.id, m.disponible, m.bientot]),
    [
      ['estimation', false, false], ['qui-de-nous', false, true], ['undercover', false, true],
      ['meme-reponse', false, true], ['bluff', false, true],
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
