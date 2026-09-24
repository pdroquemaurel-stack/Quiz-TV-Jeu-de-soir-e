import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliser } from './undercover.js';

test('undercover : normaliser ignore la casse, les accents et les espaces en trop', () => {
  for (const saisie of ['PISCINE', 'piscine', 'Piscíne', '  piscine  ', 'Pîscine']) {
    assert.equal(normaliser(saisie), 'piscine');
  }
  assert.equal(normaliser('Café'), 'cafe');
  assert.equal(normaliser('  Pomme   de  terre '), 'pomme de terre');
});

test('undercover : normaliser ne confond pas un pluriel avec le singulier', () => {
  assert.notEqual(normaliser('Plages'), normaliser('Plage'));
});
