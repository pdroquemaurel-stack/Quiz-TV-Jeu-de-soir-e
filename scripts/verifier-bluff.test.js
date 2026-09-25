import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierBluff } from './verifier-bluff.js';

function questionValide(modifications = {}) {
  return {
    id: 'b0001',
    texte: 'Au sumo, les lutteurs lancent ___ sur le ring',
    reponse: 'Du sel',
    variantes: ['Du gros sel'],
    ...modifications,
  };
}

// Vérifie qu'une seule question avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(question, extrait) {
  const erreurs = verifierBluff([question]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('bluff : une question valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierBluff([questionValide()]), []);
  assert.deepEqual(verifierBluff([questionValide({ variantes: [] })]), []);
});

test('bluff : le fichier doit être une liste', () => {
  assert.equal(verifierBluff({}).length, 1);
});

test('bluff : id au mauvais préfixe ou en double', () => {
  erreurAttendue(questionValide({ id: 'm0001' }), 'bNNNN');
  erreurAttendue(questionValide({ id: 'b1' }), 'bNNNN');
  const erreurs = verifierBluff([questionValide(), questionValide({ texte: 'Autre ___' })]);
  assert.equal(erreurs.length, 1);
  assert.ok(erreurs[0].includes('id en double'));
});

test('bluff : champ en trop', () => {
  erreurAttendue(questionValide({ categorie: 'sport' }), 'champ(s) en trop');
});

test('bluff : texte vide, trop long ou en double', () => {
  erreurAttendue(questionValide({ texte: '' }), 'texte vide');
  erreurAttendue(questionValide({ texte: `___${'x'.repeat(108)}` }), 'texte trop long');
  const erreurs = verifierBluff([questionValide(), questionValide({ id: 'b0002' })]);
  assert.equal(erreurs.length, 1);
  assert.ok(erreurs[0].includes('texte en double'));
});

test('bluff : exactement un trou dans le texte', () => {
  erreurAttendue(questionValide({ texte: 'Au sumo, les lutteurs lancent du sel' }), 'exactement un ___');
  erreurAttendue(questionValide({ texte: 'Au sumo, ___ lancent ___' }), 'exactement un ___');
});

test('bluff : pas d\'article ni de possessif juste avant le trou', () => {
  const refuses = [
    'Au sumo, ils lancent du ___', 'L\'animal national est la ___', 'Ils ont peur des ___', 'Il était un ___',
    'La mort de son ___', 'Président d\'___', 'Né à l\'___', 'Plus longtemps qu\'___', 'Une médaille d’___',
  ];
  for (const texte of refuses) erreurAttendue(questionValide({ texte }), 'article ou possessif');
  const acceptes = ['___ ont des empreintes', 'Une horde de ___', 'Le goût ___', 'Il s\'appelle « The ___ »', 'Olive ___'];
  for (const texte of acceptes) assert.deepEqual(verifierBluff([questionValide({ texte })]), [], texte);
});

test('bluff : réponse ou variante vide, avec espaces, trop longue ou sans lettre', () => {
  erreurAttendue(questionValide({ reponse: '' }), 'réponse vide');
  erreurAttendue(questionValide({ reponse: ' Du sel' }), 'espaces');
  erreurAttendue(questionValide({ reponse: 'x'.repeat(31) }), 'trop longue');
  erreurAttendue(questionValide({ reponse: '!!!' }), 'sans lettre');
  erreurAttendue(questionValide({ variantes: [''] }), 'variante «  » vide');
  erreurAttendue(questionValide({ variantes: 'Du gros sel' }), 'variantes doit être une liste');
});

test('bluff : une variante de même clé que la réponse ou qu\'une autre variante', () => {
  erreurAttendue(questionValide({ variantes: ['le SEL'] }), 'se confond avec « Du sel »');
  erreurAttendue(questionValide({ variantes: ['Du gros sel', 'gros-sels'] }), 'se confond avec « Du gros sel »');
});

test('bluff : le vrai fichier data/bluff.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/bluff.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierBluff(liste), []);
  assert.equal(liste.length, 120);
});
