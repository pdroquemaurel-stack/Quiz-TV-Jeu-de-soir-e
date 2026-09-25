import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La TV se lit à 3 mètres : aucun texte sous 40 px (docs/spec.md, « Écrans à concevoir »).
// Seule la planche de sons (/tv?sons), lue depuis le PC, y échappe.
const TAILLE_MIN = 40;

function taillesDeTexte(css) {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tailles = [];
  for (const [, selecteur, corps] of sansCommentaires.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, valeur] of corps.matchAll(/font-size\s*:\s*([^;]+)/g)) {
      tailles.push({ selecteur: selecteur.trim(), valeur: valeur.trim() });
    }
  }
  return tailles;
}

test('TV : aucun font-size sous 40 px dans tv.css, hors planche de sons', () => {
  const css = readFileSync(new URL('../public/tv/tv.css', import.meta.url), 'utf8');
  const tailles = taillesDeTexte(css);
  assert.ok(tailles.length >= 30, `seulement ${tailles.length} font-size trouvés : lecture du CSS cassée ?`);

  const fautives = tailles
    .filter(({ selecteur }) => !selecteur.includes('.planche-sons'))
    .filter(({ valeur }) => {
      const px = valeur.match(/^(\d+(?:\.\d+)?)px$/);
      return !px || Number(px[1]) < TAILLE_MIN;
    })
    .map(({ selecteur, valeur }) => `${selecteur} : ${valeur}`);
  // Chaque ligne restante est une taille à passer en px, à 40 px au moins.
  assert.deepEqual(fautives, []);
});
