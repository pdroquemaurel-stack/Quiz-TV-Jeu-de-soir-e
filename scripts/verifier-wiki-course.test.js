import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COUPLES_MIN_PAR_NIVEAU, LIENS_MIN_DEPART, verifierEnLigne, verifierWikiCourse,
} from './verifier-wiki-course.js';

function coupleValide(modifications = {}, numero = 1, niveau = 1) {
  return {
    id: `wc-couple-${numero}`, depart: `Départ ${numero}`, cible: `Cible ${numero}`, niveau, ...modifications,
  };
}

// Assez de couples valides de chaque niveau pour que seul le couple modifié (le premier) pose problème.
function listeAvec(modifications) {
  const autres = Array.from({ length: 2 * COUPLES_MIN_PAR_NIVEAU }, (_, i) => coupleValide({}, i + 2, (i % 2) + 1));
  return [coupleValide(modifications), ...autres];
}

function erreurAttendue(modifications, extrait) {
  const erreurs = verifierWikiCourse(listeAvec(modifications));
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('wiki course : une liste valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierWikiCourse(listeAvec({})), []);
});

test('wiki course : le fichier doit être une liste, avec assez de couples par niveau', () => {
  assert.equal(verifierWikiCourse({}).length, 1);
  const erreurs = verifierWikiCourse([coupleValide()]);
  assert.equal(erreurs.length, 2);
  assert.ok(erreurs[0].includes('niveau 1'));
});

test('wiki course : id mal formé ou en double', () => {
  erreurAttendue({ id: 'couple' }, 'format wc-');
  erreurAttendue({ id: 'wc-Couple' }, 'format wc-');
  erreurAttendue({ id: 'wc-couple-2' }, 'id en double');
});

test('wiki course : départ ou cible vides, avec espaces, identiques', () => {
  erreurAttendue({ depart: ' ' }, 'depart vide');
  erreurAttendue({ cible: 'Pizza ' }, 'cible vide');
  erreurAttendue({ cible: 'Départ 1' }, 'identiques');
});

test('wiki course : niveau hors 1–2, champ en trop, couple en double', () => {
  erreurAttendue({ niveau: 3 }, 'niveau');
  erreurAttendue({ image: 'x' }, 'en trop');
  erreurAttendue({ depart: 'Départ 2', cible: 'Cible 2', niveau: 2 }, 'couple en double');
});

// Un faux Wikipédia : Mercure est une homonymie, Pizzas une redirection, Lune n'existe pas,
// Puddlage a assez de liens, Moustache trop peu.
async function fauxWikipedia(adresse) {
  const parametres = new URL(adresse).searchParams;
  const liens = (nombre) => Array.from({ length: nombre }, (_, i) => ({ ns: 0, title: `Lien ${i}` }));
  let query;
  if (parametres.get('prop') === 'links') {
    query = { pages: [{ title: parametres.get('titles'), links: liens(parametres.get('titles') === 'Puddlage' ? LIENS_MIN_DEPART : 3) }] };
  } else {
    const titres = parametres.get('titles').split('|');
    query = {
      redirects: titres.includes('Pizzas') ? [{ from: 'Pizzas', to: 'Pizza' }] : [],
      pages: titres.filter((titre) => titre !== 'Pizzas').map((titre) => {
        if (titre === 'Lune') return { title: titre, missing: true };
        if (titre === 'Mercure') return { title: titre, pageprops: { disambiguation: '' } };
        return { title: titre };
      }),
    };
  }
  return { json: async () => ({ query }) };
}

test('wiki course en ligne : redirection, page absente, homonymie, départ sans assez de liens', async () => {
  const erreurs = await verifierEnLigne([
    { depart: 'Puddlage', cible: 'Pizzas' },
    { depart: 'Puddlage', cible: 'Lune' },
    { depart: 'Moustache', cible: 'Mercure' },
  ], fauxWikipedia);
  assert.deepEqual(erreurs, [
    '« Pizzas » redirige vers « Pizza »',
    '« Lune » n\'existe pas',
    '« Mercure » est une page d\'homonymie',
    `le départ « Moustache » a moins de ${LIENS_MIN_DEPART} liens`,
  ]);
});

test('le fichier data/wiki-course.json est valide', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/wiki-course.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierWikiCourse(liste), []);
  assert.ok(liste.length >= 40);
});
