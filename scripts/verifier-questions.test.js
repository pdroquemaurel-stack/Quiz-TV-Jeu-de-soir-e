import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairesVoisines, verifierQuestions } from './verifier-questions.js';

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

// --- Paires voisines ---

const banque = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const idsVoisines = (liste) => pairesVoisines(liste).map(({ ids }) => ids.join('/'));

test('paires voisines : le même sujet rare dans deux questions est signalé', () => {
  const liste = [
    questionValide({ id: 'q0001', texte: 'Qui a peint la Joconde ?', reponses: ['Vinci', 'Monet', 'Manet', 'Dali'], bonneReponse: 0 }),
    questionValide({ id: 'q0002', texte: 'Dans quel musée est la Joconde ?', reponses: ['Louvre', 'Orsay', 'Prado', 'Tate'], bonneReponse: 0 }),
    questionValide({ id: 'q0003', texte: 'Qui a composé le Boléro ?', reponses: ['Ravel', 'Vinci', 'Satie', 'Bizet'], bonneReponse: 0 }),
  ];
  assert.deepEqual(idsVoisines(liste), ['q0001/q0002']);
});

test('paires voisines : 2 propositions identiques sont signalées, sauf des nombres', () => {
  const liste = [
    questionValide({ id: 'q0001', reponses: ['Elvis Presley', 'Michael Jackson', 'Prince', 'Madonna'] }),
    questionValide({ id: 'q0002', texte: 'Autre question ?', reponses: ['Michael Jackson', 'Elvis Presley', 'Sting', 'Bono'] }),
    questionValide({ id: 'q0003', texte: 'Combien de pattes ?', reponses: ['4', '6', '8', '10'] }),
    questionValide({ id: 'q0004', texte: 'Combien de roues ?', reponses: ['4', '6', '3', '2'] }),
  ];
  assert.deepEqual(idsVoisines(liste), ['q0001/q0002']);
});

test('paires voisines : les paires connues de la banque sont signalées', () => {
  const trouvees = idsVoisines(banque);
  for (const paire of ['q0081/q0084', 'q0111/q0117', 'q0121/q0122', 'q0161/q0169', 'q0043/q0047', 'q0082/q0088', 'q0095/q0182']) {
    assert.ok(trouvees.includes(paire), `${paire} attendue`);
  }
});
