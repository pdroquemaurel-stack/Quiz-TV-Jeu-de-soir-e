// Ce qui sert à plusieurs modes de jeu.

export { passerAuPodium } from '../medailles.js';

// Phase du mode en cours (« question »…), ou null hors partie.
export function phaseEnCours(salle) {
  return salle.etat === 'partie' ? salle.etatMode.phase : null;
}

// Forme comparable d'un texte saisi : minuscules, sans accents, espaces réduits.
export function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Forme comparable d'une réponse libre (Même réponse, Le bluff) : en plus de normaliser,
// ponctuation, article en tête et pluriel simple ignorés.
const ARTICLE_EN_TETE = /^(de la|le|la|les|l|un|une|des|du|d) (?=.)/;

// « Fraises » → « fraise », « Choux » → « chou ». Les mots de 3 lettres restent tels quels (« bus »).
function retirerPluriel(mot) {
  return mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot;
}

// Deux réponses de même clé sont la même réponse. Clé vide : réponse invalide (« !!! »).
export function cleReponse(texte) {
  return normaliser(texte)
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ARTICLE_EN_TETE, '')
    .split(' ')
    .map(retirerPluriel)
    .join(' ');
}

// Mélange de Fisher-Yates, sur une copie.
export function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Les questions jamais vues d'abord, au hasard. S'il n'y en a pas assez,
// on complète avec les déjà vues, les plus anciennes d'abord.
export function tirerQuestions(banque, questionsVues, nombre) {
  const inedites = melanger(banque.filter((question) => !questionsVues.includes(question.id)));
  const dejaVues = questionsVues
    .map((id) => banque.find((question) => question.id === id))
    .filter(Boolean);
  return [...inedites, ...dejaVues].slice(0, nombre);
}

// questionsVues reste dans l'ordre chronologique : une question revue passe en fin de liste.
export function noterQuestionsVues(salle, questions) {
  const ids = questions.map((question) => question.id);
  salle.questionsVues = [...salle.questionsVues.filter((id) => !ids.includes(id)), ...ids];
}

// Seuls les joueurs connectés au début de la manche sont attendus.
export function listerAttendus(salle) {
  return salle.joueurs.filter((joueur) => joueur.connecte).map((joueur) => joueur.id);
}

// Seuls les joueurs attendus jouent la manche en cours : les autres attendent la suivante.
export function participe(salle, joueurId) {
  return salle.etatMode.attendus.includes(joueurId);
}

// Vrai quand tous les joueurs attendus encore connectés ont répondu.
export function tousOntRepondu(salle) {
  const { attendus, reponses } = salle.etatMode;
  return salle.joueurs
    .filter((joueur) => joueur.connecte && attendus.includes(joueur.id))
    .every((joueur) => reponses[joueur.id]);
}

// Ex æquo : même rang, et le rang suivant est sauté (1, 1, 3).
export function rangDe(salle, joueur) {
  return 1 + salle.joueurs.filter((autre) => autre.score > joueur.score).length;
}

// Le tri est stable : à égalité, l'ordre d'arrivée est conservé.
// pointsGagnes(salle, joueurId) donne les points de la manche, propres au mode.
// rangAvant : le rang avant ces points, pour les flèches ▲▼ de la TV. null tant que
// tout le monde était à 0 : il n'y avait pas encore de classement.
export function classement(salle, pointsGagnes) {
  const scoreAvant = new Map(
    salle.joueurs.map((joueur) => [joueur.id, joueur.score - pointsGagnes(salle, joueur.id)]),
  );
  const personneNAvaitDePoints = [...scoreAvant.values()].every((score) => score === 0);
  const rangAvant = (joueur) => {
    if (personneNAvaitDePoints) return null;
    const monScore = scoreAvant.get(joueur.id);
    return 1 + [...scoreAvant.values()].filter((score) => score > monScore).length;
  };
  return [...salle.joueurs]
    .sort((a, b) => b.score - a.score)
    .map((joueur) => ({
      id: joueur.id,
      pseudo: joueur.pseudo,
      couleur: joueur.couleur,
      score: joueur.score,
      connecte: joueur.connecte,
      rang: rangDe(salle, joueur),
      rangAvant: rangAvant(joueur),
      points: pointsGagnes(salle, joueur.id),
    }));
}
