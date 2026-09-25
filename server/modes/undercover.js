// Mode Undercover (docs/modes/undercover.md).
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, melanger, normaliser, noterQuestionsVues,
  participe, passerAuPodium, phaseEnCours, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';
import { compterVotes, trouverElus } from './qui-de-nous.js';

export const id = 'undercover';
export const nom = 'Undercover';
export const regleCourte = "Un intrus a un mot proche, Mister White n'en a pas : démasquez-les.";
export const joueursMin = 4;

export const NOMBRE_MANCHES = 3;
export const DUREE_VOTE_MS = 20000;
export const DUREE_ELIMINATION_MS = 8000;
export const DUREE_DEVINETTE_MS = 30000;
export const DUREE_RESULTAT_DEVINETTE_MS = 5000;
export const DUREE_FIN_MANCHE_MS = 15000;
export const POINTS_CIVIL = 1000;
export const POINTS_INFILTRE = 2000;
export const LONGUEUR_MAX_PROPOSITION = 30;

// Lue au premier lancement seulement.
let banque = null;

export function banqueUndercover() {
  banque ??= JSON.parse(readFileSync(new URL('../../data/undercover.json', import.meta.url), 'utf8'));
  return banque;
}

// ---------- Règles pures ----------

export function composition(nombreParticipants) {
  if (nombreParticipants >= 7) return { undercovers: 2, misterWhite: 1 };
  if (nombreParticipants >= 5) return { undercovers: 1, misterWhite: 1 };
  return { undercovers: 1, misterWhite: 0 };
}

// Rôles tirés au hasard : { idJoueur: 'civil' | 'undercover' | 'mister_white' }.
export function distribuerRoles(participants) {
  const { undercovers, misterWhite } = composition(participants.length);
  const roles = {};
  melanger(participants).forEach((joueurId, index) => {
    if (index < undercovers) roles[joueurId] = 'undercover';
    else if (index < undercovers + misterWhite) roles[joueurId] = 'mister_white';
    else roles[joueurId] = 'civil';
  });
  return roles;
}

// Ordre au hasard, Mister White jamais en tête. Échanger les deux premiers
// garde un premier orateur tiré au hasard parmi les autres.
export function tirerOrdreParole(enJeu, roles) {
  const ordre = melanger(enJeu);
  if (ordre.length > 1 && roles[ordre[0]] === 'mister_white') [ordre[0], ordre[1]] = [ordre[1], ordre[0]];
  return ordre;
}

// Vérifié après une élimination seulement : 'civils', 'infiltres' ou null.
export function vainqueur(roles, elimines) {
  const restants = Object.keys(roles).filter((joueurId) => !elimines.includes(joueurId));
  const civils = restants.filter((joueurId) => roles[joueurId] === 'civil').length;
  if (civils === restants.length) return 'civils';
  if (civils <= 1) return 'infiltres';
  return null;
}

// La proposition de Mister White, comparée au mot et à ses variantes.
export function motTrouve(proposition, entree) {
  return [entree.mot, ...entree.variantes].map(normaliser).includes(normaliser(proposition));
}

export function pointsDuRole(role, gagnant) {
  if (gagnant === 'civils') return role === 'civil' ? POINTS_CIVIL : 0;
  if (gagnant === 'infiltres') return role === 'civil' ? 0 : POINTS_INFILTRE;
  if (gagnant === 'mister_white') return role === 'mister_white' ? POINTS_INFILTRE : 0;
  return 0;
}

// ---------- Déroulé ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const paires = tirerQuestions(banqueUndercover(), salle.questionsVues, NOMBRE_MANCHES);
  noterQuestionsVues(salle, paires);
  salle.etatMode = { paires, victoires: { civils: 0, infiltres: 0, misterWhite: 0 } };
  demarrerManche(salle, 0);
}

// Seuls les joueurs connectés au début de la manche y participent.
function demarrerManche(salle, index) {
  const etatMode = salle.etatMode;
  const participants = listerAttendus(salle);
  const [motCivils, motUndercover] = melanger(etatMode.paires[index].mots);
  Object.assign(etatMode, {
    indexManche: index,
    tour: 0,
    participants,
    roles: distribuerRoles(participants),
    motCivils,
    motUndercover,
    elimines: [],
    dernierVote: null,
    devinette: null,
    gagnant: null,
  });
  demarrerTour(salle);
}

function demarrerTour(salle) {
  const etatMode = salle.etatMode;
  Object.assign(etatMode, {
    phase: 'description',
    tour: etatMode.tour + 1,
    debutPhaseA: Date.now(),
    ordreParole: tirerOrdreParole(enJeu(salle), etatMode.roles),
    departage: null,
    attendus: [],
    reponses: {},
  });
}

function enJeu(salle) {
  const { participants, elimines } = salle.etatMode;
  return participants.filter((joueurId) => !elimines.includes(joueurId));
}

// departage : null pour un vote normal, ou la liste des ex æquo.
function demarrerVote(salle, departage) {
  const vivants = enJeu(salle);
  Object.assign(salle.etatMode, {
    phase: 'vote',
    debutPhaseA: Date.now(),
    departage,
    attendus: listerAttendus(salle).filter((joueurId) => vivants.includes(joueurId)),
    reponses: {},
  });
}

// On ne vote pas pour soi, sauf si l'on est le seul candidat (MODE_DEV à 1 joueur).
function candidatsPour(salle, votantId) {
  const candidats = salle.etatMode.departage ?? enJeu(salle);
  const autres = candidats.filter((candidat) => candidat !== votantId);
  return autres.length > 0 ? autres : candidats;
}

function terminerVote(salle) {
  const etatMode = salle.etatMode;
  const candidats = etatMode.departage ?? enJeu(salle);
  const resultats = compterVotes(etatMode.reponses, candidats);
  const exAequo = trouverElus(resultats);
  const elimine = exAequo.length === 1 ? exAequo[0] : null;
  if (elimine) etatMode.elimines.push(elimine);
  etatMode.dernierVote = {
    resultats,
    votes: Object.entries(etatMode.reponses).map(([votant, reponse]) => ({ votant, cible: reponse.vote })),
    elimine,
    exAequo,
    // Un seul départage : une deuxième égalité n'élimine personne.
    departageAVenir: exAequo.length > 1 && !etatMode.departage ? exAequo : null,
  };
  etatMode.phase = 'elimination';
  etatMode.debutPhaseA = Date.now();
}

function demarrerDevinette(salle, misterWhite) {
  salle.etatMode.phase = 'devinette';
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.devinette = { misterWhite, proposition: null, trouve: false, recuA: null };
}

// Sans proposition à la fin du chrono : tentative ratée.
function fermerDevinette(salle, proposition) {
  const { devinette, motCivils } = salle.etatMode;
  devinette.proposition = proposition;
  devinette.trouve = proposition !== null && motTrouve(proposition, motCivils);
  devinette.recuA = Date.now();
}

function finirManche(salle, gagnant) {
  const etatMode = salle.etatMode;
  etatMode.phase = 'fin_manche';
  etatMode.debutPhaseA = Date.now();
  etatMode.gagnant = gagnant;
  const cle = { civils: 'civils', infiltres: 'infiltres', mister_white: 'misterWhite' }[gagnant];
  etatMode.victoires[cle] += 1;
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

function apresElimination(salle) {
  const { dernierVote, roles, elimines } = salle.etatMode;
  if (dernierVote.departageAVenir) return demarrerVote(salle, dernierVote.departageAVenir);
  if (!dernierVote.elimine) return demarrerTour(salle);
  if (roles[dernierVote.elimine] === 'mister_white') return demarrerDevinette(salle, dernierVote.elimine);
  const gagnant = vainqueur(roles, elimines);
  if (gagnant) finirManche(salle, gagnant);
  else demarrerTour(salle);
}

function apresDevinette(salle) {
  const { devinette, roles, elimines } = salle.etatMode;
  const gagnant = devinette.trouve ? 'mister_white' : vainqueur(roles, elimines);
  if (gagnant) finirManche(salle, gagnant);
  else demarrerTour(salle);
}

function apresFinManche(salle) {
  const suivante = salle.etatMode.indexManche + 1;
  if (suivante < salle.etatMode.paires.length) demarrerManche(salle, suivante);
  else passerAuPodium(salle);
}

// ---------- Contrat du mode ----------

// En vote : l'id du joueur désigné. En devinette : le mot proposé par Mister White.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (phase === 'vote') return enregistrerVote(salle, joueurId, contenu);
  if (phase === 'devinette') return enregistrerProposition(salle, joueurId, contenu);
  return false;
}

function enregistrerVote(salle, joueurId, vote) {
  if (!participe(salle, joueurId) || salle.etatMode.reponses[joueurId]) return false;
  if (!candidatsPour(salle, joueurId).includes(vote)) return false;
  salle.etatMode.reponses[joueurId] = { vote, recuA: Date.now() };
  return true;
}

function enregistrerProposition(salle, joueurId, contenu) {
  const { devinette } = salle.etatMode;
  if (devinette.misterWhite !== joueurId || devinette.recuA !== null) return false;
  if (typeof contenu !== 'string') return false;
  const proposition = contenu.trim();
  if (proposition === '' || proposition.length > LONGUEUR_MAX_PROPOSITION) return false;
  fermerDevinette(salle, proposition);
  return true;
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'vote' && tousOntRepondu(salle)) terminerVote(salle);
}

// « Passer au vote » ou « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'description') demarrerVote(salle, null);
  else if (phase === 'elimination') apresElimination(salle);
  else if (phase === 'devinette' && salle.etatMode.devinette.recuA !== null) apresDevinette(salle);
  else if (phase === 'fin_manche') apresFinManche(salle);
  else return false;
  return true;
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null (description).
export function echeance(salle) {
  const { debutPhaseA, devinette } = salle.etatMode;
  const phase = phaseEnCours(salle);
  if (phase === 'vote') return debutPhaseA + DUREE_VOTE_MS;
  if (phase === 'elimination') return debutPhaseA + DUREE_ELIMINATION_MS;
  if (phase === 'devinette') {
    return devinette.recuA === null
      ? debutPhaseA + DUREE_DEVINETTE_MS
      : devinette.recuA + DUREE_RESULTAT_DEVINETTE_MS;
  }
  if (phase === 'fin_manche') return debutPhaseA + DUREE_FIN_MANCHE_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'vote') terminerVote(salle);
  else if (phase === 'elimination') apresElimination(salle);
  else if (phase === 'devinette') {
    if (salle.etatMode.devinette.recuA === null) fermerDevinette(salle, null);
    else apresDevinette(salle);
  } else if (phase === 'fin_manche') apresFinManche(salle);
}

// Les points n'existent qu'en fin de manche.
function pointsGagnes(salle, joueurId) {
  const { phase, roles, gagnant } = salle.etatMode;
  if (phase !== 'fin_manche' || !roles[joueurId]) return 0;
  return pointsDuRole(roles[joueurId], gagnant);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Ce que reçoit la TV : aucun mot ni rôle d'un joueur en jeu avant la fin de la manche.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase) return { ...vueCommuneTv(salle), ...VUES_TV[phase](salle) };
  if (salle.etat === 'podium') return { classement: classement(salle), victoires: salle.etatMode.victoires };
  return {};
}

function vueCommuneTv(salle) {
  const {
    phase, indexManche, paires, tour, roles, participants, elimines,
  } = salle.etatMode;
  const nombre = (role) => Object.values(roles).filter((r) => r === role).length;
  return {
    phase,
    // Change à chaque tour : la TV y repère une nouvelle étape.
    numero: `${indexManche + 1}-${tour}`,
    manche: indexManche + 1,
    totalManches: paires.length,
    tour,
    composition: { undercovers: nombre('undercover'), misterWhite: nombre('mister_white') },
    participants,
    elimines: elimines.map((joueurId) => ({ id: joueurId, role: roles[joueurId] })),
  };
}

const VUES_TV = {
  description: (salle) => ({ ordreParole: salle.etatMode.ordreParole }),
  vote: (salle) => ({
    candidats: salle.etatMode.departage ?? enJeu(salle),
    departage: salle.etatMode.departage,
    ontVote: Object.keys(salle.etatMode.reponses),
    tempsRestantMs: tempsRestant(salle),
  }),
  elimination: (salle) => {
    const { dernierVote, roles } = salle.etatMode;
    return {
      resultats: dernierVote.resultats,
      votes: dernierVote.votes,
      elimine: dernierVote.elimine ? { id: dernierVote.elimine, role: roles[dernierVote.elimine] } : null,
      exAequo: dernierVote.exAequo,
      departage: dernierVote.departageAVenir,
    };
  },
  devinette: (salle) => ({ devinette: vueDevinette(salle), tempsRestantMs: tempsRestant(salle) }),
  fin_manche: (salle) => {
    const {
      gagnant, motCivils, motUndercover, roles,
    } = salle.etatMode;
    return {
      gagnant,
      motCivils: motCivils.mot,
      motUndercover: motUndercover.mot,
      roles,
      classement: classement(salle),
    };
  },
};

function tempsRestant(salle) {
  return Math.max(0, echeance(salle) - Date.now());
}

// Ce que tout le monde voit de la devinette : la proposition une fois envoyée, jamais le mot attendu.
function vueDevinette(salle) {
  const { misterWhite, proposition, trouve, recuA } = salle.etatMode.devinette;
  const resultatConnu = recuA !== null;
  return {
    misterWhite,
    resultatConnu,
    proposition: resultatConnu ? proposition : null,
    trouve: resultatConnu && trouve,
  };
}

function joueurVisible(salle, joueurId) {
  const { pseudo, couleur, connecte } = salle.joueurs.find((joueur) => joueur.id === joueurId);
  return { id: joueurId, pseudo, couleur, connecte };
}

function pseudoDe(salle, joueurId) {
  return joueurVisible(salle, joueurId).pseudo;
}

function motDe(salle, joueurId) {
  const { roles, motCivils, motUndercover } = salle.etatMode;
  if (roles[joueurId] === 'civil') return motCivils.mot;
  if (roles[joueurId] === 'undercover') return motUndercover.mot;
  return null;
}

// Le bouton de l'hôte, quel que soit son propre écran (même éliminé ou en attente de manche).
function actionHote(salle, joueur) {
  if (salle.hoteId !== joueur.id) return null;
  const { phase, devinette } = salle.etatMode;
  if (phase === 'description') return 'passer_au_vote';
  if (phase === 'elimination' || phase === 'fin_manche') return 'suivant';
  if (phase === 'devinette' && devinette.recuA !== null) return 'suivant';
  return null;
}

// Écran du téléphone : jamais le mot d'un autre, ni un rôle caché, ni le vote d'un autre.
// Un civil et un undercover reçoivent les mêmes champs : seule la valeur de `mot` change.
export function vueJoueur(salle, joueur) {
  const etatMode = salle.etatMode;
  const commun = {
    actionHote: actionHote(salle, joueur),
    manche: etatMode.indexManche + 1,
    totalManches: etatMode.paires.length,
    tour: etatMode.tour,
  };
  if (!etatMode.participants.includes(joueur.id)) return { ...commun, ecran: 'attente_manche' };

  const role = etatMode.roles[joueur.id];
  const avecMot = { ...commun, mot: motDe(salle, joueur.id), misterWhite: role === 'mister_white' };
  const { phase } = etatMode;
  if (phase === 'fin_manche') return { ...avecMot, ...vueFinManche(salle, joueur, role) };
  if (phase === 'devinette' && etatMode.devinette.misterWhite === joueur.id) {
    return { ...avecMot, ecran: 'deviner', devinette: vueDevinette(salle), tempsRestantMs: tempsRestant(salle) };
  }
  if (etatMode.elimines.includes(joueur.id)) return { ...avecMot, ecran: 'elimine', role };
  if (phase === 'vote') return { ...avecMot, ...vueVote(salle, joueur) };
  if (phase === 'elimination' || phase === 'devinette') return { ...avecMot, ...vueElimination(salle) };
  return { ...avecMot, ecran: 'mot' };
}

function vueVote(salle, joueur) {
  const reponse = salle.etatMode.reponses[joueur.id];
  if (reponse) return { ecran: 'vote_envoye', choisi: joueurVisible(salle, reponse.vote) };
  // Absent au début du vote : il attend la fin du vote avec son mot.
  if (!participe(salle, joueur.id)) return { ecran: 'mot' };
  const candidats = candidatsPour(salle, joueur.id).map((candidat) => joueurVisible(salle, candidat));
  return { ecran: 'voter', departage: salle.etatMode.departage !== null, candidats };
}

function vueElimination(salle) {
  const { dernierVote, roles, phase } = salle.etatMode;
  const { elimine, departageAVenir } = dernierVote;
  const devinette = phase === 'devinette' ? vueDevinette(salle) : null;
  return {
    ecran: 'elimination',
    elimine: elimine ? { pseudo: pseudoDe(salle, elimine), role: roles[elimine] } : null,
    departage: departageAVenir ? departageAVenir.map((joueurId) => pseudoDe(salle, joueurId)) : null,
    devinette: devinette && { ...devinette, misterWhite: pseudoDe(salle, devinette.misterWhite) },
  };
}

function vueFinManche(salle, joueur, role) {
  const { gagnant, motCivils, motUndercover } = salle.etatMode;
  return {
    ecran: 'fin_manche',
    role,
    gagnant,
    motCivils: motCivils.mot,
    motUndercover: motUndercover.mot,
    points: pointsGagnes(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}
