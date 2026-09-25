import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUREE_PODIUM_MS, ajouterJoueur, creerSalle, demarrerPartie, synchroniserMinuteur, terminerPartie,
  vueJoueur, vueTv,
} from '../salles.js';
import { tousOntRepondu } from './commun.js';
import {
  DUREE_TRANSITION_MS, NOMBRE_QUESTIONS, avancer, banqueQuestions, calculerPoints, calculerPrix,
  classement, echeance, enregistrerReponse, melangerReponses, passerALaSuite, reponseLaPlusRapide,
  reveler, suivant, tirerQuestionsEquilibrees, verifierFinAnticipee,
} from './quiz.js';

function sallePrete() {
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  const { joueur: lea } = ajouterJoueur(salle, 'Léa', 's2');
  demarrerPartie(salle);
  avancer(salle);
  return { salle, paul, lea };
}

// Question suivante, sans attendre la fin de l'écran de transition.
function questionSuivante(salle) {
  passerALaSuite(salle);
  if (salle.etat === 'partie') avancer(salle);
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

// Comme diffuser() dans index.js : on resynchronise après chaque étape.
function quandAvance(salle) {
  synchroniserMinuteur(salle, quandAvance);
}

// « transition », « question », « revelation » pendant une partie, sinon l'état de la salle.
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

test('demarrerPartie passe à la transition de la 1re question et remet les scores à zéro', () => {
  const salle = creerSalle('tv');
  const { joueur } = ajouterJoueur(salle, 'Paul', 's1');
  joueur.score = 500;

  demarrerPartie(salle);

  assert.equal(etape(salle), 'transition');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
  assert.equal(joueur.score, 0);

  avancer(salle);
  assert.equal(etape(salle), 'question');
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

  questionSuivante(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'repondre');
  assert.equal(enregistrerReponse(salle, tardif.id, 0), true);
});

test('les questions s\'enchaînent puis on arrive au podium', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < NOMBRE_QUESTIONS; i++) {
    reveler(salle);
    passerALaSuite(salle);
    assert.equal(etape(salle), 'transition');
    assert.equal(salle.etatMode.indexQuestion, i);
    avancer(salle);
    assert.equal(etape(salle), 'question');
    assert.deepEqual(salle.etatMode.reponses, {});
  }
  reveler(salle);
  passerALaSuite(salle);
  assert.equal(etape(salle), 'podium');
});

test('echeance : 2,5 s en transition, 20 s en question, 8 s en révélation, aucune au podium', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  assert.equal(echeance(salle), 20000);

  t.mock.timers.tick(3000);
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(echeance(salle), 11000);

  avancer(salle);
  assert.equal(etape(salle), 'transition');
  assert.equal(salle.etatMode.indexQuestion, 1);
  assert.equal(echeance(salle), 3000 + DUREE_TRANSITION_MS);

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

  assert.equal(etape(salle), 'transition');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(paul.score, 0);
});

// --- Arrêt par l'hôte ---

test('terminer pendant une question : podium, et la manche en cours ne compte pas', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  reveler(salle);
  questionSuivante(salle);
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

  assert.equal(etape(salle), 'transition');
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

test('minuteur : transition 8 s après la révélation, question 2,5 s plus tard, puis podium et tableau', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(20000);
  t.mock.timers.tick(7999);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'transition');
  assert.equal(salle.etatMode.indexQuestion, 1);
  t.mock.timers.tick(DUREE_TRANSITION_MS - 1);
  assert.equal(etape(salle), 'transition');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'question');

  // On avance étape par étape jusqu'à la révélation de la dernière question :
  // un seul gros tick ne déclenche pas les minuteurs créés pendant ce tick.
  for (let i = 1; i < NOMBRE_QUESTIONS - 1; i++) {
    t.mock.timers.tick(20000);
    t.mock.timers.tick(8000);
    t.mock.timers.tick(DUREE_TRANSITION_MS);
  }
  t.mock.timers.tick(20000);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(8000);
  assert.equal(etape(salle), 'podium');
  t.mock.timers.tick(DUREE_PODIUM_MS - 1);
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
  assert.equal(etape(salle), 'transition');
  t.mock.timers.tick(DUREE_TRANSITION_MS);
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

// --- Transition avant chaque question ---

test('transition : aucune réponse acceptée, et « Suivant » est ignoré', () => {
  const { salle, paul } = sallePrete();
  reveler(salle);
  passerALaSuite(salle);
  assert.equal(etape(salle), 'transition');

  assert.equal(enregistrerReponse(salle, paul.id, bonneReponse(salle)), false);
  verifierFinAnticipee(salle);
  assert.equal(suivant(salle), false);
  assert.equal(etape(salle), 'transition');
});

test('transition : les points partent du début de la question, pas de la transition', (t) => {
  simulerTemps(t);
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  ajouterJoueur(salle, 'Léa', 's2');
  demarrerPartie(salle);
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(DUREE_TRANSITION_MS);
  assert.equal(etape(salle), 'question');
  assert.equal(echeance(salle), DUREE_TRANSITION_MS + 20000);
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  reveler(salle);
  assert.equal(paul.score, 1000);
});

test('transition : un joueur arrivé pendant la transition joue la question', () => {
  const { salle } = sallePrete();
  reveler(salle);
  passerALaSuite(salle);
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's3');
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');

  avancer(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'repondre');
  assert.equal(enregistrerReponse(salle, tardif.id, 0), true);
});

test('transition : la TV reçoit la catégorie, sans le texte ni les réponses', () => {
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  demarrerPartie(salle);
  const question = salle.etatMode.questions[0];
  const vue = vueTv(salle).etatMode;

  assert.deepEqual(Object.keys(vue).sort(), ['categorie', 'numero', 'phase', 'total']);
  assert.equal(vue.numero, 1);
  assert.equal(typeof vue.categorie, 'string');
  assert.notEqual(vue.categorie, question.categorie, 'le libellé, pas l\'identifiant');
  assert.ok(!JSON.stringify(vueTv(salle)).includes(JSON.stringify(question.texte)));
  assert.equal(vueJoueur(salle, paul).ecran, 'attente_question');
});

test('transition : chaque catégorie de la banque a un libellé', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  demarrerPartie(salle);
  for (const question of banqueQuestions) {
    salle.etatMode.questions[0] = question;
    assert.ok(vueTv(salle).etatMode.categorie, question.categorie);
  }
});

test('transition : terminer pendant la transition mène au podium', () => {
  const { salle, paul } = sallePrete();
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  reveler(salle);
  passerALaSuite(salle);
  const score = paul.score;

  assert.equal(terminerPartie(salle), true);
  assert.equal(etape(salle), 'podium');
  assert.equal(paul.score, score);
});

// --- Réponse la plus rapide ---

test('plus rapide : la bonne réponse reçue la première, une mauvaise plus rapide ne compte pas', () => {
  const reponses = {
    a: { choix: 1, recuA: 1500 },
    b: { choix: 2, recuA: 2800 },
    c: { choix: 2, recuA: 2300 },
  };
  assert.deepEqual(reponseLaPlusRapide(reponses, 2, 1000), { id: 'c', dureeMs: 1300 });
});

test('plus rapide : personne n\'a trouvé, ou personne n\'a répondu', () => {
  assert.equal(reponseLaPlusRapide({ a: { choix: 1, recuA: 1500 } }, 2, 1000), null);
  assert.equal(reponseLaPlusRapide({}, 2, 1000), null);
});

test('plus rapide : à égalité, la première enregistrée', () => {
  const reponses = { a: { choix: 0, recuA: 1800 }, b: { choix: 0, recuA: 1800 } };
  assert.equal(reponseLaPlusRapide(reponses, 0, 0).id, 'a');
});

test('plus rapide : la TV et le téléphone le reçoivent à la révélation seulement', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  t.mock.timers.tick(1800);
  enregistrerReponse(salle, lea.id, bonneReponse(salle));
  t.mock.timers.tick(500);
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  assert.equal(vueTv(salle).etatMode.plusRapide, undefined);

  reveler(salle);
  assert.deepEqual(vueTv(salle).etatMode.plusRapide, { id: lea.id, dureeMs: 1800 });
  assert.equal(vueJoueur(salle, lea).plusRapide, true);
  assert.equal(vueJoueur(salle, paul).plusRapide, false);
});

// --- Prix de fin de partie ---

// Une question jouée : réponses sous la forme { id: [juste, dureeMs] }.
function questionJouee(texte, attendus, reponses = {}) {
  return {
    texte,
    attendus,
    reponses: Object.fromEntries(
      Object.entries(reponses).map(([id, [juste, dureeMs]]) => [id, { juste, dureeMs }]),
    ),
  };
}

const prixDe = (prix, type) => prix.find((unPrix) => unPrix.type === type);

test('prix : aucune question jouée, aucun prix', () => {
  assert.deepEqual(calculerPrix([], ['a', 'b']), []);
});

test('prix éclair : la bonne réponse la plus rapide, même si une mauvaise était plus rapide', () => {
  const prix = calculerPrix([
    questionJouee('Q1', ['a', 'b'], { a: [false, 500], b: [true, 1800] }),
    questionJouee('Q2', ['a', 'b'], { a: [true, 2500], b: [true, 3000] }),
  ], ['a', 'b']);
  assert.deepEqual(prixDe(prix, 'eclair'), { type: 'eclair', ids: ['b'], dureeMs: 1800 });
});

test('prix éclair : à égalité, les deux le reçoivent ; sans bonne réponse, personne', () => {
  const egalite = calculerPrix([
    questionJouee('Q1', ['a', 'b'], { a: [true, 1200] }),
    questionJouee('Q2', ['a', 'b'], { b: [true, 1200] }),
  ], ['a', 'b']);
  assert.deepEqual(prixDe(egalite, 'eclair').ids, ['a', 'b']);

  const aucune = calculerPrix([questionJouee('Q1', ['a'], { a: [false, 1000] })], ['a']);
  assert.equal(prixDe(aucune, 'eclair'), undefined);
});

test('prix série : 3 bonnes réponses d\'affilée au moins, une question non jouée coupe la série', () => {
  const juste = (id) => ({ [id]: [true, 5000] });
  const historique = [
    questionJouee('Q1', ['a', 'b'], { ...juste('a'), ...juste('b') }),
    questionJouee('Q2', ['a', 'b'], { ...juste('a'), ...juste('b') }),
    questionJouee('Q3', ['a'], juste('a')),
    questionJouee('Q4', ['a', 'b'], { ...juste('a'), ...juste('b') }),
  ];
  assert.deepEqual(
    prixDe(calculerPrix(historique, ['a', 'b']), 'serie'),
    { type: 'serie', ids: ['a'], longueur: 4 },
  );

  const courte = historique.slice(0, 2);
  assert.equal(prixDe(calculerPrix(courte, ['a', 'b']), 'serie'), undefined);
});

test('prix solo : seule bonne réponse d\'une question jouée à 3 ou plus', () => {
  const historique = [
    questionJouee('Q1', ['a', 'b', 'c'], { a: [true, 5000], b: [false, 4000] }),
    questionJouee('Q2', ['a', 'b', 'c'], { a: [true, 5000], c: [false, 4000] }),
    questionJouee('Q3', ['a', 'b', 'c'], { b: [true, 5000] }),
    // Jouée à 2 : ne compte pas.
    questionJouee('Q4', ['b', 'c'], { b: [true, 5000] }),
  ];
  assert.deepEqual(
    prixDe(calculerPrix(historique, ['a', 'b', 'c']), 'solo'),
    { type: 'solo', ids: ['a'], fois: 2 },
  );

  const aDeux = [questionJouee('Q1', ['a', 'b'], { a: [true, 5000] })];
  assert.equal(prixDe(calculerPrix(aDeux, ['a', 'b']), 'solo'), undefined);
});

test('prix question piège : la plus ratée, une absence de réponse compte comme ratée', () => {
  const historique = [
    questionJouee('Facile', ['a', 'b', 'c', 'd'], { a: [true, 1], b: [true, 1], c: [true, 1] }),
    questionJouee('Dure', ['a', 'b', 'c', 'd'], { a: [true, 1], b: [false, 1] }),
    questionJouee('Piège', ['a', 'b', 'c', 'd'], { a: [false, 1], b: [false, 1] }),
  ];
  assert.deepEqual(prixDe(calculerPrix(historique, ['a', 'b', 'c', 'd']), 'piege'), {
    type: 'piege', texte: 'Piège', rates: 4, sur: 4,
  });
});

test('prix question piège : personne ne le mérite si chaque question est trouvée par la moitié', () => {
  const historique = [
    questionJouee('Q1', ['a', 'b', 'c', 'd'], { a: [true, 1], b: [true, 1], c: [false, 1] }),
    questionJouee('Q2', ['a', 'b'], { a: [true, 1] }),
  ];
  assert.equal(prixDe(calculerPrix(historique, ['a', 'b', 'c', 'd']), 'piege'), undefined);
});

test('prix suspense : la bonne réponse la plus tardive, après 15 s seulement', () => {
  const historique = [
    questionJouee('Q1', ['a', 'b'], { a: [true, 2000], b: [true, 16000] }),
    questionJouee('Q2', ['a', 'b'], { a: [true, 19600], b: [false, 19900] }),
  ];
  assert.deepEqual(
    prixDe(calculerPrix(historique, ['a', 'b']), 'suspense'),
    { type: 'suspense', ids: ['a'], dureeMs: 19600 },
  );

  const tropTot = [questionJouee('Q1', ['a', 'b'], { a: [true, 2000], b: [true, 14999] })];
  assert.equal(prixDe(calculerPrix(tropTot, ['a', 'b']), 'suspense'), undefined);
});

test('prix suspense : une seule bonne réponse tardive ne donne pas aussi le suspense', () => {
  const prix = calculerPrix([questionJouee('Q1', ['a', 'b'], { a: [true, 17000] })], ['a', 'b']);
  assert.equal(prixDe(prix, 'eclair').dureeMs, 17000);
  assert.equal(prixDe(prix, 'suspense'), undefined);
});

test('prix dans la lune : le plus de questions sans réponse, 2 au moins', () => {
  const historique = [
    questionJouee('Q1', ['a', 'b'], { a: [false, 1000] }),
    questionJouee('Q2', ['a', 'b'], { a: [false, 1000] }),
    questionJouee('Q3', ['a', 'b'], { b: [false, 1000] }),
  ];
  assert.deepEqual(
    prixDe(calculerPrix(historique, ['a', 'b']), 'lune'),
    { type: 'lune', ids: ['b'], fois: 2 },
  );

  const uneFois = historique.slice(0, 1);
  assert.equal(prixDe(calculerPrix(uneFois, ['a', 'b']), 'lune'), undefined);
});

test('prix : 4 au plus, dans l\'ordre éclair, série, solo, piège, suspense, lune', () => {
  const tous = ['a', 'b', 'c', 'd'];
  const historique = [
    questionJouee('Q1', tous, { a: [true, 1000] }),
    questionJouee('Q2', tous, { a: [true, 16000] }),
    questionJouee('Q3', tous, { a: [true, 3000] }),
  ];
  const prix = calculerPrix(historique, tous);
  assert.deepEqual(prix.map((unPrix) => unPrix.type), ['eclair', 'serie', 'solo', 'piege']);
});

test('prix : un joueur qui a quitté la salle n\'en reçoit aucun', () => {
  const historique = [
    questionJouee('Q1', ['a', 'b', 'c'], { a: [true, 1000], b: [true, 3000] }),
    questionJouee('Q2', ['a', 'b', 'c'], { a: [true, 1000] }),
  ];
  const prix = calculerPrix(historique, ['b', 'c']);
  assert.deepEqual(prixDe(prix, 'eclair').ids, ['b']);
  assert.equal(prixDe(prix, 'solo'), undefined);
});

test('prix : la partie jouée les retient, et la TV les reçoit au podium', (t) => {
  simulerTemps(t);
  const { salle, paul, lea } = sallePrete();
  t.mock.timers.tick(1200);
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  lea.connecte = false;
  reveler(salle);

  // Léa, déconnectée sans répondre, n'est pas comptée dans la question.
  assert.deepEqual(salle.etatMode.historique[0].attendus, [paul.id]);
  terminerPartie(salle);
  assert.deepEqual(
    prixDe(vueTv(salle).etatMode.prix, 'eclair'),
    { type: 'eclair', ids: [paul.id], dureeMs: 1200 },
  );
});
