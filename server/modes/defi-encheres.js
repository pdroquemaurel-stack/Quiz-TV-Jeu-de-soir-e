// Mode Le défi des enchères (docs/modes/defi-encheres.md) : on surenchérit au « +1 »,
// le dernier enchérisseur cite ses réponses à voix haute, un arbitre les compte.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, echeanceDePhase, listerAttendus, melanger, noterQuestionsVues, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tirerQuestions,
  texteLongueur,
} from './commun.js';

export const id = 'defi-encheres';
export const nom = 'Le défi des enchères';
export const regleCourte = 'Surenchéris au « +1 »… puis cite autant de réponses que tu l\'as promis, en 1 minute.';
export const joueursMin = 3;

export const DUREE_ENCHERES_MS = 7000;
export const DUREE_ANNONCE_MS = 5000;
export const DUREE_DEFI_MS = 60000;
export const DUREE_REVELATION_MS = 10000;
export const ENCHERE_MAX = 99;

export const banqueDefis = JSON.parse(
  readFileSync(new URL('../../data/defi-encheres.json', import.meta.url), 'utf8'),
);

// ---------- Réglages de l'hôte : le nombre de manches seulement (le défi dure toujours 1 min) ----------

const CHOIX = { longueurs: [5, 8, 12], unite: ['manche', 'manches'] };

export function reglagesParDefaut() {
  return { longueur: 8 };
}

export function validerReglages(donnees) {
  const { longueur } = donnees ?? {};
  return CHOIX.longueurs.includes(longueur) ? { longueur } : null;
}

function reglagesDe(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  return {
    titre: 'Options',
    valeurs: reglages,
    resume: texteLongueur(CHOIX, reglages.longueur),
    options: {
      longueurs: CHOIX.longueurs.map((longueur) => ({ id: longueur, libelle: texteLongueur(CHOIX, longueur) })),
    },
  };
}

// ---------- Règles pures ----------

// « En 1 minute, combien de départements français peux-tu citer ? », « … combien d'acteurs … ».
export function texteDefi(sujet) {
  const de = /^[aeiouyàâéèêîôû]/i.test(sujet) ? 'd\'' : 'de ';
  return `En 1 minute, combien ${de}${sujet} peux-tu citer ?`;
}

// Relevé : le relevant marque son enchère. Raté : +1 pour chaque autre joueur de la manche,
// sauf l'arbitre. L'arbitre ne marque jamais rien.
// manche : { attendus, enchere, auteur, arbitre, compteur }.
export function pointsDeLaManche(manche, joueurId) {
  const { attendus, enchere, auteur, arbitre, compteur } = manche;
  if (joueurId === arbitre) return 0;
  if (compteur >= enchere) return joueurId === auteur ? enchere : 0;
  return joueurId !== auteur && attendus.includes(joueurId) ? 1 : 0;
}

// Parmi les candidats, le moins souvent arbitre jusqu'ici, au hasard entre ex æquo. null s'il n'y en a pas.
export function choisirArbitre(candidats, arbitrages) {
  const fois = (joueurId) => arbitrages[joueurId] ?? 0;
  return melanger(candidats).sort((a, b) => fois(a) - fois(b))[0] ?? null;
}

// ---------- Déroulé d'une partie ----------

function estConnecte(salle, joueurId) {
  return salle.joueurs.some((joueur) => joueur.id === joueurId && joueur.connecte);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueDefis, salle.questionsVues, reglagesDe(salle).longueur);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions, arbitrages: {} };
  demarrerManche(salle, 0);
}

// La manche s'ouvre sur la mise de départ du défi, au nom d'un joueur tiré au sort.
function demarrerManche(salle, index) {
  const attendus = listerAttendus(salle);
  Object.assign(salle.etatMode, {
    phase: 'encheres',
    indexQuestion: index,
    debutPhaseA: Date.now(),
    attendus,
    enchere: salle.etatMode.questions[index].miseDepart,
    auteur: melanger(attendus)[0] ?? null,
    arbitre: null,
    compteur: 0,
  });
}

// En `encheres` : { encherir: n }, n = enchère en cours + 1. En `defi` : { compter: 1 | -1 }, de l'arbitre.
// Renvoie true si c'est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (phase === 'encheres') return encherir(salle, joueurId, contenu.encherir);
  if (phase === 'defi') return compter(salle, joueurId, contenu.compter);
  return false;
}

// La valeur visée est envoyée : deux appuis simultanés ne font monter l'enchère que de 1.
function encherir(salle, joueurId, valeur) {
  const { etatMode } = salle;
  if (!participe(salle, joueurId) || joueurId === etatMode.auteur) return false;
  if (valeur !== etatMode.enchere + 1 || valeur > ENCHERE_MAX) return false;
  Object.assign(etatMode, { enchere: valeur, auteur: joueurId, debutPhaseA: Date.now() });
  return true;
}

function compter(salle, joueurId, pas) {
  const { etatMode } = salle;
  if (joueurId !== etatMode.arbitre || (pas !== 1 && pas !== -1)) return false;
  etatMode.compteur = Math.max(0, etatMode.compteur + pas);
  return true;
}

// Adjugé : l'arbitre est tiré parmi les attendus connectés, sauf le relevant.
function adjuger(salle) {
  const { etatMode } = salle;
  etatMode.phase = 'annonce';
  etatMode.debutPhaseA = Date.now();
  nommerArbitre(salle);
}

function nommerArbitre(salle) {
  const { etatMode } = salle;
  const candidats = etatMode.attendus.filter((joueurId) => joueurId !== etatMode.auteur && estConnecte(salle, joueurId));
  etatMode.arbitre = choisirArbitre(candidats, etatMode.arbitrages);
  if (etatMode.arbitre) etatMode.arbitrages[etatMode.arbitre] = (etatMode.arbitrages[etatMode.arbitre] ?? 0) + 1;
}

// Après chaque réponse et chaque déconnexion : défi relevé dès que le compteur atteint l'enchère ;
// arbitre déconnecté pendant l'annonce ou le défi, remplacé (le compteur est gardé).
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  if (phase !== 'annonce' && phase !== 'defi') return;
  const { etatMode } = salle;
  if (phase === 'defi' && etatMode.compteur >= etatMode.enchere) {
    reveler(salle);
    return;
  }
  if (!etatMode.arbitre || !estConnecte(salle, etatMode.arbitre)) nommerArbitre(salle);
}

function pointsGagnes(salle, joueurId) {
  return salle.etatMode.phase === 'revelation' ? pointsDeLaManche(salle.etatMode, joueurId) : 0;
}

function reveler(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, demarrerManche);
}

// « Suivant » de l'hôte pendant la révélation. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Le chrono des enchères repart à chaque « +1 » : debutPhaseA est remis à l'heure de l'enchère.
const DUREES = {
  encheres: DUREE_ENCHERES_MS, annonce: DUREE_ANNONCE_MS, defi: DUREE_DEFI_MS, revelation: DUREE_REVELATION_MS,
};

export function echeance(salle) {
  return echeanceDePhase(salle, DUREES);
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'encheres') adjuger(salle);
  else if (phase === 'annonce') {
    salle.etatMode.phase = 'defi';
    salle.etatMode.debutPhaseA = Date.now();
  } else if (phase === 'defi') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// Rien n'est secret dans ce mode : le défi, les enchères et le compteur sont publics.

function vueDefi(defi) {
  return { sujet: defi.sujet, texte: texteDefi(defi.sujet) };
}

function pseudoDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId)?.pseudo ?? null;
}

function vueManche(salle) {
  const {
    phase, questions, indexQuestion, enchere, auteur, arbitre, compteur,
  } = salle.etatMode;
  const vue = {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    defi: vueDefi(questionCourante(salle)),
    enchere,
    auteur,
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
  if (phase !== 'encheres') Object.assign(vue, { arbitre, compteur });
  return vue;
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'revelation') {
    const { compteur, enchere } = salle.etatMode;
    return { ...vueManche(salle), releve: compteur >= enchere, classement: classement(salle) };
  }
  if (phase) return vueManche(salle);
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const {
    phase, questions, indexQuestion, enchere, auteur, arbitre, compteur,
  } = salle.etatMode;
  const base = {
    numero: indexQuestion + 1,
    total: questions.length,
    defi: vueDefi(questionCourante(salle)),
    enchere,
    phase,
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
  if (phase === 'encheres') {
    return {
      ...base, ecran: 'encheres', auteur: pseudoDe(salle, auteur), estAuteur: joueur.id === auteur, enchereMax: ENCHERE_MAX,
    };
  }
  const roles = { compteur, releveur: pseudoDe(salle, auteur), arbitre: pseudoDe(salle, arbitre) };
  if (phase === 'revelation') {
    let role = 'joueur';
    if (joueur.id === auteur) role = 'releveur';
    else if (joueur.id === arbitre) role = 'arbitre';
    return {
      ...base,
      ...roles,
      ecran: 'resultat',
      releve: compteur >= enchere,
      role,
      points: pointsGagnes(salle, joueur.id),
      rang: rangDe(salle, joueur),
    };
  }
  if (joueur.id === auteur) return { ...base, ...roles, ecran: 'releve' };
  if (joueur.id === arbitre) return { ...base, ...roles, ecran: 'arbitre' };
  return { ...base, ...roles, ecran: 'ecouter_defi' };
}
