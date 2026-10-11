import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERSONNAGES_MIN_PAR_NIVEAU, verifierQuiSuisJe } from './verifier-qui-suis-je.js';

function personnageValide(modifications = {}, numero = 1, niveau = 1) {
  return {
    id: `qs-personnage-${numero}`,
    nom: `Personnage ${numero}`,
    categorie: 'Chanteuse',
    niveau,
    wikipedia: `Personnage ${numero}`,
    image: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Portrait.jpg',
    auteur: 'Jean Photographe',
    licence: 'CC BY-SA 4.0',
    ...modifications,
  };
}

// Assez de personnages valides de chaque niveau pour que seul le premier, modifié, pose problème.
function listeAvec(modifications) {
  const autres = Array.from({ length: 2 * PERSONNAGES_MIN_PAR_NIVEAU }, (_, i) =>
    personnageValide({}, i + 2, i < PERSONNAGES_MIN_PAR_NIVEAU ? 1 : 2));
  return [personnageValide(modifications), ...autres];
}

// Vérifie que le personnage avec ces modifications produit une seule erreur contenant `extrait`.
function erreurAttendue(modifications, extrait) {
  const erreurs = verifierQuiSuisJe(listeAvec(modifications));
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('qui suis-je : une liste valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierQuiSuisJe(listeAvec({})), []);
  assert.deepEqual(verifierQuiSuisJe(listeAvec({
    image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/P.jpg/1280px-P.jpg',
  })), []);
  // Image non libre, hébergée par le Wikipédia anglais.
  assert.deepEqual(verifierQuiSuisJe(listeAvec({
    image: 'https://upload.wikimedia.org/wikipedia/en/a/ab/Mario.png', auteur: 'Wikipédia', licence: 'Droits réservés',
  })), []);
});

test('qui suis-je : le fichier doit être une liste avec assez de personnages par niveau', () => {
  assert.equal(verifierQuiSuisJe({}).length, 1);
  assert.deepEqual(verifierQuiSuisJe([personnageValide()]), [
    `au moins ${PERSONNAGES_MIN_PAR_NIVEAU} personnages de niveau 1 attendus (1)`,
    `au moins ${PERSONNAGES_MIN_PAR_NIVEAU} personnages de niveau 2 attendus (0)`,
  ]);
});

test('qui suis-je : id mal formé ou en double', () => {
  erreurAttendue({ id: 'celine-dion' }, 'format qs-');
  erreurAttendue({ id: 'qs-Céline' }, 'format qs-');
  erreurAttendue({ id: 'qs-personnage-2' }, 'id en double');
});

test('qui suis-je : nom ou catégorie vide, avec espaces, nom en double', () => {
  erreurAttendue({ nom: ' ' }, 'nom vide');
  erreurAttendue({ nom: 'Astérix ' }, 'espaces');
  erreurAttendue({ categorie: '' }, 'categorie vide');
  erreurAttendue({ nom: 'PERSONNAGE 2' }, 'nom en double');
});

test('qui suis-je : niveau hors 1–2 et champ en trop', () => {
  erreurAttendue({ niveau: 3 }, 'niveau');
  erreurAttendue({ niveau: '1' }, 'niveau');
  erreurAttendue({ wikidata: 'Q1835' }, 'en trop');
});

test('qui suis-je : titre Wikipédia absent ou vide', () => {
  erreurAttendue({ wikipedia: undefined }, 'wikipedia vide');
  erreurAttendue({ wikipedia: '' }, 'wikipedia vide');
  erreurAttendue({ wikipedia: ' Zidane' }, 'espaces');
});

test('qui suis-je : photo obligatoire, avec auteur et licence, sur Wikimedia', () => {
  erreurAttendue({ image: undefined }, 'image vide');
  erreurAttendue({ auteur: '' }, 'auteur vide');
  erreurAttendue({ licence: undefined }, 'licence vide');
  erreurAttendue({ image: 'https://exemple.fr/photo.jpg' }, 'hors de Wikimedia');
});

test('le fichier data/qui-suis-je.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/qui-suis-je.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierQuiSuisJe(liste), []);
  assert.ok(liste.length >= 180);
});
