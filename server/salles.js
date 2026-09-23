import { randomBytes } from 'node:crypto';

export const JOUEURS_MAX = 10;
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

function premiereCouleurLibre(salle) {
  const prises = salle.joueurs.map((joueur) => joueur.couleur);
  return COULEURS_JOUEURS.find((couleur) => !prises.includes(couleur));
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

  const connectes = salle.joueurs.filter((joueur) => joueur.connecte);
  if (connectes.length >= JOUEURS_MAX) return { erreur: erreur('salle_pleine') };

  const joueur = {
    id: 'j_' + randomBytes(4).toString('hex'),
    pseudo,
    couleur: premiereCouleurLibre(salle),
    score: 0,
    connecte: true,
    socketId,
    arriveeA: Date.now(),
  };
  salle.joueurs.push(joueur);
  if (salle.hoteId === null) salle.hoteId = joueur.id;
  return { joueur };
}

export function retirerJoueur(salle, id) {
  salle.joueurs = salle.joueurs.filter((joueur) => joueur.id !== id);
  if (salle.hoteId === id) {
    const plusAncien = [...salle.joueurs].sort((a, b) => a.arriveeA - b.arriveeA)[0];
    salle.hoteId = plusAncien ? plusAncien.id : null;
  }
}

export function trouverJoueurParSocket(socketId) {
  for (const salle of Object.values(salles)) {
    const joueur = salle.joueurs.find((j) => j.socketId === socketId);
    if (joueur) return { salle, joueur };
  }
  return null;
}

export function vueJoueur(salle, joueur) {
  return {
    ecran: 'attente',
    id: joueur.id,
    pseudo: joueur.pseudo,
    couleur: joueur.couleur,
    estHote: salle.hoteId === joueur.id,
  };
}
