import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normaliser } from '../server/modes/commun.js';

const CHAMPS_PAIRE = ['id', 'mots'];
const CHAMPS_MOT = ['mot', 'variantes'];
export const LONGUEUR_MAX_MOT = 20;

function champsEnTrop(objet, champs) {
  const enTrop = Object.keys(objet).filter((champ) => !champs.includes(champ));
  return enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
}

// Un mot ou une variante : chaîne non vide, sans espace au bord, pas trop longue.
function erreursTexte(texte, nom) {
  if (typeof texte !== 'string' || texte.trim() === '') return [`${nom} vide ou absent`];
  if (texte !== texte.trim()) return [`${nom} avec des espaces au début ou à la fin`];
  if (texte.length > LONGUEUR_MAX_MOT) return [`${nom} trop long (${texte.length} > ${LONGUEUR_MAX_MOT})`];
  return [];
}

function erreursMot(entree, numero) {
  const nom = `mot ${numero}`;
  if (typeof entree !== 'object' || entree === null) return [`${nom} : ce n'est pas un objet`];
  const erreurs = champsEnTrop(entree, CHAMPS_MOT).map((erreur) => `${nom} : ${erreur}`);
  erreurs.push(...erreursTexte(entree.mot, nom));
  if (!Array.isArray(entree.variantes)) return [...erreurs, `${nom} : variantes doit être une liste`];

  const vues = new Set(typeof entree.mot === 'string' ? [normaliser(entree.mot)] : []);
  for (const variante of entree.variantes) {
    const problemes = erreursTexte(variante, `variante « ${variante} » du ${nom}`);
    erreurs.push(...problemes);
    if (problemes.length) continue;
    if (vues.has(normaliser(variante))) erreurs.push(`${nom} : variante « ${variante} » en double`);
    vues.add(normaliser(variante));
  }
  return erreurs;
}

// Toutes les formes acceptées d'un mot, normalisées.
function formes(entree) {
  return [entree.mot, ...entree.variantes].map(normaliser);
}

// Renvoie la liste des problèmes d'une paire, sans tenir compte des autres.
function erreursPaire(paire) {
  const erreurs = champsEnTrop(paire, CHAMPS_PAIRE);
  if (typeof paire.id !== 'string' || !/^u\d{4}$/.test(paire.id)) {
    erreurs.push('id doit être au format uNNNN');
  }
  if (!Array.isArray(paire.mots) || paire.mots.length !== 2) {
    return [...erreurs, 'mots doit contenir exactement 2 mots'];
  }
  const erreursMots = paire.mots.flatMap((entree, index) => erreursMot(entree, index + 1));
  if (erreursMots.length) return [...erreurs, ...erreursMots];

  // Sinon Mister White gagnerait en donnant le mot de l'undercover.
  const [premier, second] = paire.mots.map(formes);
  if (premier.some((forme) => second.includes(forme))) {
    erreurs.push('les deux mots se confondent (mot ou variante commune)');
  }
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierUndercover(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de paires'];

  const erreurs = [];
  const idsVus = new Set();
  const pairesVues = new Set();
  liste.forEach((paire, index) => {
    const nom = `paire ${index + 1} (${paire?.id ?? 'sans id'})`;
    if (typeof paire !== 'object' || paire === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    const erreursDeLaPaire = erreursPaire(paire);
    for (const erreur of erreursDeLaPaire) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(paire.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(paire.id);

    if (erreursDeLaPaire.length) return;
    // « Café / Thé » et « Thé / Café » sont la même paire.
    const cle = paire.mots.map((entree) => normaliser(entree.mot)).sort().join(' / ');
    if (pairesVues.has(cle)) erreurs.push(`${nom} : paire en double`);
    pairesVues.add(cle);
  });
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-undercover.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/undercover.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de undercover.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierUndercover(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} paires OK`);
}
