import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, noterQuestionsVues, participe, phaseEnCours,
  passerAuPodium, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'qui-de-nous';
export const nom = 'Qui de nous ?';
export const regleCourte = '10 questions : vote pour un joueur, marque si tu votes comme le groupe.';
export const joueursMin = 4;

export const NOMBRE_QUESTIONS = 10;
export const DUREE_VOTE_MS = 20000;
export const DUREE_RESULTATS_MS = 12000;
export const POINTS_COMME_LE_GROUPE = 1000;

export const banqueQuiDeNous = JSON.parse(
  readFileSync(new URL('../../data/qui-de-nous.json', import.meta.url), 'utf8'),
);

// Votes reçus par chaque candidat, du plus désigné au moins désigné.
// À égalité, l'ordre des candidats est conservé.
export function compterVotes(reponses, candidats) {
  const votes = Object.values(reponses).map((reponse) => reponse.vote);
  return candidats
    .map((candidat) => ({ id: candidat, votes: votes.filter((vote) => vote === candidat).length }))
    .sort((a, b) => b.votes - a.votes);
}

// Les candidats en tête, tous ex æquo compris. Aucun élu s'il n'y a aucun vote.
export function trouverElus(resultats) {
  const maximum = Math.max(0, ...resultats.map((ligne) => ligne.votes));
  if (maximum === 0) return [];
  return resultats.filter((ligne) => ligne.votes === maximum).map((ligne) => ligne.id);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueQuiDeNous, salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions, votesRecus: {} };
  demarrerQuestion(salle, 0);
}

// Les attendus sont aussi les candidats : la liste est figée pour toute la manche.
function demarrerQuestion(salle, index) {
  salle.etatMode.phase = 'vote';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// On ne vote pas pour soi, sauf si l'on est le seul candidat.
function candidatsPour(salle, votantId) {
  const { attendus } = salle.etatMode;
  if (attendus.length === 1) return attendus;
  return attendus.filter((candidat) => candidat !== votantId);
}

// Renvoie true si le vote est accepté : l'id d'un candidat de la manche.
export function enregistrerReponse(salle, joueurId, vote) {
  if (phaseEnCours(salle) !== 'vote' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId]) return false;
  if (!candidatsPour(salle, joueurId).includes(vote)) return false;
  salle.etatMode.reponses[joueurId] = { vote, recuA: Date.now() };
  return true;
}

// Appelée après chaque vote et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'vote' && tousOntRepondu(salle)) montrerResultats(salle);
}

function resultats(salle) {
  return compterVotes(salle.etatMode.reponses, salle.etatMode.attendus);
}

function elus(salle) {
  return trouverElus(resultats(salle));
}

// Les points n'existent qu'à partir des résultats.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'resultats') return 0;
  const reponse = salle.etatMode.reponses[joueurId];
  return reponse && elus(salle).includes(reponse.vote) ? POINTS_COMME_LE_GROUPE : 0;
}

export function montrerResultats(salle) {
  salle.etatMode.phase = 'resultats';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
  const { votesRecus } = salle.etatMode;
  for (const ligne of resultats(salle)) votesRecus[ligne.id] = (votesRecus[ligne.id] ?? 0) + ligne.votes;
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else passerAuPodium(salle);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'resultats') return false;
  passerALaSuite(salle);
  return true;
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'vote') return salle.etatMode.debutPhaseA + DUREE_VOTE_MS;
  if (phase === 'resultats') return salle.etatMode.debutPhaseA + DUREE_RESULTATS_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'vote') montrerResultats(salle);
  else if (phase === 'resultats') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// Le ou les joueurs les plus désignés de la partie, pour le podium.
// votesRecus manque si la partie jouée était d'un autre mode (l'hôte a changé de mode au tableau).
export function plusDesignes(salle) {
  const lignes = Object.entries(salle.etatMode.votesRecus ?? {})
    .map(([joueurId, votes]) => ({ id: joueurId, votes }));
  const maximum = Math.max(0, ...lignes.map((ligne) => ligne.votes));
  if (maximum === 0) return [];
  return lignes.filter((ligne) => ligne.votes === maximum);
}

// Ce que reçoit la TV : jamais qui a voté pour qui, et aucun décompte pendant le vote.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'vote') return vueQuestion(salle);
  if (phase === 'resultats') return { ...vueQuestion(salle), ...vueResultats(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle), plusDesignes: plusDesignes(salle) };
  return {};
}

function vueQuestion(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte: questionCourante(salle).texte },
    ontVote: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

function vueResultats(salle) {
  return {
    resultats: resultats(salle),
    elus: elus(salle),
    nombreVotes: Object.keys(salle.etatMode.reponses).length,
    classement: classement(salle),
  };
}

function joueurVisible(salle, joueurId) {
  const { pseudo, couleur, connecte } = salle.joueurs.find((joueur) => joueur.id === joueurId);
  return { id: joueurId, pseudo, couleur, connecte };
}

// Écran du téléphone pendant une partie : jamais le vote d'un autre joueur.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, indexQuestion, reponses } = salle.etatMode;
  const reponse = reponses[joueur.id];
  const numero = indexQuestion + 1;
  if (phase === 'vote') {
    if (reponse) return { ecran: 'vote_envoye', numero, choisi: joueurVisible(salle, reponse.vote) };
    const candidats = candidatsPour(salle, joueur.id).map((candidat) => joueurVisible(salle, candidat));
    return { ecran: 'voter', numero, candidats };
  }
  const points = pointsGagnes(salle, joueur.id);
  return {
    ecran: 'resultat',
    vote: reponse ? joueurVisible(salle, reponse.vote).pseudo : null,
    elus: elus(salle).map((elu) => joueurVisible(salle, elu).pseudo),
    commeLeGroupe: points > 0,
    points,
    votesRecus: resultats(salle).find((ligne) => ligne.id === joueur.id).votes,
    rang: rangDe(salle, joueur),
  };
}
