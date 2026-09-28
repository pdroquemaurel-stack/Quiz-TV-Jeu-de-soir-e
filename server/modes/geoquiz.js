// Mode GéoQuiz (docs/modes/geoquiz.md) : la TV montre la photo d'un lieu réel,
// chacun pose un pin sur une carte du monde, le plus proche marque le plus.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, echeanceDePhase, listerAttendus, noterQuestionsVues, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tirerQuestions,
  tousOntRepondu,
} from './commun.js';

export const id = 'geoquiz';
export const nom = 'GéoQuiz';
export const regleCourte = 'Où a été prise la photo ? Pose ton pin sur la carte : plus tu es près, plus tu marques.';
export const joueursMin = 2;

export const DUREE_DEVINETTE_MS = 60000;
export const DUREE_REVELATION_MS = 20000;
const RAYON_TERRE_KM = 6371;

// Nombre de lieux de chaque difficulté (1 facile à 3 difficile) selon le nombre de manches.
export const REPARTITIONS = {
  3: { 1: 1, 2: 1, 3: 1 },
  5: { 1: 2, 2: 2, 3: 1 },
  10: { 1: 4, 2: 4, 3: 2 },
};
const MANCHES_PAR_DEFAUT = 5;

function lireJson(chemin) {
  return JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'));
}

// Les lieux exclus à la main (photos inutilisables) ne sont jamais tirés.
export function lieuxJouables(pack, exclus) {
  return pack.filter((lieu) => !exclus.includes(lieu.id));
}

export const banqueGeoquiz = lieuxJouables(
  lireJson('../../data/geoquiz.json'),
  lireJson('../../data/geoquiz-exclus.json'),
);

// ---------- Règles pures ----------

const enRadians = (degres) => (degres * Math.PI) / 180;

// Distance à vol d'oiseau entre deux points { lat, lng }, en km (formule de Haversine).
export function distanceKm(a, b) {
  const dLat = enRadians(b.lat - a.lat);
  const dLng = enRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(enRadians(a.lat)) * Math.cos(enRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

export function calculerPoints(km) {
  return Math.round(5000 * Math.exp(-km / 2000));
}

// La carte du téléphone se répète vers l'est et l'ouest : 190 → −170.
// Une longitude déjà dans les bornes n'est pas recalculée (pas d'erreur d'arrondi).
export function normaliserLongitude(lng) {
  if (lng >= -180 && lng <= 180) return lng;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// Pins validés ({ joueurId: { lat, lng } }) triés du plus proche au plus loin du lieu.
// km est arrondi au dixième pour l'affichage, les points sont calculés sur la distance exacte.
export function calculerResultats(reponses, lieu) {
  return Object.entries(reponses)
    .map(([joueurId, { lat, lng }]) => {
      const km = distanceKm({ lat, lng }, lieu);
      return { id: joueurId, lat, lng, km: Math.round(km * 10) / 10, points: calculerPoints(km) };
    })
    .sort((a, b) => a.km - b.km);
}

// ---------- Réglages de l'hôte : le nombre de manches ----------

export function reglagesParDefaut() {
  return { manches: MANCHES_PAR_DEFAUT };
}

export function validerReglages(donnees) {
  const manches = donnees?.manches;
  return Number.isInteger(manches) && Object.hasOwn(REPARTITIONS, manches) ? { manches } : null;
}

function manchesChoisies(salle) {
  return (salle.reglagesMode?.[id] ?? reglagesParDefaut()).manches;
}

export function vueReglages(salle) {
  const manches = manchesChoisies(salle);
  return {
    manches,
    titre: 'Manches',
    resume: `${manches} manches`,
    options: { manches: Object.keys(REPARTITIONS).map(Number) },
  };
}

// ---------- Tirage ----------

// Les lieux de chaque difficulté selon la répartition : d'abord les jamais vus, puis les
// plus anciennement vus. S'il en manque, on complète avec la difficulté la plus proche.
// Rendus du plus facile au plus difficile.
export function tirerLieux(banque, questionsVues, manches) {
  const repartition = REPARTITIONS[manches];
  const ordre = tirerQuestions(banque, questionsVues, banque.length);
  const choisis = [];
  const manquants = [];
  for (const [difficulte, nombre] of Object.entries(repartition)) {
    const trouves = ordre.filter((lieu) => lieu.difficulte === Number(difficulte)).slice(0, nombre);
    choisis.push(...trouves);
    for (let i = trouves.length; i < nombre; i++) manquants.push(Number(difficulte));
  }
  for (const difficulte of manquants) {
    const ecart = (lieu) => Math.abs(lieu.difficulte - difficulte);
    const restants = ordre.filter((lieu) => !choisis.includes(lieu));
    const plusProche = restants.reduce((meilleur, lieu) => (ecart(lieu) < ecart(meilleur) ? lieu : meilleur), restants[0]);
    if (plusProche) choisis.push(plusProche);
  }
  return choisis.sort((a, b) => a.difficulte - b.difficulte);
}

// ---------- Déroulé d'une partie ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerLieux(banqueGeoquiz, salle.questionsVues, manchesChoisies(salle));
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions };
  demarrerManche(salle, 0);
}

function demarrerManche(salle, index) {
  salle.etatMode.phase = 'devinette';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.attendus = listerAttendus(salle);
  salle.etatMode.pins = {};
  salle.etatMode.reponses = {};
}

// Un pin valide : { lat, lng } avec la longitude ramenée entre −180 et 180, ou null.
function lirePin(donnees) {
  const { lat, lng } = donnees ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) return null;
  return { lat, lng: normaliserLongitude(lng) };
}

// donnees : { lat, lng, valide }. Un pin non validé (à chaque tap) est gardé comme brouillon,
// pour le valider à la fin du chrono : on renvoie alors false, car il n'y a rien à diffuser
// (personne d'autre ne doit le voir). Renvoie true quand un pin est validé.
export function enregistrerReponse(salle, joueurId, donnees) {
  if (phaseEnCours(salle) !== 'devinette' || !participe(salle, joueurId)) return false;
  const { pins, reponses } = salle.etatMode;
  if (reponses[joueurId]) return false;
  const pin = lirePin(donnees);
  if (!pin) return false;
  if (donnees.valide !== true) {
    pins[joueurId] = pin;
    return false;
  }
  reponses[joueurId] = { ...pin, recuA: Date.now() };
  delete pins[joueurId];
  return true;
}

// Appelée après chaque pin validé et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'devinette' && tousOntRepondu(salle)) reveler(salle);
}

function resultats(salle) {
  return calculerResultats(salle.etatMode.reponses, questionCourante(salle));
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return resultats(salle).find((ligne) => ligne.id === joueurId)?.points ?? 0;
}

// Les brouillons des joueurs attendus qui n'ont pas validé sont validés ici.
export function reveler(salle) {
  const { attendus, pins, reponses } = salle.etatMode;
  for (const joueurId of attendus) {
    if (!reponses[joueurId] && pins[joueurId]) reponses[joueurId] = { ...pins[joueurId], recuA: Date.now() };
  }
  salle.etatMode.pins = {};
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

const DUREES = { devinette: DUREE_DEVINETTE_MS, revelation: DUREE_REVELATION_MS };

export function echeance(salle) {
  return echeanceDePhase(salle, DUREES);
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'devinette') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Le lieu, champ par champ : jamais avant la révélation.
function vueLieu(lieu) {
  return { nom: lieu.nom, pays: lieu.pays, lat: lieu.lat, lng: lieu.lng };
}

// Ce que reçoit la TV : la photo, mais ni le lieu ni les pins avant la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'devinette') return vueManche(salle);
  if (phase === 'revelation') return { ...vueManche(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueManche(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  const { image, auteur, licence } = questionCourante(salle);
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    photo: { image, auteur, licence },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueRevelation(salle) {
  const { attendus, reponses, questions, indexQuestion } = salle.etatMode;
  const vue = {
    lieu: vueLieu(questionCourante(salle)),
    resultats: resultats(salle),
    sansReponse: attendus.filter((joueurId) => !reponses[joueurId]),
    classement: classement(salle),
  };
  // Pour que la TV précharge la photo de la manche suivante.
  const suivante = questions[indexQuestion + 1];
  if (suivante) vue.photoSuivante = { image: suivante.image };
  return vue;
}

// Écran du téléphone : jamais la photo, jamais le lieu avant la révélation,
// jamais le pin d'un autre joueur.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion, attendus, pins, reponses } = salle.etatMode;
  const numeros = { numero: indexQuestion + 1, total: questions.length };
  const reponse = reponses[joueur.id];
  const pinDe = (point) => (point ? { lat: point.lat, lng: point.lng } : null);
  if (phase === 'devinette') {
    if (!reponse) return { ecran: 'devinette', ...numeros, pin: pinDe(pins[joueur.id]) };
    return {
      ecran: 'pin_valide',
      ...numeros,
      pin: pinDe(reponse),
      nbValides: Object.keys(reponses).length,
      nbAttendus: attendus.length,
    };
  }
  const ligne = resultats(salle).find((l) => l.id === joueur.id);
  return {
    ecran: 'resultat',
    ...numeros,
    lieu: vueLieu(questionCourante(salle)),
    pin: pinDe(reponse),
    km: ligne?.km ?? null,
    points: ligne?.points ?? 0,
    rang: rangDe(salle, joueur),
  };
}
