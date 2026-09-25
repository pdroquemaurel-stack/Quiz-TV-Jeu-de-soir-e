import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CATEGORIES = [
  'geographie', 'histoire', 'sciences', 'nature', 'art-litterature',
  'cinema-tv', 'musique', 'sport', 'gastronomie', 'langue-divers', 'maths-logique',
];
export const LONGUEUR_MAX_TEXTE = 110;
export const LONGUEUR_MAX_REPONSE = 30;
const NOMBRE_QUESTIONS = 10;
const CHAMPS = ['id', 'texte', 'reponses', 'bonneReponse', 'categorie', 'difficulte'];

const texteNonVide = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';
// Espace au début, à la fin, ou deux espaces d'affilée.
const espacesEnTrop = (texte) => texte !== texte.trim() || /\s{2}/.test(texte);

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
  } else if (espacesEnTrop(question.texte)) erreurs.push('espaces en trop dans le texte');
  else if (!question.texte.endsWith('?')) erreurs.push('le texte doit finir par « ? »');

  const { reponses } = question;
  if (!Array.isArray(reponses) || reponses.length !== 4) {
    erreurs.push('il faut exactement 4 réponses');
  } else if (!reponses.every(texteNonVide)) {
    erreurs.push('réponse vide ou qui n\'est pas du texte');
  } else {
    const trop = reponses.filter((reponse) => reponse.length > LONGUEUR_MAX_REPONSE);
    if (trop.length) erreurs.push(`réponse(s) trop longue(s) : ${trop.join(' / ')}`);
    const espacees = reponses.filter(espacesEnTrop);
    if (espacees.length) erreurs.push(`espaces en trop dans : ${espacees.join(' / ')}`);
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

// ---------- Paires voisines ----------
// Deux questions sur le même sujet (« la Joconde ») donnent une impression de répétition
// si elles tombent dans la même partie. Simple alerte à relire : le script n'échoue pas.

// Mots de la façon de poser une question, pas du sujet.
const MOTS_COURANTS = new Set([
  'quelle', 'quels', 'quelles', 'combien', 'lequel', 'laquelle', 'environ', 'celebre',
  'premier', 'premiere', 'porte', 'realise', 'raconte', 'originaire', 'specialite', 'fabrique',
  'principal', 'ingredient', 'traditionnellement', 'couleur', 'interprete', 'chanteur',
  'chanteuse', 'acteur', 'peintre', 'groupe', 'decouvert', 'scientifique', 'capable', 'mesure',
  'marque',
  // Mots banals ou à double sens (« chaîne » de montagnes et de restaurants, « tournée »
  // d'un chanteur et d'un film) : ils rapprochaient des questions sans sujet commun.
  'affrontent', 'album', 'artiste', 'autrice', 'breaking', 'britannique', 'chaine', 'chimie',
  'civilisation', 'classique', 'deroule', 'devant', 'devenu', 'elles', 'enfants', 'entre',
  'entreprise', 'fondee', 'garcon', 'independance', 'jeune', 'lance', 'marche', 'mondial',
  'nicolas', 'partie', 'piece', 'premiers', 'produit', 'quitte', 'record', 'remplace', 'robot',
  'scene', 'signe', 'somme', 'souvent', 'thomas', 'tournee', 'unite',
]);

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function mots(texte) {
  return sansAccents(texte).split(/[^a-z0-9]+/).filter((mot) => mot.length >= 5 && !MOTS_COURANTS.has(mot));
}

// Le sujet d'une question : son texte et sa bonne réponse.
const motsDuSujet = (question) => new Set(mots(`${question.texte} ${question.reponses[question.bonneReponse]}`));
const tousLesMots = (question) => new Set(mots(`${question.texte} ${question.reponses.join(' ')}`));

// Propositions identiques, hors nombres (« 4 », « 1945 » reviennent partout).
function propositionsCommunes(a, b) {
  const deA = new Set(a.reponses.map((reponse) => sansAccents(reponse).trim()));
  return b.reponses
    .map((reponse) => sansAccents(reponse).trim())
    .filter((reponse) => deA.has(reponse) && !/^\d+$/.test(reponse));
}

// Renvoie [{ ids: [a, b], raison }]. Deux règles :
// - un mot rare (présent dans ces deux questions seulement) fait partie du sujet des deux ;
// - au moins 2 propositions identiques.
export function pairesVoisines(liste) {
  const sujets = liste.map(motsDuSujet);
  const frequence = {};
  for (const question of liste) {
    for (const mot of tousLesMots(question)) frequence[mot] = (frequence[mot] ?? 0) + 1;
  }
  const paires = [];
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const motsRares = [...sujets[i]].filter((mot) => sujets[j].has(mot) && frequence[mot] === 2);
      const propositions = propositionsCommunes(liste[i], liste[j]);
      const raisons = [];
      if (motsRares.length) raisons.push(`même sujet : ${motsRares.join(', ')}`);
      if (propositions.length >= 2) raisons.push(`mêmes propositions : ${propositions.join(', ')}`);
      if (raisons.length) paires.push({ ids: [liste[i].id, liste[j].id], raison: raisons.join(' ; ') });
    }
  }
  return paires;
}

// ---------- Autres alertes à relire ----------

const estUnNombre = (reponse) => /^[\d\s.,]+%?$/.test(reponse.trim());

// Renvoie [{ id, raison }] : bonne réponse écrite dans la question,
// ou propositions qui mélangent nombres et mots.
export function alertesQuestions(liste) {
  const alertes = [];
  for (const question of liste) {
    const bonne = sansAccents(question.reponses[question.bonneReponse]);
    const motEntier = new RegExp(`(^|[^a-z0-9])${bonne.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    if (bonne.length >= 4 && motEntier.test(sansAccents(question.texte))) {
      alertes.push({ id: question.id, raison: 'la bonne réponse est écrite dans la question' });
    }
    const nombres = question.reponses.filter(estUnNombre).length;
    if (nombres > 0 && nombres < 4) {
      alertes.push({ id: question.id, raison: 'propositions mélangées, nombres et mots' });
    }
  }
  return alertes;
}

// Pour chaque thème seul et chaque niveau (NIVEAUX du quiz), le nombre de questions
// du choix, s'il est sous 10 : l'hôte reverrait des questions dès la 1re partie.
export function stocksInsuffisants(liste, niveaux) {
  const manques = [];
  for (const categorie of CATEGORIES) {
    for (const [niveau, { repartition }] of Object.entries(niveaux)) {
      const nombre = liste.filter((question) => question.categorie === categorie
        && Object.hasOwn(repartition, question.difficulte)).length;
      if (nombre < NOMBRE_QUESTIONS) manques.push({ categorie, niveau, nombre });
    }
  }
  return manques;
}

// Une ligne par catégorie : « cinema-tv        23 = 10 / 9 / 4 ».
function tableauCategories(liste) {
  return CATEGORIES.map((categorie) => {
    const siennes = liste.filter((question) => question.categorie === categorie);
    const parDifficulte = [1, 2, 3].map((d) => siennes.filter((question) => question.difficulte === d).length);
    return `  ${categorie.padEnd(16)} ${String(siennes.length).padStart(3)} = ${parDifficulte.join(' / ')}`;
  }).join('\n');
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
  console.log(`Par catégorie (faciles / moyennes / difficiles) :\n${tableauCategories(liste)}`);
  console.log(`Par difficulté : ${compter(liste, 'difficulte')}`);

  const voisines = pairesVoisines(liste);
  if (voisines.length) {
    console.log(`\nAttention, ${voisines.length} paire(s) voisine(s) à relire (elles peuvent tomber dans la même partie) :`);
    for (const { ids, raison } of voisines) console.log(`  ${ids.join(' / ')} : ${raison}`);
  }

  const alertes = alertesQuestions(liste);
  if (alertes.length) {
    console.log(`\nAttention, ${alertes.length} question(s) à relire :`);
    for (const { id, raison } of alertes) console.log(`  ${id} : ${raison}`);
  }

  // Chargé seulement maintenant : quiz.js lit questions.json dès son import.
  const { NIVEAUX } = await import('../server/modes/quiz.js');
  const manques = stocksInsuffisants(liste, NIVEAUX);
  if (manques.length) {
    console.log(`\nAttention, ${manques.length} choix de l'hôte sous ${NOMBRE_QUESTIONS} questions (un seul thème) :`);
    for (const { categorie, niveau, nombre } of manques) console.log(`  ${categorie}, ${niveau} : ${nombre}`);
  }
}
