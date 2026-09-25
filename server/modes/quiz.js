import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, melanger, noterQuestionsVues, participe,
  passerAuPodium, phaseEnCours, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'quiz';
export const nom = 'Quiz';
export const regleCourte = '10 questions, 4 choix : plus tu réponds vite, plus tu marques.';
export const joueursMin = 2;

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

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueQuestions, salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions: questions.map(melangerReponses) };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  salle.etatMode.phase = 'question';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutQuestionA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Renvoie true si la réponse est acceptée.
export function enregistrerReponse(salle, joueurId, choix) {
  if (phaseEnCours(salle) !== 'question' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId]) return false;
  if (!Number.isInteger(choix) || choix < 0 || choix >= NOMBRE_CHOIX) return false;
  salle.etatMode.reponses[joueurId] = { choix, recuA: Date.now() };
  return true;
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'question' && tousOntRepondu(salle)) reveler(salle);
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  if (!reponse || reponse.choix !== questionCourante(salle).bonneReponse) return 0;
  return calculerPoints(reponse.recuA - salle.etatMode.debutQuestionA);
}

export function reveler(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutRevelationA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else passerAuPodium(salle);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'question') return salle.etatMode.debutQuestionA + DUREE_QUESTION_MS;
  if (phase === 'revelation') return salle.etatMode.debutRevelationA + DUREE_REVELATION_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'question') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// Ce que reçoit la TV : seulement la question en cours, et sa bonne réponse
// uniquement à partir de la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'question') return vueQuestion(salle);
  if (phase === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  const { texte, reponses: propositions } = questionCourante(salle);
  return {
    phase,
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

// Écran du téléphone pendant une partie (le podium est commun à tous les modes).
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  if (salle.etatMode.phase === 'question') {
    const reponse = salle.etatMode.reponses[joueur.id];
    return reponse ? { ecran: 'reponse_envoyee', choix: reponse.choix } : { ecran: 'repondre' };
  }
  const points = pointsGagnes(salle, joueur.id);
  return { ecran: 'resultat', juste: points > 0, points, rang: rangDe(salle, joueur) };
}
