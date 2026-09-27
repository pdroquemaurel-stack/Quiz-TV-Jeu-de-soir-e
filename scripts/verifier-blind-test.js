import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normaliser } from '../server/modes/commun.js';

const CHAMPS = ['id', 'deezer', 'titre', 'artiste', 'pochette', 'gain', 'garder'];
// Une partie de mix à 10 joueurs : 10 manches de 5 chansons (docs/modes/blind-test.md).
export const MIN_CHANSONS = 50;
// Deezer accepte 50 requêtes par 5 s : on reste loin en dessous.
const PAUSE_DEEZER_MS = 150;

// Deux chansons de même clé sont la même chanson (même artiste, même titre).
export function cleChanson(chanson) {
  return `${normaliser(String(chanson.artiste))} | ${normaliser(String(chanson.titre))}`;
}

function erreurTexte(valeur, nom) {
  if (typeof valeur !== 'string' || valeur.trim() === '') return `${nom} vide ou absent`;
  if (valeur !== valeur.trim()) return `${nom} avec des espaces au début ou à la fin`;
  return null;
}

function erreursChanson(chanson) {
  const enTrop = Object.keys(chanson).filter((champ) => !CHAMPS.includes(champ));
  const erreurs = enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
  if (!Number.isInteger(chanson.deezer) || chanson.deezer <= 0) erreurs.push('deezer doit être un entier positif');
  else if (chanson.id !== `d${chanson.deezer}`) erreurs.push(`id doit valoir « d${chanson.deezer} »`);
  for (const nom of ['titre', 'artiste']) {
    const erreur = erreurTexte(chanson[nom], nom);
    if (erreur) erreurs.push(erreur);
  }
  if (typeof chanson.pochette !== 'string' || !chanson.pochette.startsWith('https://')) {
    erreurs.push('pochette doit être une adresse https://');
  }
  if (typeof chanson.gain !== 'number' || !Number.isFinite(chanson.gain)) erreurs.push('gain doit être un nombre');
  if (typeof chanson.garder !== 'boolean') erreurs.push('garder doit valoir true ou false');
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du catalogue (vide si tout va bien).
export function verifierBlindTest(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de chansons'];

  const erreurs = [];
  const idsVus = new Set();
  const clesVues = new Map();
  let gardees = 0;
  liste.forEach((chanson, index) => {
    const nom = `Chanson ${index + 1} (${chanson?.id ?? 'sans id'})`;
    if (typeof chanson !== 'object' || chanson === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursChanson(chanson)) erreurs.push(`${nom} : ${erreur}`);
    if (idsVus.has(chanson.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(chanson.id);
    if (chanson.garder !== false) {
      gardees++;
      const cle = cleChanson(chanson);
      if (clesVues.has(cle)) erreurs.push(`${nom} : même chanson que ${clesVues.get(cle)}`);
      else clesVues.set(cle, chanson.id);
    }
  });

  if (gardees < MIN_CHANSONS) {
    erreurs.push(`${gardees} chansons gardées, il en faut au moins ${MIN_CHANSONS} pour une partie de mix à 10 joueurs`);
  }
  return erreurs;
}

// Les chansons gardées dont Deezer ne donne plus d'extrait. Ne modifie jamais le catalogue.
async function extraitsIndisponibles(gardees) {
  const indisponibles = [];
  for (const chanson of gardees) {
    try {
      const piste = await (await fetch(`https://api.deezer.com/track/${chanson.deezer}`)).json();
      if (!piste.readable || !piste.preview) indisponibles.push(chanson);
    } catch {
      indisponibles.push(chanson);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_DEEZER_MS));
  }
  return indisponibles;
}

// Lancé en ligne de commande : node scripts/verifier-blind-test.js [--deezer]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/blind-test.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de ${chemin} : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierBlindTest(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const gardees = liste.filter((chanson) => chanson.garder);
  console.log(`${gardees.length} chansons gardées, ${liste.length - gardees.length} exclues OK`);

  if (process.argv.includes('--deezer')) {
    console.log(`Interrogation de Deezer pour ${gardees.length} chansons…`);
    const indisponibles = await extraitsIndisponibles(gardees);
    for (const chanson of indisponibles) {
      console.error(`${chanson.id} : extrait indisponible (${chanson.artiste} — ${chanson.titre})`);
    }
    console.log(indisponibles.length ? `${indisponibles.length} extrait(s) indisponible(s) : passer ces chansons à garder: false.` : 'Tous les extraits sont disponibles.');
    if (indisponibles.length) process.exit(1);
  }
}
