import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_PAR_DIFFICULTE, verifierGeoquiz } from './verifier-geoquiz.js';

function lieu(numero, modifications = {}) {
  return {
    id: `l${numero}`,
    nom: `Lieu ${numero}`,
    pays: 'France',
    lat: 48.8584,
    lng: 2.2945,
    image: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo_${numero}.jpg/1920px-Photo_${numero}.jpg`,
    auteur: 'Une photographe',
    licence: 'CC BY-SA 4.0',
    difficulte: 1 + (numero % 3),
    ...modifications,
  };
}

// Un pack valide : un lieu de plus que le minimum dans chaque difficulté, pour qu'un lieu mal
// écrit ne fasse pas en plus tomber sa difficulté sous le minimum.
function pack(modifierPremier = {}) {
  const liste = Array.from({ length: 3 * (MIN_PAR_DIFFICULTE + 1) }, (_, i) => lieu(i + 1));
  liste[0] = { ...liste[0], ...modifierPremier };
  return liste;
}

// Une seule erreur attendue, contenant `extrait`.
function erreurAttendue(liste, exclus, extrait) {
  const erreurs = verifierGeoquiz(liste, exclus);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('géoquiz : un pack valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierGeoquiz(pack(), []), []);
});

test('géoquiz : le pack et les exclus doivent être des listes', () => {
  assert.equal(verifierGeoquiz({}, []).length, 1);
  assert.equal(verifierGeoquiz(pack(), {}).length, 1);
});

test('géoquiz : id sans l, non numérique ou en double', () => {
  erreurAttendue(pack({ id: '243' }), [], 'l + chiffres');
  erreurAttendue(pack({ id: 'Q243' }), [], 'l + chiffres');
  erreurAttendue(pack({ id: 'labc' }), [], 'l + chiffres');
  erreurAttendue([...pack(), lieu(1)], [], 'id en double');
});

test('géoquiz : champ en trop ou manquant', () => {
  erreurAttendue(pack({ liens: 120 }), [], 'champ(s) en trop : liens');
  const sansPays = pack();
  delete sansPays[0].pays;
  erreurAttendue(sansPays, [], 'pays vide');
});

test('géoquiz : nom, pays, auteur ou licence vides', () => {
  erreurAttendue(pack({ nom: '  ' }), [], 'nom vide');
  erreurAttendue(pack({ pays: '' }), [], 'pays vide');
  erreurAttendue(pack({ auteur: '' }), [], 'auteur vide');
  erreurAttendue(pack({ licence: '' }), [], 'licence vide');
});

test('géoquiz : coordonnées hors bornes ou qui ne sont pas des nombres', () => {
  erreurAttendue(pack({ lat: 95 }), [], 'lat');
  erreurAttendue(pack({ lat: '48.8' }), [], 'lat');
  erreurAttendue(pack({ lng: -181 }), [], 'lng');
  erreurAttendue(pack({ lng: Number.NaN }), [], 'lng');
  assert.deepEqual(verifierGeoquiz(pack({ lat: -90, lng: 180 }), []), []);
});

test('géoquiz : image hors de Wikimedia ou en http', () => {
  erreurAttendue(pack({ image: 'https://example.com/photo.jpg' }), [], 'image');
  erreurAttendue(pack({ image: 'http://upload.wikimedia.org/a.jpg' }), [], 'image');
  assert.deepEqual(verifierGeoquiz(pack({ image: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.jpg' }), []), []);
});

test('géoquiz : difficulté hors de 1, 2, 3', () => {
  erreurAttendue(pack({ difficulte: 0 }), [], 'difficulte');
  erreurAttendue(pack({ difficulte: '1' }), [], 'difficulte');
});

test('géoquiz : un id exclu absent du pack est signalé', () => {
  erreurAttendue(pack(), ['l999999'], 'l999999');
});

test('géoquiz : trop peu de lieux dans une difficulté une fois les exclus retirés', () => {
  const liste = pack();
  const difficiles = liste.filter((l) => l.difficulte === 3).map((l) => l.id);
  erreurAttendue(liste, difficiles.slice(0, 2), 'difficiles');
});

test('géoquiz : le vrai pack et ses exclus passent la vérification', () => {
  const vraiPack = JSON.parse(readFileSync(new URL('../data/geoquiz.json', import.meta.url), 'utf8'));
  const vraisExclus = JSON.parse(readFileSync(new URL('../data/geoquiz-exclus.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierGeoquiz(vraiPack, vraisExclus), []);
});
