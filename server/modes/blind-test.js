// Mode Blind test (docs/modes/blind-test.md). Chaque manche a son maître du jeu, qui voit
// la réponse et désigne qui a trouvé. Deux formats choisis par l'hôte :
// - classique : une chanson par manche (une « question » est une chanson du catalogue) ;
// - mix : 5 chansons jouées ensemble (une « question » est une liste de 5 chansons).
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

export const CHANSONS_PAR_MIX = 5;
export const DUREE_ECOUTE_MIX_MS = 120000;
export const DUREE_DESIGNATION_MIX_MS = 20000;
export const DUREE_REVELATION_MIX_MS = 15000;
// Ce qu'a trouvé le gagnant d'une chanson du mix.
export const POINTS_MIX = { titre: 500, artiste: 500, 'les-deux': 1000 };

// Position de départ dans l'extrait de 30 s, tirée pour chaque chanson.
const DEPART_MAX_S = 10;

const FORMATS = { classique: 'Classique', mix: 'Mix' };

// ---------- Réglages de l'hôte : le format ----------

export function reglagesParDefaut() {
  return { format: 'classique' };
}

export function validerReglages(donnees) {
  const format = donnees?.format;
  return typeof format === 'string' && Object.hasOwn(FORMATS, format) ? { format } : null;
}

function formatChoisi(salle) {
  return (salle.reglagesMode?.[id] ?? reglagesParDefaut()).format;
}

export function vueReglages(salle) {
  const format = formatChoisi(salle);
  return {
    format,
    titre: 'Format',
    resume: FORMATS[format],
    options: { formats: Object.entries(FORMATS).map(([idFormat, libelle]) => ({ id: idFormat, libelle })) },
  };
}

// ---------- Règles pures ----------

// designation : { titre, artiste }, chacun l'id du joueur qui a trouvé, ou null.
export function pointsClassique(designation, joueurId) {
  if (!designation) return 0;
  return (designation.titre === joueurId ? POINTS_TITRE : 0)
    + (designation.artiste === joueurId ? POINTS_ARTISTE : 0);
}

// trouvees : { index de la chanson dans le mix: { joueur, trouve } }.
export function pointsDuMix(trouvees, joueurId) {
  return Object.values(trouvees)
    .filter((trouvee) => trouvee.joueur === joueurId)
    .reduce((total, trouvee) => total + POINTS_MIX[trouvee.trouve], 0);
}

function tirerDepart() {
  return Math.floor(Math.random() * (DEPART_MAX_S + 1));
}

// ---------- Maîtres et désignables ----------

function maitreCourant(salle) {
  return salle.etatMode.maitres[salle.etatMode.indexQuestion];
}

function estConnecte(salle, joueurId) {
  return salle.joueurs.some((joueur) => joueur.id === joueurId && joueur.connecte);
}

// Seuls les joueurs attendus de la manche, sauf le maître, peuvent être désignés.
function peutEtreDesigne(salle, joueurId) {
  return participe(salle, joueurId) && joueurId !== maitreCourant(salle);
}

export function designationValide(salle, contenu) {
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (!Object.hasOwn(contenu, 'titre') || !Object.hasOwn(contenu, 'artiste')) return false;
  return [contenu.titre, contenu.artiste].every((joueurId) => joueurId === null || peutEtreDesigne(salle, joueurId));
}

// ---------- Déroulé commun ----------

// Chacun des joueurs connectés au lancement sera maître une fois, dans un ordre tiré au sort.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const format = formatChoisi(salle);
  const maitres = melanger(listerAttendus(salle));
  const parManche = format === 'mix' ? CHANSONS_PAR_MIX : 1;
  const chansons = tirerQuestions(banqueBlindTest(), salle.questionsVues, maitres.length * parManche);
  noterQuestionsVues(salle, chansons);
  const questions = format === 'mix'
    ? maitres.map((_, manche) => chansons.slice(manche * parManche, (manche + 1) * parManche))
    : chansons;
  salle.etatMode = { format, questions, maitres };
  demarrerManche(salle, 0);
}

// Une manche dont le maître est déconnecté est sautée ; plus aucune : podium.
function demarrerManche(salle, index) {
  const { maitres, format } = salle.etatMode;
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
    attendus: listerAttendus(salle),
  });
  if (format === 'mix') {
    Object.assign(salle.etatMode, {
      departs: Array.from({ length: CHANSONS_PAR_MIX }, tirerDepart),
      ecouteRestanteMs: DUREE_ECOUTE_MIX_MS,
      trouvees: {},
      chansonEnDesignation: null,
    });
  } else {
    Object.assign(salle.etatMode, { depart: tirerDepart(), designation: null });
  }
}

// Seul le maître répond. Renvoie true si c'est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (phase !== 'ecoute' && phase !== 'designation') return false;
  if (joueurId !== maitreCourant(salle)) return false;
  return salle.etatMode.format === 'mix'
    ? enregistrerReponseMix(salle, phase, contenu)
    : enregistrerReponseClassique(salle, contenu);
}

// Classique : la validation termine la manche. Mix : les 5 chansons trouvées aussi.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  const { format, designation, trouvees } = salle.etatMode;
  if (format === 'classique' && (phase === 'ecoute' || phase === 'designation') && designation) {
    montrerRevelation(salle);
  }
  if (format === 'mix' && phase === 'ecoute' && Object.keys(trouvees).length === CHANSONS_PAR_MIX) {
    montrerRevelation(salle);
  }
}

// Classique : points ajoutés à la révélation. Mix : ajoutés dès la désignation de chaque chanson.
function pointsGagnes(salle, joueurId) {
  const { format, phase, designation, trouvees } = salle.etatMode;
  if (format === 'mix') return pointsDuMix(trouvees, joueurId);
  return phase === 'revelation' ? pointsClassique(designation, joueurId) : 0;
}

function montrerRevelation(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  if (salle.etatMode.format === 'classique') {
    for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
  }
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

const DUREES_CLASSIQUE = {
  ecoute: DUREE_ECOUTE_MS, designation: DUREE_DESIGNATION_MS, revelation: DUREE_REVELATION_MS,
};
const DUREES_MIX = { designation: DUREE_DESIGNATION_MIX_MS, revelation: DUREE_REVELATION_MIX_MS };

// En mix, l'écoute dure ce qui reste du décompte, mis en pause pendant les désignations.
export function echeance(salle) {
  if (salle.etatMode.format === 'mix' && phaseEnCours(salle) === 'ecoute') {
    return salle.etatMode.debutPhaseA + salle.etatMode.ecouteRestanteMs;
  }
  return echeanceDePhase(salle, salle.etatMode.format === 'mix' ? DUREES_MIX : DUREES_CLASSIQUE);
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'revelation') passerALaSuite(salle);
  else if (salle.etatMode.format === 'mix') avancerMix(salle, phase);
  else avancerClassique(salle, phase);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Classique ----------

function enregistrerReponseClassique(salle, contenu) {
  if (salle.etatMode.designation || !designationValide(salle, contenu)) return false;
  salle.etatMode.designation = { titre: contenu.titre, artiste: contenu.artiste };
  return true;
}

// Sans validation, la chanson ne rapporte rien.
function avancerClassique(salle, phase) {
  if (phase === 'ecoute') {
    salle.etatMode.phase = 'designation';
    salle.etatMode.debutPhaseA = Date.now();
  } else if (phase === 'designation') montrerRevelation(salle);
}

// ---------- Mix ----------

// En écoute : { arreter: index } d'une chanson pas encore trouvée.
// En désignation : { joueur, trouve } pour la chanson arrêtée, ou { annuler: true }.
function enregistrerReponseMix(salle, phase, contenu) {
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (phase === 'ecoute') return arreterMix(salle, contenu.arreter);
  if (contenu.annuler === true) {
    reprendreEcoute(salle);
    return true;
  }
  return designerMix(salle, contenu.joueur, contenu.trouve);
}

// Le décompte d'écoute est figé pendant la désignation.
function arreterMix(salle, index) {
  const { etatMode } = salle;
  if (!Number.isInteger(index) || index < 0 || index >= CHANSONS_PAR_MIX || etatMode.trouvees[index]) return false;
  etatMode.ecouteRestanteMs = ecouteRestante(salle);
  etatMode.phase = 'designation';
  etatMode.debutPhaseA = Date.now();
  etatMode.chansonEnDesignation = index;
  return true;
}

function designerMix(salle, joueurId, trouve) {
  if (!peutEtreDesigne(salle, joueurId) || typeof trouve !== 'string' || !Object.hasOwn(POINTS_MIX, trouve)) {
    return false;
  }
  const { etatMode } = salle;
  etatMode.trouvees[etatMode.chansonEnDesignation] = { joueur: joueurId, trouve };
  salle.joueurs.find((joueur) => joueur.id === joueurId).score += POINTS_MIX[trouve];
  reprendreEcoute(salle);
  return true;
}

function reprendreEcoute(salle) {
  salle.etatMode.phase = 'ecoute';
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.chansonEnDesignation = null;
}

// Désignation sans réponse : annulée. Décompte d'écoute écoulé : révélation.
function avancerMix(salle, phase) {
  if (phase === 'designation') reprendreEcoute(salle);
  else if (phase === 'ecoute') {
    salle.etatMode.ecouteRestanteMs = 0;
    montrerRevelation(salle);
  }
}

// Ce qui reste du décompte d'écoute, figé hors de l'écoute.
function ecouteRestante(salle) {
  const { phase, ecouteRestanteMs, debutPhaseA } = salle.etatMode;
  if (phase !== 'ecoute') return ecouteRestanteMs;
  return Math.max(0, ecouteRestanteMs - (Date.now() - debutPhaseA));
}

// ---------- Vues ----------
// Construites champ par champ. Le titre et l'artiste ne partent que vers le téléphone du maître
// avant la révélation (ou, en mix, avant que la chanson soit trouvée) ; l'id Deezer ne part
// que vers la TV, qui joue les extraits.

function vueCommune(salle) {
  const {
    format, phase, indexQuestion, maitres,
  } = salle.etatMode;
  return {
    format,
    phase,
    numero: indexQuestion + 1,
    total: maitres.length,
    maitre: maitreCourant(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueChanson(chanson) {
  return { titre: chanson.titre, artiste: chanson.artiste, pochette: chanson.pochette };
}

function pseudoDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId)?.pseudo ?? null;
}

// Les boutons du maître : les joueurs attendus encore connectés, sauf lui.
function designables(salle) {
  return salle.joueurs
    .filter((joueur) => joueur.connecte && peutEtreDesigne(salle, joueur.id))
    .map(({ id: idJoueur, pseudo, couleur }) => ({ id: idJoueur, pseudo, couleur }));
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase) return salle.etatMode.format === 'mix' ? vueTvMix(salle) : vueTvClassique(salle);
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const estMaitre = joueur.id === maitreCourant(salle);
  const { format, phase, indexQuestion, maitres } = salle.etatMode;
  const base = { format, numero: indexQuestion + 1, total: maitres.length };
  if (phase !== 'revelation' && !estMaitre) {
    return { ...base, ecran: 'ecouter', phase, maitre: pseudoDe(salle, maitreCourant(salle)) };
  }
  if (format === 'mix') return { ...base, ...vueJoueurMix(salle, joueur, estMaitre) };
  return { ...base, ...vueJoueurClassique(salle, joueur, estMaitre) };
}

// ---------- Vues du classique ----------

function vueTvClassique(salle) {
  const { phase, depart, debutPhaseA } = salle.etatMode;
  const vue = vueCommune(salle);
  if (phase === 'ecoute') {
    const { id: idChanson, gain } = questionCourante(salle);
    return {
      ...vue, extrait: { id: idChanson, depart, gain }, tempsEcouleMs: Date.now() - debutPhaseA,
    };
  }
  if (phase === 'designation') return vue;
  const { designation, questions, indexQuestion } = salle.etatMode;
  const revelation = {
    ...vue,
    chanson: vueChanson(questionCourante(salle)),
    titre: designation?.titre ?? null,
    artiste: designation?.artiste ?? null,
    classement: classement(salle),
  };
  const suivante = questions[indexQuestion + 1];
  if (suivante) revelation.extraitSuivant = { id: suivante.id };
  return revelation;
}

function vueJoueurClassique(salle, joueur, estMaitre) {
  const { phase, designation } = salle.etatMode;
  const chanson = vueChanson(questionCourante(salle));
  if (phase === 'revelation') {
    return {
      ecran: 'resultat',
      estMaitre,
      chanson,
      trouveTitre: pseudoDe(salle, designation?.titre ?? null),
      trouveArtiste: pseudoDe(salle, designation?.artiste ?? null),
      aTrouveTitre: designation?.titre === joueur.id,
      aTrouveArtiste: designation?.artiste === joueur.id,
      points: pointsGagnes(salle, joueur.id),
      rang: rangDe(salle, joueur),
    };
  }
  return {
    ecran: 'maitre_classique',
    phase,
    chanson,
    designables: designables(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

// ---------- Vues du mix ----------

// Une chanson pas encore trouvée ne donne que son extrait, jusqu'à la révélation.
function vueCarte(salle, chanson, index) {
  const { phase, trouvees, departs } = salle.etatMode;
  const trouvee = trouvees[index];
  if (trouvee) {
    return {
      ...vueChanson(chanson), joueur: trouvee.joueur, trouve: trouvee.trouve, points: POINTS_MIX[trouvee.trouve],
    };
  }
  if (phase === 'revelation') return { ...vueChanson(chanson), joueur: null, trouve: null, points: 0 };
  return { extrait: { id: chanson.id, depart: departs[index], gain: chanson.gain } };
}

function vueTvMix(salle) {
  const { phase, questions, indexQuestion, chansonEnDesignation } = salle.etatMode;
  const vue = {
    ...vueCommune(salle),
    cartes: questionCourante(salle).map((chanson, index) => vueCarte(salle, chanson, index)),
    dureeEcouteMs: DUREE_ECOUTE_MIX_MS,
    ecouteRestanteMs: ecouteRestante(salle),
    tempsEcouteMs: DUREE_ECOUTE_MIX_MS - ecouteRestante(salle),
  };
  if (phase === 'designation') vue.chansonEnDesignation = chansonEnDesignation;
  if (phase === 'revelation') {
    vue.classement = classement(salle);
    const suivante = questions[indexQuestion + 1];
    if (suivante) vue.extraitsSuivants = suivante.map((chanson) => ({ id: chanson.id }));
  }
  return vue;
}

function vueJoueurMix(salle, joueur, estMaitre) {
  const { phase, trouvees, chansonEnDesignation } = salle.etatMode;
  const chansons = questionCourante(salle);
  if (phase === 'revelation') {
    return {
      ecran: 'resultat',
      estMaitre,
      chansons: chansons.map((chanson, index) => ({
        ...vueChanson(chanson),
        trouvePar: pseudoDe(salle, trouvees[index]?.joueur ?? null),
        trouve: trouvees[index]?.trouve ?? null,
      })),
      points: pointsGagnes(salle, joueur.id),
      rang: rangDe(salle, joueur),
    };
  }
  if (phase === 'designation') {
    return {
      ecran: 'maitre_designation',
      chanson: vueChanson(chansons[chansonEnDesignation]),
      designables: designables(salle),
      tempsRestantMs: tempsRestantMs(salle, echeance),
    };
  }
  return {
    ecran: 'maitre_mix',
    chansons: chansons.map((chanson, index) => ({
      titre: chanson.titre,
      artiste: chanson.artiste,
      trouvee: Boolean(trouvees[index]),
      joueur: pseudoDe(salle, trouvees[index]?.joueur ?? null),
    })),
  };
}
