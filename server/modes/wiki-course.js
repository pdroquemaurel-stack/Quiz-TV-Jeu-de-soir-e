// Mode Wiki course (docs/modes/wiki-course.md) : atteindre une page Wikipédia cible en ne
// cliquant que sur les liens des articles, en course libre ou en manches.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, maintenant, noterQuestionsVues, passerAuPodium,
  phaseEnCours, rangDe, tempsRestantMs, texteLongueur, tirerQuestions,
} from './commun.js';
import * as wikipedia from '../wikipedia.js';

export const id = 'wiki-course';
export const nom = 'Wiki course';
export const regleCourte = 'Atteins la page cible en cliquant de lien en lien sur Wikipédia. Pas de recherche à côté !';
export const joueursMin = 2;
// Reprise après une pause de l'hôte : toutes les heures de etatMode avancent d'autant.
export { decalerHeures } from './commun.js';

export const DUREE_ANNONCE_MS = 8000;
export const DUREE_REVELATION_MS = 3000;
export const DUREE_BILAN_MS = 20000;
export const MANCHES_MAX = 15;
const ESSAIS_HASARD = 3;

export const banqueCouples = JSON.parse(
  readFileSync(new URL('../../data/wiki-course.json', import.meta.url), 'utf8'),
);

// ---------- Réglages de l'hôte : format, courses, temps, départ, niveaux ----------

const FORMATS = { libre: 'Course libre', manches: 'Manches' };
const LONGUEURS = [1, 3, 5];
// 0 : course libre sans limite de temps, finie quand tous sont arrivés ou par l'hôte.
const TEMPS = { libre: [180, 300, 480, 0], manches: [10, 15, 20] };
const NIVEAUX = { 1: 'Facile', 2: 'Difficile' };
const CHOIX_LONGUEUR = { unite: ['course', 'courses'] };

export function reglagesParDefaut() {
  return {
    format: 'libre', longueur: 3, temps: 300, departHasard: false, niveaux: [1, 2],
  };
}

// Renvoie des réglages propres, ou null. Un temps de l'autre format (l'hôte vient de
// changer de format) devient le temps par défaut du nouveau.
export function validerReglages(donnees) {
  const {
    format, longueur, temps, departHasard, niveaux,
  } = donnees ?? {};
  if (!Object.hasOwn(FORMATS, format) || !LONGUEURS.includes(longueur) || typeof departHasard !== 'boolean') return null;
  const connus = Object.keys(NIVEAUX).map(Number);
  if (!Array.isArray(niveaux) || niveaux.length === 0 || !niveaux.every((niveau) => connus.includes(niveau))) return null;
  let tempsRetenu = temps;
  if (!TEMPS[format].includes(temps)) {
    if (!Object.values(TEMPS).flat().includes(temps)) return null;
    tempsRetenu = TEMPS[format][1];
  }
  return {
    format, longueur, temps: tempsRetenu, departHasard, niveaux: connus.filter((niveau) => niveaux.includes(niveau)),
  };
}

function reglagesDe(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

// 300 → « 5 min », 15 → « 15 s », 0 → « Sans limite ».
function texteTemps(secondes) {
  if (secondes === 0) return 'Sans limite';
  return secondes >= 60 ? `${secondes / 60} min` : `${secondes} s`;
}

function texteNiveaux(niveaux) {
  if (niveaux.length === Object.keys(NIVEAUX).length) return 'Tous niveaux';
  return niveaux.map((niveau) => NIVEAUX[niveau]).join(' + ');
}

export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  const { format, longueur, temps } = reglages;
  let tempsTexte = `manches de ${temps} s`;
  if (format === 'libre') tempsTexte = temps === 0 ? 'sans limite de temps' : texteTemps(temps);
  return {
    titre: 'Options',
    valeurs: reglages,
    resume: [
      FORMATS[format], texteLongueur(CHOIX_LONGUEUR, longueur), tempsTexte,
      reglages.departHasard ? 'départ au hasard' : null, texteNiveaux(reglages.niveaux),
    ].filter(Boolean).join(' · '),
    options: {
      formats: Object.entries(FORMATS).map(([idFormat, libelle]) => ({ id: idFormat, libelle })),
      longueurs: LONGUEURS.map((nombre) => ({ id: nombre, libelle: texteLongueur(CHOIX_LONGUEUR, nombre) })),
      temps: TEMPS[format].map((secondes) => ({ id: secondes, libelle: texteTemps(secondes) })),
      titreTemps: format === 'libre' ? 'Durée de chaque course' : 'Temps pour choisir un lien',
      niveaux: Object.entries(NIVEAUX).map(([niveau, libelle]) => ({ id: Number(niveau), libelle })),
    },
  };
}

// ---------- Règles pures ----------

// Course libre : rang d'arrivée à l'heure du serveur, mêmes points à la même milliseconde.
export function pointsCourseLibre(rang) {
  return Math.max(1000 - 150 * (rang - 1), 250);
}

export function pointsManche(manche) {
  return 1000 - 50 * (manche - 1);
}

// Rang d'arrivée de chaque joueur arrivé : { joueurId: rang }, ex æquo à la même heure.
export function rangsArrivee(etatMode) {
  const arrivees = Object.entries(etatMode.parcours)
    .filter(([, parcours]) => parcours.arriveeA !== null)
    .map(([joueurId, parcours]) => [joueurId, parcours.arriveeA]);
  return Object.fromEntries(arrivees.map(([joueurId, heure]) => [
    joueurId, 1 + arrivees.filter(([, autre]) => autre < heure).length,
  ]));
}

// Points de la course pour chaque joueur qui y participe : { joueurId: points }.
export function pointsDeLaCourse(etatMode) {
  const rangs = rangsArrivee(etatMode);
  return Object.fromEntries(Object.entries(etatMode.parcours).map(([joueurId, parcours]) => {
    if (parcours.arriveeManche !== null) return [joueurId, pointsManche(parcours.arriveeManche)];
    if (parcours.arriveeA !== null) return [joueurId, pointsCourseLibre(rangs[joueurId])];
    return [joueurId, 0];
  }));
}

// ---------- Déroulé d'une partie ----------

function joueurDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId);
}

function pageCourante(parcours) {
  return parcours.pile.at(-1);
}

function estArrive(parcours) {
  return parcours.arriveeA !== null || parcours.arriveeManche !== null;
}

function coupleCourant(salle) {
  return salle.etatMode.courses[salle.etatMode.indexCourse];
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const {
    format, longueur, temps, departHasard, niveaux,
  } = reglagesDe(salle);
  const banque = banqueCouples.filter((couple) => niveaux.includes(couple.niveau));
  const courses = tirerQuestions(banque, salle.questionsVues, longueur);
  noterQuestionsVues(salle, courses);
  salle.etatMode = {
    format, duree: temps * 1000, departHasard, courses,
  };
  demarrerAnnonce(salle, 0);
}

function demarrerAnnonce(salle, index) {
  const { etatMode } = salle;
  if (index >= etatMode.courses.length) {
    passerAuPodium(salle);
    return;
  }
  const couple = etatMode.courses[index];
  Object.assign(etatMode, {
    phase: 'annonce',
    indexCourse: index,
    debutPhaseA: Date.now(),
    depart: etatMode.departHasard ? null : couple.depart,
    cible: { titre: couple.cible, extrait: '', image: null },
    resumeLance: false,
    tirageLance: false,
    manche: 1,
    attendus: listerAttendus(salle),
    parcours: {},
    deplacements: [],
  });
}

function nouveauParcours(depart) {
  return {
    pile: [depart], pages: [depart], clics: 0, demande: null, choix: null, refus: null, arriveeA: null, arriveeManche: null,
  };
}

function commencerCourse(salle) {
  const { etatMode } = salle;
  // Départ au hasard pas encore trouvé : celui du couple.
  etatMode.depart ??= coupleCourant(salle).depart;
  etatMode.phase = 'course';
  etatMode.debutPhaseA = Date.now();
  etatMode.parcours = Object.fromEntries(etatMode.attendus.map((joueurId) => [joueurId, nouveauParcours(etatMode.depart)]));
}

// Un déplacement accepté : vers une nouvelle page, ou en arrière (retour).
function deplacer(salle, parcours, vers, heureA) {
  const { etatMode } = salle;
  if (vers.retour) parcours.pile.pop();
  else parcours.pile.push(vers.titre);
  parcours.pages.push(pageCourante(parcours));
  parcours.clics += 1;
  if (pageCourante(parcours) !== etatMode.cible.titre) return;
  if (etatMode.format === 'libre') parcours.arriveeA = heureA;
  else parcours.arriveeManche = etatMode.manche;
}

function terminerCourse(salle) {
  const { etatMode } = salle;
  for (const parcours of Object.values(etatMode.parcours)) {
    parcours.demande = null;
    parcours.choix = null;
  }
  etatMode.phase = 'bilan';
  etatMode.debutPhaseA = Date.now();
  const points = pointsDeLaCourse(etatMode);
  for (const [joueurId, gain] of Object.entries(points)) {
    const joueur = joueurDe(salle, joueurId);
    if (joueur) joueur.score += gain;
  }
}

// Manches : tous les choix s'appliquent d'un coup.
function reveler(salle) {
  const { etatMode } = salle;
  etatMode.deplacements = [];
  for (const [joueurId, parcours] of Object.entries(etatMode.parcours)) {
    parcours.demande = null;
    parcours.refus = null;
    if (!parcours.choix) continue;
    const de = pageCourante(parcours);
    deplacer(salle, parcours, parcours.choix, null);
    etatMode.deplacements.push({ id: joueurId, de, vers: pageCourante(parcours) });
    parcours.choix = null;
  }
  etatMode.phase = 'revelation';
  etatMode.debutPhaseA = Date.now();
}

function mancheSuivante(salle) {
  const { etatMode } = salle;
  if (etatMode.manche >= MANCHES_MAX || coureursRestants(salle).length === 0) {
    terminerCourse(salle);
    return;
  }
  Object.assign(etatMode, {
    phase: 'course', manche: etatMode.manche + 1, debutPhaseA: Date.now(), deplacements: [],
  });
}

// Les joueurs de la course, connectés et pas encore arrivés.
function coureursRestants(salle) {
  return Object.entries(salle.etatMode.parcours)
    .filter(([joueurId, parcours]) => joueurDe(salle, joueurId)?.connecte && !estArrive(parcours))
    .map(([joueurId]) => joueurId);
}

// En `course` : { aller: "Titre" } ou { retour: true } d'un joueur de la course pas encore arrivé.
// Un lien n'est accepté qu'après la vérification auprès de Wikipédia (synchroniser).
export function enregistrerReponse(salle, joueurId, contenu) {
  if (phaseEnCours(salle) !== 'course' || typeof contenu !== 'object' || contenu === null) return false;
  const parcours = salle.etatMode.parcours[joueurId];
  if (!parcours || estArrive(parcours) || parcours.demande) return false;
  if (contenu.retour === true) return demanderRetour(salle, parcours);
  const titre = wikipedia.nettoyerTitre(contenu.aller);
  if (!titre || titre === pageCourante(parcours)) return false;
  parcours.demande = { titre, demandeA: maintenant(salle), lancee: false };
  parcours.refus = null;
  return true;
}

function demanderRetour(salle, parcours) {
  if (parcours.pile.length < 2) return false;
  parcours.refus = null;
  if (salle.etatMode.format === 'libre') deplacer(salle, parcours, { retour: true }, maintenant(salle));
  else parcours.choix = { retour: true };
  return true;
}

// Le résultat de la vérification d'un lien, si la course et la demande sont toujours là.
function appliquerVerification(salle, etatMode, index, parcours, demande, resultat) {
  if (salle.etatMode !== etatMode || etatMode.indexCourse !== index || parcours.demande !== demande) return false;
  parcours.demande = null;
  if (!resultat.ok || resultat.titre === pageCourante(parcours)) {
    parcours.refus = resultat.ok ? 'absent' : resultat.raison;
    return true;
  }
  if (etatMode.format === 'libre') deplacer(salle, parcours, { titre: resultat.titre }, demande.demandeA);
  else parcours.choix = { titre: resultat.titre };
  return true;
}

async function tirerDepart() {
  for (let essai = 0; essai < ESSAIS_HASARD; essai++) {
    const titre = await wikipedia.articleAuHasard();
    if (titre) return titre;
  }
  return null;
}

// Appelée à chaque diffusion pendant la partie : lance ce qui doit être demandé à Wikipédia
// (résumé de la cible, départ au hasard, vérification des clics). rappel(salle) est appelé
// quand une réponse a changé l'état. Renvoie une promesse, attendue par les tests.
export function synchroniser(salle, rappel) {
  const { etatMode } = salle;
  const phase = phaseEnCours(salle);
  const index = etatMode?.indexCourse;
  const encoreLa = () => salle.etatMode === etatMode && etatMode.indexCourse === index;
  const travaux = [];
  if (phase === 'annonce' && !etatMode.resumeLance) {
    etatMode.resumeLance = true;
    travaux.push(wikipedia.resumer(etatMode.cible.titre).then((resume) => {
      if (!resume || !encoreLa()) return;
      etatMode.cible = resume;
      rappel(salle);
    }));
  }
  if (phase === 'annonce' && etatMode.departHasard && !etatMode.tirageLance) {
    etatMode.tirageLance = true;
    travaux.push(tirerDepart().then((titre) => {
      if (!titre || !encoreLa() || etatMode.phase !== 'annonce' || titre === etatMode.cible.titre) return;
      etatMode.depart = titre;
      rappel(salle);
    }));
  }
  if (phase === 'course') {
    for (const parcours of Object.values(etatMode.parcours)) {
      const { demande } = parcours;
      if (!demande || demande.lancee) continue;
      demande.lancee = true;
      travaux.push(wikipedia.verifierLien(pageCourante(parcours), demande.titre).then((resultat) => {
        if (appliquerVerification(salle, etatMode, index, parcours, demande, resultat)) rappel(salle);
      }));
    }
  }
  return Promise.all(travaux);
}

// Après chaque réponse, vérification et déconnexion : course libre finie quand tous les
// coureurs connectés sont arrivés ; en manches, révélation quand tous ont choisi.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) !== 'course') return;
  const restants = coureursRestants(salle);
  if (restants.length === 0) terminerCourse(salle);
  else if (salle.etatMode.format === 'manches' && restants.every((joueurId) => salle.etatMode.parcours[joueurId].choix)) {
    reveler(salle);
  }
}

function pointsGagnes(salle, joueurId) {
  const { etatMode } = salle;
  return etatMode.phase === 'bilan' ? pointsDeLaCourse(etatMode)[joueurId] ?? 0 : 0;
}

// « Suivant » de l'hôte : fin de l'annonce, « Terminer la course », fin du bilan.
export function suivant(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'annonce') commencerCourse(salle);
  else if (phase === 'course' || phase === 'revelation') terminerCourse(salle);
  else if (phase === 'bilan') demarrerAnnonce(salle, salle.etatMode.indexCourse + 1);
  else return false;
  return true;
}

export function echeance(salle) {
  const phase = phaseEnCours(salle);
  const { debutPhaseA, duree } = salle.etatMode ?? {};
  if (phase === 'annonce') return debutPhaseA + DUREE_ANNONCE_MS;
  if (phase === 'course') return duree === 0 ? null : debutPhaseA + duree;
  if (phase === 'revelation') return debutPhaseA + DUREE_REVELATION_MS;
  if (phase === 'bilan') return debutPhaseA + DUREE_BILAN_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'annonce') commencerCourse(salle);
  else if (phase === 'course' && etatMode.format === 'manches') reveler(salle);
  else if (phase === 'course') terminerCourse(salle);
  else if (phase === 'revelation') mancheSuivante(salle);
  else if (phase === 'bilan') demarrerAnnonce(salle, etatMode.indexCourse + 1);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// Temps restant de la phase, ou null pour une course libre sans limite.
function chronoDe(salle) {
  return echeance(salle) === null ? null : tempsRestantMs(salle, echeance);
}

// ---------- Vues ----------
// Rien de secret, sauf les choix d'une manche : ni la TV ni les autres ne les voient
// avant la révélation.

function vueCourse(salle) {
  const {
    phase, indexCourse, courses, format, depart, cible,
  } = salle.etatMode;
  return {
    phase, numero: indexCourse + 1, total: courses.length, format, depart, cible,
  };
}

function lignesJoueurs(salle) {
  const { etatMode } = salle;
  const rangs = rangsArrivee(etatMode);
  return Object.entries(etatMode.parcours).map(([joueurId, parcours]) => ({
    id: joueurId,
    page: pageCourante(parcours),
    clics: parcours.clics,
    arrive: estArrive(parcours),
    rangArrivee: rangs[joueurId] ?? null,
    arriveeManche: parcours.arriveeManche,
    aChoisi: etatMode.format === 'manches' && Boolean(parcours.choix),
  }));
}

// Bilan : les arrivés dans l'ordre d'arrivée (puis au moins de clics), puis les autres.
function parcoursDuBilan(salle) {
  const { etatMode } = salle;
  const points = pointsDeLaCourse(etatMode);
  const ordre = (parcours) => parcours.arriveeManche ?? parcours.arriveeA ?? Infinity;
  return Object.entries(etatMode.parcours)
    .sort(([, a], [, b]) => ordre(a) - ordre(b) || a.clics - b.clics)
    .map(([joueurId, parcours]) => ({
      id: joueurId, pages: parcours.pages, clics: parcours.clics, arrive: estArrive(parcours), points: points[joueurId],
    }));
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'annonce') return { ...vueCourse(salle), tempsRestantMs: tempsRestantMs(salle, echeance) };
  if (phase === 'course' || phase === 'revelation') {
    return {
      ...vueCourse(salle),
      manche: etatMode.manche,
      mancheMax: MANCHES_MAX,
      tempsRestantMs: chronoDe(salle),
      joueurs: lignesJoueurs(salle),
      deplacements: phase === 'revelation' ? etatMode.deplacements : [],
    };
  }
  if (phase === 'bilan') {
    return { ...vueCourse(salle), parcours: parcoursDuBilan(salle), classement: classement(salle) };
  }
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueCourseJoueur(salle, parcours) {
  const { etatMode } = salle;
  const phase = phaseEnCours(salle);
  const rangs = rangsArrivee(etatMode);
  const joueurId = Object.keys(etatMode.parcours).find((autre) => etatMode.parcours[autre] === parcours);
  const base = {
    numero: etatMode.indexCourse + 1,
    total: etatMode.courses.length,
    format: etatMode.format,
    cible: { titre: etatMode.cible.titre, extrait: etatMode.cible.extrait },
    clics: parcours.clics,
    manche: etatMode.manche,
    mancheMax: MANCHES_MAX,
    tempsRestantMs: chronoDe(salle),
    nbArrives: Object.values(etatMode.parcours).filter(estArrive).length,
    nbCoureurs: Object.keys(etatMode.parcours).length,
  };
  if (estArrive(parcours)) {
    return {
      ...base, ecran: 'arrive', rangArrivee: rangs[joueurId] ?? null, arriveeManche: parcours.arriveeManche,
    };
  }
  let choix = null;
  if (parcours.choix) choix = parcours.choix.retour ? { retour: true } : { titre: parcours.choix.titre };
  return {
    ...base,
    ecran: 'course',
    revelation: phase === 'revelation',
    page: pageCourante(parcours),
    peutRetour: parcours.pile.length > 1,
    choix,
    enVerification: Boolean(parcours.demande),
    refus: parcours.refus,
  };
}

export function vueJoueur(salle, joueur) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'annonce') {
    if (!etatMode.attendus.includes(joueur.id)) return { ecran: 'attente_question' };
    const {
      numero, total, format, depart, cible,
    } = vueCourse(salle);
    return {
      ecran: 'annonce', numero, total, format, depart, cible: { titre: cible.titre, extrait: cible.extrait },
    };
  }
  const parcours = etatMode.parcours[joueur.id];
  if (phase === 'course' || phase === 'revelation') {
    return parcours ? vueCourseJoueur(salle, parcours) : { ecran: 'attente_question' };
  }
  return {
    ecran: 'bilan',
    numero: etatMode.indexCourse + 1,
    total: etatMode.courses.length,
    cible: { titre: etatMode.cible.titre },
    participe: Boolean(parcours),
    pages: parcours?.pages ?? [],
    clics: parcours?.clics ?? 0,
    arrive: Boolean(parcours && estArrive(parcours)),
    points: pointsGagnes(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}
