import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleReponse } from '../server/modes/commun.js';
import { LONGUEUR_MAX_REPONSE } from '../server/modes/meme-reponse.js';
import { LONGUEUR_MAX_TEXTE } from './verifier-questions.js';

const CHAMPS_QUESTION = ['id', 'texte', 'reponses'];
const CHAMPS_REPONSE = ['reponse', 'variantes'];
export const REPONSES_MIN = 4;
export const REPONSES_MAX = 15;

function champsEnTrop(objet, champs) {
  const enTrop = Object.keys(objet).filter((champ) => !champs.includes(champ));
  return enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
}

// Une réponse ou une variante : chaîne non vide, sans espace au bord, pas trop longue, clé non vide.
function erreursForme(forme, nom) {
  if (typeof forme !== 'string' || forme.trim() === '') return [`${nom} vide ou absente`];
  if (forme !== forme.trim()) return [`${nom} avec des espaces au début ou à la fin`];
  if (forme.length > LONGUEUR_MAX_REPONSE) return [`${nom} trop longue (${forme.length} > ${LONGUEUR_MAX_REPONSE})`];
  if (cleReponse(forme) === '') return [`${nom} sans lettre ni chiffre`];
  return [];
}

function erreursReponse(entree, numero) {
  const nom = `réponse ${numero}`;
  if (typeof entree !== 'object' || entree === null) return [`${nom} : ce n'est pas un objet`];
  const erreurs = champsEnTrop(entree, CHAMPS_REPONSE).map((erreur) => `${nom} : ${erreur}`);
  erreurs.push(...erreursForme(entree.reponse, nom));
  if (!Array.isArray(entree.variantes)) return [...erreurs, `${nom} : variantes doit être une liste`];
  for (const variante of entree.variantes) erreurs.push(...erreursForme(variante, `variante « ${variante} » de la ${nom}`));
  return erreurs;
}

// Sinon une réponse tapée pourrait appartenir à deux groupes.
function collisions(reponses) {
  const erreurs = [];
  const cles = new Map();
  for (const entree of reponses) {
    for (const forme of [entree.reponse, ...entree.variantes]) {
      const cle = cleReponse(forme);
      if (cles.has(cle)) erreurs.push(`« ${forme} » se confond avec « ${cles.get(cle)} »`);
      else cles.set(cle, forme);
    }
  }
  return erreurs;
}

// Renvoie la liste des problèmes d'une question, sans tenir compte des autres.
function erreursQuestion(question) {
  const erreurs = champsEnTrop(question, CHAMPS_QUESTION);
  if (typeof question.id !== 'string' || !/^m\d{4}$/.test(question.id)) {
    erreurs.push('id doit être au format mNNNN');
  }
  if (typeof question.texte !== 'string' || question.texte.trim() === '') erreurs.push('texte vide ou absent');
  else if (question.texte.length > LONGUEUR_MAX_TEXTE) {
    erreurs.push(`texte trop long (${question.texte.length} > ${LONGUEUR_MAX_TEXTE})`);
  }
  const { reponses } = question;
  if (!Array.isArray(reponses) || reponses.length < REPONSES_MIN || reponses.length > REPONSES_MAX) {
    return [...erreurs, `reponses doit contenir de ${REPONSES_MIN} à ${REPONSES_MAX} réponses`];
  }
  const erreursReponses = reponses.flatMap((entree, index) => erreursReponse(entree, index + 1));
  if (erreursReponses.length) return [...erreurs, ...erreursReponses];
  return [...erreurs, ...collisions(reponses)];
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierMemeReponse(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de questions'];

  const erreurs = [];
  const idsVus = new Set();
  const textesVus = new Set();
  liste.forEach((question, index) => {
    const nom = `question ${index + 1} (${question?.id ?? 'sans id'})`;
    if (typeof question !== 'object' || question === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursQuestion(question)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(question.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(question.id);

    if (textesVus.has(question.texte)) erreurs.push(`${nom} : texte en double`);
    textesVus.add(question.texte);
  });
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-meme-reponse.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/meme-reponse.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de meme-reponse.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierMemeReponse(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} questions OK`);
}
