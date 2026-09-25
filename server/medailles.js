// Médailles de fin de partie et points globaux, communs à tous les modes.

export const POINTS_MEDAILLE = { or: 3, argent: 2, bronze: 1 };
const MEDAILLE_DU_RANG = { 1: 'or', 2: 'argent', 3: 'bronze' };

// Classement « olympique » : les ex æquo partagent la médaille et le rang suivant
// est sauté (1, 1, 3 → or, or, bronze). Un score de 0 ne rapporte rien.
// Entrée : [{ id, score }]. Sortie : { id: 'or' | 'argent' | 'bronze' }.
export function attribuerMedailles(joueurs) {
  const medailles = {};
  for (const joueur of joueurs) {
    if (joueur.score <= 0) continue;
    const rang = 1 + joueurs.filter((autre) => autre.score > joueur.score).length;
    if (MEDAILLE_DU_RANG[rang]) medailles[joueur.id] = MEDAILLE_DU_RANG[rang];
  }
  return medailles;
}

// Le seul joueur en tête des points globaux, s'il atteint l'objectif. Sinon null.
export function trouverGrandGagnant(joueurs, objectif) {
  const enTete = joueursEnTete(joueurs);
  if (enTete.length !== 1 || enTete[0].pointsGlobaux < objectif) return null;
  return enTete[0].id;
}

// Plusieurs joueurs à égalité en tête, au moins à l'objectif : on joue une partie de plus.
export function estDepartage(joueurs, objectif) {
  const enTete = joueursEnTete(joueurs);
  return enTete.length > 1 && enTete[0].pointsGlobaux >= objectif;
}

function joueursEnTete(joueurs) {
  const maximum = Math.max(0, ...joueurs.map((joueur) => joueur.pointsGlobaux));
  if (maximum === 0) return [];
  return joueurs.filter((joueur) => joueur.pointsGlobaux === maximum);
}

// Tableau des points globaux, trié, avec les ex æquo au même rang.
// Le tri est stable : à égalité, l'ordre d'arrivée est conservé.
export function classementGlobal(joueurs) {
  const maximum = Math.max(0, ...joueurs.map((joueur) => joueur.pointsGlobaux));
  return [...joueurs]
    .sort((a, b) => b.pointsGlobaux - a.pointsGlobaux)
    .map((joueur) => ({
      id: joueur.id,
      pseudo: joueur.pseudo,
      couleur: joueur.couleur,
      connecte: joueur.connecte,
      pointsGlobaux: joueur.pointsGlobaux,
      medailles: joueur.medailles,
      rang: 1 + joueurs.filter((autre) => autre.pointsGlobaux > joueur.pointsGlobaux).length,
      ecartAuLeader: maximum - joueur.pointsGlobaux,
    }));
}

// Fin d'une partie, quel que soit le mode : podium, médailles et points globaux.
export function passerAuPodium(salle) {
  salle.etat = 'podium';
  salle.debutPodiumA = Date.now();
  salle.medaillesPartie = attribuerMedailles(salle.joueurs);
  for (const joueur of salle.joueurs) {
    const medaille = salle.medaillesPartie[joueur.id];
    if (!medaille) continue;
    joueur.pointsGlobaux += POINTS_MEDAILLE[medaille];
    joueur.medailles[medaille]++;
  }
}
