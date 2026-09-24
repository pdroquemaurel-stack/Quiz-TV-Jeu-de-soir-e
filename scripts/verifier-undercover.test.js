import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierUndercover } from './verifier-undercover.js';

function paireValide(modifications = {}) {
  return {
    id: 'u0001',
    mots: [
      { mot: 'Plage', variantes: ['Plages'] },
      { mot: 'Piscine', variantes: ['Piscines'] },
    ],
    ...modifications,
  };
}

// Paire valide dont le 1er et le 2e mot sont remplacés.
function avecMots(premier, second) {
  return paireValide({ mots: [premier, second] });
}

// Vérifie qu'une seule paire avec ces modifications produit une erreur contenant `extrait`.
function erreurAttendue(paire, extrait) {
  const erreurs = verifierUndercover([paire]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('undercover : une paire valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierUndercover([paireValide()]), []);
  assert.deepEqual(verifierUndercover([avecMots({ mot: 'Café', variantes: [] }, { mot: 'Thé', variantes: [] })]), []);
});

test('undercover : le fichier doit être une liste', () => {
  assert.equal(verifierUndercover({}).length, 1);
});

test('undercover : id au mauvais préfixe ou en double', () => {
  erreurAttendue(paireValide({ id: 'n0001' }), 'uNNNN');
  erreurAttendue(paireValide({ id: 'u1' }), 'uNNNN');
  const autre = avecMots({ mot: 'Café', variantes: [] }, { mot: 'Thé', variantes: [] });
  assert.deepEqual(verifierUndercover([paireValide(), autre]), ['paire 2 (u0001) : id en double']);
});

test('undercover : champ en trop dans la paire ou dans un mot', () => {
  erreurAttendue(paireValide({ categorie: 'lieux' }), 'en trop');
  erreurAttendue(avecMots({ mot: 'Plage', variantes: [], indice: 'sable' }, { mot: 'Piscine', variantes: [] }), 'en trop');
});

test('undercover : une paire doit avoir exactement 2 mots', () => {
  erreurAttendue(paireValide({ mots: [{ mot: 'Plage', variantes: [] }] }), 'exactement 2');
  const trois = [1, 2, 3].map((n) => ({ mot: `Mot${n}`, variantes: [] }));
  erreurAttendue(paireValide({ mots: trois }), 'exactement 2');
});

test('undercover : mot vide, trop long, avec espaces, variantes absentes', () => {
  const piscine = { mot: 'Piscine', variantes: [] };
  erreurAttendue(avecMots({ mot: ' ', variantes: [] }, piscine), 'vide');
  erreurAttendue(avecMots({ mot: 'P'.repeat(21), variantes: [] }, piscine), 'trop long');
  erreurAttendue(avecMots({ mot: 'Plage ', variantes: [] }, piscine), 'espaces');
  erreurAttendue(avecMots({ mot: 'Plage' }, piscine), 'liste');
});

test('undercover : variante en double ou identique au mot une fois normalisée', () => {
  const piscine = { mot: 'Piscine', variantes: [] };
  erreurAttendue(avecMots({ mot: 'Plage', variantes: ['Plages', 'plages'] }, piscine), 'en double');
  erreurAttendue(avecMots({ mot: 'Clé', variantes: ['CLE'] }, piscine), 'en double');
});

test('undercover : les deux mots ne doivent pas se confondre', () => {
  erreurAttendue(avecMots({ mot: 'Café', variantes: [] }, { mot: 'cafe', variantes: [] }), 'se confondent');
  erreurAttendue(avecMots({ mot: 'Plage', variantes: ['Piscine'] }, { mot: 'Piscine', variantes: [] }), 'se confondent');
});

test('undercover : paire en double, dans un ordre ou dans l\'autre', () => {
  const inversee = { ...paireValide({ id: 'u0002' }), mots: [...paireValide().mots].reverse() };
  assert.deepEqual(verifierUndercover([paireValide(), inversee]), ['paire 2 (u0002) : paire en double']);
});

test('le fichier data/undercover.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/undercover.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierUndercover(liste), []);
  assert.ok(liste.length >= 60);
});
