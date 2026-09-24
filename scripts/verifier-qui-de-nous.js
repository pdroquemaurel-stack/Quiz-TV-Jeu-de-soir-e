import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LONGUEUR_MAX_TEXTE } from './verifier-questions.js';

const CHAMPS = ['id', 'texte'];

// Renvoie la liste des problèmes d'une question, sans tenir compte des autres.
function erreursQuestion(question) {
  const erreurs = [];
  const champsEnTrop = Object.keys(question).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof question.id !== 'string' || !/^n\d{4}$/.test(question.id)) {
    erreurs.push('id doit être au format nNNNN');
  }

  const { texte } = question;
  if (typeof texte !== 'string' || texte.trim() === '') erreurs.push('texte vide ou absent');
  else if (texte.length > LONGUEUR_MAX_TEXTE) {
    erreurs.push(`texte trop long (${texte.length} > ${LONGUEUR_MAX_TEXTE})`);
  } else if (!texte.startsWith('Qui de nous')) erreurs.push('le texte doit commencer par « Qui de nous »');
  else if (!texte.trim().endsWith('?')) erreurs.push('le texte doit finir par « ? »');
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierQuiDeNous(liste) {
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

// Lancé en ligne de commande : node scripts/verifier-qui-de-nous.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/qui-de-nous.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de qui-de-nous.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierQuiDeNous(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} questions OK`);
}
