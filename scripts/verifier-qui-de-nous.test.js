import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierQuiDeNous } from './verifier-qui-de-nous.js';

function questionValide(modifications = {}) {
  return {
    id: 'n0001',
    texte: 'Qui de nous est le plus susceptible de rater son avion ?',
    ...modifications,
  };
}

// Vérifie qu'une seule question avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(modifications, extrait) {
  const erreurs = verifierQuiDeNous([questionValide(modifications)]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('qui de nous : une question valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierQuiDeNous([questionValide()]), []);
});

test('qui de nous : le fichier doit être une liste', () => {
  assert.equal(verifierQuiDeNous({}).length, 1);
});

test('qui de nous : id au mauvais préfixe ou en double', () => {
  erreurAttendue({ id: 'e0001' }, 'nNNNN');
  erreurAttendue({ id: 'n1' }, 'nNNNN');
  const erreurs = verifierQuiDeNous([
    questionValide(),
    questionValide({ texte: 'Qui de nous cuisine le mieux ?' }),
  ]);
  assert.deepEqual(erreurs, ['question 2 (n0001) : id en double']);
});

test('qui de nous : texte vide, trop long, mauvais début ou sans point d\'interrogation', () => {
  erreurAttendue({ texte: ' ' }, 'texte vide');
  erreurAttendue({ texte: `Qui de nous ${'a'.repeat(110)} ?` }, 'trop long');
  erreurAttendue({ texte: 'Qui est le plus susceptible de rater son avion ?' }, '« Qui de nous »');
  erreurAttendue({ texte: 'Qui de nous cuisine le mieux' }, '« ? »');
});

test('qui de nous : champ en trop et texte en double', () => {
  erreurAttendue({ categorie: 'voyage' }, 'en trop');
  const erreurs = verifierQuiDeNous([questionValide(), questionValide({ id: 'n0002' })]);
  assert.deepEqual(erreurs, ['question 2 (n0002) : texte en double']);
});

test('le fichier data/qui-de-nous.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/qui-de-nous.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierQuiDeNous(liste), []);
  assert.ok(liste.length >= 120);
});
