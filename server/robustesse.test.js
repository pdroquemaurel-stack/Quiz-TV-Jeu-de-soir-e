import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELAI_ABSENCE_MS, DELAI_FERMETURE_MS, ajouterJoueur, creerSalle, deconnecterJoueur,
  deconnecterTv, reconnecterJoueur, reconnecterTv, trouverSalle,
} from './salles.js';
import { demarrerPartie } from './modes/quiz.js';

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

// Remplace diffuser() : on compte seulement les appels.
function espion() {
  const quandChange = () => { quandChange.appels++; };
  quandChange.appels = 0;
  return quandChange;
}

// Chaque salle a son propre socket TV, pour que deconnecterTv trouve la bonne.
let numeroTv = 0;

// Trois joueurs arrivés à 1 ms d'intervalle : A (hôte), B, C.
function salleATrois(t) {
  const salle = creerSalle(`tv-${++numeroTv}`);
  const { joueur: a } = ajouterJoueur(salle, 'A', 'sA');
  t.mock.timers.tick(1);
  const { joueur: b } = ajouterJoueur(salle, 'B', 'sB');
  t.mock.timers.tick(1);
  const { joueur: c } = ajouterJoueur(salle, 'C', 'sC');
  return { salle, a, b, c };
}

const trouverJoueur = (salle, id) => salle.joueurs.find((joueur) => joueur.id === id);

// --- Reconnexion d'un joueur ---

test('reconnexion : même pseudo, même score, même couleur, nouveau socket, sans doublon', (t) => {
  simulerTemps(t);
  const { salle, b } = salleATrois(t);
  demarrerPartie(salle);
  b.score = 2740;
  const couleur = b.couleur;

  deconnecterJoueur(salle, b, espion());
  assert.equal(b.connecte, false);
  t.mock.timers.tick(60000);

  const revenu = reconnecterJoueur(salle, b.id, 'sB2');
  assert.equal(revenu, b);
  assert.equal(revenu.pseudo, 'B');
  assert.equal(revenu.score, 2740);
  assert.equal(revenu.couleur, couleur);
  assert.equal(revenu.connecte, true);
  assert.equal(revenu.socketId, 'sB2');
  assert.equal(salle.joueurs.length, 3);
});

test('reconnexion : un id inconnu dans la salle est refusé', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 'sA');
  assert.equal(reconnecterJoueur(salle, 'j_inconnu', 's2'), null);
  assert.equal(reconnecterJoueur(salle, undefined, 's2'), null);
});

// --- Salle d'attente ---

test('salle d\'attente : un joueur déconnecté est retiré après 10 s, pas avant', (t) => {
  simulerTemps(t);
  const { salle, c } = salleATrois(t);
  const quandChange = espion();

  deconnecterJoueur(salle, c, quandChange);
  t.mock.timers.tick(DELAI_ABSENCE_MS - 1);
  assert.ok(trouverJoueur(salle, c.id));
  assert.equal(quandChange.appels, 0);

  t.mock.timers.tick(1);
  assert.equal(trouverJoueur(salle, c.id), undefined);
  assert.equal(quandChange.appels, 1);
});

test('salle d\'attente : un joueur revenu avant 10 s n\'est pas retiré', (t) => {
  simulerTemps(t);
  const { salle, c } = salleATrois(t);

  deconnecterJoueur(salle, c, espion());
  t.mock.timers.tick(5000);
  reconnecterJoueur(salle, c.id, 'sC2');
  t.mock.timers.tick(60000);

  assert.ok(trouverJoueur(salle, c.id));
});

test('salle d\'attente : l\'hôte retiré cède son rôle au joueur connecté le plus ancien', (t) => {
  simulerTemps(t);
  const { salle, a, b } = salleATrois(t);

  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(DELAI_ABSENCE_MS);

  assert.equal(trouverJoueur(salle, a.id), undefined);
  assert.equal(salle.hoteId, b.id);
});

// --- Pendant une partie ---

test('partie : un joueur déconnecté n\'est jamais retiré', (t) => {
  simulerTemps(t);
  const { salle, c } = salleATrois(t);
  demarrerPartie(salle);

  deconnecterJoueur(salle, c, espion());
  t.mock.timers.tick(DELAI_ABSENCE_MS);
  t.mock.timers.tick(60 * 60 * 1000);

  assert.ok(trouverJoueur(salle, c.id));
  assert.equal(c.connecte, false);
});

// --- Transfert de l'hôte ---

test('hôte : transfert après 10 s, pas avant, au joueur connecté arrivé le plus tôt', (t) => {
  simulerTemps(t);
  const { salle, a, b, c } = salleATrois(t);
  demarrerPartie(salle);

  // B est plus ancien que C, mais déconnecté : c'est C qui doit recevoir le rôle.
  deconnecterJoueur(salle, b, espion());
  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(DELAI_ABSENCE_MS - 1);
  assert.equal(salle.hoteId, a.id);

  t.mock.timers.tick(1);
  assert.equal(salle.hoteId, c.id);
});

test('hôte : pas de transfert si aucun autre joueur n\'est connecté', (t) => {
  simulerTemps(t);
  const { salle, a, b, c } = salleATrois(t);
  demarrerPartie(salle);

  deconnecterJoueur(salle, b, espion());
  deconnecterJoueur(salle, c, espion());
  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(60000);

  assert.equal(salle.hoteId, a.id);
});

test('hôte : sans successeur à 10 s, le rôle passe au premier joueur qui se reconnecte', (t) => {
  simulerTemps(t);
  const { salle, a, b, c } = salleATrois(t);
  demarrerPartie(salle);

  deconnecterJoueur(salle, b, espion());
  deconnecterJoueur(salle, c, espion());
  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(60000);
  reconnecterJoueur(salle, c.id, 'sC2');

  assert.equal(salle.hoteId, c.id);
});

test('hôte : l\'ancien hôte qui revient ne récupère pas le rôle', (t) => {
  simulerTemps(t);
  const { salle, a, b } = salleATrois(t);
  demarrerPartie(salle);

  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(DELAI_ABSENCE_MS);
  reconnecterJoueur(salle, a.id, 'sA2');

  assert.equal(salle.hoteId, b.id);
});

test('hôte : revenu avant 10 s, il reste l\'hôte', (t) => {
  simulerTemps(t);
  const { salle, a } = salleATrois(t);
  demarrerPartie(salle);

  deconnecterJoueur(salle, a, espion());
  t.mock.timers.tick(5000);
  reconnecterJoueur(salle, a.id, 'sA2');
  t.mock.timers.tick(60000);

  assert.equal(salle.hoteId, a.id);
});

// --- Fermeture des salles ---

function toutDeconnecter(salle) {
  deconnecterTv(salle.tvSocketId);
  for (const joueur of salle.joueurs) deconnecterJoueur(salle, joueur, espion());
}

test('fermeture : la salle est fermée après 30 min sans aucune connexion, pas avant', (t) => {
  simulerTemps(t);
  const { salle } = salleATrois(t);
  demarrerPartie(salle);

  toutDeconnecter(salle);
  t.mock.timers.tick(DELAI_FERMETURE_MS - 1);
  assert.equal(trouverSalle(salle.code), salle);

  t.mock.timers.tick(1);
  assert.equal(trouverSalle(salle.code), null);
});

test('fermeture : jamais tant que la TV est connectée', (t) => {
  simulerTemps(t);
  const { salle } = salleATrois(t);
  for (const joueur of salle.joueurs) deconnecterJoueur(salle, joueur, espion());

  t.mock.timers.tick(DELAI_ABSENCE_MS);
  t.mock.timers.tick(2 * 60 * 60 * 1000);
  assert.equal(trouverSalle(salle.code), salle);
});

test('fermeture : une reconnexion annule la fermeture prévue', (t) => {
  simulerTemps(t);
  const { salle, b } = salleATrois(t);
  demarrerPartie(salle);

  toutDeconnecter(salle);
  t.mock.timers.tick(20 * 60 * 1000);
  reconnecterJoueur(salle, b.id, 'sB2');
  t.mock.timers.tick(60 * 60 * 1000);

  assert.equal(trouverSalle(salle.code), salle);
});

// --- Reconnexion de la TV ---

test('TV : reconnexion acceptée avec le bon jeton, refusée sinon', () => {
  const salle = creerSalle('tv1');

  assert.equal(reconnecterTv(salle.code, 'mauvais', 'tv2'), null);
  assert.equal(reconnecterTv(salle.code, undefined, 'tv2'), null);
  assert.equal(reconnecterTv('????', salle.jetonTv, 'tv2'), null);
  assert.equal(salle.tvSocketId, 'tv1');

  assert.equal(reconnecterTv(salle.code, salle.jetonTv, 'tv2'), salle);
  assert.equal(salle.tvSocketId, 'tv2');
});
