// Mode La légende (docs/modes/legende.md). Une « question » est ici un GIF du catalogue.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, cleReponse, creerOptions, echeanceDePhase, fusionnerParCle,
  listerAttendus, melanger, noterQuestionsVues, participe, phaseEnCours, questionCourante,
  questionSuivanteOuPodium, rangDe, tempsRestantMs, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'legende';
export const nom = 'La légende';
export const regleCourte = 'Donnez un titre à chaque GIF, puis votez pour le meilleur. Soyez drôles, ou essayez.';
export const joueursMin = 3;

export const NOMBRE_GIF = 8;
export const DUREE_SAISIE_MS = 45000;
export const DUREE_VOTE_MS = 40000;
export const DUREE_REVELATION_MS = 20000;
export const POINTS_PAR_VOTE = 500;
export const BONUS_LEGENDAIRE = 1000;
export const LONGUEUR_MAX_TITRE = 120;

// Lu au premier lancement seulement : scripts/verifier-legende.js importe ce fichier
// pour ses constantes, et doit pouvoir signaler lui-même un catalogue illisible.
let banque = null;

// Seuls les GIF gardés à la relecture sont tirés.
export function banqueLegende() {
  banque ??= JSON.parse(readFileSync(new URL('../../data/legende.json', import.meta.url), 'utf8'))
    .filter((gif) => gif.garder);
  return banque;
}

// ---------- Règles pures ----------

// Les titres de même clé ne forment qu'une proposition, puis tout est mélangé.
export function formerPropositions(titres, melange = melanger) {
  return melange(fusionnerParCle(titres));
}

// Pour chaque proposition : ses votants, si elle est légendaire et ce qu'elle rapporte à chacun
// de ses auteurs. votes : { joueurId: { choix } }, choix étant l'index d'une proposition.
// Légendaire : tous ceux qui ont voté et pouvaient la choisir (ses auteurs votent forcément
// ailleurs) l'ont choisie, avec au moins 2 votes et au moins 2 propositions.
export function resultatsDesPropositions(propositions, votes) {
  const votants = Object.keys(votes);
  return propositions.map((proposition, index) => {
    const votantsDe = votants.filter((votant) => votes[votant].choix === index);
    const pouvaientLaChoisir = votants.filter((votant) => !proposition.auteurs.includes(votant));
    const legendaire = propositions.length >= 2 && votantsDe.length >= 2
      && votantsDe.length === pouvaientLaChoisir.length;
    const points = POINTS_PAR_VOTE * votantsDe.length + (legendaire ? BONUS_LEGENDAIRE : 0);
    return { votants: votantsDe, legendaire, points };
  });
}

// Index des propositions qui ont le plus de votes (au moins 1).
export function gagnants(resultats) {
  const maximum = Math.max(0, ...resultats.map((resultat) => resultat.votants.length));
  if (maximum === 0) return [];
  return resultats.flatMap((resultat, index) => (resultat.votants.length === maximum ? [index] : []));
}

// ---------- Déroulé ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueLegende(), salle.questionsVues, options.lire(salle).longueur);
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
    titres: {},
    propositions: [],
  });
}

// Un titre en saisie, un index de proposition en vote. Renvoie true s'il est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (phase !== 'saisie' && phase !== 'vote') return false;
  if (!participe(salle, joueurId) || salle.etatMode.reponses[joueurId]) return false;
  const accepte = phase === 'saisie' ? titreValide(contenu) : voteValide(salle, joueurId, contenu);
  if (!accepte) return false;
  const reponse = phase === 'saisie' ? { texte: nettoyerTitre(contenu) } : { choix: contenu };
  salle.etatMode.reponses[joueurId] = { ...reponse, recuA: Date.now() };
  return true;
}

// Un texte de 1 à 120 caractères une fois les espaces réduits, de clé non vide.
function titreValide(texte) {
  if (typeof texte !== 'string') return false;
  const propre = nettoyerTitre(texte);
  return propre.length <= LONGUEUR_MAX_TITRE && cleReponse(propre) !== '';
}

// Bords retirés, retours à la ligne et espaces multiples réduits à un espace.
function nettoyerTitre(texte) {
  return texte.trim().replace(/\s+/g, ' ');
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

// Les titres deviennent des propositions, et reponses reçoit désormais les votes.
// Avec moins de 2 propositions, il n'y a rien à départager.
function terminerSaisie(salle) {
  const { etatMode } = salle;
  etatMode.titres = etatMode.reponses;
  etatMode.reponses = {};
  etatMode.propositions = formerPropositions(etatMode.titres);
  if (pasAssezDeTitres(salle)) {
    montrerRevelation(salle);
    return;
  }
  etatMode.phase = 'vote';
  etatMode.debutPhaseA = Date.now();
}

function pasAssezDeTitres(salle) {
  return salle.etatMode.propositions.length < 2;
}

function resultats(salle) {
  return resultatsDesPropositions(salle.etatMode.propositions, salle.etatMode.reponses);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  const index = salle.etatMode.propositions.findIndex((proposition) => proposition.auteurs.includes(joueurId));
  return index < 0 ? 0 : resultats(salle)[index].points;
}

function montrerRevelation(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, demarrerQuestion);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Options de l'hôte : nombre de GIF et temps pour l'écriture (en s).
const options = creerOptions(id, {
  longueurs: [5, NOMBRE_GIF, 12], unite: ['GIF', 'GIF'], temps: [30, DUREE_SAISIE_MS / 1000, 60],
});
export const { reglagesParDefaut, validerReglages, vueReglages } = options;

// Le temps pour l'écriture est une option de l'hôte, qui ne change pas pendant la partie.
export function echeance(salle) {
  const dureeReponseMs = options.lire(salle).temps * 1000;
  return echeanceDePhase(salle, { saisie: dureeReponseMs, vote: DUREE_VOTE_MS, revelation: DUREE_REVELATION_MS });
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
// Construites champ par champ : aucun auteur ni aucun vote ne sort avant la révélation.
// Le GIF ne part que vers la TV : les téléphones n'ont rien à charger.

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') return vueGif(salle);
  if (phase === 'vote') return { ...vueGif(salle), propositions: textesDesPropositions(salle) };
  if (phase === 'revelation') return { ...vueGif(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueGif(salle) {
  const {
    phase, questions, indexQuestion, reponses,
  } = salle.etatMode;
  const { fichier, nom: nomGif } = questionCourante(salle);
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    gif: { fichier, nom: nomGif },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function textesDesPropositions(salle) {
  return salle.etatMode.propositions.map(({ texte }) => ({ texte }));
}

// Qui a écrit quoi, qui a voté quoi : tout devient public.
function vueRevelation(salle) {
  const {
    attendus, titres, reponses, propositions, questions, indexQuestion,
  } = salle.etatMode;
  const resultatsParProposition = resultats(salle);
  const indexGagnants = gagnants(resultatsParProposition);
  const pasAssez = pasAssezDeTitres(salle);
  const vue = {
    propositions: propositions.map((proposition, index) => ({
      texte: proposition.texte,
      auteurs: proposition.auteurs,
      votants: resultatsParProposition[index].votants,
      points: resultatsParProposition[index].points,
      gagnant: indexGagnants.includes(index),
    })),
    legendaire: resultatsParProposition.some((resultat) => resultat.legendaire),
    pasAssezDeTitres: pasAssez,
    sansTitre: attendus.filter((joueurId) => !titres[joueurId]),
    sansVote: pasAssez ? [] : attendus.filter((joueurId) => !reponses[joueurId]),
    classement: classement(salle),
  };
  const gifSuivant = questions[indexQuestion + 1];
  if (gifSuivant) vue.gifSuivant = { fichier: gifSuivant.fichier };
  return vue;
}

// Écran du téléphone pendant une partie : son propre titre seulement, jamais le GIF.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion } = salle.etatMode;
  const numero = indexQuestion + 1;
  const reponse = salle.etatMode.reponses[joueur.id];
  if (phase === 'saisie') {
    if (reponse) return { ecran: 'titre_envoye', numero, texte: reponse.texte };
    return { ecran: 'ecrire', numero, total: questions.length };
  }
  if (phase === 'vote') return vueVote(salle, joueur, numero);
  return vueResultat(salle, joueur, numero);
}

function vueVote(salle, joueur, numero) {
  const { propositions, questions, reponses } = salle.etatMode;
  const vote = reponses[joueur.id];
  if (vote) return { ecran: 'vote_envoye', numero, texte: propositions[vote.choix].texte };
  return {
    ecran: 'voter',
    numero,
    total: questions.length,
    propositions: propositions.map(({ texte, auteurs }) => ({ texte, laTienne: auteurs.includes(joueur.id) })),
  };
}

function vueResultat(salle, joueur, numero) {
  const { propositions, titres, reponses } = salle.etatMode;
  const index = propositions.findIndex((proposition) => proposition.auteurs.includes(joueur.id));
  const resultatsParProposition = resultats(salle);
  const resultat = resultatsParProposition[index];
  return {
    ecran: 'resultat',
    numero,
    aVote: Boolean(reponses[joueur.id]),
    pasAssezDeTitres: pasAssezDeTitres(salle),
    sonTitre: titres[joueur.id]?.texte ?? null,
    votesRecus: resultat?.votants.length ?? 0,
    legendaire: resultat?.legendaire ?? false,
    gagnant: index >= 0 && gagnants(resultatsParProposition).includes(index),
    points: resultat?.points ?? 0,
    rang: rangDe(salle, joueur),
  };
}
