import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GIF_PAR_PARTIE, TAILLE_MAX_OCTETS, lireTailles, verifierLegende } from './verifier-legende.js';

function gif(numero, modifications = {}) {
  return { id: `g${numero}`, nom: `Gif ${numero}`, fichier: `gifs/${numero}.mp4`, garder: true, ...modifications };
}

// Un catalogue valide de 8 GIF (1 à 8), et les tailles de leurs vidéos sur le « disque ».
function catalogue(modifierPremier = {}) {
  const liste = Array.from({ length: GIF_PAR_PARTIE }, (_, i) => gif(i + 1));
  liste[0] = { ...liste[0], ...modifierPremier };
  return liste;
}

function taillesDe(liste, octets = 200000) {
  return new Map(liste.map((element) => [element.fichier, octets]));
}

// Une seule erreur attendue, contenant `extrait`.
function erreurAttendue(liste, tailles, extrait) {
  const erreurs = verifierLegende(liste, tailles);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('légende : un catalogue valide ne donne aucune erreur', () => {
  const liste = catalogue();
  assert.deepEqual(verifierLegende(liste, taillesDe(liste)), []);
});

test('légende : le fichier doit être une liste', () => {
  assert.equal(verifierLegende({}, new Map()).length, 1);
});

test('légende : id sans g, non numérique ou en double', () => {
  // Sans id valide, aucune vidéo ne peut lui correspondre : le disque n'a que celles des 7 autres.
  const tailles = taillesDe(catalogue().slice(1));
  erreurAttendue(catalogue({ id: '1' }), tailles, 'g + chiffres');
  erreurAttendue(catalogue({ id: 'gabc' }), tailles, 'g + chiffres');
  erreurAttendue(catalogue({ id: 'b0001' }), tailles, 'g + chiffres');
  const liste = [...catalogue(), gif(1, { nom: 'Autre' })];
  erreurAttendue(liste, taillesDe(catalogue()), 'id en double');
});

test('légende : champ en trop ou manquant', () => {
  const liste = catalogue();
  const tailles = taillesDe(liste);
  erreurAttendue(catalogue({ categorie: 'film' }), tailles, 'champ(s) en trop : categorie');
  const sansNom = catalogue();
  delete sansNom[0].nom;
  erreurAttendue(sansNom, tailles, 'nom vide');
  const sansGarder = catalogue();
  delete sansGarder[0].garder;
  erreurAttendue(sansGarder, tailles, 'garder doit valoir');
});

test('légende : nom vide ou avec des espaces au bord', () => {
  const tailles = taillesDe(catalogue());
  erreurAttendue(catalogue({ nom: '  ' }), tailles, 'nom vide');
  erreurAttendue(catalogue({ nom: ' Gif 1' }), tailles, 'espaces');
});

test('légende : garder doit être un booléen', () => {
  erreurAttendue(catalogue({ garder: 'oui' }), taillesDe(catalogue()), 'garder doit valoir');
});

test('légende : le fichier doit correspondre à l\'id', () => {
  const tailles = taillesDe(catalogue());
  erreurAttendue(catalogue({ fichier: 'gifs/2.mp4' }), tailles, 'fichier doit valoir « gifs/1.mp4 »');
  erreurAttendue(catalogue({ fichier: 'gifs/1.gif' }), tailles, 'fichier doit valoir');
  erreurAttendue(catalogue({ fichier: 'public/gifs/1.mp4' }), tailles, 'fichier doit valoir');
});

test('légende : une vidéo gardée absente ou trop lourde', () => {
  const liste = catalogue();
  const sansPremiere = taillesDe(liste);
  sansPremiere.delete('gifs/1.mp4');
  erreurAttendue(liste, sansPremiere, 'vidéo absente : public/gifs/1.mp4');

  const lourde = taillesDe(liste);
  lourde.set('gifs/1.mp4', TAILLE_MAX_OCTETS + 1);
  erreurAttendue(liste, lourde, 'vidéo trop lourde');
  lourde.set('gifs/1.mp4', TAILLE_MAX_OCTETS);
  assert.deepEqual(verifierLegende(liste, lourde), []);
});

test('légende : un GIF non gardé peut ne pas avoir de vidéo', () => {
  const liste = [...catalogue(), gif(9, { garder: false })];
  assert.deepEqual(verifierLegende(liste, taillesDe(catalogue())), []);
});

test('légende : une vidéo qu\'aucun GIF gardé n\'utilise est signalée', () => {
  const liste = [...catalogue(), gif(9, { garder: false })];
  erreurAttendue(liste, taillesDe(liste), 'public/gifs/9.mp4 : aucun GIF gardé');
  erreurAttendue(catalogue(), new Map([...taillesDe(catalogue()), ['gifs/perdu.mp4', 10]]), 'gifs/perdu.mp4');
});

test('légende : il faut au moins 8 GIF gardés', () => {
  const liste = catalogue({ garder: false });
  const tailles = taillesDe(liste.slice(1));
  erreurAttendue(liste, tailles, `7 GIF gardés, il en faut au moins ${GIF_PAR_PARTIE}`);
});

test('légende : le vrai catalogue data/legende.json et ses vidéos sont valides', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/legende.json', import.meta.url), 'utf8'));
  const tailles = lireTailles(new URL('../public/', import.meta.url));
  assert.deepEqual(verifierLegende(liste, tailles), []);
});
