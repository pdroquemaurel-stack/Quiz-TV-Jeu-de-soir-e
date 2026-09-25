// Mode Le bluff (docs/modes/bluff.md).
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, cleReponse, listerAttendus, melanger, noterQuestionsVues, participe,
  passerAuPodium, phaseEnCours, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'bluff';
export const nom = 'Le bluff';
export const regleCourte = '8 questions : inventez une fausse réponse, puis trouvez la vraie.';
export const joueursMin = 4;

export const NOMBRE_QUESTIONS = 8;
export const DUREE_SAISIE_MS = 45000;
export const DUREE_VOTE_MS = 25000;
export const DUREE_REVELATION_MS = 15000;
export const POINTS_VERITE = 1000;
export const POINTS_PAR_PIEGE = 500;
export const LONGUEUR_MAX_REPONSE = 30;

// Lue au premier lancement seulement : scripts/verifier-bluff.js importe ce fichier
// pour ses constantes, et doit pouvoir signaler lui-même un fichier illisible.
let banque = null;

export function banqueBluff() {
  banque ??= JSON.parse(readFileSync(new URL('../../data/bluff.json', import.meta.url), 'utf8'));
  return banque;
}

// ---------- Règles pures ----------

// Même clé que la vraie réponse ou qu'une de ses variantes.
export function estLaVerite(texte, question) {
  const cle = cleReponse(texte);
  return [question.reponse, ...question.variantes].some((forme) => cleReponse(forme) === cle);
}

// Tous les bluffs ont la même allure que la vraie réponse : majuscule initiale, sans point final.
export function presenter(texte) {
  const sansPoint = texte.replace(/\.+$/, '').trim();
  return sansPoint.charAt(0).toUpperCase() + sansPoint.slice(1);
}

// Les propositions du vote : les bluffs de même clé fusionnés (texte du premier arrivé),
// ceux qui sont la vraie réponse fondus dans celle-ci, puis la vraie réponse, le tout mélangé.
export function formerPropositions(bluffs, question, melange = melanger) {
  const vraie = { texte: question.reponse, auteurs: [], vraie: true, ontEcritLaVerite: [] };
  const parCle = new Map();
  const parArrivee = Object.entries(bluffs).sort(([, a], [, b]) => a.recuA - b.recuA);
  for (const [joueurId, { texte }] of parArrivee) {
    if (estLaVerite(texte, question)) {
      vraie.ontEcritLaVerite.push(joueurId);
      continue;
    }
    const cle = cleReponse(texte);
    if (!parCle.has(cle)) parCle.set(cle, { texte: presenter(texte), auteurs: [], vraie: false });
    parCle.get(cle).auteurs.push(joueurId);
  }
  return melange([...parCle.values(), vraie]);
}

// Points de la question : { joueurId: { aTrouve, pieges, points } }, pour ceux qui marquent.
// votes : { joueurId: { choix } }, choix étant l'index d'une proposition.
export function calculerPoints(propositions, votes) {
  const resultats = {};
  const resultatDe = (joueurId) => {
    resultats[joueurId] ??= { aTrouve: false, pieges: 0, points: 0 };
    return resultats[joueurId];
  };
  for (const [votant, { choix }] of Object.entries(votes)) {
    const proposition = propositions[choix];
    if (proposition.vraie) {
      resultatDe(votant).aTrouve = true;
      resultatDe(votant).points += POINTS_VERITE;
    }
    for (const auteur of proposition.auteurs) {
      resultatDe(auteur).pieges += 1;
      resultatDe(auteur).points += POINTS_PAR_PIEGE;
    }
  }
  return resultats;
}

// ---------- Déroulé ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueBluff(), salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  Object.assign(salle.etatMode, {
    phase: 'saisie',
    indexQuestion: index,
    debutPhaseA: Date.now(),
    attendus: listerAttendus(salle),
    reponses: {},
    bluffs: {},
    propositions: [],
  });
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Un bluff en saisie, un index de proposition en vote. Renvoie true s'il est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (phase !== 'saisie' && phase !== 'vote') return false;
  if (!participe(salle, joueurId) || salle.etatMode.reponses[joueurId]) return false;
  const accepte = phase === 'saisie' ? bluffValide(contenu) : voteValide(salle, joueurId, contenu);
  if (!accepte) return false;
  const reponse = phase === 'saisie' ? { texte: contenu.trim() } : { choix: contenu };
  salle.etatMode.reponses[joueurId] = { ...reponse, recuA: Date.now() };
  return true;
}

// Un texte de 1 à 30 caractères, de clé non vide. Un bluff qui est la vraie réponse est accepté.
function bluffValide(texte) {
  if (typeof texte !== 'string') return false;
  const propre = texte.trim();
  return propre.length <= LONGUEUR_MAX_REPONSE && cleReponse(propre) !== '';
}

// Jamais pour une proposition dont on est l'auteur.
function voteValide(salle, joueurId, choix) {
  const { propositions } = salle.etatMode;
  if (!Number.isInteger(choix) || choix < 0 || choix >= propositions.length) return false;
  return !propositions[choix].auteurs.includes(joueurId);
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie' && tousOntRepondu(salle)) terminerSaisie(salle);
  else if (phase === 'vote' && tousOntRepondu(salle)) montrerRevelation(salle);
}

// Les bluffs deviennent des propositions, et reponses reçoit désormais les votes.
// Sans autre proposition que la vraie réponse, il n'y a rien à voter.
function terminerSaisie(salle) {
  const { etatMode } = salle;
  etatMode.bluffs = etatMode.reponses;
  etatMode.reponses = {};
  etatMode.propositions = formerPropositions(etatMode.bluffs, questionCourante(salle));
  if (etatMode.propositions.length === 1) {
    montrerRevelation(salle);
    return;
  }
  etatMode.phase = 'vote';
  etatMode.debutPhaseA = Date.now();
}

function resultats(salle) {
  return calculerPoints(salle.etatMode.propositions, salle.etatMode.reponses);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return resultats(salle)[joueurId]?.points ?? 0;
}

function montrerRevelation(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

function passerALaSuite(salle) {
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

const DUREES = { saisie: DUREE_SAISIE_MS, vote: DUREE_VOTE_MS, revelation: DUREE_REVELATION_MS };

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  return phase ? salle.etatMode.debutPhaseA + DUREES[phase] : null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') terminerSaisie(salle);
  else if (phase === 'vote') montrerRevelation(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// Construites champ par champ : ni la vraie réponse, ni les auteurs ne sortent avant la révélation.

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') return vueQuestion(salle);
  if (phase === 'vote') return { ...vueQuestion(salle), propositions: textesDesPropositions(salle) };
  if (phase === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const {
    phase, questions, indexQuestion, reponses,
  } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte: questionCourante(salle).texte },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

function textesDesPropositions(salle) {
  return salle.etatMode.propositions.map(({ texte }) => ({ texte }));
}

// Qui a écrit quoi, qui a voté quoi : tout devient public.
function vueRevelation(salle) {
  const {
    attendus, bluffs, reponses, propositions,
  } = salle.etatMode;
  const votants = Object.keys(reponses);
  const ontTrouve = votants.filter((votant) => propositions[reponses[votant].choix].vraie);
  const personneNaBluffe = propositions.length === 1;
  return {
    propositions: propositions.map((proposition, index) => {
      const votantsDe = votants.filter((votant) => reponses[votant].choix === index);
      const vue = {
        texte: proposition.texte,
        vraie: proposition.vraie,
        auteurs: proposition.auteurs,
        votants: votantsDe,
        points: proposition.vraie ? 0 : POINTS_PAR_PIEGE * votantsDe.length,
      };
      if (proposition.vraie) vue.ontEcritLaVerite = proposition.ontEcritLaVerite;
      return vue;
    }),
    sansBluff: attendus.filter((joueurId) => !bluffs[joueurId]),
    sansVote: personneNaBluffe ? [] : attendus.filter((joueurId) => !reponses[joueurId]),
    personneNaBluffe,
    tousOntTrouve: votants.length > 0 && ontTrouve.length === votants.length,
    personneNaTrouve: votants.length > 0 && ontTrouve.length === 0,
    classement: classement(salle),
  };
}

// Écran du téléphone pendant une partie : son propre bluff seulement, jamais la vraie réponse avant la révélation.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion } = salle.etatMode;
  const numero = indexQuestion + 1;
  const question = { texte: questionCourante(salle).texte };
  const reponse = salle.etatMode.reponses[joueur.id];
  if (phase === 'saisie') {
    if (reponse) return { ecran: 'bluff_envoye', numero, texte: reponse.texte };
    return {
      ecran: 'ecrire', numero, total: questions.length, question,
    };
  }
  if (phase === 'vote') return vueVote(salle, joueur, numero, question);
  return vueResultat(salle, joueur, numero);
}

function vueVote(salle, joueur, numero, question) {
  const { propositions, questions, reponses } = salle.etatMode;
  const vote = reponses[joueur.id];
  if (vote) return { ecran: 'vote_envoye', numero, texte: propositions[vote.choix].texte };
  return {
    ecran: 'voter',
    numero,
    total: questions.length,
    question,
    propositions: propositions.map(({ texte, auteurs }) => ({ texte, laTienne: auteurs.includes(joueur.id) })),
  };
}

function vueResultat(salle, joueur, numero) {
  const { propositions, bluffs, reponses } = salle.etatMode;
  const vraie = propositions.find((proposition) => proposition.vraie);
  const resultat = resultats(salle)[joueur.id] ?? { aTrouve: false, pieges: 0, points: 0 };
  return {
    ecran: 'resultat',
    numero,
    vraieReponse: vraie.texte,
    aVote: Boolean(reponses[joueur.id]),
    personneNaBluffe: propositions.length === 1,
    aTrouve: resultat.aTrouve,
    sonBluff: bluffs[joueur.id]?.texte ?? null,
    bluffVrai: vraie.ontEcritLaVerite.includes(joueur.id),
    pieges: resultat.pieges,
    pointsBluff: resultat.pieges * POINTS_PAR_PIEGE,
    points: resultat.points,
    rang: rangDe(salle, joueur),
  };
}
