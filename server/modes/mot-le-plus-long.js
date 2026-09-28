// Mode Mot le plus long (docs/modes/mot-le-plus-long.md) : 9 lettres tirées au hasard,
// chacun forme en secret le mot le plus long possible. Seul le plus long marque.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, creerOptions, echeanceDePhase, listerAttendus, melanger, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tousOntRepondu,
} from './commun.js';

export const id = 'mot-le-plus-long';
export const nom = 'Mot le plus long';
export const regleCourte = 'Forme le mot le plus long avec les 9 lettres de la TV. Seul le plus long marque : un point par lettre.';
export const joueursMin = 2;

export const DUREE_RECHERCHE_MS = 45000;
export const DUREE_REVELATION_MS = 15000;
export const NB_LETTRES = 9;
// Un tirage dont le plus long mot possible est plus court est retiré.
export const LONGUEUR_MIN_MEILLEUR = 6;

// Répartition des lettres du Scrabble français, sans les jokers.
export const SAC = {
  A: 9, B: 2, C: 2, D: 3, E: 15, F: 2, G: 2, H: 2, I: 8, J: 1, K: 1, L: 5, M: 3,
  N: 6, O: 6, P: 2, Q: 1, R: 6, S: 6, T: 6, U: 6, V: 2, W: 1, X: 1, Y: 1, Z: 1,
};
const VOYELLES = 'AEIOUY';

// ---------- Dictionnaire (data/mots.txt, tiré de Lexique 3.83, CC BY-SA 4.0) ----------

function lireDictionnaire() {
  const texte = readFileSync(new URL('../../data/mots.txt', import.meta.url), 'utf8');
  return texte.split(/\r?\n/).filter(Boolean);
}

// Un mot le plus long est cherché du plus long au plus court : les mots sont rangés par
// longueur décroissante, puis dans l'ordre alphabétique (le tri est stable).
export function preparerDictionnaire(mots) {
  return { ensemble: new Set(mots), parLongueur: [...mots].sort((a, b) => b.length - a.length) };
}

export const dictionnaire = preparerDictionnaire(lireDictionnaire());

// ---------- Règles pures ----------

const rangLettre = (mot, i) => mot.charCodeAt(i) - 65; // A → 0, Z → 25

// ['A', 'B', 'A'] → [2, 1, 0, …] : le nombre de A, de B… du tirage.
function compterLettres(lettres) {
  const compte = Array(26).fill(0);
  for (const lettre of lettres) compte[rangLettre(lettre, 0)] += 1;
  return compte;
}

// Le plus long possible teste 70 000 mots par tirage : plutôt qu'une copie du compte
// par mot, on prend les lettres du mot dans le compte, puis on les remet.
function formableAvecCompte(mot, compte) {
  let pris = 0;
  while (pris < mot.length && compte[rangLettre(mot, pris)] > 0) {
    compte[rangLettre(mot, pris)] -= 1;
    pris += 1;
  }
  for (let i = 0; i < pris; i++) compte[rangLettre(mot, i)] += 1;
  return pris === mot.length;
}

// Vrai si chaque lettre du mot est dans le tirage, au plus autant de fois qu'elle y est.
export function formableAvec(mot, lettres) {
  return formableAvecCompte(mot, compterLettres(lettres));
}

// Un mot le plus long possible avec ces lettres, ou null.
export function plusLongPossible(lettres, dico) {
  const compte = compterLettres(lettres);
  return dico.parLongueur.find((mot) => mot.length <= lettres.length && formableAvecCompte(mot, compte)) ?? null;
}

function estVoyelle(lettre) {
  return VOYELLES.includes(lettre);
}

// 9 lettres tirées sans remise dans le sac, avec au moins 2 voyelles et 2 consonnes.
export function tirerLettres() {
  const sac = Object.entries(SAC).flatMap(([lettre, nombre]) => Array(nombre).fill(lettre));
  for (;;) {
    const lettres = melanger(sac).slice(0, NB_LETTRES);
    const voyelles = lettres.filter(estVoyelle).length;
    if (voyelles >= 2 && NB_LETTRES - voyelles >= 2) return lettres;
  }
}

// Un tirage jouable : { lettres, meilleur }, retiré tant que le meilleur mot est trop court.
export function tirerManche(dico) {
  for (;;) {
    const lettres = tirerLettres();
    const meilleur = plusLongPossible(lettres, dico);
    if (meilleur && meilleur.length >= LONGUEUR_MIN_MEILLEUR) return { lettres, meilleur };
  }
}

// Texte saisi → majuscules sans accents (« Œuf » → « OEUF »), ou null si ce n'est pas un mot.
export function normaliserSaisie(texte) {
  if (typeof texte !== 'string') return null;
  const mot = texte
    .toUpperCase()
    .replace(/Œ/g, 'OE')
    .replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return /^[A-Z]*$/.test(mot) ? mot : null;
}

// Raison du refus d'un mot : 'lettres', 'dictionnaire', ou null s'il est valide.
export function raisonRefus(mot, lettres, dico) {
  if (!formableAvec(mot, lettres)) return 'lettres';
  if (!dico.ensemble.has(mot)) return 'dictionnaire';
  return null;
}

// Mots validés ({ joueurId: { mot, recuA } }) → [{ id, mot, longueur, valide, raison, points }].
// Le mot valide le plus long marque sa longueur, ex æquo compris. Tri : les mots valides
// du plus long au plus court, puis les invalides, à égalité par ordre d'arrivée.
export function calculerResultats(reponses, lettres, dico) {
  const lignes = Object.entries(reponses)
    .sort(([, a], [, b]) => a.recuA - b.recuA)
    .map(([joueurId, { mot }]) => {
      const raison = raisonRefus(mot, lettres, dico);
      return { id: joueurId, mot, longueur: mot.length, valide: raison === null, raison, points: 0 };
    });
  const plusLong = Math.max(0, ...lignes.filter((l) => l.valide).map((l) => l.longueur));
  for (const ligne of lignes) {
    if (ligne.valide && ligne.longueur === plusLong) ligne.points = plusLong;
  }
  const rangTri = (ligne) => (ligne.valide ? 0 : 1);
  return lignes.sort((a, b) => rangTri(a) - rangTri(b) || b.longueur - a.longueur);
}

// ---------- Options de l'hôte : nombre de manches et temps pour chercher (en s) ----------

const options = creerOptions(id, {
  longueurs: [5, 6, 7], unite: ['manche', 'manches'], temps: [30, DUREE_RECHERCHE_MS / 1000, 60],
});
export const { reglagesParDefaut, validerReglages, vueReglages } = options;

// ---------- Déroulé d'une partie ----------

// Les tirages sont faits au lancement. Une « question » est ici un tirage : { lettres, meilleur }.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = Array.from({ length: options.lire(salle).longueur }, () => tirerManche(dictionnaire));
  salle.etatMode = { questions };
  demarrerManche(salle, 0);
}

function demarrerManche(salle, index) {
  salle.etatMode.phase = 'recherche';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.attendus = listerAttendus(salle);
  salle.etatMode.brouillons = {};
  salle.etatMode.reponses = {};
}

// donnees : { mot, valide }. Un mot non validé (à chaque lettre touchée) est gardé comme
// brouillon, pour le valider à la fin du chrono : on renvoie alors false, car il n'y a rien
// à diffuser. Renvoie true quand un mot est validé.
export function enregistrerReponse(salle, joueurId, donnees) {
  if (phaseEnCours(salle) !== 'recherche' || !participe(salle, joueurId)) return false;
  const { brouillons, reponses } = salle.etatMode;
  if (reponses[joueurId]) return false;
  const mot = normaliserSaisie(donnees?.mot);
  if (mot === null || mot.length > NB_LETTRES || !formableAvec(mot, questionCourante(salle).lettres)) return false;
  if (donnees.valide !== true) {
    brouillons[joueurId] = mot;
    return false;
  }
  if (mot.length < 2) return false;
  reponses[joueurId] = { mot, recuA: Date.now() };
  delete brouillons[joueurId];
  return true;
}

// Appelée après chaque mot validé et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'recherche' && tousOntRepondu(salle)) reveler(salle);
}

function resultats(salle) {
  return calculerResultats(salle.etatMode.reponses, questionCourante(salle).lettres, dictionnaire);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return resultats(salle).find((ligne) => ligne.id === joueurId)?.points ?? 0;
}

// Les brouillons non vides des joueurs attendus qui n'ont pas validé sont validés ici.
export function reveler(salle) {
  const { attendus, brouillons, reponses } = salle.etatMode;
  for (const joueurId of attendus) {
    if (!reponses[joueurId] && brouillons[joueurId]) reponses[joueurId] = { mot: brouillons[joueurId], recuA: Date.now() };
  }
  salle.etatMode.brouillons = {};
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  for (const ligne of resultats(salle)) {
    const joueur = salle.joueurs.find((j) => j.id === ligne.id);
    if (joueur) joueur.score += ligne.points;
  }
}

export function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, demarrerManche);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Le temps pour chercher est une option de l'hôte, qui ne change pas pendant la partie.
export function echeance(salle) {
  const dureeRechercheMs = options.lire(salle).temps * 1000;
  return echeanceDePhase(salle, { recherche: dureeRechercheMs, revelation: DUREE_REVELATION_MS });
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'recherche') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Ce que reçoit la TV : les lettres, mais ni les mots des joueurs ni le meilleur mot
// avant la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'recherche') return vueManche(salle);
  if (phase === 'revelation') return { ...vueManche(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueManche(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    lettres: questionCourante(salle).lettres,
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueRevelation(salle) {
  const { attendus, reponses } = salle.etatMode;
  return {
    resultats: resultats(salle),
    sansReponse: attendus.filter((joueurId) => !reponses[joueurId]),
    meilleur: questionCourante(salle).meilleur,
    classement: classement(salle),
  };
}

// Écran du téléphone : jamais le mot d'un autre joueur, jamais le meilleur mot avant la révélation.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion, attendus, brouillons, reponses } = salle.etatMode;
  const { lettres, meilleur } = questionCourante(salle);
  const manche = { numero: indexQuestion + 1, total: questions.length, lettres };
  const reponse = reponses[joueur.id];
  if (phase === 'recherche') {
    if (!reponse) return { ecran: 'recherche', ...manche, mot: brouillons[joueur.id] ?? '' };
    return {
      ecran: 'mot_valide',
      ...manche,
      mot: reponse.mot,
      nbValides: Object.keys(reponses).length,
      nbAttendus: attendus.length,
    };
  }
  const ligne = resultats(salle).find((l) => l.id === joueur.id);
  return {
    ecran: 'resultat',
    ...manche,
    mot: ligne?.mot ?? null,
    valide: ligne?.valide ?? false,
    raison: ligne?.raison ?? null,
    points: ligne?.points ?? 0,
    meilleur,
    rang: rangDe(salle, joueur),
  };
}
