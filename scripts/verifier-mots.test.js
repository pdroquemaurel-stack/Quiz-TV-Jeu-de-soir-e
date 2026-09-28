import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lignesDe, MIN_MOTS, verifierMots } from './verifier-mots.js';

// Un dictionnaire valide de MIN_MOTS mots de 5 lettres, triés : AAAAA, AAAAB…
function dictionnaire() {
  const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: MIN_MOTS }, (_, n) => {
    let mot = '';
    for (let i = 0; i < 5; i++) {
      mot = lettres[n % 26] + mot;
      n = Math.floor(n / 26);
    }
    return mot;
  });
}

// Une seule erreur attendue, contenant `extrait`.
function erreurAttendue(lignes, extrait) {
  const erreurs = verifierMots(lignes);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

// Remplace le mot d'index `index` en gardant l'ordre alphabétique autour.
function avec(index, mot) {
  const lignes = dictionnaire();
  lignes[index] = mot;
  return lignes;
}

test('mots : un dictionnaire valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierMots(dictionnaire()), []);
});

// Le dernier mot, remplacé par un mot qui reste après son précédent dans l'ordre alphabétique.
const DERNIER = MIN_MOTS - 1;

test('mots : que des majuscules A à Z', () => {
  erreurAttendue(avec(0, ''), 'A à Z');
  erreurAttendue(avec(DERNIER, 'ZZZZa'), 'A à Z');
  erreurAttendue(avec(DERNIER, 'ZZZZÉ'), 'A à Z');
  erreurAttendue(avec(DERNIER, 'ZZ-ZZ'), 'A à Z');
});

test('mots : de 2 à 9 lettres', () => {
  erreurAttendue(avec(DERNIER, 'Z'), 'de 2 à 9 lettres');
  erreurAttendue(avec(DERNIER, 'ZZZZZZZZZZ'), 'de 2 à 9 lettres');
});

test('mots : ni doublon ni désordre', () => {
  const lignes = dictionnaire();
  lignes.splice(1, 0, lignes[0]);
  lignes.pop();
  erreurAttendue(lignes, 'en double');
  erreurAttendue(avec(1, 'ZZ'), 'ordre alphabétique');
});

test('mots : assez de mots', () => {
  erreurAttendue(dictionnaire().slice(1), `il en faut au moins ${MIN_MOTS}`);
});

test('mots : la ligne vide finale ne compte pas', () => {
  assert.deepEqual(lignesDe('ETE\nMAISON\n'), ['ETE', 'MAISON']);
  assert.deepEqual(lignesDe('ETE\r\nMAISON'), ['ETE', 'MAISON']);
});

test('mots : le vrai dictionnaire est valide', () => {
  const texte = readFileSync(new URL('../data/mots.txt', import.meta.url), 'utf8');
  assert.deepEqual(verifierMots(lignesDe(texte)), []);
});
