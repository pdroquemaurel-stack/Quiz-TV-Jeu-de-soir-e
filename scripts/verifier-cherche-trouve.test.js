import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DETAILS_MIN, ECART_MIN, verifierChercheTrouve } from './verifier-cherche-trouve.js';
import { THEMES, construireScene, svgDe } from './construire-cherche-trouve.js';

function detail(numero, modifications = {}) {
  return {
    id: `plage-${numero}`, base: '🦀', accessoire: `A${numero}`, texte: `Détail ${numero}`, x: numero * 200, y: 100, ...modifications,
  };
}

function sceneValide(modifications = {}) {
  return {
    id: 'plage',
    nom: 'La plage',
    image: '/cherche-trouve/plage.svg',
    largeur: 3600,
    hauteur: 2400,
    details: Array.from({ length: DETAILS_MIN }, (_, i) => detail(i + 1)),
    ...modifications,
  };
}

// Vérifie qu'une seule erreur contient `extrait`.
function erreurAttendue(scene, extrait) {
  const erreurs = verifierChercheTrouve([scene]);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

function avecDetail(numero, modifications) {
  const scene = sceneValide();
  scene.details[numero - 1] = detail(numero, modifications);
  return scene;
}

test('cherche & trouve : une scène valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierChercheTrouve([sceneValide()]), []);
  assert.equal(verifierChercheTrouve([]).length, 1);
});

test('cherche & trouve : scène mal formée', () => {
  erreurAttendue(sceneValide({ image: 'plage.png' }), 'image');
  erreurAttendue(sceneValide({ hauteur: 2400.5 }), 'largeur');
  erreurAttendue(sceneValide({ nom: ' ' }), 'nom');
  erreurAttendue(sceneValide({ details: sceneValide().details.slice(1) }), `au moins ${DETAILS_MIN}`);
});

test('cherche & trouve : détail hors de l\'image, trop proche, en double, mal nommé', () => {
  erreurAttendue(avecDetail(1, { x: 4000 }), 'hors de l\'image');
  erreurAttendue(avecDetail(2, { x: 200 + ECART_MIN - 10 }), `moins de ${ECART_MIN} px`);
  erreurAttendue(avecDetail(3, { accessoire: 'A1' }), 'même paire');
  erreurAttendue(avecDetail(4, { id: 'zoo-4' }), 'commencer par');
  erreurAttendue(avecDetail(5, { texte: '' }), 'texte vide');
});

test('cherche & trouve : la construction redonne les mêmes scènes, chaque détail unique', () => {
  for (const theme of THEMES) {
    const premiere = construireScene(theme);
    const seconde = construireScene(theme);
    assert.deepEqual(premiere, seconde);
    for (const { base, accessoire, x, y } of premiere.details) {
      const memes = premiere.objets.filter((objet) => objet.base === base && objet.accessoire === accessoire);
      assert.equal(memes.length, 1, `${theme.id} : ${base}${accessoire} en ${memes.length} exemplaires`);
      assert.deepEqual([memes[0].x, memes[0].y], [x, y]);
      // Des leurres existent : même base avec un autre accessoire, ou même accessoire ailleurs.
      assert.ok(premiere.objets.some((o) => o.base === base && o.accessoire && o.accessoire !== accessoire));
      assert.ok(premiere.objets.some((o) => o.accessoire === accessoire && o.base !== base));
    }
    // Le SVG ne nomme rien : aucun identifiant de détail dedans.
    assert.ok(!svgDe(theme, premiere.objets).includes(`${theme.id}-1`));
  }
});

test('le fichier data/cherche-trouve.json est valide et ses images existent', () => {
  const liste = JSON.parse(readFileSync(new URL('../data/cherche-trouve.json', import.meta.url), 'utf8'));
  assert.deepEqual(verifierChercheTrouve(liste, fileURLToPath(new URL('../public', import.meta.url))), []);
  assert.equal(liste.length, 3);
});
