import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle, synchroniserMinuteur, vueJoueur, vueTv } from '../salles.js';
import {
  NOMBRE_QUESTIONS, avancer, banqueQuestions, calculerPoints, classement, demarrerPartie,
  echeance, enregistrerReponse, melangerReponses, passerALaSuite, reveler, tirerQuestions,
  tousOntRepondu,
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

// --- Tirage des questions ---

function banqueFictive(nombre) {
  return Array.from({ length: nombre }, (_, i) => ({ id: `q${String(i + 1).padStart(4, '0')}` }));
}

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

test('tirage : le nombre demandé, sans doublon', () => {
  const tirees = tirerQuestions(banqueFictive(12), [], 10);
  assert.equal(tirees.length, 10);
  assert.equal(new Set(idsDe(tirees)).size, 10);
});

test('tirage : inédites d\'abord, puis les déjà vues les plus anciennes', () => {
  const banque = banqueFictive(12);
  // Vues dans cet ordre : q0005 est la plus ancienne. Inédites : q0011 et q0012.
  const vues = ['q0005', 'q0001', 'q0002', 'q0003', 'q0004', 'q0006', 'q0007', 'q0008', 'q0009', 'q0010'];
  const ids = idsDe(tirerQuestions(banque, vues, 10));
  assert.deepEqual(ids.slice(0, 2).sort(), ['q0011', 'q0012']);
  assert.deepEqual(ids.slice(2), vues.slice(0, 8));
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

  assert.equal(salle.etat, 'question');
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

  // On avance étape par étape jusqu'à la révélation de la dernière question :
  // un seul gros tick ne déclenche pas les minuteurs créés pendant ce tick.
  for (let i = 1; i < NOMBRE_QUESTIONS - 1; i++) {
    t.mock.timers.tick(20000);
    t.mock.timers.tick(8000);
  }
  t.mock.timers.tick(20000);
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

  for (let i = 0; i < NOMBRE_QUESTIONS; i++) passerALaSuite(salle);
  assert.equal(vueJoueur(salle, paul).ecran, 'fin');
  assert.equal(typeof vueJoueur(salle, paul).assezDeJoueurs, 'boolean');
});
