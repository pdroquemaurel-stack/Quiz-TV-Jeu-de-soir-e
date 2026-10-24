import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIN_CHANSONS, MIN_PAR_CATEGORIE, bilanCategories, verifierBlindTest, verifierPlaylists,
} from './verifier-blind-test.js';

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

// Deux playlists rangées dans des catégories, comme data/playlists-blind-test.json.
const PLAYLISTS = { 70: { nom: 'En mode 70', categorie: 'Disco' }, 80: { nom: 'En mode 80', categorie: 'Rap' } };

test('blind test : playlists facultatives, des ids connus du fichier des playlists, sans doublon (tranche 42)', () => {
  assert.deepEqual(verifierBlindTest(catalogue({ playlists: [70, 80] }), PLAYLISTS), []);
  const erreurAvecPlaylists = (modifications, extrait) => {
    const erreurs = verifierBlindTest(catalogue(modifications), PLAYLISTS);
    assert.equal(erreurs.length, 1, erreurs.join(' | '));
    assert.ok(erreurs[0].includes(extrait), erreurs[0]);
  };
  erreurAvecPlaylists({ playlists: [] }, 'liste non vide');
  erreurAvecPlaylists({ playlists: 70 }, 'liste non vide');
  erreurAvecPlaylists({ playlists: ['70'] }, 'entiers positifs');
  erreurAvecPlaylists({ playlists: [99] }, 'playlist 99 absente');
  erreurAvecPlaylists({ playlists: [70, 70] }, 'playlist en double');
});

test('blind test : fichier des playlists, un nom et une catégorie par id Deezer', () => {
  assert.deepEqual(verifierPlaylists(PLAYLISTS), []);
  assert.deepEqual(verifierPlaylists({}), []);
  assert.equal(verifierPlaylists([]).length, 1);
  assert.deepEqual(verifierPlaylists({ abc: { nom: 'X', categorie: 'Y' } }), ['Playlist abc : l\'id doit être un id Deezer']);
  assert.deepEqual(verifierPlaylists({ 70: { nom: 'X' } }), ['Playlist 70 : categorie vide ou absent']);
  assert.deepEqual(verifierPlaylists({ 70: { nom: 'X', categorie: 'Disco ' } }), ['Playlist 70 : categorie avec des espaces au début ou à la fin']);
});

test('blind test : bilan des catégories, chansons gardées sans playlist et petites catégories', () => {
  const liste = catalogue();
  liste[0] = { ...liste[0], playlists: [70] };
  liste[1] = { ...liste[1], playlists: [70, 80], garder: false };
  for (let i = 2; i < 2 + MIN_PAR_CATEGORIE; i++) liste[i] = { ...liste[i], playlists: [80] };
  const { parCategorie, sansCategorie, petites } = bilanCategories(liste, PLAYLISTS);
  assert.deepEqual(parCategorie, { Disco: 1, Rap: MIN_PAR_CATEGORIE });
  assert.deepEqual(petites, ['Disco']);
  assert.equal(sansCategorie.length, MIN_CHANSONS - 2 - MIN_PAR_CATEGORIE);
});

test('blind test : le vrai catalogue data/blind-test.json est valide, avec ses playlists', () => {
  const lire = (fichier) => JSON.parse(readFileSync(new URL(`../data/${fichier}`, import.meta.url), 'utf8'));
  const playlists = lire('playlists-blind-test.json');
  assert.deepEqual(verifierPlaylists(playlists), []);
  assert.deepEqual(verifierBlindTest(lire('blind-test.json'), playlists), []);
});
