import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleReponse } from '../server/modes/commun.js';
import { LONGUEUR_MAX_REPONSE } from '../server/modes/bluff.js';
import { LONGUEUR_MAX_TEXTE } from './verifier-questions.js';

const CHAMPS = ['id', 'texte', 'reponse', 'variantes'];
const TROU = '___';

// Un article ou un possessif juste avant le trou trahirait le genre ou le nombre de la réponse :
// il fait partie de la réponse (« est ___ » → « La licorne »). L'élision aussi (« d'___ »).
const DETERMINANT_AVANT_TROU = new RegExp(
  '(^|[^\\p{L}])((le|la|les|un|une|des|du|au|aux|son|sa|ses|mon|ma|mes|ton|ta|tes|leur|leurs|ce|cet|cette|ces)\\s+'
  + '|(l|d|qu)[\'’]\\s*)___',
  'iu',
);

// La vraie réponse ou une variante : chaîne non vide, sans espace au bord, pas trop longue, clé non vide.
function erreursForme(forme, nom) {
  if (typeof forme !== 'string' || forme.trim() === '') return [`${nom} vide ou absente`];
  if (forme !== forme.trim()) return [`${nom} avec des espaces au début ou à la fin`];
  if (forme.length > LONGUEUR_MAX_REPONSE) return [`${nom} trop longue (${forme.length} > ${LONGUEUR_MAX_REPONSE})`];
  if (cleReponse(forme) === '') return [`${nom} sans lettre ni chiffre`];
  return [];
}

function erreursTexte(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return ['texte vide ou absent'];
  if (texte.length > LONGUEUR_MAX_TEXTE) return [`texte trop long (${texte.length} > ${LONGUEUR_MAX_TEXTE})`];
  if (texte.split(TROU).length !== 2) return [`texte sans exactement un ${TROU}`];
  if (DETERMINANT_AVANT_TROU.test(texte)) return [`article ou possessif juste avant le ${TROU} : il va dans la réponse`];
  return [];
}

// Sinon une variante serait inutile, ou le fichier se contredirait.
function collisions(formes) {
  const erreurs = [];
  const cles = new Map();
  for (const forme of formes) {
    const cle = cleReponse(forme);
    if (cles.has(cle)) erreurs.push(`« ${forme} » se confond avec « ${cles.get(cle)} »`);
    else cles.set(cle, forme);
  }
  return erreurs;
}

// Renvoie la liste des problèmes d'une question, sans tenir compte des autres.
function erreursQuestion(question) {
  const enTrop = Object.keys(question).filter((champ) => !CHAMPS.includes(champ));
  const erreurs = enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
  if (typeof question.id !== 'string' || !/^b\d{4}$/.test(question.id)) erreurs.push('id doit être au format bNNNN');
  erreurs.push(...erreursTexte(question.texte));
  erreurs.push(...erreursForme(question.reponse, 'réponse'));
  if (!Array.isArray(question.variantes)) return [...erreurs, 'variantes doit être une liste'];
  for (const variante of question.variantes) erreurs.push(...erreursForme(variante, `variante « ${variante} »`));
  if (erreurs.length) return erreurs;
  return collisions([question.reponse, ...question.variantes]);
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierBluff(liste) {
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

// Lancé en ligne de commande : node scripts/verifier-bluff.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/bluff.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de bluff.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierBluff(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} questions OK`);
}
