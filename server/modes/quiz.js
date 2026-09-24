import { readFileSync } from 'node:fs';

const NOMBRE_CHOIX = 4;
export const NOMBRE_QUESTIONS = 10;
export const DUREE_QUESTION_MS = 20000;
export const DUREE_REVELATION_MS = 8000;

export const banqueQuestions = JSON.parse(
  readFileSync(new URL('../../data/questions.json', import.meta.url), 'utf8'),
);

// points = arrondi(1000 - 500 × t / 20), avec t en secondes, borné entre 0 et 20 s.
export function calculerPoints(dureeMs) {
  const t = Math.min(Math.max(dureeMs, 0), DUREE_QUESTION_MS) / 1000;
  return Math.round(1000 - (500 * t) / 20);
}

// Mélange de Fisher-Yates, sur une copie.
function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Copie de la question avec les réponses dans un nouvel ordre,
// et bonneReponse qui pointe toujours vers la même réponse.
export function melangerReponses(question) {
  const ordre = melanger([0, 1, 2, 3]);
  return {
    ...question,
    reponses: ordre.map((index) => question.reponses[index]),
    bonneReponse: ordre.indexOf(question.bonneReponse),
  };
}

// Les questions jamais vues d'abord, au hasard. S'il n'y en a pas assez,
// on complète avec les déjà vues, les plus anciennes d'abord.
export function tirerQuestions(banque, questionsVues, nombre) {
  const inedites = melanger(banque.filter((question) => !questionsVues.includes(question.id)));
  const dejaVues = questionsVues
    .map((id) => banque.find((question) => question.id === id))
    .filter(Boolean);
  return [...inedites, ...dejaVues].slice(0, nombre);
}

// questionsVues reste dans l'ordre chronologique : une question revue passe en fin de liste.
function noterQuestionsVues(salle, questions) {
  const ids = questions.map((question) => question.id);
  salle.questionsVues = [...salle.questionsVues.filter((id) => !ids.includes(id)), ...ids];
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueQuestions, salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions: questions.map(melangerReponses) };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  salle.etat = 'question';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutQuestionA = Date.now();
  salle.etatMode.reponses = {};
  // Seuls les joueurs connectés au début de la manche sont attendus.
  salle.etatMode.attendus = salle.joueurs
    .filter((joueur) => joueur.connecte)
    .map((joueur) => joueur.id);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Seuls les joueurs attendus jouent la manche en cours : les autres attendent la suivante.
function participe(salle, joueurId) {
  return salle.etatMode.attendus.includes(joueurId);
}

// Renvoie true si la réponse est acceptée.
export function enregistrerReponse(salle, joueurId, choix) {
  if (salle.etat !== 'question' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId]) return false;
  if (!Number.isInteger(choix) || choix < 0 || choix >= NOMBRE_CHOIX) return false;
  salle.etatMode.reponses[joueurId] = { choix, recuA: Date.now() };
  return true;
}

// Vrai quand tous les joueurs attendus encore connectés ont répondu.
export function tousOntRepondu(salle) {
  if (salle.etat !== 'question') return false;
  const { attendus, reponses } = salle.etatMode;
  return salle.joueurs
    .filter((joueur) => joueur.connecte && attendus.includes(joueur.id))
    .every((joueur) => reponses[joueur.id]);
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  if (!reponse || reponse.choix !== questionCourante(salle).bonneReponse) return 0;
  return calculerPoints(reponse.recuA - salle.etatMode.debutQuestionA);
}

export function reveler(salle) {
  salle.etat = 'revelation';
  salle.etatMode.debutRevelationA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else salle.etat = 'podium';
}

// Arrêt par l'hôte : une question en cours n'est pas comptée, car les points
// ne sont ajoutés qu'à la révélation. Renvoie true si la partie a été terminée.
export function terminerPartie(salle) {
  if (salle.etat !== 'question' && salle.etat !== 'revelation') return false;
  salle.etat = 'podium';
  return true;
}

// Heure à laquelle l'étape en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  if (salle.etat === 'question') return salle.etatMode.debutQuestionA + DUREE_QUESTION_MS;
  if (salle.etat === 'revelation') return salle.etatMode.debutRevelationA + DUREE_REVELATION_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  if (salle.etat === 'question') reveler(salle);
  else if (salle.etat === 'revelation') passerALaSuite(salle);
}

// Ce que reçoit la TV : seulement la question en cours, et sa bonne réponse
// uniquement à partir de la révélation.
export function vueTvQuiz(salle) {
  if (salle.etat === 'question') return vueQuestion(salle);
  if (salle.etat === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const { questions, indexQuestion, reponses } = salle.etatMode;
  const { texte, reponses: propositions } = questionCourante(salle);
  return {
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte, reponses: propositions },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

function vueRevelation(salle) {
  const nombreParChoix = new Array(NOMBRE_CHOIX).fill(0);
  for (const { choix } of Object.values(salle.etatMode.reponses)) nombreParChoix[choix]++;
  return {
    bonneReponse: questionCourante(salle).bonneReponse,
    nombreParChoix,
    classement: classement(salle),
  };
}

// Ex æquo : même rang, et le rang suivant est sauté (1, 1, 3).
function rangDe(salle, joueur) {
  return 1 + salle.joueurs.filter((autre) => autre.score > joueur.score).length;
}

// Le tri est stable : à égalité, l'ordre d'arrivée est conservé.
export function classement(salle) {
  return [...salle.joueurs]
    .sort((a, b) => b.score - a.score)
    .map((joueur) => ({
      id: joueur.id,
      pseudo: joueur.pseudo,
      couleur: joueur.couleur,
      score: joueur.score,
      connecte: joueur.connecte,
      rang: rangDe(salle, joueur),
      points: pointsGagnes(salle, joueur.id),
    }));
}

export function vueJoueurQuiz(salle, joueur) {
  if (salle.etat !== 'podium' && !participe(salle, joueur.id)) return { ecran: 'attente_question' };
  if (salle.etat === 'question') {
    const reponse = salle.etatMode.reponses[joueur.id];
    return reponse ? { ecran: 'reponse_envoyee', choix: reponse.choix } : { ecran: 'repondre' };
  }
  const rang = rangDe(salle, joueur);
  if (salle.etat === 'revelation') {
    const points = pointsGagnes(salle, joueur.id);
    return { ecran: 'resultat', juste: points > 0, points, rang };
  }
  return { ecran: 'fin', rang };
}
