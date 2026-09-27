import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aRelire, ajouterChansons } from './importer-deezer.js';

// Une piste telle que la renvoie https://api.deezer.com/track/<id>.
function piste(id, modifications = {}) {
  return {
    id, readable: true, title_short: `Titre ${id}`, preview: `https://cdnt-preview.dzcdn.net/${id}.mp3`, gain: -9.8,
    artist: { name: `Artiste ${id}` }, album: { cover_medium: `https://cdn-images.dzcdn.net/${id}.jpg` },
    ...modifications,
  };
}

test('import : une piste devient une chanson gardée, à la fin du catalogue', () => {
  const existante = { id: 'd1', deezer: 1, titre: 'Relu', artiste: 'A', pochette: 'https://p', gain: -5, garder: false };
  const { catalogue, ajoutees } = ajouterChansons([existante], [piste(2)]);
  assert.deepEqual(catalogue, [existante, {
    id: 'd2', deezer: 2, titre: 'Titre 2', artiste: 'Artiste 2',
    pochette: 'https://cdn-images.dzcdn.net/2.jpg', gain: -9.8, garder: true,
  }]);
  assert.equal(ajoutees.length, 1);
});

test('import : une chanson déjà au catalogue n\'est ni modifiée ni rajoutée', () => {
  const existante = { id: 'd1', deezer: 1, titre: 'Titre relu', artiste: 'A', pochette: 'https://p', gain: -5, garder: false };
  const { catalogue, ajoutees } = ajouterChansons([existante], [piste(1), piste(3), piste(3)]);
  assert.deepEqual(catalogue.map((c) => c.id), ['d1', 'd3']);
  assert.equal(catalogue[0], existante);
  assert.equal(ajoutees.length, 1);
});

test('import : pistes illisibles, sans extrait ou sans gain écartées et comptées', () => {
  const pistes = [piste(1, { readable: false }), piste(2, { preview: '' }), piste(3, { gain: undefined }), piste(4, { readable: false })];
  const { catalogue, ecartees } = ajouterChansons([], pistes);
  assert.deepEqual(catalogue, []);
  assert.deepEqual(ecartees, { illisible: 2, 'sans extrait': 1, 'sans gain': 1 });
});

test('import : la même chanson sous un autre id est écartée comme doublon', () => {
  const existante = { id: 'd1', deezer: 1, titre: 'Gimme! Gimme! Gimme!', artiste: 'ABBA', pochette: 'https://p', gain: -5, garder: true };
  const pistes = [
    piste(2, { title_short: 'gimme! gimme! gimme!', artist: { name: 'Abba' } }),
    piste(3), piste(4, { title_short: 'Titre 3', artist: { name: 'Artiste 3' } }),
  ];
  const { catalogue, ecartees } = ajouterChansons([existante], pistes);
  assert.deepEqual(catalogue.map((c) => c.id), ['d1', 'd3']);
  assert.deepEqual(ecartees, { doublon: 2 });
});

test('import : espaces retirés des bords du titre et de l\'artiste', () => {
  const { catalogue } = ajouterChansons([], [piste(1, { title_short: ' Titre ', artist: { name: 'Nom ' } })]);
  assert.equal(catalogue[0].titre, 'Titre');
  assert.equal(catalogue[0].artiste, 'Nom');
});

test('import : titres à relire repérés', () => {
  for (const titre of ['Song (Radio Edit)', 'Song - Remastered 2011', 'Song feat. X', 'Song [Live]', 'Song Remaster']) {
    assert.ok(aRelire({ titre }), titre);
  }
  for (const titre of ['Harder, Better, Faster, Stronger', 'Rock-a-Bye', "L'Aventurier"]) {
    assert.ok(!aRelire({ titre }), titre);
  }
});
