import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierMemeReponse } from './verifier-meme-reponse.js';

const REPONSES = [
  { reponse: 'Fraise', variantes: [] },
  { reponse: 'Cerise', variantes: [] },
  { reponse: 'Framboise', variantes: [] },
  { reponse: 'Pomme', variantes: ['Pomme rouge'] },
];

function questionValide(modifications = {}) {
  return { id: 'm0001', texte: 'Cite un fruit rouge', reponses: REPONSES, ...modifications };
}

// Question valide dont la 4e réponse connue est remplacée.
function avecReponse(entree) {
  return questionValide({ reponses: [...REPONSES.slice(0, 3), entree] });
}

// Vérifie qu'une seule question avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(question, extrait) {
  const erreurs = verifierMemeReponse([question]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('même réponse : une question valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierMemeReponse([questionValide()]), []);
});

test('même réponse : le fichier doit être une liste', () => {
  assert.equal(verifierMemeReponse({}).length, 1);
});

test('même réponse : id au mauvais préfixe ou en double', () => {
  erreurAttendue(questionValide({ id: 'u0001' }), 'mNNNN');
  erreurAttendue(questionValide({ id: 'm1' }), 'mNNNN');
  const erreurs = verifierMemeReponse([questionValide(), questionValide({ texte: 'Autre' })]);
  assert.deepEqual(erreurs.length, 1);
  assert.ok(erreurs[0].includes('id en double'));
});

test('même réponse : champ en trop, dans la question ou dans une réponse', () => {
  erreurAttendue(questionValide({ categorie: 'fruits' }), 'champ(s) en trop');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: [], note: 1 }), 'champ(s) en trop');
});

test('même réponse : texte vide, trop long ou en double', () => {
  erreurAttendue(questionValide({ texte: '' }), 'texte vide');
  erreurAttendue(questionValide({ texte: 'x'.repeat(111) }), 'texte trop long');
  const erreurs = verifierMemeReponse([questionValide(), questionValide({ id: 'm0002' })]);
  assert.equal(erreurs.length, 1);
  assert.ok(erreurs[0].includes('texte en double'));
});

test('même réponse : de 4 à 15 réponses connues', () => {
  erreurAttendue(questionValide({ reponses: REPONSES.slice(0, 3) }), 'de 4 à 15');
  const seize = Array.from({ length: 16 }, (_, i) => ({ reponse: `Fruit ${i}`, variantes: [] }));
  erreurAttendue(questionValide({ reponses: seize }), 'de 4 à 15');
  erreurAttendue(questionValide({ reponses: 'Fraise' }), 'de 4 à 15');
});

test('même réponse : réponse ou variante vide, trop longue, avec espaces ou sans lettre', () => {
  erreurAttendue(avecReponse({ reponse: '', variantes: [] }), 'vide');
  erreurAttendue(avecReponse({ reponse: 'x'.repeat(31), variantes: [] }), 'trop longue');
  erreurAttendue(avecReponse({ reponse: ' Pomme', variantes: [] }), 'espaces');
  erreurAttendue(avecReponse({ reponse: '!!!', variantes: [] }), 'sans lettre');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: [''] }), 'vide');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: 'Pommes' }), 'variantes doit être une liste');
});

test('même réponse : deux formes de même clé dans une question', () => {
  erreurAttendue(avecReponse({ reponse: 'Fraises', variantes: [] }), 'se confond avec « Fraise »');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: ['la cerise'] }), 'se confond avec « Cerise »');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: ['Pommes'] }), 'se confond avec « Pomme »');
  erreurAttendue(avecReponse({ reponse: 'Pomme', variantes: ['Poire', 'POIRE'] }), 'se confond avec « Poire »');
});

test('même réponse : le vrai fichier data/meme-reponse.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/meme-reponse.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierMemeReponse(liste), []);
  assert.ok(liste.length >= 120);
});
