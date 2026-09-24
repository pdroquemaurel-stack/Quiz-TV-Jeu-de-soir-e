import { randomBytes } from 'node:crypto';
import { avancer, echeance, vueJoueurQuiz, vueTvQuiz } from './modes/quiz.js';

export const JOUEURS_MAX = 10;
export const DELAI_ABSENCE_MS = 10000;
export const DELAI_FERMETURE_MS = 30 * 60 * 1000;
const PSEUDO_MAX = 12;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const COULEURS_JOUEURS = [
  '#FF8C1A', '#FF5CA8', '#9B5DE5', '#00C2D1', '#3DDC97',
  '#B5E61D', '#A0522D', '#F1F1F1', '#8EC5FF', '#8A8F98',
];

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
    action();
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
    etatMode: {},
  };
  salles[salle.code] = salle;
  return salle;
}

export function trouverSalle(code) {
  return salles[String(code ?? '').trim().toUpperCase()] ?? null;
}

function joueursConnectes(salle) {
  return salle.joueurs.filter((joueur) => joueur.connecte);
}

// Avec MODE_DEV=1, on peut jouer seul.
export function assezDeJoueurs(salle) {
  const minimum = process.env.MODE_DEV === '1' ? 1 : 2;
  return joueursConnectes(salle).length >= minimum;
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
    pseudo,
    couleur: couleurPourNouveauJoueur(salle),
    score: 0,
    connecte: true,
    socketId,
    arriveeA: Date.now(),
  };
  salle.joueurs.push(joueur);
  verifierHote(salle);
  surveillerFermeture(salle);
  return { joueur };
}

// Renvoie le joueur, ou null si cet id n'est pas (ou plus) dans la salle.
export function reconnecterJoueur(salle, id, socketId) {
  const joueur = salle.joueurs.find((j) => j.id === id);
  if (!joueur) return null;
  joueur.connecte = true;
  joueur.socketId = socketId;
  annuler(cleAbsence(salle, id));
  verifierHote(salle);
  surveillerFermeture(salle);
  return joueur;
}

// Au bout de 10 s d'absence : retrait en salle d'attente, sinon transfert de l'hôte.
export function deconnecterJoueur(salle, joueur, quandChange) {
  joueur.connecte = false;
  joueur.socketId = null;
  programmer(cleAbsence(salle, joueur.id), DELAI_ABSENCE_MS, () => {
    if (salle.etat === 'lobby') retirerJoueur(salle, joueur.id);
    else if (salle.hoteId === joueur.id) transfererHote(salle);
    quandChange(salle);
  });
  surveillerFermeture(salle);
}

export function retirerJoueur(salle, id) {
  annuler(cleAbsence(salle, id));
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
  if (successeur) salle.hoteId = successeur.id;
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
  surveillerFermeture(salle);
  return salle;
}

export function deconnecterTv(socketId) {
  const salle = Object.values(salles).find((s) => s.tvSocketId === socketId);
  if (!salle) return;
  salle.tvSocketId = null;
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

// Programme le passage à l'étape suivante à l'échéance donnée par le mode.
// L'échéance est une heure fixe : resynchroniser ne décale jamais le chrono.
export function synchroniserMinuteur(salle, quandAvance) {
  const cle = `${salle.code}:etape`;
  annuler(cle);

  const fin = echeance(salle);
  if (fin === null) return;

  programmer(cle, Math.max(0, fin - Date.now()), () => {
    avancer(salle);
    quandAvance(salle);
  });
}

export function vueTv(salle) {
  return { ...salle, etatMode: vueTvQuiz(salle) };
}

export function vueJoueur(salle, joueur) {
  const vue = {
    ecran: 'attente',
    id: joueur.id,
    pseudo: joueur.pseudo,
    couleur: joueur.couleur,
    score: joueur.score,
    estHote: salle.hoteId === joueur.id,
  };
  if (salle.etat === 'lobby') return { ...vue, assezDeJoueurs: assezDeJoueurs(salle) };
  if (salle.etat === 'podium') {
    return { ...vue, ...vueJoueurQuiz(salle, joueur), assezDeJoueurs: assezDeJoueurs(salle) };
  }
  return { ...vue, ...vueJoueurQuiz(salle, joueur) };
}
