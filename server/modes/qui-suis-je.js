// Mode Qui suis-je ? (docs/modes/qui-suis-je.md) : chacun son tour, un joueur dos à la TV
// devine le plus de personnages possible par des questions oui/non, les autres répondent.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, melanger, noterQuestionsVues, passerAuPodium,
  phaseEnCours, rangDe, tempsRestantMs, texteLongueur, tirerQuestions,
} from './commun.js';

export const id = 'qui-suis-je';
export const nom = 'Qui suis-je ?';
export const regleCourte = 'Devine des personnages par des questions oui/non. Les autres voient la réponse, pas toi.';
export const joueursMin = 2;
// Reprise après une pause de l'hôte : toutes les heures de etatMode avancent d'autant.
export { decalerHeures } from './commun.js';

export const POINTS_PAR_PERSONNAGE = 300;
export const PENALITE_PASSER_MS = 15000;
export const DUREE_BILAN_MS = 10000;

export const banquePersonnages = JSON.parse(
  readFileSync(new URL('../../data/qui-suis-je.json', import.meta.url), 'utf8'),
);

// ---------- Réglages de l'hôte : format, tours, chrono, affichage, niveaux ----------

// « max » : le plus de personnages possible pendant le chrono. « chrono » : en trouver
// 1, 2 ou 3 le plus vite possible, le chrono servant de temps maximal.
const FORMATS = { max: 'Le plus possible', chrono: 'Contre la montre' };
const CHOIX = { longueurs: [1, 2, 3], unite: ['tour', 'tours'] };
const TEMPS = { max: [90, 120, 180], chrono: [120, 180, 300] };
const OBJECTIFS = [1, 2, 3];
// Où voir le personnage : sur la TV (le joueur actif lui tourne le dos), ou sur les
// téléphones des autres (le joueur actif peut regarder la TV).
const AFFICHAGES = { tv: 'Sur la TV', telephones: 'Sur les téléphones' };
const NIVEAUX = { 1: 'Facile', 2: 'Difficile' };

export function reglagesParDefaut() {
  return {
    format: 'max', longueur: 1, temps: 120, objectif: 1, affichage: 'tv', niveaux: [1, 2],
  };
}

// Renvoie des réglages propres (niveaux dans l'ordre), ou null. Un temps de l'autre format
// (l'hôte vient de changer de format) devient le temps par défaut du nouveau.
export function validerReglages(donnees) {
  const {
    format, longueur, temps, objectif, affichage, niveaux,
  } = donnees ?? {};
  if (!Object.hasOwn(FORMATS, format) || !Object.hasOwn(AFFICHAGES, affichage)) return null;
  if (!CHOIX.longueurs.includes(longueur) || !OBJECTIFS.includes(objectif)) return null;
  const connus = Object.keys(NIVEAUX).map(Number);
  if (!Array.isArray(niveaux) || niveaux.length === 0 || !niveaux.every((niveau) => connus.includes(niveau))) return null;
  let tempsRetenu = temps;
  if (!TEMPS[format].includes(temps)) {
    if (!Object.values(TEMPS).flat().includes(temps)) return null;
    tempsRetenu = TEMPS[format][1];
  }
  return {
    format, longueur, temps: tempsRetenu, objectif, affichage, niveaux: connus.filter((niveau) => niveaux.includes(niveau)),
  };
}

function reglagesDe(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

// 90 → « 1 min 30 », 120 → « 2 min ».
export function texteDuree(secondes) {
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return reste ? `${minutes} min ${reste}` : `${minutes} min`;
}

function texteNiveaux(niveaux) {
  if (niveaux.length === Object.keys(NIVEAUX).length) return 'Tous niveaux';
  return niveaux.map((niveau) => NIVEAUX[niveau]).join(' + ');
}

function texteObjectif(objectif) {
  return objectif > 1 ? `${objectif} personnages` : '1 personnage';
}

export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  const { format, objectif, affichage } = reglages;
  const enChrono = format === 'chrono';
  return {
    titre: 'Options',
    valeurs: reglages,
    resume: [
      enChrono ? `Contre la montre, ${texteObjectif(objectif)}` : null,
      texteLongueur(CHOIX, reglages.longueur),
      enChrono ? `${texteDuree(reglages.temps)} max` : texteDuree(reglages.temps),
      affichage === 'telephones' ? 'personnage sur les téléphones' : null,
      texteNiveaux(reglages.niveaux),
    ].filter(Boolean).join(' · '),
    options: {
      formats: Object.entries(FORMATS).map(([idFormat, libelle]) => ({ id: idFormat, libelle })),
      objectifs: OBJECTIFS.map((nombre) => ({ id: nombre, libelle: texteObjectif(nombre) })),
      affichages: Object.entries(AFFICHAGES).map(([idAffichage, libelle]) => ({ id: idAffichage, libelle })),
      longueurs: CHOIX.longueurs.map((longueur) => ({ id: longueur, libelle: texteLongueur(CHOIX, longueur) })),
      temps: TEMPS[format].map((temps) => ({ id: temps, libelle: texteDuree(temps) })),
      titreTemps: enChrono ? 'Temps maximal de chaque tour' : 'Chrono de chaque tour',
      niveaux: Object.entries(NIVEAUX).map(([niveau, libelle]) => ({ id: Number(niveau), libelle })),
    },
  };
}

// ---------- Règles pures ----------

// Chaque joueur est actif `longueur` fois, dans un ordre tiré au sort à chaque tour,
// jamais deux fois d'affilée (sauf s'il est seul).
export function ordreDesTours(joueurIds, longueur) {
  const tours = [];
  for (let tour = 0; tour < longueur; tour++) {
    const ordre = melanger(joueurIds);
    if (ordre.length > 1 && ordre[0] === tours.at(-1)) [ordre[0], ordre[1]] = [ordre[1], ordre[0]];
    tours.push(...ordre);
  }
  return tours;
}

// Contre la montre : 1 point par dixième de seconde restant sur le temps maximal, 0 si
// l'objectif n'est pas atteint. Celui qui met le moins de temps marque le plus.
export function pointsDuTour(etatMode) {
  if (etatMode.format !== 'chrono') return POINTS_PAR_PERSONNAGE * etatMode.trouves.length;
  if (etatMode.tempsMisMs === null) return 0;
  return Math.max(0, Math.round((etatMode.duree - etatMode.tempsMisMs) / 100));
}

// ---------- Déroulé d'une partie ----------

function joueurDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId);
}

function estConnecte(salle, joueurId) {
  return Boolean(joueurDe(salle, joueurId)?.connecte);
}

function actifDe(salle) {
  return salle.etatMode.tours[salle.etatMode.indexTour];
}

function personnageCourant(salle) {
  return salle.etatMode.personnages[salle.etatMode.indexPersonnage] ?? null;
}

// L'hôte valide les « Trouvé ! ». S'il est le joueur actif (ou absent) : le premier autre joueur
// connecté, dans l'ordre d'arrivée. Recalculé à chaque fois : une déconnexion le remplace d'office.
export function valideurDe(salle) {
  const actif = actifDe(salle);
  const hote = joueurDe(salle, salle.hoteId);
  if (hote?.connecte && hote.id !== actif) return hote.id;
  const autres = salle.joueurs
    .filter((joueur) => joueur.connecte && joueur.id !== actif)
    .sort((a, b) => a.arriveeA - b.arriveeA);
  return autres[0]?.id ?? null;
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const {
    format, longueur, temps, objectif, affichage, niveaux,
  } = reglagesDe(salle);
  const banque = banquePersonnages.filter((personnage) => niveaux.includes(personnage.niveau));
  // Tous les personnages des niveaux choisis, les jamais vus d'abord : seuls ceux montrés
  // sont notés comme vus.
  salle.etatMode = {
    tours: ordreDesTours(listerAttendus(salle), longueur),
    personnages: tirerQuestions(banque, salle.questionsVues, banque.length),
    indexPersonnage: 0,
    duree: temps * 1000,
    format,
    objectif,
    affichage,
  };
  demarrerTour(salle, 0);
}

// Préparation du tour `index`. Un joueur actif absent voit son tour sauté.
function demarrerTour(salle, index) {
  const { etatMode } = salle;
  if (index >= etatMode.tours.length) {
    passerAuPodium(salle);
    return;
  }
  Object.assign(etatMode, {
    phase: 'preparation',
    indexTour: index,
    debutPhaseA: Date.now(),
    trouves: [],
    passes: [],
    enValidation: false,
    tempsEcoule: false,
    trouveA: null,
    tempsMisMs: null,
    nonTrouve: null,
  });
  if (!estConnecte(salle, actifDe(salle))) demarrerTour(salle, index + 1);
}

function montrerPersonnage(salle) {
  const personnage = personnageCourant(salle);
  if (personnage) noterQuestionsVues(salle, [personnage]);
}

function commencerJeu(salle) {
  salle.etatMode.phase = 'jeu';
  salle.etatMode.debutPhaseA = Date.now();
  if (!personnageCourant(salle)) terminerTour(salle);
  else montrerPersonnage(salle);
}

// Le personnage en cours est trouvé ou passé : au suivant, ou fin du tour s'il n'y en a plus
// ou si le chrono est fini.
function personnageSuivant(salle) {
  salle.etatMode.indexPersonnage += 1;
  const chronoFini = salle.etatMode.tempsEcoule || echeance(salle) <= Date.now();
  if (chronoFini || !personnageCourant(salle)) terminerTour(salle);
  else montrerPersonnage(salle);
}

// personnageVu : le tour s'arrête sur un personnage montré mais pas trouvé. Il n'est pas
// reproposé au joueur suivant, qui l'a vu pendant ce tour.
function terminerTour(salle, personnageVu = false) {
  const { etatMode } = salle;
  if (personnageVu && personnageCourant(salle)) {
    etatMode.nonTrouve = personnageCourant(salle).id;
    etatMode.indexPersonnage += 1;
  }
  Object.assign(etatMode, { phase: 'bilan', debutPhaseA: Date.now(), enValidation: false });
  const actif = joueurDe(salle, actifDe(salle));
  if (actif) actif.score += pointsDuTour(etatMode);
}

// En `preparation` : { partir: true } du joueur actif. En `jeu` : { trouve: true } ou { passer: true }
// du joueur actif, { valider: true | false } du valideur. Renvoie true si c'est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (typeof contenu !== 'object' || contenu === null) return false;
  const { etatMode } = salle;
  const estActif = joueurId === actifDe(salle);
  if (phase === 'preparation') {
    if (!estActif || contenu.partir !== true) return false;
    commencerJeu(salle);
    return true;
  }
  if (phase !== 'jeu') return false;
  if (typeof contenu.valider === 'boolean') return valider(salle, joueurId, contenu.valider);
  if (!estActif || etatMode.enValidation || etatMode.tempsEcoule) return false;
  if (contenu.trouve === true) {
    etatMode.enValidation = true;
    etatMode.trouveA = Date.now();
    return true;
  }
  if (contenu.passer === true) {
    etatMode.passes.push(personnageCourant(salle).id);
    personnageSuivant(salle);
    return true;
  }
  return false;
}

function valider(salle, joueurId, accepte) {
  const { etatMode } = salle;
  if (!etatMode.enValidation || joueurId !== valideurDe(salle)) return false;
  etatMode.enValidation = false;
  if (accepte) {
    etatMode.trouves.push(personnageCourant(salle).id);
    if (objectifAtteint(etatMode)) finirContreLaMontre(salle);
    else personnageSuivant(salle);
  } else if (etatMode.tempsEcoule) terminerTour(salle, true);
  return true;
}

function objectifAtteint(etatMode) {
  return etatMode.format === 'chrono' && etatMode.trouves.length >= etatMode.objectif;
}

// Le temps compte jusqu'au « Trouvé ! » du dernier personnage, plus 15 s par « Passer ».
function finirContreLaMontre(salle) {
  const { etatMode } = salle;
  etatMode.tempsMisMs = etatMode.trouveA - etatMode.debutPhaseA + PENALITE_PASSER_MS * etatMode.passes.length;
  etatMode.indexPersonnage += 1;
  terminerTour(salle);
}

// Après chaque réponse et chaque déconnexion : joueur actif parti pendant sa préparation,
// ou validation en attente après le chrono sans plus personne pour valider.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'preparation' && !estConnecte(salle, actifDe(salle))) demarrerTour(salle, etatMode.indexTour + 1);
  if (phase === 'jeu' && etatMode.tempsEcoule && !valideurDe(salle)) terminerTour(salle, true);
}

function pointsGagnes(salle, joueurId) {
  const { etatMode } = salle;
  return etatMode.phase === 'bilan' && joueurId === actifDe(salle) ? pointsDuTour(etatMode) : 0;
}

// « Suivant » de l'hôte pendant le bilan. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'bilan') return false;
  demarrerTour(salle, salle.etatMode.indexTour + 1);
  return true;
}

// Chaque « Passer » avance la fin du tour de 15 s. Pas d'échéance pendant la préparation,
// ni pendant une validation qui attend après la fin du chrono.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  if (phase === 'jeu' && !etatMode.tempsEcoule) {
    return etatMode.debutPhaseA + etatMode.duree - PENALITE_PASSER_MS * etatMode.passes.length;
  }
  if (phase === 'bilan') return etatMode.debutPhaseA + DUREE_BILAN_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'jeu') {
    // Une validation en cours se termine : la décision compte encore.
    if (salle.etatMode.enValidation && valideurDe(salle)) salle.etatMode.tempsEcoule = true;
    else terminerTour(salle, true);
  } else if (phase === 'bilan') demarrerTour(salle, salle.etatMode.indexTour + 1);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------
// Le joueur actif ne reçoit jamais le personnage avant le bilan. La TV ne reçoit que
// le personnage en cours, jamais la liste tirée. Les autres téléphones : nom et catégorie.

function personnageParId(salle, idPersonnage) {
  return salle.etatMode.personnages.find((personnage) => personnage.id === idPersonnage);
}

// L'image à précharger : le personnage suivant (pendant la préparation, celui qui va arriver).
function imageAPrecharger(salle, decalage) {
  const personnage = salle.etatMode.personnages[salle.etatMode.indexPersonnage + decalage];
  return personnage ? { image: personnage.image } : null;
}

function vueTour(salle) {
  const {
    phase, indexTour, tours, format, objectif, affichage,
  } = salle.etatMode;
  return {
    phase, numero: indexTour + 1, total: tours.length, actif: actifDe(salle), format, objectif, affichage,
  };
}

// Le chrono qui monte (contre la montre) : temps déjà compté, pénalités comprises.
function tempsEcouleMs(salle) {
  return salle.etatMode.duree - tempsRestantMs(salle, echeance);
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  // Personnage sur les téléphones : la TV ne le montre jamais, le joueur actif la regarde.
  const surTv = etatMode.affichage === 'tv';
  if (phase === 'preparation') return { ...vueTour(salle), personnageSuivant: surTv ? imageAPrecharger(salle, 0) : null };
  if (phase === 'jeu') {
    const {
      nom: nomPersonnage, categorie, image, auteur, licence,
    } = personnageCourant(salle);
    return {
      ...vueTour(salle),
      personnage: surTv ? {
        nom: nomPersonnage, categorie, image, auteur, licence,
      } : null,
      nbTrouves: etatMode.trouves.length,
      nbPasses: etatMode.passes.length,
      enValidation: etatMode.enValidation,
      tempsEcoule: etatMode.tempsEcoule,
      valideur: valideurDe(salle),
      tempsRestantMs: tempsRestantMs(salle, echeance),
      tempsEcouleMs: tempsEcouleMs(salle),
      personnageSuivant: surTv ? imageAPrecharger(salle, 1) : null,
    };
  }
  if (phase === 'bilan') {
    return {
      ...vueTour(salle),
      trouves: etatMode.trouves.map((idPersonnage) => {
        const { nom: nomPersonnage, image } = personnageParId(salle, idPersonnage);
        return { nom: nomPersonnage, image };
      }),
      passes: etatMode.passes.map((idPersonnage) => ({ nom: personnageParId(salle, idPersonnage).nom })),
      nonTrouve: etatMode.nonTrouve ? personnageParId(salle, etatMode.nonTrouve).nom : null,
      tempsMisMs: etatMode.tempsMisMs,
      points: pointsDuTour(etatMode),
      classement: classement(salle),
    };
  }
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

export function vueJoueur(salle, joueur) {
  const phase = phaseEnCours(salle);
  const { etatMode } = salle;
  const { numero, total, actif } = vueTour(salle);
  const estActif = joueur.id === actif;
  const { format, objectif, affichage } = etatMode;
  const base = {
    numero, total, actif: joueurDe(salle, actif)?.pseudo ?? '?', format, objectif, affichage,
  };
  if (phase === 'preparation') return { ...base, ecran: estActif ? 'preparation_actif' : 'preparation' };
  if (phase === 'jeu') {
    const jeu = {
      ...base,
      nbTrouves: etatMode.trouves.length,
      enValidation: etatMode.enValidation,
      tempsEcoule: etatMode.tempsEcoule,
      valideur: joueurDe(salle, valideurDe(salle))?.pseudo ?? null,
      tempsRestantMs: tempsRestantMs(salle, echeance),
      tempsEcouleMs: tempsEcouleMs(salle),
    };
    if (estActif) return { ...jeu, ecran: 'actif' };
    const {
      nom: nomPersonnage, categorie, image, auteur, licence,
    } = personnageCourant(salle);
    // Personnage sur les téléphones : la photo aussi, puisque la TV ne la montre pas.
    const personnage = affichage === 'telephones' ? {
      nom: nomPersonnage, categorie, image, auteur, licence,
    } : { nom: nomPersonnage, categorie };
    return {
      ...jeu, ecran: 'repondre', personnage, estValideur: joueur.id === valideurDe(salle),
    };
  }
  return {
    ...base,
    ecran: 'bilan',
    estActif,
    trouves: etatMode.trouves.map((idPersonnage) => personnageParId(salle, idPersonnage).nom),
    passes: etatMode.passes.map((idPersonnage) => personnageParId(salle, idPersonnage).nom),
    nonTrouve: etatMode.nonTrouve ? personnageParId(salle, etatMode.nonTrouve).nom : null,
    tempsMisMs: etatMode.tempsMisMs,
    points: pointsDuTour(etatMode),
    rang: rangDe(salle, joueur),
  };
}
