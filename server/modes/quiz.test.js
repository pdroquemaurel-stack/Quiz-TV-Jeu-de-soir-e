import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle, vueJoueur, vueTv } from '../salles.js';
import {
  QUESTIONS_PROVISOIRES, demarrerPartie, enregistrerReponse, passerALaSuite,
  reveler, tousOntRepondu,
} from './quiz.js';

function sallePrete() {
  const salle = creerSalle('tv');
  const { joueur: paul } = ajouterJoueur(salle, 'Paul', 's1');
  const { joueur: lea } = ajouterJoueur(salle, 'Léa', 's2');
  demarrerPartie(salle);
  return { salle, paul, lea };
}

const bonneReponse = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion].bonneReponse;
const mauvaiseReponse = (salle) => (bonneReponse(salle) + 1) % 4;

test('demarrerPartie passe à la 1re question et remet les scores à zéro', () => {
  const salle = creerSalle('tv');
  const { joueur } = ajouterJoueur(salle, 'Paul', 's1');
  joueur.score = 500;

  demarrerPartie(salle);

  assert.equal(salle.etat, 'question');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(salle.etatMode.questions.length, QUESTIONS_PROVISOIRES.length);
  assert.deepEqual(salle.etatMode.reponses, {});
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

test('tousOntRepondu ignore les joueurs déconnectés', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, 0);
  assert.equal(tousOntRepondu(salle), false);

  lea.connecte = false;
  assert.equal(tousOntRepondu(salle), true);
});

test('reveler donne 1000 points aux bonnes réponses seulement', () => {
  const { salle, paul, lea } = sallePrete();
  enregistrerReponse(salle, paul.id, bonneReponse(salle));
  enregistrerReponse(salle, lea.id, mauvaiseReponse(salle));

  reveler(salle);

  assert.equal(salle.etat, 'revelation');
  assert.equal(paul.score, 1000);
  assert.equal(lea.score, 0);
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

test('pendant la question, la TV ne reçoit ni la bonne réponse ni les questions suivantes', () => {
  const { salle } = sallePrete();
  const texteVue = JSON.stringify(vueTv(salle));

  assert.ok(!texteVue.includes('bonneReponse'));
  assert.ok(texteVue.includes(QUESTIONS_PROVISOIRES[0].texte));
  assert.ok(!texteVue.includes(QUESTIONS_PROVISOIRES[1].texte));
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

test('l\'écran du téléphone suit l\'état de la manche', () => {
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
});
