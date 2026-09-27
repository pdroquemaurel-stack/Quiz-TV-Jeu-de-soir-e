import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_CHANSONS, verifierBlindTest } from './verifier-blind-test.js';

function chanson(numero, modifications = {}) {
  return {
    id: `d${numero}`, deezer: numero, titre: `Titre ${numero}`, artiste: `Artiste ${numero}`,
    pochette: `https://cdn-images.dzcdn.net/images/cover/${numero}/250x250.jpg`, gain: -10.5, garder: true,
    ...modifications,
  };
}

// Un catalogue valide de MIN_CHANSONS chansons (1 à 50), le premier éventuellement modifié.
function catalogue(modifierPremier = {}) {
  const liste = Array.from({ length: MIN_CHANSONS }, (_, i) => chanson(i + 1));
  liste[0] = { ...liste[0], ...modifierPremier };
  return liste;
}

// Une seule erreur attendue, contenant `extrait`.
function erreurAttendue(liste, extrait) {
  const erreurs = verifierBlindTest(liste);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('blind test : un catalogue valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierBlindTest(catalogue()), []);
});

test('blind test : le fichier doit être une liste', () => {
  assert.equal(verifierBlindTest({}).length, 1);
});

test('blind test : id qui ne correspond pas à deezer, ou en double', () => {
  erreurAttendue(catalogue({ id: 'd999' }), 'id doit valoir « d1 »');
  erreurAttendue(catalogue({ id: '1' }), 'id doit valoir « d1 »');
  erreurAttendue([...catalogue(), chanson(1, { titre: 'Autre' })], 'id en double');
});

test('blind test : deezer doit être un entier positif', () => {
  erreurAttendue(catalogue({ deezer: '1' }), 'entier positif');
  erreurAttendue(catalogue({ deezer: 0 }), 'entier positif');
  erreurAttendue(catalogue({ deezer: 1.5 }), 'entier positif');
});

test('blind test : champ en trop ou manquant', () => {
  erreurAttendue(catalogue({ annee: 2001 }), 'champ(s) en trop : annee');
  const { gain, ...sansGain } = chanson(1);
  erreurAttendue([sansGain, ...catalogue().slice(1)], 'gain');
});

test('blind test : titre ou artiste vide, ou avec des espaces au bord', () => {
  erreurAttendue(catalogue({ titre: '' }), 'titre vide');
  erreurAttendue(catalogue({ titre: '  ' }), 'titre vide');
  erreurAttendue(catalogue({ artiste: 'Daft Punk ' }), 'artiste avec des espaces');
});

test('blind test : pochette https, gain numérique, garder booléen', () => {
  erreurAttendue(catalogue({ pochette: 'http://x/p.jpg' }), 'https://');
  erreurAttendue(catalogue({ gain: '-10' }), 'gain doit être un nombre');
  erreurAttendue(catalogue({ gain: Number.NaN }), 'gain doit être un nombre');
  erreurAttendue(catalogue({ garder: 'oui' }), 'garder');
});

test('blind test : au moins 50 chansons gardées', () => {
  erreurAttendue(catalogue({ garder: false }), `${MIN_CHANSONS - 1} chansons gardées`);
  erreurAttendue(catalogue().slice(1), `${MIN_CHANSONS - 1} chansons gardées`);
});

test('blind test : la même chanson gardée deux fois, sous deux ids', () => {
  erreurAttendue([...catalogue(), chanson(99, { titre: 'TITRE 1', artiste: 'artiste 1' })], 'même chanson que d1');
  assert.deepEqual(verifierBlindTest([...catalogue(), chanson(99, { titre: 'Titre 1', artiste: 'Artiste 1', garder: false })]), []);
});

test('blind test : le vrai catalogue data/blind-test.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/blind-test.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierBlindTest(liste), []);
});
