import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORE_MAX, ajouterJoueur, creerSalle, demarrerPartie, fermerSalle, mettreEnPause, modifierScore,
  passerApresPodium, reprendrePartie, synchroniserMinuteur, terminerPartie,
} from './salles.js';
import { vueJoueur } from './vues.js';
import { decalerHeures, questionCourante } from './modes/commun.js';
import { modes } from './modes/index.js';
import * as petitBac from './modes/petit-bac.js';
import * as quiz from './modes/quiz.js';

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

// Une partie lancée à 4 joueurs, refermée à la fin du test (ses minuteurs avec).
function partieA4(t, mode) {
  const salle = creerSalle(`tv-pause-${mode}`);
  for (const pseudo of ['A', 'B', 'C', 'D']) ajouterJoueur(salle, pseudo, `s${pseudo}-${mode}`);
  salle.mode = mode;
  demarrerPartie(salle);
  t.after(() => fermerSalle(salle));
  return salle;
}

// Remplace diffuser() : chaque changement reprogramme le minuteur, comme index.js.
function diffuser(salle) {
  synchroniserMinuteur(salle, diffuser);
}

test('pause : seulement pendant une partie, une fois ; reprise seulement en pause', (t) => {
  simulerTemps(t);
  const salle = creerSalle('tv-pause-etats');
  t.after(() => fermerSalle(salle));
  ajouterJoueur(salle, 'A', 'sA-etats');
  assert.equal(mettreEnPause(salle), false);
  demarrerPartie(salle);
  assert.equal(reprendrePartie(salle), false);
  assert.equal(mettreEnPause(salle), true);
  assert.equal(mettreEnPause(salle), false);
  assert.equal(reprendrePartie(salle), true);
  assert.equal(salle.pause, null);
});

test('pause : terminer la partie depuis la pause passe au podium sans pause', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  mettreEnPause(salle);
  assert.equal(terminerPartie(salle), true);
  assert.equal(salle.etat, 'podium');
  assert.equal(salle.pause, null);
});

test('pause : le chrono du serveur s\'arrête puis repart avec le temps qui lui restait', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  diffuser(salle);
  t.mock.timers.tick(quiz.DUREE_TRANSITION_MS + 5000);
  assert.equal(salle.etatMode.phase, 'question');
  const restantAvant = quiz.vueTv(salle).tempsRestantMs;

  mettreEnPause(salle);
  diffuser(salle);
  t.mock.timers.tick(10 * 60 * 1000);
  assert.equal(salle.etatMode.phase, 'question');
  assert.equal(quiz.vueTv(salle).tempsRestantMs, restantAvant, 'chrono affiché figé pendant la pause');

  reprendrePartie(salle);
  diffuser(salle);
  assert.equal(quiz.vueTv(salle).tempsRestantMs, restantAvant);
  t.mock.timers.tick(restantAvant - 1);
  assert.equal(salle.etatMode.phase, 'question');
  t.mock.timers.tick(1);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('pause : une réponse donnée avant la pause garde ses points de rapidité', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  t.mock.timers.tick(quiz.DUREE_TRANSITION_MS);
  quiz.avancer(salle);
  const [a] = salle.joueurs;
  t.mock.timers.tick(4000);
  quiz.enregistrerReponse(salle, a.id, questionCourante(salle).bonneReponse);
  mettreEnPause(salle);
  t.mock.timers.tick(30000);
  reprendrePartie(salle);
  t.mock.timers.tick(1000);
  quiz.reveler(salle);
  assert.equal(a.score, quiz.calculerPoints(4000));
});

test('pause : dans chaque mode, l\'échéance recule exactement de la durée de la pause', (t) => {
  simulerTemps(t);
  for (const id of Object.keys(modes)) {
    const salle = partieA4(t, id);
    t.mock.timers.tick(1000);
    const avant = modes[id].echeance(salle);
    mettreEnPause(salle);
    t.mock.timers.tick(45000);
    reprendrePartie(salle);
    const apres = modes[id].echeance(salle);
    assert.equal(apres, avant === null ? null : avant + 45000, id);
  }
});

test('pause : decalerHeures avance les heures à toute profondeur, rien d\'autre', () => {
  const salle = {
    etatMode: {
      debutPhaseA: 1000,
      reponses: { j_1: { choix: 2, recuA: 1500 }, j_2: { recuA: null } },
      lettres: { A: 9 },
      dureeEcouteMixMs: 120000,
    },
  };
  decalerHeures(salle, 300);
  assert.deepEqual(salle.etatMode, {
    debutPhaseA: 1300,
    reponses: { j_1: { choix: 2, recuA: 1800 }, j_2: { recuA: null } },
    lettres: { A: 9 },
    dureeEcouteMixMs: 120000,
  });
});

test('pause : au Petit bac, les 10 s après le STOP reprennent aussi où elles en étaient', () => {
  const salle = {
    etat: 'partie',
    reglagesMode: {},
    etatMode: { phase: 'ecriture', debutPhaseA: 0, stop: { id: 'j_1', a: 20000 } },
  };
  const avant = petitBac.echeance(salle);
  petitBac.decalerHeures(salle, 7000);
  assert.equal(salle.etatMode.stop.a, 27000);
  assert.equal(petitBac.echeance(salle), avant + 7000);
});

// --- Correction des scores (temps 2) ---

test('scores : corrigés seulement pendant une pause, avec un entier de 0 à SCORE_MAX', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  const [a, b] = salle.joueurs;
  assert.equal(modifierScore(salle, { joueurId: a.id, score: 1200 }), false, 'hors pause');

  mettreEnPause(salle);
  for (const score of [-1, SCORE_MAX + 1, 12.5, '1200', null, NaN]) {
    assert.equal(modifierScore(salle, { joueurId: a.id, score }), false, `score ${score}`);
  }
  assert.equal(modifierScore(salle, { joueurId: 'j_inconnu', score: 10 }), false);
  assert.equal(modifierScore(salle, null), false);
  assert.equal(a.score, 0);

  assert.equal(modifierScore(salle, { joueurId: a.id, score: 1200 }), true);
  assert.equal(modifierScore(salle, { joueurId: b.id, score: SCORE_MAX }), true);
  assert.equal(modifierScore(salle, { joueurId: b.id, score: 0 }), true);
  assert.deepEqual([a.score, b.score], [1200, 0]);
});

test('scores : seul l\'hôte reçoit la liste à corriger, et seulement en pause', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  const [hote, autre] = salle.joueurs;
  assert.equal(vueJoueur(salle, hote).scoresPause, undefined);
  mettreEnPause(salle);
  modifierScore(salle, { joueurId: autre.id, score: 500 });
  assert.deepEqual(vueJoueur(salle, hote).scoresPause[1], {
    id: autre.id, pseudo: 'B', couleur: autre.couleur, score: 500,
  });
  assert.equal(vueJoueur(salle, hote).scoresPause.length, 4);
  assert.equal(vueJoueur(salle, autre).scoresPause, undefined);
});

test('scores : un score corrigé compte pour les médailles et les points globaux', (t) => {
  simulerTemps(t);
  const salle = partieA4(t, 'quiz');
  const [a, b, c] = salle.joueurs;
  mettreEnPause(salle);
  modifierScore(salle, { joueurId: c.id, score: 3000 });
  modifierScore(salle, { joueurId: a.id, score: 2000 });
  modifierScore(salle, { joueurId: b.id, score: 1000 });
  terminerPartie(salle);
  assert.deepEqual(salle.medaillesPartie, { [c.id]: 'or', [a.id]: 'argent', [b.id]: 'bronze' });
  passerApresPodium(salle);
  assert.deepEqual([c.pointsGlobaux, a.pointsGlobaux, b.pointsGlobaux], [3, 2, 1]);
});
