import { randomBytes } from 'node:crypto';
import {
  POINTS_MEDAILLE, classementGlobal, estDepartage, passerAuPodium, trouverGrandGagnant,
} from './medailles.js';
import { journaliser, journaliserErreur } from './journal.js';
import { rangDe } from './modes/commun.js';
import { modes, modesAVenir } from './modes/index.js';

export const JOUEURS_MAX = 10;
export const DELAI_ABSENCE_MS = 10000;
export const DELAI_FERMETURE_MS = 30 * 60 * 1000;
export const DUREE_PODIUM_MS = 20000;
export const OBJECTIF_MIN = 3;
export const OBJECTIF_MAX = 15;
const PSEUDO_MAX = 12;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Numéros de couleur : la teinte réelle est dans public/commun/theme.css (--joueur-N).
export const COULEURS_JOUEURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const ERREURS = {
  salle_introuvable: 'Salle introuvable',
  pseudo_pris: 'Pseudo déjà pris',
  salle_pleine: `Salle pleine (${JOUEURS_MAX} max)`,
  pseudo_invalide: `Pseudo de 1 à ${PSEUDO_MAX} caractères`,
};

export const salles = {};

// Hors de la salle, pour ne pas partir dans salle:etat.
// Clés : « CODE:etape », « CODE:absence:idJoueur », « CODE:fermeture ».
const minuteurs = new Map();

function programmer(cle, delaiMs, action) {
  annuler(cle);
  const minuteur = setTimeout(() => {
    minuteurs.delete(cle);
    // Une erreur imprévue ne perd que cette action, pas toutes les salles du serveur.
    try {
      action();
    } catch (erreur) {
      journaliserErreur(`minuteur ${cle}`, erreur);
    }
  }, delaiMs);
  minuteurs.set(cle, minuteur);
}

function annuler(cle) {
  clearTimeout(minuteurs.get(cle));
  minuteurs.delete(cle);
}

const cleAbsence = (salle, id) => `${salle.code}:absence:${id}`;

export function erreur(code) {
  return { code, message: ERREURS[code] };
}

function genererCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += LETTRES[Math.floor(Math.random() * LETTRES.length)];
    }
  } while (salles[code]);
  return code;
}

export function creerSalle(tvSocketId) {
  const salle = {
    code: genererCode(),
    mode: 'quiz',
    etat: 'lobby',
    hoteId: null,
    tvSocketId,
    jetonTv: 't_' + randomBytes(16).toString('hex'),
    joueurs: [],
    questionsVues: [],
    derniereActiviteA: Date.now(),
    format: { type: 'petite', objectif: 5 },
    numeroPartie: 0,
    grandGagnantId: null,
    debutPodiumA: null,
    medaillesPartie: {},
    // Réglages de chaque mode (thèmes du quiz…), rangés par id de mode et jamais lus ici.
    reglagesMode: {},
    etatMode: {},
  };
  salles[salle.code] = salle;
  journaliser(salle.code, 'salle créée');
  return salle;
}

export function trouverSalle(code) {
  return salles[String(code ?? '').trim().toUpperCase()] ?? null;
}

function joueursConnectes(salle) {
  return salle.joueurs.filter((joueur) => joueur.connecte);
}

function modeDe(salle) {
  return modes[salle.mode];
}

// Le minimum dépend du mode. Avec MODE_DEV=1, on peut jouer seul à tous les modes.
export function modeDisponible(salle, mode) {
  const minimum = process.env.MODE_DEV === '1' ? 1 : mode.joueursMin;
  return joueursConnectes(salle).length >= minimum;
}

export function assezDeJoueurs(salle) {
  return modeDisponible(salle, modeDe(salle));
}

// Tous les modes pour le sélecteur de l'hôte : les jouables, puis ceux à venir.
function listeModes(salle) {
  const jouables = Object.values(modes).map((mode) => ({
    id: mode.id,
    nom: mode.nom,
    joueursMin: mode.joueursMin,
    disponible: modeDisponible(salle, mode),
    bientot: false,
  }));
  const aVenir = modesAVenir.map(({ id, nom, joueursMin }) => ({
    id, nom, joueursMin, disponible: false, bientot: true,
  }));
  return [...jouables, ...aVenir];
}

// Choix de l'hôte, en salle d'attente ou au tableau. Renvoie true si le mode a changé.
// Un mode à venir n'est pas dans le registre : il est refusé comme un mode inconnu.
export function choisirMode(salle, id) {
  if (salle.etat !== 'lobby' && salle.etat !== 'tableau') return false;
  if (!Object.hasOwn(modes, id) || !modeDisponible(salle, modes[id])) return false;
  salle.mode = id;
  return true;
}

// Format choisi par l'hôte en salle d'attente. Renvoie true s'il est accepté.
export function configurerFormat(salle, format) {
  const { type, objectif } = format ?? {};
  if (salle.etat !== 'lobby' || (type !== 'petite' && type !== 'aventure')) return false;
  if (!Number.isInteger(objectif) || objectif < OBJECTIF_MIN || objectif > OBJECTIF_MAX) return false;
  salle.format = { type, objectif };
  return true;
}

// Réglages du mode choisis par l'hôte en salle d'attente (thèmes et difficulté du quiz).
// Le mode les valide. Renvoie true s'ils sont acceptés.
export function reglerMode(salle, donnees) {
  const mode = modeDe(salle);
  if (salle.etat !== 'lobby' || !mode.validerReglages) return false;
  const reglages = mode.validerReglages(donnees);
  if (!reglages) return false;
  salle.reglagesMode[salle.mode] = reglages;
  return true;
}

// Ce que les écrans montrent des réglages du mode, ou null si le mode n'en a pas.
function vueReglages(salle) {
  return modeDe(salle).vueReglages?.(salle) ?? null;
}

// Lancer ou rejouer : le mode tire son contenu et démarre la première manche.
export function demarrerPartie(salle) {
  salle.etat = 'partie';
  salle.numeroPartie++;
  salle.medaillesPartie = {};
  modeDe(salle).demarrerPartie(salle);
}

// Arrêt par l'hôte. Les points ne sont ajoutés qu'à la révélation : une manche
// en cours n'est donc pas comptée. Les médailles se font sur les scores du moment.
// Renvoie true si la partie a été terminée.
export function terminerPartie(salle) {
  if (salle.etat !== 'partie') return false;
  passerAuPodium(salle);
  return true;
}

// Après le podium : le grand gagnant d'une aventure, sinon le tableau des points globaux.
export function passerApresPodium(salle) {
  if (salle.etat !== 'podium') return false;
  const gagnant = salle.format.type === 'aventure'
    ? trouverGrandGagnant(salle.joueurs, salle.format.objectif)
    : null;
  salle.grandGagnantId = gagnant;
  salle.etat = gagnant ? 'grandGagnant' : 'tableau';
  return true;
}

// Après un grand gagnant : tout repart de zéro, avec le même objectif.
export function nouvelleAventure(salle) {
  salle.numeroPartie = 0;
  salle.grandGagnantId = null;
  for (const joueur of salle.joueurs) {
    joueur.pointsGlobaux = 0;
    joueur.medailles = { or: 0, argent: 0, bronze: 0 };
  }
}

// « Partie suivante », « Rejouer » ou « Nouvelle aventure ».
export function peutRejouer(salle) {
  return (salle.etat === 'tableau' || salle.etat === 'grandGagnant') && assezDeJoueurs(salle);
}

// Retour en salle d'attente. Les points globaux restent, sauf après un grand gagnant.
export function changerFormat(salle) {
  if (salle.etat !== 'tableau' && salle.etat !== 'grandGagnant') return false;
  if (salle.etat === 'grandGagnant') nouvelleAventure(salle);
  salle.etat = 'lobby';
  return true;
}

// Plus de couleur libre (11e joueur pendant qu'un autre est déconnecté) :
// on reprend celle d'un joueur déconnecté.
function couleurPourNouveauJoueur(salle) {
  const prises = salle.joueurs.map((joueur) => joueur.couleur);
  const libre = COULEURS_JOUEURS.find((couleur) => !prises.includes(couleur));
  return libre ?? salle.joueurs.find((joueur) => !joueur.connecte).couleur;
}

// Renvoie { joueur } ou { erreur }.
export function ajouterJoueur(salle, pseudoSaisi, socketId) {
  const pseudo = String(pseudoSaisi ?? '').trim();
  if (pseudo.length < 1 || pseudo.length > PSEUDO_MAX) {
    return { erreur: erreur('pseudo_invalide') };
  }
  const pseudoPris = salle.joueurs.some(
    (joueur) => joueur.pseudo.toLowerCase() === pseudo.toLowerCase(),
  );
  if (pseudoPris) return { erreur: erreur('pseudo_pris') };

  if (joueursConnectes(salle).length >= JOUEURS_MAX) return { erreur: erreur('salle_pleine') };

  const joueur = {
    id: 'j_' + randomBytes(4).toString('hex'),
    // Secret remis à ce seul téléphone : l'id est public (listes de candidats), la clé non.
    cle: 'c_' + randomBytes(16).toString('hex'),
    pseudo,
    couleur: couleurPourNouveauJoueur(salle),
    score: 0,
    pointsGlobaux: 0,
    medailles: { or: 0, argent: 0, bronze: 0 },
    connecte: true,
    socketId,
    arriveeA: Date.now(),
  };
  salle.joueurs.push(joueur);
  journaliser(salle.code, `+joueur ${pseudo} (${joueursConnectes(salle).length} connectés)`);
  verifierHote(salle);
  surveillerFermeture(salle);
  return { joueur };
}

// Renvoie le joueur, ou null si cet id n'est pas (ou plus) dans la salle,
// ou si la clé secrète n'est pas la sienne.
export function reconnecterJoueur(salle, id, cle, socketId) {
  const joueur = salle.joueurs.find((j) => j.id === id);
  if (!joueur) return null;
  if (!cle || joueur.cle !== cle) {
    journaliser(salle.code, `reconnexion refusée pour ${joueur.id} (clé invalide)`);
    return null;
  }
  joueur.connecte = true;
  joueur.socketId = socketId;
  journaliser(salle.code, `retour ${joueur.pseudo} (${joueursConnectes(salle).length} connectés)`);
  annuler(cleAbsence(salle, id));
  verifierHote(salle);
  surveillerFermeture(salle);
  return joueur;
}

// Des points globaux ou une médaille : le joueur a déjà joué dans cette salle.
function aUnHistorique(joueur) {
  const { or, argent, bronze } = joueur.medailles;
  return joueur.pointsGlobaux > 0 || or + argent + bronze > 0;
}

// Au bout de 10 s d'absence : retrait en salle d'attente d'un joueur sans historique,
// sinon il reste (grisé) et perd seulement le rôle d'hôte.
export function deconnecterJoueur(salle, joueur, quandChange) {
  joueur.connecte = false;
  joueur.socketId = null;
  journaliser(salle.code, `déconnexion ${joueur.pseudo} (${joueursConnectes(salle).length} connectés)`);
  programmer(cleAbsence(salle, joueur.id), DELAI_ABSENCE_MS, () => {
    if (salle.etat === 'lobby' && !aUnHistorique(joueur)) retirerJoueur(salle, joueur.id);
    else if (salle.hoteId === joueur.id) transfererHote(salle);
    quandChange(salle);
  });
  surveillerFermeture(salle);
}

export function retirerJoueur(salle, id) {
  annuler(cleAbsence(salle, id));
  const retire = salle.joueurs.find((joueur) => joueur.id === id);
  if (retire) journaliser(salle.code, `-joueur ${retire.pseudo} retiré`);
  salle.joueurs = salle.joueurs.filter((joueur) => joueur.id !== id);
  if (salle.hoteId === id) {
    salle.hoteId = null;
    transfererHote(salle);
  }
}

// Le rôle passe au joueur connecté arrivé le plus tôt. S'il n'y en a aucun, rien ne change.
export function transfererHote(salle) {
  const successeur = joueursConnectes(salle)
    .filter((joueur) => joueur.id !== salle.hoteId)
    .sort((a, b) => a.arriveeA - b.arriveeA)[0];
  if (!successeur) return;
  salle.hoteId = successeur.id;
  journaliser(salle.code, `hôte → ${successeur.pseudo}`);
}

// À chaque arrivée : on désigne un hôte s'il n'y en a pas, ou si l'hôte est absent
// depuis plus de 10 s (son minuteur d'absence est alors écoulé).
function verifierHote(salle) {
  const hote = salle.joueurs.find((joueur) => joueur.id === salle.hoteId);
  const absentTropLongtemps = hote && !hote.connecte && !minuteurs.has(cleAbsence(salle, hote.id));
  if (!hote || absentTropLongtemps) transfererHote(salle);
}

// Renvoie la salle si le jeton est le bon, sinon null.
export function reconnecterTv(code, jetonTv, socketId) {
  const salle = trouverSalle(code);
  if (!salle || !jetonTv || salle.jetonTv !== jetonTv) return null;
  salle.tvSocketId = socketId;
  journaliser(salle.code, 'TV reconnectée');
  surveillerFermeture(salle);
  return salle;
}

export function deconnecterTv(socketId) {
  const salle = Object.values(salles).find((s) => s.tvSocketId === socketId);
  if (!salle) return;
  salle.tvSocketId = null;
  journaliser(salle.code, 'TV déconnectée');
  surveillerFermeture(salle);
}

// Fermeture après 30 min sans aucune connexion, ni TV ni joueur.
function surveillerFermeture(salle) {
  salle.derniereActiviteA = Date.now();
  const cle = `${salle.code}:fermeture`;
  if (salle.tvSocketId || joueursConnectes(salle).length > 0) return annuler(cle);
  if (!minuteurs.has(cle)) programmer(cle, DELAI_FERMETURE_MS, () => fermerSalle(salle));
}

export function fermerSalle(salle) {
  for (const cle of [...minuteurs.keys()]) {
    if (cle.startsWith(`${salle.code}:`)) annuler(cle);
  }
  delete salles[salle.code];
  journaliser(salle.code, 'salle fermée');
}

// Pour /sante : des nombres seulement, rien de sensible.
export function statistiques() {
  const toutes = Object.values(salles);
  return {
    salles: toutes.length,
    joueursConnectes: toutes.reduce((total, salle) => total + joueursConnectes(salle).length, 0),
  };
}

export function trouverJoueurParSocket(socketId) {
  for (const salle of Object.values(salles)) {
    const joueur = salle.joueurs.find((j) => j.socketId === socketId);
    if (joueur) return { salle, joueur };
  }
  return null;
}

// Renvoie { salle, joueur } seulement si ce socket est celui de l'hôte.
export function trouverHoteParSocket(socketId) {
  const trouve = trouverJoueurParSocket(socketId);
  if (!trouve || trouve.salle.hoteId !== trouve.joueur.id) return null;
  return trouve;
}

// Programme le passage à l'étape suivante : celle du mode pendant la partie,
// le tableau à la fin du podium. L'échéance est une heure fixe : resynchroniser
// ne décale jamais le chrono.
export function synchroniserMinuteur(salle, quandAvance) {
  const cle = `${salle.code}:etape`;
  annuler(cle);

  const auPodium = salle.etat === 'podium';
  const fin = auPodium ? salle.debutPodiumA + DUREE_PODIUM_MS : modeDe(salle).echeance(salle);
  if (fin === null) return;

  programmer(cle, Math.max(0, fin - Date.now()), () => {
    if (auPodium) passerApresPodium(salle);
    else modeDe(salle).avancer(salle);
    quandAvance(salle);
  });
}

// L'étape affichée, même chaîne que celle de la TV (« partie:revelation:10 »).
// Construite depuis la vue publique du mode, sans lire etatMode.
export function etapeCourante(salle) {
  const { phase = '', numero = '' } = modeDe(salle).vueTv(salle) ?? {};
  return `${salle.etat}:${phase}:${numero}`;
}

export function vueTv(salle) {
  // La clé de chaque joueur ne part jamais vers la TV.
  const joueurs = salle.joueurs.map(({ cle, ...joueur }) => joueur);
  const vue = { ...salle, joueurs, etatMode: modeDe(salle).vueTv(salle) };
  if (salle.etat === 'partie') return vue;
  const { id, nom, regleCourte, joueursMin } = modeDe(salle);
  return {
    ...vue,
    modeChoisi: { id, nom, regleCourte, joueursMin, assezDeJoueurs: assezDeJoueurs(salle) },
    reglages: vueReglages(salle),
    pointsMedaille: POINTS_MEDAILLE,
    tableau: classementGlobal(salle.joueurs),
    departage: salle.format.type === 'aventure' && estDepartage(salle.joueurs, salle.format.objectif),
  };
}

export function vueJoueur(salle, joueur) {
  const estHote = salle.hoteId === joueur.id;
  const vue = {
    ecran: 'attente',
    mode: salle.mode,
    id: joueur.id,
    cle: joueur.cle,
    pseudo: joueur.pseudo,
    couleur: joueur.couleur,
    score: joueur.score,
    estHote,
    peutTerminer: estHote && salle.etat === 'partie',
    etape: etapeCourante(salle),
  };
  if (salle.etat === 'partie') return { ...vue, ...modeDe(salle).vueJoueur(salle, joueur) };

  // Hors partie : le mode choisi, et le sélecteur pour l'hôte.
  const horsPartie = {
    ...vue,
    modeChoisi: modeDe(salle).nom,
    assezDeJoueurs: assezDeJoueurs(salle),
    format: salle.format,
    reglages: vueReglages(salle),
    pointsGlobaux: joueur.pointsGlobaux,
  };
  if (estHote) horsPartie.modes = listeModes(salle);
  if (salle.etat === 'podium') return { ...horsPartie, ...vueFin(salle, joueur) };
  if (salle.etat === 'tableau' || salle.etat === 'grandGagnant') {
    return { ...horsPartie, ...vueTableau(salle, joueur) };
  }
  return horsPartie;
}

function vueFin(salle, joueur) {
  const medaille = salle.medaillesPartie[joueur.id] ?? null;
  return {
    ecran: 'fin',
    rang: rangDe(salle, joueur),
    medaille,
    gain: medaille ? POINTS_MEDAILLE[medaille] : 0,
  };
}

// Écrans « tableau » et « grandGagnant ».
function vueTableau(salle, joueur) {
  const gagnant = salle.joueurs.find((autre) => autre.id === salle.grandGagnantId);
  return {
    ecran: salle.etat,
    rangGlobal: classementGlobal(salle.joueurs).find((ligne) => ligne.id === joueur.id).rang,
    numeroPartie: salle.numeroPartie,
    grandGagnant: gagnant ? gagnant.pseudo : null,
    estGrandGagnant: salle.grandGagnantId === joueur.id,
  };
}
