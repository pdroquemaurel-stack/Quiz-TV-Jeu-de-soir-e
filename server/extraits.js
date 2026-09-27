// Extraits Deezer du blind test (docs/modes/blind-test.md, « Les extraits Deezer »).
// Le lien d'un extrait expire au bout de 15 min : on le redemande à Deezer au moment de jouer.

import { readFileSync } from 'node:fs';
import { journaliserErreur } from './journal.js';
import { melanger } from './modes/commun.js';

// Moins que les 15 min de validité du lien donné par Deezer.
export const DUREE_CACHE_MS = 10 * 60 * 1000;
const DELAI_DEEZER_MS = 5000;
const TAILLE_ESSAI = 5;

let banque;

export function banqueBlindTest() {
  banque ??= JSON.parse(readFileSync(new URL('../data/blind-test.json', import.meta.url), 'utf8'))
    .filter((chanson) => chanson.garder);
  return banque;
}

// id de chanson → { lien, expireA }
const cache = new Map();

// Le lien de l'extrait d'une chanson gardée, ou null. Seules les chansons du catalogue
// passent : la route n'est pas un relais ouvert vers Deezer.
export async function lienExtrait(id, { chansons = banqueBlindTest(), chercher = fetch } = {}) {
  const chanson = chansons.find((c) => c.id === id);
  if (!chanson) return null;

  const enCache = cache.get(id);
  if (enCache && enCache.expireA > Date.now()) return enCache.lien;

  try {
    const reponse = await chercher(`https://api.deezer.com/track/${chanson.deezer}`, {
      signal: AbortSignal.timeout(DELAI_DEEZER_MS),
    });
    const piste = await reponse.json();
    if (!piste.readable || !piste.preview) throw new Error('extrait indisponible');
    cache.set(id, { lien: piste.preview, expireA: Date.now() + DUREE_CACHE_MS });
    return piste.preview;
  } catch (e) {
    journaliserErreur(`extrait ${id}`, e.message);
    return null;
  }
}

// Pour la planche /tv?extraits : quelques chansons gardées au hasard, sans répétition.
export function tirerEssai(chansons = banqueBlindTest()) {
  return melanger(chansons).slice(0, TAILLE_ESSAI)
    .map(({ id, titre, artiste, gain }) => ({ id, titre, artiste, gain }));
}
