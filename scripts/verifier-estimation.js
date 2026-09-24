import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES, LONGUEUR_MAX_TEXTE } from './verifier-questions.js';

export const REPONSE_MAX = 999999999999;
export const LONGUEUR_MAX_UNITE = 12;
const CHAMPS = ['id', 'texte', 'reponse', 'unite', 'categorie', 'difficulte'];

// Renvoie la liste des problèmes d'une question, sans tenir compte des autres.
function erreursQuestion(question) {
  const erreurs = [];
  const champsEnTrop = Object.keys(question).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof question.id !== 'string' || !/^e\d{4}$/.test(question.id)) {
    erreurs.push('id doit être au format eNNNN');
  }

  const { texte } = question;
  if (typeof texte !== 'string' || texte.trim() === '') erreurs.push('texte vide ou absent');
  else if (texte.length > LONGUEUR_MAX_TEXTE) {
    erreurs.push(`texte trop long (${texte.length} > ${LONGUEUR_MAX_TEXTE})`);
  } else if (!texte.trim().endsWith('?')) erreurs.push('le texte doit finir par « ? »');

  const { reponse } = question;
  if (!Number.isInteger(reponse) || reponse < 0 || reponse > REPONSE_MAX) {
    erreurs.push(`reponse doit être un entier de 0 à ${REPONSE_MAX}`);
  }

  if (typeof question.unite !== 'string') erreurs.push('unite doit être du texte (vide autorisé)');
  else if (question.unite.length > LONGUEUR_MAX_UNITE) {
    erreurs.push(`unite trop longue (${question.unite.length} > ${LONGUEUR_MAX_UNITE})`);
  }

  if (!CATEGORIES.includes(question.categorie)) {
    erreurs.push(`categorie inconnue : ${question.categorie}`);
  }
  if (![1, 2, 3].includes(question.difficulte)) erreurs.push('difficulte doit valoir 1, 2 ou 3');
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierEstimation(liste) {
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

    if (typeof question.texte === 'string') {
      const texte = question.texte.trim().toLowerCase();
      if (textesVus.has(texte)) erreurs.push(`${nom} : texte en double`);
      textesVus.add(texte);
    }
  });
  return erreurs;
}

function compter(liste, champ) {
  const totaux = {};
  for (const question of liste) totaux[question[champ]] = (totaux[question[champ]] ?? 0) + 1;
  return Object.entries(totaux).map(([valeur, nombre]) => `${valeur} ${nombre}`).join(', ');
}

// Lancé en ligne de commande : node scripts/verifier-estimation.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/estimation.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de estimation.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierEstimation(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} questions OK`);
  console.log(`Par catégorie : ${compter(liste, 'categorie')}`);
  console.log(`Par difficulté : ${compter(liste, 'difficulte')}`);
}
