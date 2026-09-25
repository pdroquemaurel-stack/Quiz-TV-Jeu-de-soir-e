import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, creerSalle, demarrerPartie, synchroniserMinuteur, terminerPartie, vueJoueur,
  vueTv,
} from '../salles.js';
import { tousOntRepondu } from './commun.js';
import {
  NOMBRE_QUESTIONS, avancer, banqueQuestions, calculerPoints, classement, echeance,
  enregistrerReponse, melangerReponses, passerALaSuite, reveler, tirerQuestionsEquilibrees,
  verifierFinAnticipee,
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

// « question », « revelation » pendant une partie, sinon l'état de la salle.
const etape = (salle) => (salle.etat === 'partie' ? salle.etatMode.phase : salle.etat);

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

  assert.equal(etape(salle), 'revelation');
  assert.equal(paul.score, 750);
  assert.equal(lea.score, 0);
});

// --- Classement ---

test('classement : les points de la manche sont ceux du quiz', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  enregistrerReponse(salle, lea.id, mauvaiseReponse(salle));
  reveler(salle);
  assert.deepEqual(classement(salle).map((l) => [l.pseudo, l.points]), [['Paul', 1000], ['Léa', 0]]);
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

// --- Tirage des questions ---

const idsDe = (questions) => questions.map((question) => question.id);

test('mélange : bonneReponse pointe toujours vers la même réponse', () => {
  const question = {
    id: 'q0042',
    texte: "Quelle est la capitale de l'Australie ?",
    reponses: ['Sydney', 'Canberra', 'Melbourne', 'Perth'],
    bonneReponse: 1,
    categorie: 'geographie',
    difficulte: 2,
  };
  const ordresVus = new Set();
  for (let i = 0; i < 500; i++) {
    const melangee = melangerReponses(question);
    assert.equal(melangee.reponses[melangee.bonneReponse], 'Canberra');
    assert.deepEqual([...melangee.reponses].sort(), [...question.reponses].sort());
    ordresVus.add(melangee.reponses.join('|'));
  }
  // Les 24 ordres possibles finissent tous par sortir.
  assert.equal(ordresVus.size, 24);
  assert.deepEqual(question.reponses, ['Sydney', 'Canberra', 'Melbourne', 'Perth']);
  assert.equal(question.bonneReponse, 1);
});

test('la banque contient assez de questions pour une partie', () => {
  assert.ok(banqueQuestions.length >= NOMBRE_QUESTIONS);
});

test('parties successives : aucune question répétée tant qu\'il reste des inédites', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  const nombreParties = Math.floor(banqueQuestions.length / NOMBRE_QUESTIONS);
  const toutes = [];
  for (let i = 0; i < nombreParties; i++) {
    demarrerPartie(salle);
    toutes.push(...idsDe(salle.etatMode.questions));
  }
  assert.equal(new Set(toutes).size, nombreParties * NOMBRE_QUESTIONS);
  assert.deepEqual(salle.questionsVues, toutes);
});

test('banque épuisée : une question revue passe en fin de questionsVues', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  const nombreParties = Math.floor(banqueQuestions.length / NOMBRE_QUESTIONS) + 1;
  for (let i = 0; i < nombreParties; i++) demarrerPartie(salle);

  const derniere = idsDe(salle.etatMode.questions);
  assert.equal(new Set(derniere).size, NOMBRE_QUESTIONS);
  assert.equal(new Set(salle.questionsVues).size, salle.questionsVues.length);
  assert.equal(salle.questionsVues.length, banqueQuestions.length);
  assert.deepEqual(salle.questionsVues.slice(-NOMBRE_QUESTIONS), derniere);
});

const compterPar = (questions, champ) => {
  const totaux = {};
  for (const question of questions) totaux[question[champ]] = (totaux[question[champ]] ?? 0) + 1;
  return totaux;
};

test('tirage équilibré : sur 1 000 tirages, 4 faciles, 4 moyennes, 2 difficiles et 2 par catégorie au plus', () => {
  for (let i = 0; i < 1000; i++) {
    const questions = tirerQuestionsEquilibrees(banqueQuestions, []);
    assert.equal(new Set(idsDe(questions)).size, NOMBRE_QUESTIONS);
    assert.deepEqual(compterPar(questions, 'difficulte'), { 1: 4, 2: 4, 3: 2 });
    assert.ok(Object.values(compterPar(questions, 'categorie')).every((nombre) => nombre <= 2));
  }
});

test('tirage équilibré : toujours 10 questions, même quand les difficiles sont épuisées', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  const nombreParties = Math.floor(banqueQuestions.length / NOMBRE_QUESTIONS) + 3;
  for (let i = 0; i < nombreParties; i++) {
    demarrerPartie(salle);
    assert.equal(new Set(idsDe(salle.etatMode.questions)).size, NOMBRE_QUESTIONS);
  }
});

test('tirage équilibré : les questions jamais vues passent avant l\'équilibre', () => {
  const banque = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, categorie: 'sport', difficulte: 3 })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, categorie: `c${i}`, difficulte: 1 })),
  ];
  const vues = banque.slice(10).map((question) => question.id);
  // Les 10 inédites sont toutes difficiles et de la même catégorie : on les prend quand même.
  const questions = tirerQuestionsEquilibrees(banque, vues);
  assert.deepEqual(idsDe(questions).sort(), banque.slice(0, 10).map((question) => question.id).sort());
});

test('les questions d\'une partie ont leurs réponses mélangées sans perdre la bonne', () => {
  const { salle } = sallePrete();
  for (const question of salle.etatMode.questions) {
    const originale = banqueQuestions.find((q) => q.id === question.id);
    assert.equal(
      question.reponses[question.bonneReponse],
      originale.reponses[originale.bonneReponse],
    );
  }
});

// --- Déroulé d'une manche ---

test('demarrerPartie passe à la 1re question et remet les scores à zéro', () => {
  const salle = creerSalle('tv');
  const { joueur } = ajouterJoueur(salle, 'Paul', 's1');
  joueur.score = 500;

  demarrerPartie(salle);

  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
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

test('arrivée en cours de manche : 0 point, attend la question suivante, puis joue', () => {
  const { salle, paul, lea } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's3');
  assert.equal(tardif.score, 0);
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  assert.equal(enregistrerReponse(salle, tardif.id, 0), false);

  enregistrerReponse(salle, paul.id, 0);
  enregistrerReponse(salle, lea.id, 1);
  assert.equal(tousOntRepondu(salle), true);
  reveler(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');

  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'repondre');
  assert.equal(enregistrerReponse(salle, tardif.id, 0), true);
});

test('les questions s\'enchaînent puis on arrive au podium', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < NOMBRE_QUESTIONS; i++) {
    reveler(salle);
    passerALaSuite(salle);
    assert.equal(etape(salle), 'question');
    assert.equal(salle.etatMode.indexQuestion, i);
    assert.deepEqual(salle.etatMode.reponses, {});
  }
  reveler(salle);
  passerALaSuite(salle);
  assert.equal(etape(salle), 'podium');
});

test('echeance : 20 s en question, 8 s en révélation, aucune au podium', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  assert.equal(echeance(salle), 20000);

  t.mock.timers.tick(3000);
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(echeance(salle), 11000);

  avancer(salle);
  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);

  salle.etat = 'podium';
  assert.equal(echeance(salle), null);
});

test('rejouer : scores à zéro et retour à la 1re question', () => {
  const { salle, paul } = sallePrete();
  paul.score = 2500;
  salle.etat = 'podium';

  demarrerPartie(salle);

  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(paul.score, 0);
});

// --- Arrêt par l'hôte ---

test('terminer pendant une question : podium, et la manche en cours ne compte pas', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  reveler(salle);
  passerALaSuite(salle);
  paul.score = 1500;
  enregistrerReponse(salle, paul.id, bonneReponse(salle));

  assert.equal(terminerPartie(salle), true);

  assert.equal(etape(salle), 'podium');
  assert.equal(paul.score, 1500);
  assert.equal(lea.score, 0);
  assert.equal(echeance(salle), null);
  assert.equal(vueJoueur(salle, paul).ecran, 'fin');
});

test('terminer pendant une révélation : les points de la manche révélée sont gardés', () => {
  const { salle, paul } = sallePrete();
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  reveler(salle);
  const scoreRevele = paul.score;

  assert.equal(terminerPartie(salle), true);

  assert.equal(etape(salle), 'podium');
  assert.equal(paul.score, scoreRevele);
  assert.ok(scoreRevele > 0);
});

test('terminer est sans effet en salle d\'attente et au podium', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  assert.equal(terminerPartie(salle), false);
  assert.equal(etape(salle), 'lobby');

  salle.etat = 'podium';
  assert.equal(terminerPartie(salle), false);
});

test('rejouer fonctionne après un arrêt par l\'hôte', () => {
  const { salle, paul } = sallePrete();
  paul.score = 800;
  terminerPartie(salle);

  demarrerPartie(salle);

  assert.equal(etape(salle), 'question');
  assert.equal(paul.score, 0);
});

// --- Minuteurs, avec le temps simulé ---

test('minuteur : la révélation arrive à 20 s pile', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(19999);
  assert.equal(etape(salle), 'question');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'revelation');
});

test('minuteur : question suivante 8 s après la révélation, puis podium, et le tableau 15 s plus tard', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(20000);
  t.mock.timers.tick(7999);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);

  // On avance étape par étape jusqu'à la révélation de la dernière question :
  // un seul gros tick ne déclenche pas les minuteurs créés pendant ce tick.
  for (let i = 1; i < NOMBRE_QUESTIONS - 1; i++) {
    t.mock.timers.tick(20000);
    t.mock.timers.tick(8000);
  }
  t.mock.timers.tick(20000);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(8000);
  assert.equal(etape(salle), 'podium');
  t.mock.timers.tick(14999);
  assert.equal(etape(salle), 'podium');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'tableau');
  t.mock.timers.tick(60000);
  assert.equal(etape(salle), 'tableau');
});

test('minuteur : une resynchronisation en cours de manche ne relance pas le chrono', (t) => {
  simulerTemps(t);
  const { salle, paul } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(5000);
  enregistrerReponse(salle, paul.id, 0);
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(15000);
  assert.equal(etape(salle), 'revelation');
});

test('minuteur : fin anticipée, puis question suivante 8 s plus tard', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(3000);
  enregistrerReponse(salle, paul.id, 0);
  enregistrerReponse(salle, lea.id, 1);
  verifierFinAnticipee(salle);
  synchroniserMinuteur(salle, quandAvance);
  assert.equal(etape(salle), 'revelation');

  t.mock.timers.tick(8000);
  assert.equal(etape(salle), 'question');
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
  assert.equal(etape(salle), 'question');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

// --- Ce que voient la TV et les téléphones ---

test('pendant la question, la TV ne reçoit ni la bonne réponse ni les questions suivantes', () => {
  const { salle } = sallePrete();
  const texteVue = JSON.stringify(vueTv(salle));
  const { questions } = salle.etatMode;

  assert.ok(!texteVue.includes('bonneReponse'));
  assert.ok(texteVue.includes(JSON.stringify(questions[0].texte)));
  assert.ok(!texteVue.includes(JSON.stringify(questions[1].texte)));
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
  assert.equal(vuePaul.aRepondu, true);
  assert.equal(vueJoueur(salle, lea).aRepondu, false);

  for (let i = 0; i < NOMBRE_QUESTIONS; i++) passerALaSuite(salle);
  assert.equal(vueJoueur(salle, paul).ecran, 'fin');
  assert.equal(typeof vueJoueur(salle, paul).assezDeJoueurs, 'boolean');
});
