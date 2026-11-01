import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTS_MIN, verifierChapeau } from './verifier-chapeau.js';

function motValide(modifications = {}, numero = 1) {
  return { id: `ch-mot-${numero}`, mot: `Mot numéro ${numero}`, ...modifications };
}

// Assez de mots valides pour que seul le mot modifié (le premier) pose problème.
function listeAvec(modifications) {
  return [motValide(modifications), ...Array.from({ length: MOTS_MIN - 1 }, (_, i) => motValide({}, i + 2))];
}

function erreurAttendue(modifications, extrait) {
  const erreurs = verifierChapeau(listeAvec(modifications));
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('chapeau : une liste valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierChapeau(listeAvec({})), []);
});

test('chapeau : le fichier doit être une liste d\'au moins 60 mots', () => {
  assert.equal(verifierChapeau({}).length, 1);
  assert.deepEqual(verifierChapeau([motValide()]), [`au moins ${MOTS_MIN} mots attendus (1)`]);
});

test('chapeau : id mal formé ou en double', () => {
  erreurAttendue({ id: 'pizza' }, 'format ch-');
  erreurAttendue({ id: 'ch-Pizza' }, 'format ch-');
  erreurAttendue({ id: 'ch-mot-2' }, 'id en double');
});

test('chapeau : mot vide, avec espaces, trop long ou en double, champ en trop', () => {
  erreurAttendue({ mot: ' ' }, 'mot vide');
  erreurAttendue({ mot: 'Pizza ' }, 'espaces');
  erreurAttendue({ mot: 'x'.repeat(31) }, 'plus de 30');
  // Même clé que Même réponse : accents, majuscules et article ignorés.
  erreurAttendue({ mot: 'le mot numero 2' }, 'mot en double');
  erreurAttendue({ categorie: 'objet' }, 'en trop');
});

test('le fichier data/chapeau.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/chapeau.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierChapeau(liste), []);
  assert.ok(liste.length >= 150);
});
