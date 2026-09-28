// Ce que reçoivent la TV (salle:etat) et chaque téléphone (joueur:etat).
// Le contenu propre à un mode vient de son vueTv / vueJoueur.
import { POINTS_MEDAILLE, classementGlobal, estDepartage } from './medailles.js';
import { rangDe } from './modes/commun.js';
import { modes, modesAVenir } from './modes/index.js';
import { assezDeJoueurs, modeDe, modeDisponible } from './salles.js';

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

// Ce que les écrans montrent des réglages du mode, ou null si le mode n'en a pas.
function vueReglages(salle) {
  return modeDe(salle).vueReglages?.(salle) ?? null;
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
    formatValide: salle.formatValide,
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
