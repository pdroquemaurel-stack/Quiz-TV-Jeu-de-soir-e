import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierEstimation } from './verifier-estimation.js';

function questionValide(modifications = {}) {
  return {
    id: 'e0001',
    texte: "Combien de kilomètres séparent Paris de Marseille, à vol d'oiseau ?",
    reponse: 660,
    unite: 'km',
    categorie: 'geographie',
    difficulte: 2,
    ...modifications,
  };
}

// Vérifie qu'une seule question avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(modifications, extrait) {
  const erreurs = verifierEstimation([questionValide(modifications)]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('estimation : une question valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierEstimation([questionValide()]), []);
  assert.deepEqual(verifierEstimation([questionValide({ unite: '' })]), []);
});

test('estimation : le fichier doit être une liste', () => {
  assert.equal(verifierEstimation({}).length, 1);
});

test('estimation : id au mauvais format ou en double', () => {
  erreurAttendue({ id: 'q0001' }, 'eNNNN');
  const erreurs = verifierEstimation([questionValide(), questionValide({ texte: 'Autre ?' })]);
  assert.deepEqual(erreurs, ['question 2 (e0001) : id en double']);
});

test('estimation : texte vide, trop long ou sans point d\'interrogation', () => {
  erreurAttendue({ texte: ' ' }, 'texte vide');
  erreurAttendue({ texte: `${'a'.repeat(120)} ?` }, 'trop long');
  erreurAttendue({ texte: 'Combien de km' }, '« ? »');
});

test('estimation : réponse décimale, négative, trop grande ou en texte', () => {
  for (const reponse of [12.5, -3, 1e12, '660', null]) erreurAttendue({ reponse }, 'reponse');
  assert.deepEqual(verifierEstimation([questionValide({ reponse: 0 })]), []);
});

test('estimation : unité, catégorie, difficulté, champ en trop', () => {
  erreurAttendue({ unite: undefined }, 'unite');
  erreurAttendue({ unite: 'kilomètres carrés' }, 'unite trop longue');
  erreurAttendue({ categorie: 'cuisine' }, 'categorie');
  erreurAttendue({ difficulte: 4 }, 'difficulte');
  erreurAttendue({ source: 'wiki' }, 'en trop');
});

test('le fichier data/estimation.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/estimation.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierEstimation(liste), []);
  assert.ok(liste.length >= 80);
});
