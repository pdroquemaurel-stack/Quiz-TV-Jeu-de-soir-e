import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFIS_MIN, verifierDefiEncheres } from './verifier-defi-encheres.js';

function defiValide(modifications = {}, numero = 1) {
  return { id: `de-sujet-${numero}`, sujet: `sujet numéro ${numero}`, miseDepart: 5, ...modifications };
}

// Assez de défis valides pour que seul le défi modifié (le premier) pose problème.
function listeAvec(modifications) {
  return [defiValide(modifications), ...Array.from({ length: DEFIS_MIN - 1 }, (_, i) => defiValide({}, i + 2))];
}

// Vérifie que le défi avec ces modifications produit une seule erreur contenant `extrait`.
function erreurAttendue(modifications, extrait) {
  const erreurs = verifierDefiEncheres(listeAvec(modifications));
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('défi des enchères : une liste valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierDefiEncheres(listeAvec({})), []);
});

test('défi des enchères : le fichier doit être une liste d\'au moins 12 défis', () => {
  assert.equal(verifierDefiEncheres({}).length, 1);
  assert.deepEqual(verifierDefiEncheres([defiValide()]), [`au moins ${DEFIS_MIN} défis attendus (1)`]);
});

test('défi des enchères : id mal formé ou en double', () => {
  erreurAttendue({ id: 'departements' }, 'format de-');
  erreurAttendue({ id: 'de-Départements' }, 'format de-');
  erreurAttendue({ id: 'de-sujet-2' }, 'id en double');
});

test('défi des enchères : sujet vide, avec espaces, avec article ou en double', () => {
  erreurAttendue({ sujet: ' ' }, 'sujet vide');
  erreurAttendue({ sujet: 'fruits ' }, 'espaces');
  erreurAttendue({ sujet: 'les fruits' }, 'article');
  erreurAttendue({ sujet: 'des fruits' }, 'article');
  erreurAttendue({ sujet: 'Sujet numero 2' }, 'sujet en double');
});

test('défi des enchères : mise de départ hors bornes et champ en trop', () => {
  erreurAttendue({ miseDepart: 0 }, 'miseDepart');
  erreurAttendue({ miseDepart: 21 }, 'miseDepart');
  erreurAttendue({ miseDepart: 5.5 }, 'miseDepart');
  erreurAttendue({ difficulte: 2 }, 'en trop');
});

test('le fichier data/defi-encheres.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/defi-encheres.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierDefiEncheres(liste), []);
  assert.ok(liste.length >= 30);
});
