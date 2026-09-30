import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// La TV se lit à 3 mètres : aucun texte sous 40 px (docs/spec.md, « Écrans à concevoir »).
// Seules les planches de test (/tv?sons, /tv?extraits, /tv?nuancier) y échappent.
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

// tv.css et les feuilles des modes (tv/modes/<mode>.css).
function cssDeLaTv() {
  const dossierModes = new URL('../public/tv/modes/', import.meta.url);
  const feuillesModes = readdirSync(dossierModes).filter((nom) => nom.endsWith('.css'));
  return [
    readFileSync(new URL('../public/tv/tv.css', import.meta.url), 'utf8'),
    ...feuillesModes.map((nom) => readFileSync(new URL(nom, dossierModes), 'utf8')),
  ].join('\n');
}

test('TV : aucun font-size sous 40 px dans tv.css et tv/modes/*.css, hors planches de test', () => {
  const tailles = taillesDeTexte(cssDeLaTv());
  assert.ok(tailles.length >= 30, `seulement ${tailles.length} font-size trouvés : lecture du CSS cassée ?`);

  const fautives = tailles
    .filter(({ selecteur }) => !selecteur.includes('.planche-sons') && !selecteur.includes('.planche-nuancier'))
    .filter(({ valeur }) => {
      const px = valeur.match(/^(\d+(?:\.\d+)?)px$/);
      return !px || Number(px[1]) < TAILLE_MIN;
    })
    .map(({ selecteur, valeur }) => `${selecteur} : ${valeur}`);
  // Chaque ligne restante est une taille à passer en px, à 40 px au moins.
  assert.deepEqual(fautives, []);
});
