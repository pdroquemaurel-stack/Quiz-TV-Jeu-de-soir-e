import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { categoriesDeChanson } from '../server/extraits.js';
import { normaliser } from '../server/modes/commun.js';

const CHAMPS = ['id', 'deezer', 'titre', 'artiste', 'pochette', 'gain', 'garder', 'playlists'];
// Une partie de mix à 10 joueurs : 10 manches de 5 chansons (docs/modes/blind-test.md).
export const MIN_CHANSONS = 50;
// En dessous, une partie classique de 20 chansons dans cette seule catégorie se complète
// avec les autres (tranche 42) : une alerte, pas une erreur.
export const MIN_PAR_CATEGORIE = 20;
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

function erreursChanson(chanson, playlists) {
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
  if (chanson.playlists !== undefined) erreurs.push(...erreursPlaylistsDeChanson(chanson.playlists, playlists));
  return erreurs;
}

// Facultatif (tranche 42) : les ids Deezer des playlists d'où vient la chanson, sans doublon,
// toutes présentes dans data/playlists-blind-test.json.
function erreursPlaylistsDeChanson(ids, playlists) {
  if (!Array.isArray(ids) || ids.length === 0) return ['playlists doit être une liste non vide'];
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) return ['playlists : des ids Deezer (entiers positifs)'];
  const erreurs = ids.filter((id) => !Object.hasOwn(playlists, id)).map((id) => `playlist ${id} absente de playlists-blind-test.json`);
  if (new Set(ids).size !== ids.length) erreurs.push('playlist en double');
  return erreurs;
}

// Le fichier data/playlists-blind-test.json : { "id Deezer": { nom, categorie } }. Plusieurs
// playlists peuvent partager une catégorie. Renvoie la liste des erreurs.
export function verifierPlaylists(playlists) {
  if (typeof playlists !== 'object' || playlists === null || Array.isArray(playlists)) {
    return ['playlists-blind-test.json doit contenir un objet { "id": { nom, categorie } }'];
  }
  const erreurs = [];
  for (const [id, playlist] of Object.entries(playlists)) {
    if (!/^[1-9]\d*$/.test(id)) erreurs.push(`Playlist ${id} : l'id doit être un id Deezer`);
    for (const nom of ['nom', 'categorie']) {
      const erreur = erreurTexte(playlist?.[nom], nom);
      if (erreur) erreurs.push(`Playlist ${id} : ${erreur}`);
    }
  }
  return erreurs;
}

// Les alertes sur les catégories, qui n'empêchent pas de jouer : les chansons gardées sans
// playlist (à ranger à la main) et les catégories de moins de MIN_PAR_CATEGORIE chansons.
// parCategorie : { catégorie: nombre de chansons gardées }.
export function bilanCategories(liste, playlists) {
  const gardees = liste.filter((chanson) => chanson.garder);
  const parCategorie = {};
  for (const chanson of gardees) {
    for (const categorie of categoriesDeChanson(chanson, playlists)) parCategorie[categorie] = (parCategorie[categorie] ?? 0) + 1;
  }
  return {
    parCategorie,
    sansCategorie: gardees.filter((chanson) => categoriesDeChanson(chanson, playlists).length === 0),
    petites: Object.keys(parCategorie).filter((categorie) => parCategorie[categorie] < MIN_PAR_CATEGORIE),
  };
}

// Renvoie la liste de toutes les erreurs du catalogue (vide si tout va bien).
// playlists : le contenu de data/playlists-blind-test.json.
export function verifierBlindTest(liste, playlists = {}) {
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
    for (const erreur of erreursChanson(chanson, playlists)) erreurs.push(`${nom} : ${erreur}`);
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

function afficherBilanCategories(liste, playlists) {
  const { parCategorie, sansCategorie, petites } = bilanCategories(liste, playlists);
  for (const [categorie, nombre] of Object.entries(parCategorie)) console.log(`  ${categorie} : ${nombre}`);
  for (const categorie of petites) {
    console.warn(`Alerte : « ${categorie} » n'a que ${parCategorie[categorie]} chansons (moins de ${MIN_PAR_CATEGORIE}) : une partie la complétera avec les autres.`);
  }
  if (!sansCategorie.length) return;
  console.warn(`Alerte : ${sansCategorie.length} chanson(s) gardée(s) sans playlist, donc sans catégorie (jouées seulement avec toutes les catégories) :`);
  for (const chanson of sansCategorie) console.warn(`  ${chanson.id} : ${chanson.artiste} — ${chanson.titre}`);
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
  const lire = (fichier) => {
    const chemin = fileURLToPath(new URL(`../data/${fichier}`, import.meta.url));
    try {
      return JSON.parse(readFileSync(chemin, 'utf8'));
    } catch (e) {
      console.error(`Lecture impossible de ${chemin} : ${e.message}`);
      return process.exit(1);
    }
  };
  const liste = lire('blind-test.json');
  const playlists = lire('playlists-blind-test.json');

  const erreurs = [...verifierPlaylists(playlists), ...verifierBlindTest(liste, playlists)];
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const gardees = liste.filter((chanson) => chanson.garder);
  console.log(`${gardees.length} chansons gardées, ${liste.length - gardees.length} exclues OK`);
  afficherBilanCategories(liste, playlists);

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
