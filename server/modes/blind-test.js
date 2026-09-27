// Mode Blind test, format classique (docs/modes/blind-test.md). Une « question » est une chanson
// du catalogue ; chaque manche a son maître du jeu, qui voit la réponse et désigne qui a trouvé.
import { banqueBlindTest } from '../extraits.js';
import {
  classement as classementCommun, echeanceDePhase, listerAttendus, melanger, noterQuestionsVues,
  participe, passerAuPodium, phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe,
  tempsRestantMs, tirerQuestions,
} from './commun.js';

export const id = 'blind-test';
export const nom = 'Blind test';
export const regleCourte = 'Chacun son tour maître du jeu : trouvez le titre et l\'artiste !';
export const joueursMin = 3;

export const DUREE_ECOUTE_MS = 30000;
export const DUREE_DESIGNATION_MS = 15000;
export const DUREE_REVELATION_MS = 12000;
export const POINTS_TITRE = 500;
export const POINTS_ARTISTE = 500;
// Position de départ dans l'extrait de 30 s, tirée pour chaque chanson.
const DEPART_MAX_S = 10;

// ---------- Règles pures ----------

// designation : { titre, artiste }, chacun l'id du joueur qui a trouvé, ou null.
export function pointsClassique(designation, joueurId) {
  if (!designation) return 0;
  return (designation.titre === joueurId ? POINTS_TITRE : 0)
    + (designation.artiste === joueurId ? POINTS_ARTISTE : 0);
}

// Seuls les joueurs attendus de la manche, sauf le maître, peuvent être désignés.
function peutEtreDesigne(salle, joueurId) {
  return joueurId === null || (participe(salle, joueurId) && joueurId !== maitreCourant(salle));
}

export function designationValide(salle, contenu) {
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (!Object.hasOwn(contenu, 'titre') || !Object.hasOwn(contenu, 'artiste')) return false;
  return [contenu.titre, contenu.artiste].every((joueurId) => peutEtreDesigne(salle, joueurId));
}

// ---------- Déroulé ----------

function maitreCourant(salle) {
  return salle.etatMode.maitres[salle.etatMode.indexQuestion];
}

function estConnecte(salle, joueurId) {
  return salle.joueurs.some((joueur) => joueur.id === joueurId && joueur.connecte);
}

// Chacun des joueurs connectés au lancement sera maître une fois, dans un ordre tiré au sort.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const maitres = melanger(listerAttendus(salle));
  const questions = tirerQuestions(banqueBlindTest(), salle.questionsVues, maitres.length);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { format: 'classique', questions, maitres };
  demarrerManche(salle, 0);
}

// Une manche dont le maître est déconnecté est sautée ; plus aucune : podium.
function demarrerManche(salle, index) {
  const { maitres } = salle.etatMode;
  let suivante = index;
  while (suivante < maitres.length && !estConnecte(salle, maitres[suivante])) suivante++;
  if (suivante >= maitres.length) {
    passerAuPodium(salle);
    return;
  }
  Object.assign(salle.etatMode, {
    phase: 'ecoute',
    indexQuestion: suivante,
    debutPhaseA: Date.now(),
    depart: Math.floor(Math.random() * (DEPART_MAX_S + 1)),
    attendus: listerAttendus(salle),
    designation: null,
  });
}

// Seul le maître répond, une seule fois : { titre, artiste }. Renvoie true si c'est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (phase !== 'ecoute' && phase !== 'designation') return false;
  if (joueurId !== maitreCourant(salle) || salle.etatMode.designation) return false;
  if (!designationValide(salle, contenu)) return false;
  salle.etatMode.designation = { titre: contenu.titre, artiste: contenu.artiste };
  return true;
}

// La validation du maître termine la manche, pendant l'écoute comme pendant la désignation.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  if ((phase === 'ecoute' || phase === 'designation') && salle.etatMode.designation) montrerRevelation(salle);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return pointsClassique(salle.etatMode.designation, joueurId);
}

function montrerRevelation(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, demarrerManche);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

const DUREES = { ecoute: DUREE_ECOUTE_MS, designation: DUREE_DESIGNATION_MS, revelation: DUREE_REVELATION_MS };

export function echeance(salle) {
  return echeanceDePhase(salle, DUREES);
}

// Appelée quand l'échéance est atteinte. Sans validation, la chanson ne rapporte rien.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'ecoute') {
    salle.etatMode.phase = 'designation';
    salle.etatMode.debutPhaseA = Date.now();
  } else if (phase === 'designation') montrerRevelation(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// Construites champ par champ. Le titre et l'artiste ne partent que vers le téléphone du maître
// avant la révélation ; l'id Deezer ne part que vers la TV, qui joue l'extrait.

function vueCommune(salle) {
  const {
    phase, indexQuestion, maitres, debutPhaseA,
  } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: maitres.length,
    maitre: maitreCourant(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
    tempsEcouleMs: Date.now() - debutPhaseA,
  };
}

function vueChanson(chanson) {
  return { titre: chanson.titre, artiste: chanson.artiste, pochette: chanson.pochette };
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'ecoute') {
    const { id: idChanson, gain } = questionCourante(salle);
    return { ...vueCommune(salle), extrait: { id: idChanson, depart: salle.etatMode.depart, gain } };
  }
  if (phase === 'designation') return vueCommune(salle);
  if (phase === 'revelation') return { ...vueCommune(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueRevelation(salle) {
  const { designation, questions, indexQuestion } = salle.etatMode;
  const vue = {
    chanson: vueChanson(questionCourante(salle)),
    titre: designation?.titre ?? null,
    artiste: designation?.artiste ?? null,
    classement: classement(salle),
  };
  const suivante = questions[indexQuestion + 1];
  if (suivante) vue.extraitSuivant = { id: suivante.id };
  return vue;
}

function pseudoDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId)?.pseudo ?? null;
}

// Les boutons du maître : les joueurs attendus encore connectés, sauf lui.
function designables(salle) {
  return salle.joueurs
    .filter((joueur) => joueur.connecte && participe(salle, joueur.id) && joueur.id !== maitreCourant(salle))
    .map(({ id: idJoueur, pseudo, couleur }) => ({ id: idJoueur, pseudo, couleur }));
}

export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, indexQuestion, maitres } = salle.etatMode;
  const numero = indexQuestion + 1;
  const total = maitres.length;
  const estMaitre = joueur.id === maitreCourant(salle);
  if (phase === 'revelation') return vueResultat(salle, joueur, numero, estMaitre);
  if (!estMaitre) {
    return {
      ecran: 'ecouter', numero, total, phase, maitre: pseudoDe(salle, maitreCourant(salle)),
    };
  }
  return {
    ecran: 'maitre_classique',
    numero,
    total,
    phase,
    chanson: vueChanson(questionCourante(salle)),
    designables: designables(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueResultat(salle, joueur, numero, estMaitre) {
  const { designation } = salle.etatMode;
  return {
    ecran: 'resultat',
    numero,
    estMaitre,
    chanson: vueChanson(questionCourante(salle)),
    trouveTitre: pseudoDe(salle, designation?.titre ?? null),
    trouveArtiste: pseudoDe(salle, designation?.artiste ?? null),
    aTrouveTitre: designation?.titre === joueur.id,
    aTrouveArtiste: designation?.artiste === joueur.id,
    points: pointsGagnes(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}
