import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attribuerMedailles, classementGlobal, estDepartage, passerAuPodium, trouverGrandGagnant,
} from './medailles.js';

const scores = (...liste) => liste.map((score, index) => ({ id: `j${index + 1}`, score }));
const globaux = (...liste) => liste.map((pointsGlobaux, index) => ({ id: `j${index + 1}`, pointsGlobaux }));

test('médailles : cas normal, le 4e n\'a rien', () => {
  assert.deepEqual(attribuerMedailles(scores(500, 3000, 1200, 2000)), {
    j2: 'or', j4: 'argent', j3: 'bronze',
  });
});

test('médailles : égalité en tête, deux ors puis un bronze', () => {
  assert.deepEqual(attribuerMedailles(scores(3000, 3000, 1000, 500)), {
    j1: 'or', j2: 'or', j3: 'bronze',
  });
});

test('médailles : égalité en 2e place, deux argents et pas de bronze', () => {
  assert.deepEqual(attribuerMedailles(scores(3000, 2000, 2000, 500)), {
    j1: 'or', j2: 'argent', j3: 'argent',
  });
});

test('médailles : un score de 0 ne rapporte rien, même sur le podium', () => {
  assert.deepEqual(attribuerMedailles(scores(800, 0, 0)), { j1: 'or' });
  assert.deepEqual(attribuerMedailles(scores(0, 0)), {});
});

test('médailles : à 2 joueurs, or et argent', () => {
  assert.deepEqual(attribuerMedailles(scores(700, 900)), { j2: 'or', j1: 'argent' });
});

test('grand gagnant : seul en tête et à l\'objectif', () => {
  assert.equal(trouverGrandGagnant(globaux(5, 3, 1), 5), 'j1');
  assert.equal(trouverGrandGagnant(globaux(7, 6), 5), 'j1');
});

test('grand gagnant : personne sous l\'objectif ou à égalité en tête', () => {
  assert.equal(trouverGrandGagnant(globaux(4, 3), 5), null);
  assert.equal(trouverGrandGagnant(globaux(6, 6, 2), 5), null);
  assert.equal(trouverGrandGagnant(globaux(0, 0), 3), null);
});

test('départage : égalité en tête au-dessus de l\'objectif seulement', () => {
  assert.equal(estDepartage(globaux(6, 6, 2), 5), true);
  assert.equal(estDepartage(globaux(4, 4), 5), false);
  assert.equal(estDepartage(globaux(6, 5), 5), false);
});

test('classement global : trié, ex æquo au même rang, écart au leader', () => {
  const lignes = classementGlobal(globaux(2, 5, 5, 0));
  assert.deepEqual(lignes.map((l) => [l.id, l.rang, l.ecartAuLeader]), [
    ['j2', 1, 0], ['j3', 1, 0], ['j1', 3, 3], ['j4', 4, 5],
  ]);
});

test('passer au podium : points globaux et médailles ajoutés aux joueurs', () => {
  const joueur = (id, score, pointsGlobaux) => ({
    id, score, pointsGlobaux, medailles: { or: 0, argent: 0, bronze: 0 },
  });
  const salle = { etat: 'partie', joueurs: [joueur('a', 900, 4), joueur('b', 900, 0), joueur('c', 0, 1)] };
  passerAuPodium(salle);
  assert.equal(salle.etat, 'podium');
  assert.deepEqual(salle.medaillesPartie, { a: 'or', b: 'or' });
  assert.deepEqual(salle.joueurs.map((j) => j.pointsGlobaux), [7, 3, 1]);
  assert.deepEqual(salle.joueurs[0].medailles, { or: 1, argent: 0, bronze: 0 });
});
