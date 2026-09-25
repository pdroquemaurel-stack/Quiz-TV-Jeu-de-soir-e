// Mode Même réponse (docs/modes/meme-reponse.md).
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, normaliser, noterQuestionsVues, participe,
  phaseEnCours, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'meme-reponse';
export const nom = 'Même réponse';
export const regleCourte = '10 questions : marque des points en donnant la même réponse que les autres.';
export const joueursMin = 3;

export const NOMBRE_QUESTIONS = 10;
export const DUREE_SAISIE_MS = 30000;
export const DUREE_RESULTATS_MS = 12000;
export const POINTS_PAR_JOUEUR = 100;
export const BONUS_EN_TETE = 300;
export const LONGUEUR_MAX_REPONSE = 30;

// Lue au premier lancement seulement : scripts/verifier-meme-reponse.js importe ce fichier
// pour cleReponse(), et doit pouvoir signaler lui-même un fichier illisible.
let banque = null;

export function banqueMemeReponse() {
  banque ??= JSON.parse(readFileSync(new URL('../../data/meme-reponse.json', import.meta.url), 'utf8'));
  return banque;
}

// ---------- Règles pures ----------

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

// Clé de chaque forme connue (réponse ou variante) → libellé de sa réponse connue.
function libellesConnus(question) {
  const libelles = new Map();
  for (const connue of question.reponses) {
    for (const forme of [connue.reponse, ...connue.variantes]) libelles.set(cleReponse(forme), connue.reponse);
  }
  return libelles;
}

export function pointsDuGroupe(taille, enTete) {
  if (taille < 2) return 0;
  return POINTS_PAR_JOUEUR * taille + (enTete ? BONUS_EN_TETE : 0);
}

// Regroupe les réponses de même clé, rattachées à une réponse connue si possible.
// Tri : du plus grand groupe au plus petit, puis par ordre d'arrivée de la première réponse.
export function formerGroupes(reponses, question) {
  const connus = libellesConnus(question);
  const groupes = new Map();
  for (const [joueurId, { texte }] of Object.entries(reponses)) {
    const cle = cleReponse(texte);
    const libelle = connus.get(cle) ?? texte;
    // Toutes les formes d'une réponse connue se rangent sous la clé de son libellé.
    const cleGroupe = connus.has(cle) ? cleReponse(libelle) : cle;
    if (!groupes.has(cleGroupe)) groupes.set(cleGroupe, { libelle, joueurs: [] });
    groupes.get(cleGroupe).joueurs.push(joueurId);
  }
  const liste = [...groupes.values()].map((groupe) => ({ ...groupe, taille: groupe.joueurs.length }));
  const maximum = Math.max(0, ...liste.map((groupe) => groupe.taille));
  return liste
    .map((groupe) => {
      const enTete = groupe.taille >= 2 && groupe.taille === maximum;
      return { ...groupe, enTete, points: pointsDuGroupe(groupe.taille, enTete) };
    })
    .sort((a, b) => b.taille - a.taille);
}

// ---------- Déroulé ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueMemeReponse(), salle.questionsVues, NOMBRE_QUESTIONS);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  salle.etatMode.phase = 'saisie';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Renvoie true si la réponse est acceptée : un texte de 1 à 30 caractères, de clé non vide.
export function enregistrerReponse(salle, joueurId, texte) {
  if (phaseEnCours(salle) !== 'saisie' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId] || typeof texte !== 'string') return false;
  const propre = texte.trim();
  if (propre.length > LONGUEUR_MAX_REPONSE || cleReponse(propre) === '') return false;
  salle.etatMode.reponses[joueurId] = { texte: propre, recuA: Date.now() };
  return true;
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'saisie' && tousOntRepondu(salle)) montrerResultats(salle);
}

function groupes(salle) {
  return formerGroupes(salle.etatMode.reponses, questionCourante(salle));
}

function groupeDe(salle, joueurId) {
  return groupes(salle).find((groupe) => groupe.joueurs.includes(joueurId));
}

// Les points n'existent qu'à partir des résultats.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'resultats') return 0;
  return groupeDe(salle, joueurId)?.points ?? 0;
}

export function montrerResultats(salle) {
  salle.etatMode.phase = 'resultats';
  salle.etatMode.debutPhaseA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else salle.etat = 'podium';
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'resultats') return false;
  passerALaSuite(salle);
  return true;
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') return salle.etatMode.debutPhaseA + DUREE_SAISIE_MS;
  if (phase === 'resultats') return salle.etatMode.debutPhaseA + DUREE_RESULTATS_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') montrerResultats(salle);
  else if (phase === 'resultats') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Ce que reçoit la TV : aucun texte de réponse avant les résultats, jamais les réponses connues.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'saisie') return vueQuestion(salle);
  if (phase === 'resultats') return { ...vueQuestion(salle), ...vueResultats(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte: questionCourante(salle).texte },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

// Unanimité : toutes les réponses données forment un seul groupe d'au moins 2 joueurs.
function vueResultats(salle) {
  const { attendus, reponses } = salle.etatMode;
  const liste = groupes(salle);
  return {
    groupes: liste,
    sansReponse: attendus.filter((joueurId) => !reponses[joueurId]),
    unanimite: liste.length === 1 && liste[0].taille >= 2,
    classement: classement(salle),
  };
}

// Écran du téléphone pendant une partie : jamais la réponse d'un autre joueur.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const {
    phase, questions, indexQuestion, reponses,
  } = salle.etatMode;
  const reponse = reponses[joueur.id];
  const numero = indexQuestion + 1;
  if (phase === 'saisie') {
    if (reponse) return { ecran: 'reponse_envoyee', numero, texte: reponse.texte };
    const question = { texte: questionCourante(salle).texte };
    return { ecran: 'repondre', numero, total: questions.length, question };
  }
  const groupe = groupeDe(salle, joueur.id);
  return {
    ecran: 'resultat',
    numero,
    texte: reponse?.texte ?? null,
    libelle: groupe?.libelle ?? null,
    taille: groupe?.taille ?? 0,
    enTete: groupe?.enTete ?? false,
    points: groupe?.points ?? 0,
    rang: rangDe(salle, joueur),
  };
}
