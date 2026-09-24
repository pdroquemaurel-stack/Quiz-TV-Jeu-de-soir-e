import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifierQuestions } from './verifier-questions.js';

function questionValide(modifications = {}) {
  return {
    id: 'q0042',
    texte: "Quelle est la capitale de l'Australie ?",
    reponses: ['Sydney', 'Canberra', 'Melbourne', 'Perth'],
    bonneReponse: 1,
    categorie: 'geographie',
    difficulte: 2,
    ...modifications,
  };
}

// Vérifie qu'une seule question avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(modifications, extrait) {
  const erreurs = verifierQuestions([questionValide(modifications)]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('une question valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierQuestions([questionValide()]), []);
});

test('le fichier doit être une liste', () => {
  assert.equal(verifierQuestions({}).length, 1);
});

test('id au mauvais format', () => {
  erreurAttendue({ id: '42' }, 'qNNNN');
  erreurAttendue({ id: 'q42' }, 'qNNNN');
});

test('texte vide ou trop long', () => {
  erreurAttendue({ texte: '  ' }, 'texte vide');
  erreurAttendue({ texte: 'a'.repeat(111) }, 'texte trop long');
});

test('nombre de réponses différent de 4', () => {
  erreurAttendue({ reponses: ['A', 'B', 'C'] }, '4 réponses');
  erreurAttendue({ reponses: 'A, B, C, D' }, '4 réponses');
});

test('réponse vide, trop longue ou en double', () => {
  erreurAttendue({ reponses: ['A', '', 'C', 'D'] }, 'réponse vide');
  erreurAttendue({ reponses: ['A', 'B', 'C', 'x'.repeat(31)] }, 'trop longue');
  erreurAttendue({ reponses: ['Paris', 'Lyon', 'paris', 'Nice'] }, 'en double');
});

test('bonneReponse hors de 0 à 3', () => {
  for (const bonneReponse of [-1, 4, 1.5, '1', undefined]) {
    erreurAttendue({ bonneReponse }, 'bonneReponse');
  }
});

test('categorie inconnue', () => {
  erreurAttendue({ categorie: 'astrologie' }, 'categorie');
});

test('difficulte hors de 1 à 3', () => {
  erreurAttendue({ difficulte: 0 }, 'difficulte');
  erreurAttendue({ difficulte: '2' }, 'difficulte');
});

test('champ en trop', () => {
  erreurAttendue({ image: 'x.png' }, 'en trop');
});

test('id et texte en double entre deux questions', () => {
  const erreurs = verifierQuestions([
    questionValide(),
    questionValide({ texte: "QUELLE est la capitale de l'Australie ?" }),
  ]);
  assert.equal(erreurs.length, 2);
  assert.ok(erreurs[0].includes('id en double'));
  assert.ok(erreurs[1].includes('texte en double'));
});
