import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, noterQuestionsVues, participe, phaseEnCours,
  passerAuPodium, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'estimation';
export const nom = 'Estimation';
export const regleCourte = '8 questions : saisis un nombre, les 3 plus proches marquent.';
export const joueursMin = 3;

export const NOMBRE_QUESTIONS = 8;
export const DUREE_QUESTION_MS = 30000;
export const DUREE_REVELATION_MS = 10000;
export const REPONSE_MAX = 999999999999;

// Points selon le rang d'écart : 1er, 2e, 3e. Au-delà, 0.
const POINTS_PAR_RANG = [1000, 600, 300];

export const banqueEstimation = JSON.parse(
  readFileSync(new URL('../../data/estimation.json', import.meta.url), 'utf8'),
);

// Réponses de la manche triées par écart. Ex æquo : même rang et mêmes points,
// et le rang suivant est sauté (écarts 10, 10, 25 → rangs 1, 1, 3).
export function calculerEstimations(reponses, bonneReponse) {
  const lignes = Object.entries(reponses).map(([joueurId, { nombre }]) => ({
    id: joueurId,
    nombre,
    ecart: Math.abs(nombre - bonneReponse),
  }));
  return lignes
    .map((ligne) => {
      const rangEcart = 1 + lignes.filter((autre) => autre.ecart < ligne.ecart).length;
      return { ...ligne, rangEcart, points: POINTS_PAR_RANG[rangEcart - 1] ?? 0 };
    })
    .sort((a, b) => a.ecart - b.ecart);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueEstimation, salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  salle.etatMode.phase = 'question';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Renvoie true si la réponse est acceptée : un entier de 0 à REPONSE_MAX.
export function enregistrerReponse(salle, joueurId, nombre) {
  if (phaseEnCours(salle) !== 'question' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId]) return false;
  if (!Number.isInteger(nombre) || nombre < 0 || nombre > REPONSE_MAX) return false;
  salle.etatMode.reponses[joueurId] = { nombre, recuA: Date.now() };
  return true;
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'question' && tousOntRepondu(salle)) reveler(salle);
}

function estimations(salle) {
  return calculerEstimations(salle.etatMode.reponses, questionCourante(salle).reponse);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return estimations(salle).find((ligne) => ligne.id === joueurId)?.points ?? 0;
}

export function reveler(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const ligne of estimations(salle)) {
    const joueur = salle.joueurs.find((j) => j.id === ligne.id);
    if (joueur) joueur.score += ligne.points;
  }
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
  if (phase === 'question') return salle.etatMode.debutPhaseA + DUREE_QUESTION_MS;
  if (phase === 'revelation') return salle.etatMode.debutPhaseA + DUREE_REVELATION_MS;
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

// Ce que reçoit la TV : ni la bonne réponse ni les nombres saisis avant la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'question') return vueQuestion(salle);
  if (phase === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  const { texte, unite } = questionCourante(salle);
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte, unite },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

function vueRevelation(salle) {
  const { attendus, reponses } = salle.etatMode;
  return {
    bonneReponse: questionCourante(salle).reponse,
    estimations: estimations(salle),
    sansReponse: attendus.filter((joueurId) => !reponses[joueurId]),
    classement: classement(salle),
  };
}

// Écran du téléphone pendant une partie : jamais la bonne réponse avant la révélation,
// jamais les nombres des autres joueurs.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, indexQuestion, reponses } = salle.etatMode;
  const reponse = reponses[joueur.id];
  if (phase === 'question') {
    if (reponse) return { ecran: 'reponse_envoyee', nombre: reponse.nombre, unite: questionCourante(salle).unite };
    return { ecran: 'repondre', numero: indexQuestion + 1, unite: questionCourante(salle).unite };
  }
  const ligne = estimations(salle).find((l) => l.id === joueur.id);
  return {
    ecran: 'resultat',
    unite: questionCourante(salle).unite,
    nombre: ligne?.nombre ?? null,
    ecart: ligne?.ecart ?? null,
    rangEcart: ligne?.rangEcart ?? null,
    points: ligne?.points ?? 0,
    rang: rangDe(salle, joueur),
  };
}
