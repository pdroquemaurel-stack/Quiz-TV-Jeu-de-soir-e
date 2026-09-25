import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NIVEAUX } from '../server/modes/quiz.js';
import {
  alertesQuestions, pairesVoisines, stocksInsuffisants, verifierQuestions,
} from './verifier-questions.js';

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

test('espaces en trop et texte qui ne finit pas par « ? »', () => {
  erreurAttendue({ texte: " Quelle est la capitale de l'Australie ?" }, 'espaces en trop');
  erreurAttendue({ texte: "Quelle est la capitale  de l'Australie ?" }, 'espaces en trop');
  erreurAttendue({ texte: "Quelle est la capitale de l'Australie" }, '« ? »');
  erreurAttendue({ reponses: ['Sydney ', 'Canberra', 'Melbourne', 'Perth'] }, 'espaces en trop dans : Sydney');
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

test('paires voisines : un mot banal partagé ne rapproche pas deux questions', () => {
  const liste = [
    questionValide({ id: 'q0001', texte: 'Quel pays est devenu le plus peuplé ?', reponses: ['Inde', 'Chine', 'Japon', 'Laos'], bonneReponse: 0 }),
    questionValide({ id: 'q0002', texte: 'Quel compositeur est devenu sourd ?', reponses: ['Bach', 'Liszt', 'Verdi', 'Satie'], bonneReponse: 0 }),
  ];
  assert.deepEqual(idsVoisines(liste), []);
});

test('paires voisines : les paires connues de la banque sont signalées', () => {
  const trouvees = idsVoisines(banque);
  for (const paire of ['q0081/q0084', 'q0111/q0117', 'q0121/q0122', 'q0161/q0169', 'q0043/q0047', 'q0082/q0088', 'q0095/q0182']) {
    assert.ok(trouvees.includes(paire), `${paire} attendue`);
  }
});

// --- Autres alertes (tranche 22) ---

test('alerte : bonne réponse écrite dans la question, en mot entier seulement', () => {
  const liste = [
    questionValide({ id: 'q0001', texte: 'Combien de musiciens dans un quatuor à cordes ?', reponses: ['Quatuor', 'Trio', 'Duo', 'Octuor'], bonneReponse: 0 }),
    questionValide({ id: 'q0002', texte: 'Quelle est la lettre la plus fréquente en français ?', reponses: ['Le E', 'Le A', 'Le S', 'Le I'], bonneReponse: 0 }),
  ];
  assert.deepEqual(alertesQuestions(liste), [{ id: 'q0001', raison: 'la bonne réponse est écrite dans la question' }]);
});

test('alerte : propositions qui mélangent nombres et mots', () => {
  const liste = [
    questionValide({ id: 'q0001', reponses: ['12', '15', 'Aucun', '20'], bonneReponse: 0 }),
    questionValide({ id: 'q0002', reponses: ['1 000', '2,5', '50 %', '7'], bonneReponse: 0 }),
  ];
  assert.deepEqual(alertesQuestions(liste).map(({ id }) => id), ['q0001']);
});

test('alerte : thème seul sous 10 questions pour un niveau', () => {
  const liste = Array.from({ length: 12 }, (_, i) => questionValide({
    id: `q${String(i).padStart(4, '0')}`, categorie: 'sport', difficulte: i < 8 ? 1 : 3,
  }));
  const sport = stocksInsuffisants(liste, NIVEAUX).filter(({ categorie }) => categorie === 'sport');
  // Facile : 8 faciles. Normal : 12. Difficile : 4 difficiles.
  assert.deepEqual(sport, [
    { categorie: 'sport', niveau: 'facile', nombre: 8 },
    { categorie: 'sport', niveau: 'difficile', nombre: 4 },
  ]);
});
