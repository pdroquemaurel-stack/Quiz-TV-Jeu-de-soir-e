import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rattacherPlaylists } from './categoriser-blind-test.js';

function chanson(numero, modifications = {}) {
  return {
    id: `d${numero}`, deezer: numero, titre: `Titre ${numero}`, artiste: `Artiste ${numero}`,
    pochette: 'https://p', gain: -9, garder: true, ...modifications,
  };
}

// Une piste telle que la renvoie https://api.deezer.com/playlist/<id>/tracks.
function piste(id, modifications = {}) {
  return { id, title_short: `Titre ${id}`, artist: { name: `Artiste ${id}` }, ...modifications };
}

test('playlists : chaque chanson reçoit l\'id des playlists où elle est, sans rien changer d\'autre', () => {
  const catalogue = [chanson(1), chanson(2), chanson(3)];
  const { catalogue: rattache, rattachees } = rattacherPlaylists(catalogue, [
    { id: 70, pistes: [piste(1), piste(2)] },
    { id: 80, pistes: [piste(2), piste(9)] },
  ]);
  assert.deepEqual(rattache[0], { ...catalogue[0], playlists: [70] });
  assert.deepEqual(rattache[1], { ...catalogue[1], playlists: [70, 80] });
  assert.equal(rattache[2], catalogue[2], 'chanson retrouvée nulle part : le même objet, sans champ ajouté');
  assert.equal(rattachees, 3);
  assert.deepEqual(Object.keys(rattache[0]), [...Object.keys(catalogue[0]), 'playlists'], 'champ ajouté à la fin');
});

test('playlists : la même chanson sous un autre id Deezer est retrouvée par son titre et son artiste', () => {
  const catalogue = [chanson(1, { titre: 'Gimme! Gimme! Gimme!', artiste: 'ABBA' })];
  const { catalogue: rattache } = rattacherPlaylists(catalogue, [
    { id: 70, pistes: [piste(77, { title_short: 'gimme! gimme! gimme! ', artist: { name: 'Abba' } })] },
  ]);
  assert.deepEqual(rattache[0].playlists, [70]);
});

test('playlists : un id déjà là n\'est pas répété, ceux mis à la main restent', () => {
  const catalogue = [chanson(1, { playlists: [55, 70] })];
  const { catalogue: rattache, rattachees } = rattacherPlaylists(catalogue, [
    { id: 70, pistes: [piste(1)] }, { id: 90, pistes: [piste(1)] }, { id: 90, pistes: [piste(1)] },
  ]);
  assert.deepEqual(rattache[0].playlists, [55, 70, 90]);
  assert.equal(rattachees, 1);
});
