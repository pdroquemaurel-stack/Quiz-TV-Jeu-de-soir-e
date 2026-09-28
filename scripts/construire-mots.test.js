import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraireMots, normaliserMot } from './construire-mots.js';

test('mots : normalisation en majuscules sans accents', () => {
  assert.equal(normaliserMot('Été'), 'ETE');
  assert.equal(normaliserMot('œuvre'), 'OEUVRE');
  assert.equal(normaliserMot('ex-æquo'), null);
  assert.equal(normaliserMot('cæcum'), 'CAECUM');
  assert.equal(normaliserMot('garçon'), 'GARCON');
  assert.equal(normaliserMot('aujourd\'hui'), null);
  assert.equal(normaliserMot('c\'est-à-dire'), null);
  assert.equal(normaliserMot('à cloche-pied'), null);
  assert.equal(normaliserMot('etc.'), null);
});

// Un extrait au format de Lexique383.tsv (colonnes réduites, dans un autre ordre).
const TSV = [
  'phon\tortho\tlemme\tcgram',
  'Ete\tété\tété\tNOM',
  'Ete\tété\têtre\tVER',
  'mEzÇ\tmaison\tmaison\tNOM',
  'atSum\tatchoum\tatchoum\tONO',
  'kilomEtR\tkm\tkm\tNOM',
  'a\ta\tavoir\tAUX',
  'Oa\taujourd\'hui\taujourd\'hui\tADV',
  'aRistokRasi\taristocratie\taristocratie\tNOM',
  'Ek\tœuf\tœuf\tNOM',
  '',
].join('\n');

test('mots : extraction triée, sans doublon, onomatopées, abréviations et mots composés écartés', () => {
  // « km » n'a pas de voyelle ; « a » a 1 lettre ; « aristocratie » en a 12.
  assert.deepEqual(extraireMots(TSV), ['ETE', 'MAISON', 'OEUF']);
});

test('mots : un fichier sans les colonnes attendues est refusé', () => {
  assert.throws(() => extraireMots('mot\tcategorie\nmaison\tNOM'), /ortho/);
});
