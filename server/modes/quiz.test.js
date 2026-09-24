import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle, synchroniserMinuteur, vueJoueur, vueTv } from '../salles.js';
import {
  QUESTIONS_PROVISOIRES, avancer, calculerPoints, classement, demarrerPartie, echeance,
  enregistrerReponse, passerALaSuite, reveler, tousOntRepondu,
} from './quiz.js';

function sallePrete() {
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  const { joueur: lea } = ajouterJoueur(salle, 'Léa', 's2');
  demarrerPartie(salle);
  return { salle, paul, lea };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

// Comme diffuser() dans index.js : on resynchronise après chaque étape.
function quandAvance(salle) {
  synchroniserMinuteur(salle, quandAvance);
}

const bonneReponse = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion].bonneReponse;
const mauvaiseReponse = (salle) => (bonneReponse(salle) + 1) % 4;

// --- Points ---

test('points : 0 s donne 1000, 10 s donne 750, 20 s donne 500', () => {
  assert.equal(calculerPoints(0), 1000);
  assert.equal(calculerPoints(10000), 750);
  assert.equal(calculerPoints(20000), 500);
});

test('points : arrondi, et bornés entre 500 et 1000', () => {
  assert.equal(calculerPoints(5200), 870);
  assert.equal(calculerPoints(25000), 500);
  assert.equal(calculerPoints(-50), 1000);
});

test('reveler donne des points dégressifs aux bonnes réponses seulement', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();

  t.mock.timers.tick(10000);
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  enregistrerReponse(salle, lea.id, mauvaiseReponse(salle));
  reveler(salle);

  assert.equal(salle.etat, 'revelation');
  assert.equal(paul.score, 750);
  assert.equal(lea.score, 0);
});

// --- Classement ---

test('classement : une égalité donne le même rang et saute le suivant (1, 1, 3)', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  const { joueur: d } = ajouterJoueur(salle, 'D', 's4');
  demarrerPartie(salle);
  a.score = 1500;
  b.score = 1800;
  c.score = 1800;
  d.score = 900;

  const lignes = classement(salle);
  assert.deepEqual(lignes.map((l) => l.pseudo), ['B', 'C', 'A', 'D']);
  assert.deepEqual(lignes.map((l) => l.rang), [1, 1, 3, 4]);
});

test('classement : tout le monde à 0 est premier ex æquo', () => {
  const { salle } = sallePrete();
  assert.deepEqual(classement(salle).map((l) => l.rang), [1, 1]);
});

test('le téléphone reçoit son rang au résultat et à la fin', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  enregistrerReponse(salle, lea.id, mauvaiseReponse(salle));
  reveler(salle);
  assert.equal(vueJoueur(salle, paul).rang, 1);
  assert.equal(vueJoueur(salle, lea).rang, 2);

  salle.etat = 'podium';
  assert.equal(vueJoueur(salle, lea).ecran, 'fin');
  assert.equal(vueJoueur(salle, lea).rang, 2);
});

// --- Déroulé d'une manche ---

test('demarrerPartie passe à la 1re question et remet les scores à zéro', () => {
  const salle = creerSalle('tv');
  const { joueur } = ajouterJoueur(salle, 'Paul', 's1');
  joueur.score = 500;

  demarrerPartie(salle);

  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(salle.etatMode.questions.length, QUESTIONS_PROVISOIRES.length);
  assert.deepEqual(salle.etatMode.reponses, {});
  assert.deepEqual(salle.etatMode.attendus, [joueur.id]);
  assert.equal(typeof salle.etatMode.debutQuestionA, 'number');
  assert.equal(joueur.score, 0);
});

test('un joueur ne répond qu\'une fois, sans changer d\'avis', () => {
  const { salle, paul } = sallePrete();
  assert.equal(enregistrerReponse(salle, paul.id, 2), true);
  assert.equal(enregistrerReponse(salle, paul.id, 3), false);
  assert.equal(salle.etatMode.reponses[paul.id].choix, 2);
});

test('un choix invalide est refusé', () => {
  const { salle, paul } = sallePrete();
  for (const choix of [-1, 4, 1.5, '1', null, undefined]) {
    assert.equal(enregistrerReponse(salle, paul.id, choix), false);
  }
});

test('une réponse hors de l\'état question est refusée', () => {
  const { salle, paul } = sallePrete();
  reveler(salle);
  assert.equal(enregistrerReponse(salle, paul.id, 0), false);
});

test('fin anticipée : un joueur attendu qui se déconnecte ne bloque pas la manche', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, 0);
  assert.equal(tousOntRepondu(salle), false);

  lea.connecte = false;
  assert.equal(tousOntRepondu(salle), true);
});

test('fin anticipée : un joueur arrivé en cours de manche n\'est pas attendu', () => {
  const { salle, paul, lea } = sallePrete();
  ajouterJoueur(salle, 'Tardif', 's3');
  enregistrerReponse(salle, paul.id, 0);
  enregistrerReponse(salle, lea.id, 1);
  assert.equal(tousOntRepondu(salle), true);
});

test('les questions s\'enchaînent puis on arrive au podium', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < QUESTIONS_PROVISOIRES.length; i++) {
    reveler(salle);
    passerALaSuite(salle);
    assert.equal(salle.etat, 'question');
    assert.equal(salle.etatMode.indexQuestion, i);
    assert.deepEqual(salle.etatMode.reponses, {});
  }
  reveler(salle);
  passerALaSuite(salle);
  assert.equal(salle.etat, 'podium');
});

test('echeance : 20 s en question, 8 s en révélation, aucune au podium', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  assert.equal(echeance(salle), 20000);

  t.mock.timers.tick(3000);
  avancer(salle);
  assert.equal(salle.etat, 'revelation');
  assert.equal(echeance(salle), 11000);

  avancer(salle);
  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);

  salle.etat = 'podium';
  assert.equal(echeance(salle), null);
});

test('rejouer : scores à zéro et retour à la 1re question', () => {
  const { salle, paul } = sallePrete();
  paul.score = 2500;
  salle.etat = 'podium';

  demarrerPartie(salle);

  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(paul.score, 0);
});

// --- Minuteurs, avec le temps simulé ---

test('minuteur : la révélation arrive à 20 s pile', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(19999);
  assert.equal(salle.etat, 'question');
  t.mock.timers.tick(1);
  assert.equal(salle.etat, 'revelation');
});

test('minuteur : question suivante 8 s après la révélation, puis podium sans minuteur', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(20000);
  t.mock.timers.tick(7999);
  assert.equal(salle.etat, 'revelation');
  t.mock.timers.tick(1);
  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);

  // Il reste 2 questions, soit 2 × (20 s + 8 s) jusqu'au podium.
  // On avance étape par étape : un seul gros tick ne déclenche pas
  // les minuteurs créés pendant ce tick.
  for (const duree of [20000, 8000, 20000]) t.mock.timers.tick(duree);
  assert.equal(salle.etat, 'revelation');
  t.mock.timers.tick(8000);
  assert.equal(salle.etat, 'podium');
  t.mock.timers.tick(60000);
  assert.equal(salle.etat, 'podium');
});

test('minuteur : une resynchronisation en cours de manche ne relance pas le chrono', (t) => {
  simulerTemps(t);
  const { salle, paul } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(5000);
  enregistrerReponse(salle, paul.id, 0);
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(15000);
  assert.equal(salle.etat, 'revelation');
});

test('minuteur : fin anticipée, puis question suivante 8 s plus tard', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(3000);
  enregistrerReponse(salle, paul.id, 0);
  enregistrerReponse(salle, lea.id, 1);
  if (tousOntRepondu(salle)) reveler(salle);
  synchroniserMinuteur(salle, quandAvance);
  assert.equal(salle.etat, 'revelation');

  t.mock.timers.tick(8000);
  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('minuteur : « Suivant » annule l\'enchaînement automatique en cours', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(20000);
  t.mock.timers.tick(2000);
  passerALaSuite(salle);
  synchroniserMinuteur(salle, quandAvance);

  // Sans annulation, on sauterait à la question 3 à 28 s.
  t.mock.timers.tick(6000);
  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

// --- Ce que voient la TV et les téléphones ---

test('pendant la question, la TV ne reçoit ni la bonne réponse ni les questions suivantes', () => {
  const { salle } = sallePrete();
  const texteVue = JSON.stringify(vueTv(salle));

  assert.ok(!texteVue.includes('bonneReponse'));
  assert.ok(texteVue.includes(QUESTIONS_PROVISOIRES[0].texte));
  assert.ok(!texteVue.includes(QUESTIONS_PROVISOIRES[1].texte));
});

test('la TV reçoit le temps restant mesuré par le serveur', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  t.mock.timers.tick(4500);
  assert.equal(vueTv(salle).etatMode.tempsRestantMs, 15500);
});

test('à la révélation, la TV reçoit la bonne réponse et le nombre de réponses par choix', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, 2);
  enregistrerReponse(salle, lea.id, 2);
  reveler(salle);

  const vue = vueTv(salle).etatMode;
  assert.equal(vue.bonneReponse, bonneReponse(salle));
  assert.deepEqual(vue.nombreParChoix, [0, 0, 2, 0]);
});

test('un téléphone ne reçoit jamais la bonne réponse', () => {
  const { salle, paul } = sallePrete();
  assert.ok(!JSON.stringify(vueJoueur(salle, paul)).includes('bonneReponse'));
  enregistrerReponse(salle, paul.id, 0);
  assert.ok(!JSON.stringify(vueJoueur(salle, paul)).includes('bonneReponse'));
});

test('l\'écran du téléphone suit l\'état de la manche', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  assert.equal(vueJoueur(salle, paul).ecran, 'repondre');

  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  assert.equal(vueJoueur(salle, paul).ecran, 'reponse_envoyee');

  reveler(salle);
  const vuePaul = vueJoueur(salle, paul);
  assert.equal(vuePaul.ecran, 'resultat');
  assert.equal(vuePaul.juste, true);
  assert.equal(vuePaul.points, 1000);
  assert.equal(vueJoueur(salle, lea).juste, false);

  passerALaSuite(salle);
  passerALaSuite(salle);
  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, paul).ecran, 'fin');
  assert.equal(typeof vueJoueur(salle, paul).assezDeJoueurs, 'boolean');
});
