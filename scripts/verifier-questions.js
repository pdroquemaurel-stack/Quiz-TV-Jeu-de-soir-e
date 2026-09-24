import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CATEGORIES = [
  'geographie', 'histoire', 'sciences', 'nature', 'art-litterature',
  'cinema-tv', 'musique', 'sport', 'gastronomie', 'langue-divers',
];
export const LONGUEUR_MAX_TEXTE = 110;
export const LONGUEUR_MAX_REPONSE = 30;
const CHAMPS = ['id', 'texte', 'reponses', 'bonneReponse', 'categorie', 'difficulte'];

const texteNonVide = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

// Renvoie la liste des problèmes d'une question, sans tenir compte des autres.
function erreursQuestion(question) {
  const erreurs = [];
  const champsEnTrop = Object.keys(question).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof question.id !== 'string' || !/^q\d{4}$/.test(question.id)) {
    erreurs.push('id doit être au format qNNNN');
  }

  if (!texteNonVide(question.texte)) erreurs.push('texte vide ou absent');
  else if (question.texte.length > LONGUEUR_MAX_TEXTE) {
    erreurs.push(`texte trop long (${question.texte.length} > ${LONGUEUR_MAX_TEXTE})`);
  }

  const { reponses } = question;
  if (!Array.isArray(reponses) || reponses.length !== 4) {
    erreurs.push('il faut exactement 4 réponses');
  } else if (!reponses.every(texteNonVide)) {
    erreurs.push('réponse vide ou qui n\'est pas du texte');
  } else {
    const trop = reponses.filter((reponse) => reponse.length > LONGUEUR_MAX_REPONSE);
    if (trop.length) erreurs.push(`réponse(s) trop longue(s) : ${trop.join(' / ')}`);
    const distinctes = new Set(reponses.map((reponse) => reponse.trim().toLowerCase()));
    if (distinctes.size !== 4) erreurs.push('réponses en double');
  }

  if (![0, 1, 2, 3].includes(question.bonneReponse)) {
    erreurs.push('bonneReponse doit être un entier de 0 à 3');
  }
  if (!CATEGORIES.includes(question.categorie)) {
    erreurs.push(`categorie inconnue : ${question.categorie}`);
  }
  if (![1, 2, 3].includes(question.difficulte)) erreurs.push('difficulte doit valoir 1, 2 ou 3');
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierQuestions(liste) {
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

// Lancé en ligne de commande : node scripts/verifier-questions.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/questions.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de questions.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierQuestions(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} questions OK`);
  console.log(`Par catégorie : ${compter(liste, 'categorie')}`);
  console.log(`Par difficulté : ${compter(liste, 'difficulte')}`);
}
