// Mode Le chapeau (docs/modes/chapeau.md) : deux équipes font deviner les mêmes mots en trois
// manches (décrire, un seul mot, mimer). Le jeu de soirée traditionnel, sans nom de marque.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, cleReponse, listerAttendus, melanger, noterQuestionsVues, passerAuPodium,
  phaseEnCours, rangDe, tempsRestantMs, tirerQuestions,
} from './commun.js';

export const id = 'chapeau';
export const nom = 'Le chapeau';
export const regleCourte = 'Deux équipes font deviner les mêmes mots en 3 manches : décrire, un seul mot, mimer.';
export const joueursMin = 4;
// Reprise après une pause de l'hôte : toutes les heures de etatMode avancent d'autant.
export { decalerHeures } from './commun.js';

export const MOTS_PAR_JOUEUR = 3;
export const LONGUEUR_MAX = 30;
export const NOMBRE_MANCHES = 3;
export const POINTS_PAR_MOT = 100;
export const DUREES_MS = {
  saisie: 90000, annonce: 8000, bilan: 6000, finManche: 12000,
};
export const NOMS_EQUIPES = ['Rouges', 'Bleus'];
const CONSIGNES = [
  { titre: 'Décris', regle: 'Tout est permis, sauf le mot lui-même.' },
  { titre: 'Un seul mot', regle: 'Un seul mot d\'indice, pas un de plus.' },
  { titre: 'Mime', regle: 'Sans un bruit : seulement des gestes.' },
];

export const banqueMots = JSON.parse(
  readFileSync(new URL('../../data/chapeau.json', import.meta.url), 'utf8'),
);

// ---------- Réglages de l'hôte : d'où viennent les mots, durée d'un tour ----------

const ORIGINES = { joueurs: 'Écrits par les joueurs', hasard: 'Tous au hasard' };
const TEMPS = [30, 45, 60];

export function reglagesParDefaut() {
  return { mots: 'joueurs', temps: 30 };
}

export function validerReglages(donnees) {
  const { mots, temps } = donnees ?? {};
  if (!Object.hasOwn(ORIGINES, mots) || !TEMPS.includes(temps)) return null;
  return { mots, temps };
}

function reglagesDe(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  return {
    titre: 'Options',
    valeurs: reglages,
    resume: `${reglages.mots === 'hasard' ? 'Mots au hasard' : 'Mots écrits par les joueurs'} · ${reglages.temps} s par tour`,
    options: {
      origines: Object.entries(ORIGINES).map(([idOrigine, libelle]) => ({ id: idOrigine, libelle })),
      tempsTour: TEMPS.map((secondes) => ({ id: secondes, libelle: `${secondes} s` })),
    },
  };
}

// ---------- Règles pures ----------

// Deux équipes tirées au sort, une de plus d'un côté si le nombre est impair.
export function formerEquipes(joueurIds) {
  const ordre = melanger(joueurIds);
  return [ordre.filter((_, i) => i % 2 === 0), ordre.filter((_, i) => i % 2 === 1)];
}

// Les 3 mots d'une saisie, sans espace au bord, ou null.
export function validerMots(donnees) {
  const { mots } = donnees ?? {};
  if (!Array.isArray(mots) || mots.length !== MOTS_PAR_JOUEUR) return null;
  const propres = mots.map((mot) => (typeof mot === 'string' ? mot.trim().replace(/\s+/g, ' ') : ''));
  if (propres.some((mot) => mot === '' || mot.length > LONGUEUR_MAX || cleReponse(mot) === '')) return null;
  return propres;
}

// Les mots de la partie : ceux des joueurs d'abord, chaque doublon (même clé que Même réponse)
// ou mot manquant remplacé par un mot du catalogue. reserve : les mots du catalogue dans
// l'ordre où les prendre. Renvoie { mots: [{ id, texte, auteur }], tires: [entrées du catalogue] }.
export function composerMots(saisies, joueurIds, reserve) {
  const mots = [];
  const tires = [];
  const cles = new Set();
  let suivant = 0;
  const ajouter = (texte, auteur) => {
    const cle = cleReponse(texte);
    if (!cle || cles.has(cle)) return false;
    cles.add(cle);
    mots.push({ id: `m${mots.length + 1}`, texte, auteur });
    return true;
  };
  const auHasard = (auteur) => {
    while (suivant < reserve.length) {
      const entree = reserve[suivant++];
      if (ajouter(entree.mot, auteur)) {
        tires.push(entree);
        return;
      }
    }
  };
  for (const joueurId of joueurIds) {
    const siens = saisies[joueurId] ?? [];
    for (let i = 0; i < MOTS_PAR_JOUEUR; i++) {
      if (!siens[i] || !ajouter(siens[i], joueurId)) auHasard(joueurId);
    }
  }
  return { mots, tires };
}

// ---------- Déroulé d'une partie ----------

function joueurDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId);
}

function estConnecte(salle, joueurId) {
  return Boolean(joueurDe(salle, joueurId)?.connecte);
}

function participants(salle) {
  return salle.etatMode.equipes.flat();
}

function equipeDe(salle, joueurId) {
  return salle.etatMode.equipes.findIndex((equipe) => equipe.includes(joueurId));
}

function motParId(salle, idMot) {
  return salle.etatMode.mots.find((mot) => mot.id === idMot);
}

function motCourant(salle) {
  return motParId(salle, salle.etatMode.chapeau[0]);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const { mots, temps } = reglagesDe(salle);
  salle.etatMode = {
    duree: temps * 1000,
    equipes: formerEquipes(listerAttendus(salle)),
    scores: [0, 0],
    prochains: [0, 0],
    // La première équipe à jouer est la 0 : le premier tour prend l'autre que celle-ci.
    equipeActive: 1,
    actif: null,
    numeroTour: 0,
    manche: 1,
    mots: [],
    saisies: {},
    chapeau: [],
    trouvesDuTour: [],
  };
  if (mots === 'hasard') {
    fixerMots(salle);
    demarrerAnnonce(salle, 1);
  } else {
    Object.assign(salle.etatMode, { phase: 'saisie', debutPhaseA: Date.now() });
  }
}

function fixerMots(salle) {
  const { etatMode } = salle;
  const reserve = tirerQuestions(banqueMots, salle.questionsVues, banqueMots.length);
  const { mots, tires } = composerMots(etatMode.saisies, participants(salle), reserve);
  noterQuestionsVues(salle, tires);
  etatMode.mots = mots;
  etatMode.saisies = {};
}

function demarrerAnnonce(salle, manche) {
  Object.assign(salle.etatMode, {
    phase: 'annonce',
    manche,
    debutPhaseA: Date.now(),
    chapeau: melanger(salle.etatMode.mots.map((mot) => mot.id)),
    trouvesDuTour: [],
  });
}

// Le joueur actif suivant : l'autre équipe d'abord, puis la même si l'autre est absente.
// Dans une équipe, chacun son tour ; un joueur absent est sauté.
function choisirActif(salle) {
  const { etatMode } = salle;
  for (const equipe of [1 - etatMode.equipeActive, etatMode.equipeActive]) {
    const joueurs = etatMode.equipes[equipe];
    for (let essai = 0; essai < joueurs.length; essai++) {
      const candidat = joueurs[etatMode.prochains[equipe] % joueurs.length];
      etatMode.prochains[equipe] += 1;
      if (estConnecte(salle, candidat)) {
        Object.assign(etatMode, { equipeActive: equipe, actif: candidat });
        return true;
      }
    }
  }
  return false;
}

function demarrerPreparation(salle) {
  if (!choisirActif(salle)) {
    passerAuPodium(salle);
    return;
  }
  const { etatMode } = salle;
  Object.assign(etatMode, {
    phase: 'preparation', debutPhaseA: Date.now(), trouvesDuTour: [], numeroTour: etatMode.numeroTour + 1,
  });
}

// Fin d'un tour : bilan, ou fin de manche si le chapeau est vide. Les points du tour vont
// à chaque joueur de l'équipe active.
function terminerTour(salle) {
  const { etatMode } = salle;
  etatMode.phase = etatMode.chapeau.length === 0 ? 'finManche' : 'bilan';
  etatMode.debutPhaseA = Date.now();
  for (const joueurId of etatMode.equipes[etatMode.equipeActive]) {
    const joueur = joueurDe(salle, joueurId);
    if (joueur) joueur.score += POINTS_PAR_MOT * etatMode.trouvesDuTour.length;
  }
}

function apresFinManche(salle) {
  if (salle.etatMode.manche >= NOMBRE_MANCHES) passerAuPodium(salle);
  else demarrerAnnonce(salle, salle.etatMode.manche + 1);
}

function enregistrerSaisie(salle, joueurId, contenu) {
  if (!participants(salle).includes(joueurId)) return false;
  if (contenu.piocher === true) {
    salle.etatMode.saisies[joueurId] = melanger(banqueMots).slice(0, MOTS_PAR_JOUEUR).map((entree) => entree.mot);
    return true;
  }
  const mots = validerMots(contenu);
  if (!mots) return false;
  salle.etatMode.saisies[joueurId] = mots;
  return true;
}

// En `saisie` : { mots: [...] } ou { piocher: true }. En `preparation` : { partir: true } du
// joueur actif. En `jeu` : { trouve: true } ou { passer: true } du joueur actif.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (typeof contenu !== 'object' || contenu === null) return false;
  const { etatMode } = salle;
  if (phase === 'saisie') return enregistrerSaisie(salle, joueurId, contenu);
  if (joueurId !== etatMode.actif) return false;
  if (phase === 'preparation' && contenu.partir === true) {
    Object.assign(etatMode, { phase: 'jeu', debutPhaseA: Date.now() });
    return true;
  }
  if (phase !== 'jeu') return false;
  if (contenu.trouve === true) {
    etatMode.trouvesDuTour.push(etatMode.chapeau.shift());
    etatMode.scores[etatMode.equipeActive] += 1;
    if (etatMode.chapeau.length === 0) terminerTour(salle);
    return true;
  }
  if (contenu.passer === true) {
    etatMode.chapeau.push(etatMode.chapeau.shift());
    return true;
  }
  return false;
}

// Après chaque réponse et chaque déconnexion : saisie finie quand tous les joueurs connectés
// ont leurs mots ; joueur actif parti pendant sa préparation.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'saisie') {
    const connectes = participants(salle).filter((joueurId) => estConnecte(salle, joueurId));
    if (connectes.every((joueurId) => etatMode.saisies[joueurId])) {
      fixerMots(salle);
      demarrerAnnonce(salle, 1);
    }
  }
  if (phase === 'preparation' && !estConnecte(salle, etatMode.actif)) demarrerPreparation(salle);
}

function pointsGagnes(salle, joueurId) {
  const { etatMode } = salle;
  const enBilan = etatMode.phase === 'bilan' || etatMode.phase === 'finManche';
  return enBilan && equipeDe(salle, joueurId) === etatMode.equipeActive ? POINTS_PAR_MOT * etatMode.trouvesDuTour.length : 0;
}

// « Suivant » de l'hôte : fin de l'annonce, du bilan ou de la fin de manche.
export function suivant(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'annonce' || phase === 'bilan') demarrerPreparation(salle);
  else if (phase === 'finManche') apresFinManche(salle);
  else return false;
  return true;
}

export function echeance(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'jeu') return etatMode.debutPhaseA + etatMode.duree;
  if (phase in DUREES_MS) return etatMode.debutPhaseA + DUREES_MS[phase];
  return null;
}

// Appelée quand l'échéance est atteinte. Fin du chrono en jeu : le mot en cours reste en haut.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') {
    fixerMots(salle);
    demarrerAnnonce(salle, 1);
  } else if (phase === 'jeu') terminerTour(salle);
  else if (phase === 'annonce' || phase === 'bilan') demarrerPreparation(salle);
  else if (phase === 'finManche') apresFinManche(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// Le mot en cours : seulement au joueur actif et à l'équipe adverse, jamais à la TV ni aux
// coéquipiers. Les mots trouvés : au bilan du tour.

function vueEquipes(salle) {
  const { equipes, scores } = salle.etatMode;
  return equipes.map((joueurs, equipe) => ({ nom: NOMS_EQUIPES[equipe], joueurs, score: scores[equipe] }));
}

function textesTrouves(salle) {
  return salle.etatMode.trouvesDuTour.map((idMot) => motParId(salle, idMot).texte);
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (salle.etat === 'podium') return { classement: classement(salle) };
  if (!phase) return {};
  const base = {
    phase,
    numero: etatMode.numeroTour,
    manche: etatMode.manche,
    mancheMax: NOMBRE_MANCHES,
    consigne: CONSIGNES[etatMode.manche - 1],
    equipes: vueEquipes(salle),
    tempsRestantMs: echeance(salle) === null ? null : tempsRestantMs(salle, echeance),
  };
  if (phase === 'saisie') return { ...base, ontFini: Object.keys(etatMode.saisies) };
  if (phase === 'annonce') return base;
  const tour = {
    ...base, actif: etatMode.actif, equipeActive: etatMode.equipeActive, motsRestants: etatMode.chapeau.length,
  };
  if (phase === 'preparation') return tour;
  if (phase === 'jeu') return { ...tour, nbTrouvesDuTour: etatMode.trouvesDuTour.length };
  return { ...tour, trouvesDuTour: textesTrouves(salle), classement: classement(salle) };
}

export function vueJoueur(salle, joueur) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  const equipe = equipeDe(salle, joueur.id);
  if (equipe === -1) return { ecran: 'attente_question' };
  const pseudoActif = joueurDe(salle, etatMode.actif)?.pseudo ?? '?';
  const base = {
    manche: etatMode.manche,
    mancheMax: NOMBRE_MANCHES,
    consigne: CONSIGNES[etatMode.manche - 1],
    monEquipe: NOMS_EQUIPES[equipe],
    equipes: vueEquipes(salle).map(({ nom: nomEquipe, score }) => ({ nom: nomEquipe, score })),
    tempsRestantMs: echeance(salle) === null ? null : tempsRestantMs(salle, echeance),
  };
  if (phase === 'saisie') {
    return {
      ...base,
      ecran: 'saisie',
      mesMots: etatMode.saisies[joueur.id] ?? [],
      nbFinis: Object.keys(etatMode.saisies).length,
      nbJoueurs: participants(salle).length,
    };
  }
  if (phase === 'annonce') return { ...base, ecran: 'annonce' };
  const estActif = joueur.id === etatMode.actif;
  const memeEquipe = equipe === etatMode.equipeActive;
  const tour = {
    ...base, actif: pseudoActif, equipeActive: NOMS_EQUIPES[etatMode.equipeActive], memeEquipe,
  };
  if (phase === 'preparation') return { ...tour, ecran: estActif ? 'preparation_actif' : 'preparation' };
  if (phase === 'jeu') {
    const jeu = { ...tour, nbTrouvesDuTour: etatMode.trouvesDuTour.length, motsRestants: etatMode.chapeau.length };
    if (memeEquipe && !estActif) return { ...jeu, ecran: 'deviner' };
    return { ...jeu, ecran: estActif ? 'faire_deviner' : 'surveiller', mot: motCourant(salle).texte };
  }
  return {
    ...tour,
    ecran: 'bilan',
    finManche: phase === 'finManche',
    derniereManche: etatMode.manche >= NOMBRE_MANCHES,
    trouvesDuTour: textesTrouves(salle),
    points: pointsGagnes(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}
