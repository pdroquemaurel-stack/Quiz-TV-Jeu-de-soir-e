import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, passerApresPodium, synchroniserMinuteur,
  terminerPartie, vueJoueur, vueTv,
} from '../salles.js';
import {
  NOMBRE_QUESTIONS, REPONSE_MAX, banqueEstimation, calculerEstimations, enregistrerReponse,
  passerALaSuite, reveler, suivant, verifierFinAnticipee,
} from './estimation.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_QUIZ } from './quiz.js';

// Trois joueurs, mode Estimation, partie lancée.
function sallePrete() {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  assert.equal(choisirMode(salle, 'estimation'), true);
  demarrerPartie(salle);
  return { salle, a, b, c };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

function quandAvance(salle) {
  synchroniserMinuteur(salle, quandAvance);
}

const etape = (salle) => (salle.etat === 'partie' ? salle.etatMode.phase : salle.etat);
const bonneReponse = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion].reponse;

// Réponses fictives : { id: nombre } → le format de etatMode.reponses.
const reponses = (nombres) => Object.fromEntries(
  Object.entries(nombres).map(([id, nombre]) => [id, { nombre, recuA: 0 }]),
);

// --- Points ---

test('points : les 3 plus proches marquent 1000, 600, 300, les autres 0', () => {
  const lignes = calculerEstimations(reponses({ a: 110, b: 75, c: 130, d: 500 }), 100);
  assert.deepEqual(lignes.map((l) => [l.id, l.ecart, l.rangEcart, l.points]), [
    ['a', 10, 1, 1000], ['b', 25, 2, 600], ['c', 30, 3, 300], ['d', 400, 4, 0],
  ]);
});

test('points : ex æquo, même rang et mêmes points, rang suivant sauté', () => {
  const lignes = calculerEstimations(reponses({ a: 90, b: 110, c: 125, d: 140 }), 100);
  assert.deepEqual(lignes.map((l) => l.rangEcart), [1, 1, 3, 4]);
  assert.deepEqual(lignes.map((l) => l.points), [1000, 1000, 300, 0]);
});

test('points : une seule réponse donne 1000, aucune réponse ne donne rien', () => {
  assert.deepEqual(calculerEstimations(reponses({ a: 5 }), 1000).map((l) => l.points), [1000]);
  assert.deepEqual(calculerEstimations({}, 1000), []);
});

test('points : la réponse exacte a un écart de 0', () => {
  const [ligne] = calculerEstimations(reponses({ a: 1789 }), 1789);
  assert.equal(ligne.ecart, 0);
  assert.equal(ligne.points, 1000);
});

test('reveler ajoute les points au score', () => {
  const { salle, a, b, c } = sallePrete();
  const juste = bonneReponse(salle);
  enregistrerReponse(salle, a.id, juste);
  enregistrerReponse(salle, b.id, juste + 10);
  enregistrerReponse(salle, c.id, juste + 20);
  reveler(salle);
  assert.deepEqual([a.score, b.score, c.score], [1000, 600, 300]);
});

// --- Réponses ---

test('une réponse valide est acceptée une seule fois, sans changer d\'avis', () => {
  const { salle, a } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, 0), true);
  assert.equal(enregistrerReponse(salle, a.id, 12), false);
  assert.equal(salle.etatMode.reponses[a.id].nombre, 0);
});

test('une réponse invalide est refusée', () => {
  const { salle, a } = sallePrete();
  for (const nombre of [12.5, -1, REPONSE_MAX + 1, '12', null, undefined, NaN, Infinity]) {
    assert.equal(enregistrerReponse(salle, a.id, nombre), false, String(nombre));
  }
  assert.equal(enregistrerReponse(salle, a.id, REPONSE_MAX), true);
});

test('une réponse hors de la phase question ou d\'un joueur non attendu est refusée', () => {
  const { salle, a } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's4');
  assert.equal(enregistrerReponse(salle, tardif.id, 5), false);
  reveler(salle);
  assert.equal(enregistrerReponse(salle, a.id, 5), false);
});

// --- Déroulé ---

test('une partie compte 8 questions tirées de la banque d\'estimation', () => {
  const { salle } = sallePrete();
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
  assert.ok(salle.etatMode.questions.every((q) => q.id.startsWith('e')));
  assert.ok(banqueEstimation.length >= NOMBRE_QUESTIONS);
});

test('fin anticipée : dès que tous ont répondu, et après la déconnexion du dernier attendu', () => {
  const { salle, a, b, c } = sallePrete();
  enregistrerReponse(salle, a.id, 1);
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'question');

  c.connecte = false;
  enregistrerReponse(salle, b.id, 2);
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'revelation');
});

test('« Suivant » seulement pendant la révélation, puis podium après la 8e', () => {
  const { salle } = sallePrete();
  assert.equal(suivant(salle), false);
  for (let i = 0; i < NOMBRE_QUESTIONS; i++) {
    reveler(salle);
    assert.equal(suivant(salle), true);
  }
  assert.equal(salle.etat, 'podium');
});

test('minuteur : révélation à 30 s, question suivante 10 s après', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(29999);
  assert.equal(etape(salle), 'question');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(9999);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('terminer pendant une question : la manche en cours ne compte pas', () => {
  const { salle, a } = sallePrete();
  enregistrerReponse(salle, a.id, bonneReponse(salle));
  terminerPartie(salle);
  assert.equal(salle.etat, 'podium');
  assert.equal(a.score, 0);
});

test('questionsVues : les parties d\'estimation et de quiz ne se répètent pas', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < 3; i++) {
    terminerPartie(salle);
    demarrerPartie(salle);
  }
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'quiz');
  demarrerPartie(salle);
  const total = 3 * NOMBRE_QUESTIONS + NOMBRE_QUESTIONS_QUIZ;
  assert.equal(salle.questionsVues.length, total);
  assert.equal(new Set(salle.questionsVues).size, total);
  assert.equal(salle.questionsVues.filter((id) => id.startsWith('e')).length, 3 * NOMBRE_QUESTIONS);
});

// --- Ce que voient la TV et les téléphones ---

test('pendant la question, la TV ne reçoit ni la bonne réponse ni les nombres saisis', () => {
  const { salle, a } = sallePrete();
  enregistrerReponse(salle, a.id, 123456789);
  const vue = vueTv(salle).etatMode;
  assert.equal(vue.bonneReponse, undefined);
  assert.equal(vue.estimations, undefined);
  assert.deepEqual(vue.ontRepondu, [a.id]);
  assert.deepEqual(Object.keys(vue.question), ['texte', 'unite']);
  assert.ok(!JSON.stringify(vue).includes('123456789'));
});

test('à la révélation, la TV reçoit la bonne réponse, les estimations et les absents', () => {
  const { salle, a, b, c } = sallePrete();
  enregistrerReponse(salle, a.id, bonneReponse(salle) + 5);
  enregistrerReponse(salle, b.id, bonneReponse(salle));
  reveler(salle);
  const vue = vueTv(salle).etatMode;
  assert.equal(vue.bonneReponse, bonneReponse(salle));
  assert.deepEqual(vue.estimations.map((l) => [l.id, l.points]), [[b.id, 1000], [a.id, 600]]);
  assert.deepEqual(vue.sansReponse, [c.id]);
  assert.equal(vue.classement[0].points, 1000);
});

test('un téléphone ne reçoit jamais la bonne réponse avant la révélation, ni les nombres des autres', () => {
  const { salle, a, b } = sallePrete();
  enregistrerReponse(salle, a.id, 987654321);
  const vueB = vueJoueur(salle, b);
  assert.ok(!JSON.stringify(vueB).includes('987654321'));
  assert.deepEqual(
    Object.keys(vueB).filter((cle) => !['mode', 'id', 'pseudo', 'couleur', 'score', 'estHote', 'peutTerminer'].includes(cle)),
    ['ecran', 'numero', 'unite'],
  );
  const vueA = vueJoueur(salle, a);
  assert.deepEqual([vueA.ecran, vueA.nombre, vueA.bonneReponse], ['reponse_envoyee', 987654321, undefined]);

  reveler(salle);
  assert.ok(!JSON.stringify(vueJoueur(salle, b)).includes('987654321'));
});

test('l\'écran du téléphone suit la manche', () => {
  const { salle, a, b, c } = sallePrete();
  assert.equal(vueJoueur(salle, a).numero, 1);
  enregistrerReponse(salle, a.id, bonneReponse(salle));
  enregistrerReponse(salle, b.id, bonneReponse(salle) + 3);
  reveler(salle);

  const vueA = vueJoueur(salle, a);
  assert.equal(vueA.ecran, 'resultat');
  assert.deepEqual([vueA.ecart, vueA.rangEcart, vueA.points, vueA.rang], [0, 1, 1000, 1]);
  const vueC = vueJoueur(salle, c);
  assert.deepEqual([vueC.nombre, vueC.points], [null, 0]);

  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, a).numero, 2);
});

test('arrivée en cours de manche : attend la question suivante, puis joue', () => {
  const { salle } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's4');
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  reveler(salle);
  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'repondre');
});
