import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compterParLongueur, LONGUEUR_MAX, LONGUEUR_MIN } from './construire-mots.js';

export const MIN_MOTS = 20000;

// Renvoie la liste de toutes les erreurs du dictionnaire (vide si tout va bien).
// lignes : le contenu de data/mots.txt découpé ligne par ligne, sans la ligne vide finale.
export function verifierMots(lignes) {
  const erreurs = [];
  lignes.forEach((mot, index) => {
    const nom = `Ligne ${index + 1} (« ${mot} »)`;
    if (!/^[A-Z]+$/.test(mot)) erreurs.push(`${nom} : que des lettres A à Z en majuscules, sans accent`);
    else if (mot.length < LONGUEUR_MIN || mot.length > LONGUEUR_MAX) {
      erreurs.push(`${nom} : de ${LONGUEUR_MIN} à ${LONGUEUR_MAX} lettres`);
    }
    const precedent = lignes[index - 1];
    if (index > 0 && mot === precedent) erreurs.push(`${nom} : en double`);
    else if (index > 0 && mot < precedent) erreurs.push(`${nom} : pas dans l'ordre alphabétique`);
  });
  if (lignes.length < MIN_MOTS) erreurs.push(`${lignes.length} mots, il en faut au moins ${MIN_MOTS}`);
  return erreurs;
}

// « MAISON\nMAISONS\n » → ['MAISON', 'MAISONS'] : la dernière ligne vide ne compte pas.
export function lignesDe(texte) {
  const lignes = texte.split(/\r?\n/);
  if (lignes.at(-1) === '') lignes.pop();
  return lignes;
}

// Lancé en ligne de commande : node scripts/verifier-mots.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let lignes;
  try {
    lignes = lignesDe(readFileSync(new URL('../data/mots.txt', import.meta.url), 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de data/mots.txt : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierMots(lignes);
  if (erreurs.length) {
    for (const erreur of erreurs.slice(0, 50)) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const compte = compterParLongueur(lignes);
  const detail = Object.entries(compte).map(([longueur, nombre]) => `${longueur} : ${nombre}`).join(', ');
  console.log(`${lignes.length} mots (par longueur : ${detail}). OK`);
}
