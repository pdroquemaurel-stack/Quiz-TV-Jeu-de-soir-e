// Construit data/mots.txt, le dictionnaire du mode « Mot le plus long » (docs/modes/mot-le-plus-long.md).
//
// Source : Lexique 3.83, B. New et C. Pallier, www.lexique.org, licence CC BY-SA 4.0.
// data/mots.txt en est dérivé et est donc lui aussi sous licence CC BY-SA 4.0.
//
// node scripts/construire-mots.js               télécharge Lexique383.tsv (26 Mo)
// node scripts/construire-mots.js <fichier.tsv> lit un fichier déjà téléchargé
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const URL_LEXIQUE = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv';
export const LONGUEUR_MIN = 2;
export const LONGUEUR_MAX = 9;
// Onomatopées (« atchoum », « beurk ») : pas des mots du jeu.
const CATEGORIES_ECARTEES = ['ONO'];

// « Été » → « ETE », « œuvre » → « OEUVRE ». null si la forme contient autre chose que
// des lettres (trait d'union, apostrophe, espace, point).
export function normaliserMot(forme) {
  const mot = forme
    .toUpperCase()
    .replace(/Œ/g, 'OE')
    .replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return /^[A-Z]+$/.test(mot) ? mot : null;
}

// Les abréviations de Lexique (« km », « ml », « pc ») n'ont pas de voyelle.
function aUneVoyelle(mot) {
  return /[AEIOUY]/.test(mot);
}

// Les mots du jeu tirés du contenu de Lexique383.tsv : triés, sans doublon.
export function extraireMots(tsv) {
  const [entete, ...lignes] = tsv.split(/\r?\n/);
  const colonnes = entete.split('\t');
  const iOrtho = colonnes.indexOf('ortho');
  const iCategorie = colonnes.indexOf('cgram');
  if (iOrtho < 0 || iCategorie < 0) throw new Error('colonnes « ortho » et « cgram » introuvables');

  const mots = new Set();
  for (const ligne of lignes) {
    const champs = ligne.split('\t');
    if (champs.length <= iCategorie || CATEGORIES_ECARTEES.includes(champs[iCategorie])) continue;
    const mot = normaliserMot(champs[iOrtho]);
    if (mot && mot.length >= LONGUEUR_MIN && mot.length <= LONGUEUR_MAX && aUneVoyelle(mot)) mots.add(mot);
  }
  return [...mots].sort();
}

// { 2: …, 3: …, … } : nombre de mots par longueur.
export function compterParLongueur(mots) {
  const compte = {};
  for (const mot of mots) compte[mot.length] = (compte[mot.length] ?? 0) + 1;
  return compte;
}

async function lireLexique(chemin) {
  if (chemin) return readFileSync(chemin, 'utf8');
  console.log(`Téléchargement de ${URL_LEXIQUE}…`);
  const reponse = await fetch(URL_LEXIQUE);
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.text();
}

// Lancé en ligne de commande.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let tsv;
  try {
    tsv = await lireLexique(process.argv[2]);
  } catch (e) {
    console.error(`Lecture de Lexique impossible : ${e.message}`);
    console.error('Télécharge le fichier à la main et passe son chemin : node scripts/construire-mots.js <fichier.tsv>');
    process.exit(1);
  }
  const mots = extraireMots(tsv);
  writeFileSync(new URL('../data/mots.txt', import.meta.url), `${mots.join('\n')}\n`);
  const compte = compterParLongueur(mots);
  console.log(Object.entries(compte).map(([longueur, nombre]) => `${longueur} lettres : ${nombre}`).join('\n'));
  console.log(`${mots.length} mots écrits dans data/mots.txt`);
}
