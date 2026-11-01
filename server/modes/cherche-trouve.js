// Mode Cherche & trouve (docs/modes/cherche-trouve.md) : chacun explore une grande scène sur son
// téléphone pour toucher le détail demandé. Le serveur seul connaît la position des détails.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, creerOptions, listerAttendus, melanger, noterQuestionsVues, passerAuPodium,
  phaseEnCours, rangDe, tempsRestantMs, tirerQuestions,
} from './commun.js';

export const id = 'cherche-trouve';
export const nom = 'Cherche & trouve';
export const regleCourte = 'Explore la scène sur ton téléphone et touche le détail demandé avant les autres.';
export const joueursMin = 1;
// Reprise après une pause de l'hôte : toutes les heures de etatMode avancent d'autant.
export { decalerHeures } from './commun.js';

export const DUREE_ANNONCE_MS = 8000;
export const DUREE_REVELATION_MS = 10000;
// Un toucher à moins de RAYON pixels (de l'image) du centre du détail le trouve.
export const RAYON = 60;
export const DELAI_ENTRE_TOUCHERS_MS = 1000;

export const banqueScenes = JSON.parse(
  readFileSync(new URL('../../data/cherche-trouve.json', import.meta.url), 'utf8'),
);

const options = creerOptions(id, { longueurs: [4, 6, 8], unite: ['détail', 'détails'], temps: [45, 60, 90] });
export const { reglagesParDefaut, validerReglages, vueReglages } = options;

// ---------- Règles pures ----------

// Points d'une manche : 1 000 moins 5 par seconde entière (200 au moins), moins 100 par tap
// raté, jamais négatif. Pas trouvé : 0.
export function pointsDetail(ms, rates) {
  if (ms === null) return 0;
  const parLeTemps = Math.max(200, 1000 - 5 * Math.floor(ms / 1000));
  return Math.max(0, parLeTemps - 100 * rates);
}

export function estSurLeDetail({ x, y }, detail) {
  return Math.hypot(x - detail.x, y - detail.y) <= RAYON;
}

// ---------- Déroulé d'une partie ----------

function detailCourant(salle) {
  return salle.etatMode.details[salle.etatMode.indexDetail];
}

function joueurDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const { longueur, temps } = options.lire(salle);
  // Les scènes les moins vues d'abord ; dans la scène, des détails au hasard.
  const [scene] = tirerQuestions(banqueScenes, salle.questionsVues, 1);
  noterQuestionsVues(salle, [scene]);
  const {
    details, ...sansDetails
  } = scene;
  salle.etatMode = {
    phase: 'annonce',
    debutPhaseA: Date.now(),
    duree: temps * 1000,
    scene: sansDetails,
    details: melanger(details).slice(0, longueur),
    indexDetail: -1,
    attendus: [],
    reponses: {},
  };
}

function demarrerRecherche(salle, index) {
  Object.assign(salle.etatMode, {
    phase: 'recherche',
    indexDetail: index,
    debutPhaseA: Date.now(),
    // Les temps mis se comptent depuis cette heure, encore utile pendant la révélation.
    debutRechercheA: Date.now(),
    attendus: listerAttendus(salle),
    reponses: {},
  });
}

function reponseDe(salle, joueurId) {
  salle.etatMode.reponses[joueurId] ??= { trouveA: null, rates: 0, dernierToucherA: null, dernier: null };
  return salle.etatMode.reponses[joueurId];
}

// Temps mis pour trouver, en ms depuis le début de la recherche, ou null.
function tempsMis(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  return reponse?.trouveA ? reponse.trouveA - salle.etatMode.debutRechercheA : null;
}

function pointsDe(salle, joueurId) {
  return pointsDetail(tempsMis(salle, joueurId), salle.etatMode.reponses[joueurId]?.rates ?? 0);
}

function reveler(salle) {
  const { etatMode } = salle;
  for (const joueurId of etatMode.attendus) {
    const joueur = joueurDe(salle, joueurId);
    if (joueur) joueur.score += pointsDe(salle, joueurId);
  }
  Object.assign(etatMode, { phase: 'revelation', debutPhaseA: Date.now() });
}

function detailSuivantOuPodium(salle) {
  const suivant = salle.etatMode.indexDetail + 1;
  if (suivant < salle.etatMode.details.length) demarrerRecherche(salle, suivant);
  else passerAuPodium(salle);
}

function positionValide(donnees, scene) {
  const { x, y } = donnees ?? {};
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= scene.largeur && y <= scene.hauteur;
}

// En `recherche` : { x, y } en pixels de l'image, d'un joueur de la manche qui n'a pas encore
// trouvé, une seconde au moins après son toucher précédent.
export function enregistrerReponse(salle, joueurId, donnees) {
  const { etatMode } = salle;
  if (phaseEnCours(salle) !== 'recherche' || !etatMode.attendus.includes(joueurId)) return false;
  if (!positionValide(donnees, etatMode.scene)) return false;
  const reponse = reponseDe(salle, joueurId);
  const maintenant = Date.now();
  if (reponse.trouveA) return false;
  if (reponse.dernierToucherA !== null && maintenant - reponse.dernierToucherA < DELAI_ENTRE_TOUCHERS_MS) return false;
  reponse.dernierToucherA = maintenant;
  if (estSurLeDetail(donnees, detailCourant(salle))) {
    reponse.trouveA = maintenant;
    reponse.dernier = 'trouve';
  } else {
    reponse.rates += 1;
    reponse.dernier = 'rate';
  }
  return true;
}

function ontTrouve(salle) {
  return salle.etatMode.attendus.filter((joueurId) => salle.etatMode.reponses[joueurId]?.trouveA);
}

// Après chaque toucher et chaque déconnexion : tous les joueurs connectés ont trouvé.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) !== 'recherche') return;
  const trouve = ontTrouve(salle);
  const restants = salle.etatMode.attendus.filter((joueurId) => joueurDe(salle, joueurId)?.connecte && !trouve.includes(joueurId));
  if (restants.length === 0) reveler(salle);
}

function pointsGagnes(salle, joueurId) {
  return salle.etatMode.phase === 'revelation' && salle.etatMode.attendus.includes(joueurId) ? pointsDe(salle, joueurId) : 0;
}

// « Suivant » de l'hôte : fin de l'annonce ou de la révélation.
export function suivant(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'annonce') demarrerRecherche(salle, 0);
  else if (phase === 'revelation') detailSuivantOuPodium(salle);
  else return false;
  return true;
}

export function echeance(salle) {
  const phase = phaseEnCours(salle);
  const { debutPhaseA, duree } = salle.etatMode ?? {};
  if (phase === 'annonce') return debutPhaseA + DUREE_ANNONCE_MS;
  if (phase === 'recherche') return debutPhaseA + duree;
  if (phase === 'revelation') return debutPhaseA + DUREE_REVELATION_MS;
  return null;
}

export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'annonce') demarrerRecherche(salle, 0);
  else if (phase === 'recherche') reveler(salle);
  else if (phase === 'revelation') detailSuivantOuPodium(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// La position du détail ne part qu'à la révélation, vers la TV comme vers les téléphones.

function vueDetail(salle) {
  const { base, accessoire, texte } = detailCourant(salle);
  return { base, accessoire, texte };
}

function secondesMises(salle, joueurId) {
  const ms = tempsMis(salle, joueurId);
  return ms === null ? null : Math.floor(ms / 1000);
}

function vueManche(salle) {
  const { etatMode } = salle;
  return {
    phase: etatMode.phase,
    numero: etatMode.indexDetail + 1,
    total: etatMode.details.length,
    scene: etatMode.scene,
    detail: vueDetail(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (salle.etat === 'podium') return { classement: classement(salle) };
  if (phase === 'annonce') {
    return {
      phase, numero: 0, total: etatMode.details.length, scene: etatMode.scene, tempsRestantMs: tempsRestantMs(salle, echeance),
    };
  }
  if (phase === 'recherche') return { ...vueManche(salle), ontTrouve: ontTrouve(salle) };
  if (phase === 'revelation') {
    const { x, y } = detailCourant(salle);
    const resultats = etatMode.attendus
      .map((joueurId) => ({
        id: joueurId,
        secondes: secondesMises(salle, joueurId),
        rates: etatMode.reponses[joueurId]?.rates ?? 0,
        points: pointsDe(salle, joueurId),
      }))
      .sort((a, b) => b.points - a.points);
    return {
      ...vueManche(salle), position: { x, y }, resultats, ontTrouve: ontTrouve(salle), classement: classement(salle),
    };
  }
  return {};
}

export function vueJoueur(salle, joueur) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'annonce') return { ecran: 'annonce', scene: etatMode.scene, total: etatMode.details.length };
  if (!etatMode.attendus.includes(joueur.id)) return { ecran: 'attente_question' };
  const reponse = etatMode.reponses[joueur.id];
  if (phase === 'recherche') {
    return {
      ...vueManche(salle), ecran: 'recherche', trouve: Boolean(reponse?.trouveA), rates: reponse?.rates ?? 0, dernierToucher: reponse?.dernier ?? null,
    };
  }
  const { x, y } = detailCourant(salle);
  return {
    ...vueManche(salle),
    ecran: 'revelation',
    position: { x, y },
    trouve: Boolean(reponse?.trouveA),
    secondes: secondesMises(salle, joueur.id),
    rates: reponse?.rates ?? 0,
    points: pointsDe(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}
