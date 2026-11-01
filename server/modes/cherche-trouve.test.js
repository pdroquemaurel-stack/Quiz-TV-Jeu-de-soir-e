import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import { modes } from './index.js';
import {
  DELAI_ENTRE_TOUCHERS_MS, DUREE_REVELATION_MS, RAYON, avancer, banqueScenes, decalerHeures, demarrerPartie, echeance,
  enregistrerReponse, pointsDetail, reglagesParDefaut, suivant, validerReglages, verifierFinAnticipee, vueJoueur, vueReglages,
  vueTv,
} from './cherche-trouve.js';

const SOIXANTE_S = 60000;

function sallePrete({ joueurs = ['A', 'B'], reglages } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'cherche-trouve';
  salle.etat = 'partie';
  if (reglages) salle.reglagesMode = { 'cherche-trouve': { ...reglagesParDefaut(), ...reglages } };
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

function toucher(salle, joueurId, position) {
  const accepte = enregistrerReponse(salle, joueurId, position);
  if (accepte) verifierFinAnticipee(salle);
  return accepte;
}

function detail(salle) {
  return salle.etatMode.details[salle.etatMode.indexDetail];
}

// La partie lancée, jusqu'à la recherche du premier détail.
function rechercheLancee(options) {
  const prete = sallePrete(options);
  assert.equal(prete.salle.etatMode.phase, 'annonce');
  suivant(prete.salle);
  assert.equal(prete.salle.etatMode.phase, 'recherche');
  return prete;
}

// --- Registre, réglages, points ---

test('cherche & trouve : le registre contient le mode, jouable seul', () => {
  const mode = modes['cherche-trouve'];
  for (const fonction of ['demarrerPartie', 'enregistrerReponse', 'verifierFinAnticipee', 'suivant', 'echeance',
    'avancer', 'decalerHeures', 'vueTv', 'vueJoueur']) {
    assert.equal(typeof mode[fonction], 'function', fonction);
  }
  assert.equal(mode.joueursMin, 1);
  assert.equal(banqueScenes.length, 3);
});

test('cherche & trouve : réglages, 4, 6 ou 8 détails, 45, 60 ou 90 s', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 6, temps: 60 });
  assert.deepEqual(validerReglages({ longueur: 8, temps: 45 }), { longueur: 8, temps: 45 });
  assert.equal(validerReglages({ longueur: 5, temps: 60 }), null);
  assert.equal(vueReglages(creerSalle('tv')).resume, '6 détails · 60 s');
});

test('cherche & trouve : points, 1 000 moins 5 par seconde, 200 au moins, 100 par tap raté, jamais négatifs', () => {
  assert.equal(pointsDetail(0, 0), 1000);
  assert.equal(pointsDetail(30999, 0), 850);
  assert.equal(pointsDetail(200000, 0), 200);
  assert.equal(pointsDetail(10000, 2), 750);
  assert.equal(pointsDetail(200000, 5), 0);
  assert.equal(pointsDetail(null, 3), 0);
});

// --- Partie ---

test('cherche & trouve : une scène, des détails distincts de cette scène, annonce puis recherche', () => {
  const { salle } = sallePrete({ reglages: { longueur: 8 } });
  const { scene, details } = salle.etatMode;
  const complete = banqueScenes.find((s) => s.id === scene.id);
  assert.equal(details.length, 8);
  assert.equal(new Set(details.map((d) => d.id)).size, 8);
  assert.ok(details.every((d) => complete.details.some((c) => c.id === d.id)));
  assert.deepEqual(salle.questionsVues, [scene.id]);
  assert.equal(scene.details, undefined);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'recherche');
  assert.equal(salle.etatMode.indexDetail, 0);
});

test('cherche & trouve : toucher dans le rayon trouve, au-delà rate', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a] } = rechercheLancee();
  const { x, y } = detail(salle);
  assert.equal(toucher(salle, a.id, { x: x + RAYON + 5, y }), true);
  assert.equal(vueJoueur(salle, a).dernierToucher, 'rate');
  assert.equal(vueJoueur(salle, a).rates, 1);
  t.mock.timers.tick(12000);
  assert.equal(toucher(salle, a.id, { x: x + 30, y: y - 30 }), true);
  assert.equal(vueJoueur(salle, a).trouve, true);
  assert.equal(vueTv(salle).ontTrouve.length, 1);
  // Après avoir trouvé : plus de toucher.
  t.mock.timers.tick(2000);
  assert.equal(toucher(salle, a.id, { x, y }), false);
});

test('cherche & trouve : touchers refusés, mal formés, hors image ou trop rapprochés', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a] } = rechercheLancee();
  for (const mauvais of [null, {}, { x: '10', y: 10 }, { x: NaN, y: 10 }, { x: -1, y: 10 }, { x: 10, y: 99999 }]) {
    assert.equal(enregistrerReponse(salle, a.id, mauvais), false, JSON.stringify(mauvais));
  }
  assert.equal(toucher(salle, a.id, { x: 5, y: 5 }), true);
  t.mock.timers.tick(DELAI_ENTRE_TOUCHERS_MS - 1);
  assert.equal(toucher(salle, a.id, { x: 6, y: 6 }), false);
  t.mock.timers.tick(1);
  assert.equal(toucher(salle, a.id, { x: 6, y: 6 }), true);
  assert.equal(vueJoueur(salle, a).rates, 2);
});

test('cherche & trouve : tous ont trouvé → révélation, points ajoutés au score', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b] } = rechercheLancee();
  const position = detail(salle);
  t.mock.timers.tick(10000);
  toucher(salle, a.id, { x: position.x, y: position.y });
  assert.equal(salle.etatMode.phase, 'recherche');
  toucher(salle, b.id, { x: 1, y: 1 });
  t.mock.timers.tick(10000);
  toucher(salle, b.id, { x: position.x, y: position.y });
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(a.score, 950);
  // b : 20 s et un tap raté → 900 − 100.
  assert.equal(b.score, 800);
  const tv = vueTv(salle);
  assert.deepEqual(tv.position, { x: position.x, y: position.y });
  assert.deepEqual(tv.resultats.map((r) => [r.id, r.secondes, r.points]), [[a.id, 10, 950], [b.id, 20, 800]]);
  assert.equal(vueJoueur(salle, b).points, 800);
  assert.equal(vueJoueur(salle, b).secondes, 20);
  assert.equal(echeance(salle), 20000 + DUREE_REVELATION_MS);
});

test('cherche & trouve : fin du chrono → révélation, 0 pour qui n\'a pas trouvé, podium après le dernier', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = rechercheLancee({ reglages: { longueur: 4 } });
  assert.equal(echeance(salle), SOIXANTE_S);
  for (let manche = 0; manche < 4; manche++) {
    avancer(salle);
    assert.equal(salle.etatMode.phase, 'revelation');
    suivant(salle);
  }
  assert.equal(salle.etat, 'podium');
  assert.ok(joueurs.every((j) => j.score === 0));
});

test('cherche & trouve : un joueur déconnecté n\'est pas attendu, un nouveau attend la manche suivante', () => {
  const { salle, joueurs: [a, b] } = rechercheLancee();
  const nouveau = ajouterJoueur(salle, 'Z', 'sz').joueur;
  assert.equal(vueJoueur(salle, nouveau).ecran, 'attente_question');
  assert.equal(enregistrerReponse(salle, nouveau.id, { x: 1, y: 1 }), false);
  b.connecte = false;
  const { x, y } = detail(salle);
  toucher(salle, a.id, { x, y });
  assert.equal(salle.etatMode.phase, 'revelation');
  suivant(salle);
  assert.equal(vueJoueur(salle, nouveau).ecran, 'recherche');
});

test('cherche & trouve : la position n\'est envoyée qu\'à la révélation', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const positionsTirees = salle.etatMode.details.map((d) => [d.x, d.y]);
  const contientUnePosition = (vue) => {
    const texte = JSON.stringify(vue);
    return positionsTirees.some(([x, y]) => texte.includes(`"x":${x}`) || texte.includes(`"y":${y}`));
  };
  assert.equal(contientUnePosition(vueTv(salle)), false);
  assert.equal(contientUnePosition(vueJoueur(salle, a)), false);
  suivant(salle);
  assert.equal(contientUnePosition(vueTv(salle)), false);
  assert.equal(contientUnePosition(vueJoueur(salle, a)), false);
  assert.equal(vueJoueur(salle, a).detail.texte, detail(salle).texte);
  avancer(salle);
  assert.equal(vueTv(salle).position.x, detail(salle).x);
});

test('cherche & trouve : la pause décale le chrono et les temps mis', (t) => {
  simulerTemps(t);
  const { salle } = rechercheLancee();
  decalerHeures(salle, 5000);
  assert.equal(echeance(salle), SOIXANTE_S + 5000);
  assert.equal(salle.etatMode.debutRechercheA, 5000);
});
