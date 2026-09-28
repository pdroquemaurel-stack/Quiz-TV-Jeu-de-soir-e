// Ce qui sert à plusieurs modes de jeu.

import { passerAuPodium } from '../medailles.js';

export { passerAuPodium };

// Phase du mode en cours (« question »…), ou null hors partie.
export function phaseEnCours(salle) {
  return salle.etat === 'partie' ? salle.etatMode.phase : null;
}

// ---------- Options de l'hôte : longueur de la partie et temps pour répondre ----------
// choix : { longueurs: [5, 8, 12], unite: ['question', 'questions'], temps: [20, 30, 45] },
// le temps en secondes. Par défaut, le choix du milieu : la valeur d'avant ces options.

export function optionsParDefaut(choix) {
  return { longueur: choix.longueurs[1], temps: choix.temps[1] };
}

// Renvoie { longueur, temps } s'ils font partie des choix, sinon null.
export function validerOptions(choix, donnees) {
  const { longueur, temps } = donnees ?? {};
  if (!choix.longueurs.includes(longueur) || !choix.temps.includes(temps)) return null;
  return { longueur, temps };
}

// Les fonctions de réglage du contrat d'un mode qui n'a que ces deux options, et lire(salle),
// qui donne les options choisies par l'hôte (ou celles par défaut).
export function creerOptions(idMode, choix) {
  const reglagesParDefaut = () => optionsParDefaut(choix);
  const lire = (salle) => salle.reglagesMode?.[idMode] ?? reglagesParDefaut();
  return {
    reglagesParDefaut,
    validerReglages: (donnees) => validerOptions(choix, donnees),
    vueReglages: (salle) => ({ titre: 'Options', ...vueOptions(choix, lire(salle)) }),
    lire,
  };
}

// « 1 manche », « 8 questions ».
export function texteLongueur(choix, longueur) {
  return `${longueur} ${choix.unite[longueur > 1 ? 1 : 0]}`;
}

// Ce que les écrans montrent des options : valeurs choisies, résumé (« 8 questions · 30 s ») et choix possibles.
export function vueOptions(choix, reglages) {
  return {
    valeurs: reglages,
    resume: `${texteLongueur(choix, reglages.longueur)} · ${reglages.temps} s`,
    options: {
      longueurs: choix.longueurs.map((longueur) => ({ id: longueur, libelle: texteLongueur(choix, longueur) })),
      temps: choix.temps.map((temps) => ({ id: temps, libelle: `${temps} s` })),
    },
  };
}

// ---------- Enchaînement des questions (modes à questions : etatMode.questions, indexQuestion) ----------

export function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// demarrer(salle, index) : la façon propre au mode d'ouvrir une question.
export function questionSuivanteOuPodium(salle, demarrer) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrer(salle, suivante);
  else passerAuPodium(salle);
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
// durees : { phase: durée en ms }, comptée depuis etatMode.debutPhaseA.
export function echeanceDePhase(salle, durees) {
  const phase = phaseEnCours(salle);
  return phase in durees ? salle.etatMode.debutPhaseA + durees[phase] : null;
}

// Pour les vues : echeance est la fonction du mode.
export function tempsRestantMs(salle, echeance) {
  return Math.max(0, echeance(salle) - Date.now());
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

// Textes libres de plusieurs joueurs ({ joueurId: { texte, recuA } }) regroupés par clé :
// [{ texte, auteurs }], avec le texte du premier arrivé, dans l'ordre d'arrivée.
export function fusionnerParCle(textes) {
  const parCle = new Map();
  const parArrivee = Object.entries(textes).sort(([, a], [, b]) => a.recuA - b.recuA);
  for (const [joueurId, { texte }] of parArrivee) {
    const cle = cleReponse(texte);
    if (!parCle.has(cle)) parCle.set(cle, { texte, auteurs: [] });
    parCle.get(cle).auteurs.push(joueurId);
  }
  return [...parCle.values()];
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
