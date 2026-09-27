import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DUREE_CACHE_MS, lienExtrait, tirerEssai } from './extraits.js';

function chanson(numero) {
  return { id: `d${numero}`, deezer: numero, titre: `Titre ${numero}`, artiste: `Artiste ${numero}`, pochette: 'https://x/p.jpg', gain: -10, garder: true };
}

// Un faux Deezer : répond `piste` et compte les appels.
function fauxDeezer(piste) {
  const appels = [];
  const chercher = async (adresse) => {
    appels.push(adresse);
    return { json: async () => piste };
  };
  return { chercher, appels };
}

const PISTE_OK = { readable: true, preview: 'https://cdnt-preview.dzcdn.net/extrait.mp3' };

// Le cache vit dans le module : chaque test prend ses propres numéros de chanson.
test('extrait : id inconnu, sans appeler Deezer', async () => {
  const { chercher, appels } = fauxDeezer(PISTE_OK);
  assert.equal(await lienExtrait('d999', { chansons: [chanson(1)], chercher }), null);
  assert.equal(await lienExtrait('../etc', { chansons: [chanson(1)], chercher }), null);
  assert.equal(appels.length, 0);
});

test('extrait : chanson gardée, le lien de Deezer est renvoyé', async () => {
  const { chercher, appels } = fauxDeezer(PISTE_OK);
  assert.equal(await lienExtrait('d2', { chansons: [chanson(2)], chercher }), PISTE_OK.preview);
  assert.deepEqual(appels, ['https://api.deezer.com/track/2']);
});

test('extrait : le lien est gardé 10 min, puis redemandé', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  try {
    const { chercher, appels } = fauxDeezer(PISTE_OK);
    const options = { chansons: [chanson(3)], chercher };
    await lienExtrait('d3', options);
    mock.timers.tick(DUREE_CACHE_MS - 1);
    assert.equal(await lienExtrait('d3', options), PISTE_OK.preview);
    assert.equal(appels.length, 1);
    mock.timers.tick(1);
    await lienExtrait('d3', options);
    assert.equal(appels.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test('extrait : illisible, sans extrait ou Deezer injoignable → null, rien en cache', async () => {
  // journaliserErreur n'est jamais silencieux : on le fait taire le temps du test.
  const erreur = mock.method(console, 'error', () => {});
  try {
    const illisible = fauxDeezer({ readable: false, preview: PISTE_OK.preview });
    assert.equal(await lienExtrait('d4', { chansons: [chanson(4)], chercher: illisible.chercher }), null);
    const sansExtrait = fauxDeezer({ readable: true, preview: '' });
    assert.equal(await lienExtrait('d5', { chansons: [chanson(5)], chercher: sansExtrait.chercher }), null);
    const panne = async () => { throw new Error('réseau'); };
    assert.equal(await lienExtrait('d6', { chansons: [chanson(6)], chercher: panne }), null);
    assert.equal(erreur.mock.callCount(), 3);

    const retour = fauxDeezer(PISTE_OK);
    assert.equal(await lienExtrait('d4', { chansons: [chanson(4)], chercher: retour.chercher }), PISTE_OK.preview);
  } finally {
    erreur.mock.restore();
  }
});

test('essai : 5 chansons différentes, sans pochette ni id Deezer', () => {
  const chansons = Array.from({ length: 8 }, (_, i) => chanson(10 + i));
  const essai = tirerEssai(chansons);
  assert.equal(essai.length, 5);
  assert.equal(new Set(essai.map((c) => c.id)).size, 5);
  for (const c of essai) assert.deepEqual(Object.keys(c), ['id', 'titre', 'artiste', 'gain']);
});
