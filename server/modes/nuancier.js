// Mode Nuancier (docs/modes/nuancier.md) : la TV montre un logo dont une zone de couleur
// a été retirée, chacun recrée la couleur sur son téléphone avec deux curseurs.
import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, creerOptions, echeanceDePhase, listerAttendus, noterQuestionsVues, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tirerQuestions,
  tousOntRepondu,
} from './commun.js';

export const id = 'nuancier';
export const nom = 'Nuancier';
export const regleCourte = 'Recrée la couleur du logo avec tes curseurs : plus elle ressemble, plus tu marques.';
export const joueursMin = 2;

export const NOMBRE_MANCHES = 7;
export const DUREE_CHOIX_MS = 20000;
export const DUREE_REVELATION_MS = 15000;
export const LUMINOSITE_MIN = 5;
export const LUMINOSITE_MAX = 95;
const LUMINOSITE_DEPART = 50;

// Options de l'hôte : nombre de manches et temps pour choisir sa couleur (en s).
const options = creerOptions(id, {
  longueurs: [5, NOMBRE_MANCHES, 10], unite: ['manche', 'manches'], temps: [15, DUREE_CHOIX_MS / 1000, 30],
});
export const { reglagesParDefaut, validerReglages, vueReglages } = options;

export const banqueNuancier = JSON.parse(
  readFileSync(new URL('../../data/nuancier.json', import.meta.url), 'utf8'),
);

// ---------- Couleurs ----------

// « #0058A3 » → [0, 88, 163].
function versRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function versHex(rgb) {
  return '#' + rgb.map((canal) => canal.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// « #0058A3 » → { teinte: 0-360, saturation: 0-100, luminosite: 0-100 } (TSL, en anglais HSL), sans arrondi.
export function tslDe(hex) {
  const [r, v, b] = versRgb(hex).map((canal) => canal / 255);
  const max = Math.max(r, v, b);
  const min = Math.min(r, v, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { teinte: 0, saturation: 0, luminosite: l * 100 };
  let t;
  if (max === r) t = ((v - b) / d) % 6;
  else if (max === v) t = (b - r) / d + 2;
  else t = (r - v) / d + 4;
  return { teinte: (t * 60 + 360) % 360, saturation: (d / (1 - Math.abs(2 * l - 1))) * 100, luminosite: l * 100 };
}

// La saturation imposée aux curseurs, arrondie au dixième : le téléphone affiche
// exactement la couleur que le serveur note.
export function saturationDe(hex) {
  return Math.round(tslDe(hex).saturation * 10) / 10;
}

// TSL → « #RRGGBB » (formule du CSS, hsl()).
export function couleurTsl(teinte, saturation, luminosite) {
  const s = saturation / 100;
  const l = luminosite / 100;
  const a = s * Math.min(l, 1 - l);
  const canal = (n) => {
    const k = (n + teinte / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return versHex([canal(0), canal(8), canal(4)]);
}

// sRGB → CIE Lab, blanc de référence D65.
export function labDe(hex) {
  const lineaire = versRgb(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, v, b] = lineaire;
  const x = (0.4124564 * r + 0.3575761 * v + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * v + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * v + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

// Distance ΔE (CIE76) entre deux couleurs « #RRGGBB ».
export function deltaE(hex1, hex2) {
  const c1 = labDe(hex1);
  const c2 = labDe(hex2);
  return Math.hypot(c1.l - c2.l, c1.a - c2.a, c1.b - c2.b);
}

// En % : 100 pour la couleur exacte, 0 à partir d'un ΔE de 66,7.
export function ressemblance(hex, cible) {
  return Math.max(0, Math.round(100 - deltaE(hex, cible) * 1.5));
}

// Couleurs validées ({ joueurId: { teinte, luminosite } }) triées de la plus ressemblante
// à la moins ressemblante. Points = ressemblance × 10.
export function calculerResultats(reponses, logo) {
  const saturation = saturationDe(logo.cible);
  return Object.entries(reponses)
    .map(([joueurId, { teinte, luminosite }]) => {
      const couleur = couleurTsl(teinte, saturation, luminosite);
      const pourcentage = ressemblance(couleur, logo.cible);
      return { id: joueurId, couleur, ressemblance: pourcentage, points: pourcentage * 10 };
    })
    .sort((a, b) => b.ressemblance - a.ressemblance);
}

// ---------- Déroulé d'une partie ----------

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestions(banqueNuancier, salle.questionsVues, options.lire(salle).longueur);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions };
  demarrerManche(salle, 0);
}

// La position de départ des curseurs est la même pour tous : teinte au hasard, luminosité moyenne.
function demarrerManche(salle, index) {
  salle.etatMode.phase = 'choix';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.attendus = listerAttendus(salle);
  salle.etatMode.depart = { teinte: Math.floor(Math.random() * 360), luminosite: LUMINOSITE_DEPART };
  salle.etatMode.brouillons = {};
  salle.etatMode.reponses = {};
}

function entierEntre(valeur, min, max) {
  return Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

// Une couleur valide : { teinte, luminosite }, ou null.
function lireCouleur(donnees) {
  const { teinte, luminosite } = donnees ?? {};
  if (!entierEntre(teinte, 0, 359) || !entierEntre(luminosite, LUMINOSITE_MIN, LUMINOSITE_MAX)) return null;
  return { teinte, luminosite };
}

// donnees : { teinte, luminosite, valide }. Une couleur non validée (un curseur bouge) est gardée
// comme brouillon, pour la valider à la fin du chrono : on renvoie alors false, car il n'y a rien
// à diffuser (personne d'autre ne doit la voir). Renvoie true quand une couleur est validée.
export function enregistrerReponse(salle, joueurId, donnees) {
  if (phaseEnCours(salle) !== 'choix' || !participe(salle, joueurId)) return false;
  const { brouillons, reponses } = salle.etatMode;
  if (reponses[joueurId]) return false;
  const couleur = lireCouleur(donnees);
  if (!couleur) return false;
  if (donnees.valide !== true) {
    brouillons[joueurId] = couleur;
    return false;
  }
  reponses[joueurId] = { ...couleur, recuA: Date.now() };
  delete brouillons[joueurId];
  return true;
}

// Appelée après chaque couleur validée et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'choix' && tousOntRepondu(salle)) reveler(salle);
}

function resultats(salle) {
  return calculerResultats(salle.etatMode.reponses, questionCourante(salle));
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return resultats(salle).find((ligne) => ligne.id === joueurId)?.points ?? 0;
}

// Les brouillons des joueurs attendus qui n'ont pas validé sont validés ici. Un joueur
// qui n'a touché à aucun curseur n'a pas de brouillon : pas de réponse.
export function reveler(salle) {
  const { attendus, brouillons, reponses } = salle.etatMode;
  for (const joueurId of attendus) {
    if (!reponses[joueurId] && brouillons[joueurId]) reponses[joueurId] = { ...brouillons[joueurId], recuA: Date.now() };
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

// Le temps pour choisir est une option de l'hôte, qui ne change pas pendant la partie.
export function echeance(salle) {
  const dureeChoixMs = options.lire(salle).temps * 1000;
  return echeanceDePhase(salle, { choix: dureeChoixMs, revelation: DUREE_REVELATION_MS });
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'choix') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Le logo, champ par champ : jamais la cible avant la révélation.
function vueLogo(logo) {
  return { nom: logo.nom, fichier: logo.fichier, question: logo.question, zones: logo.zones };
}

// Ce que reçoit la TV : ni la cible ni les couleurs des joueurs avant la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'choix') return vueManche(salle);
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
    logo: vueLogo(questionCourante(salle)),
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueRevelation(salle) {
  const { attendus, reponses } = salle.etatMode;
  return {
    cible: questionCourante(salle).cible,
    resultats: resultats(salle),
    sansReponse: attendus.filter((joueurId) => !reponses[joueurId]),
    classement: classement(salle),
  };
}

// Écran du téléphone : jamais la cible (seulement sa saturation, nécessaire à l'aperçu),
// jamais la couleur d'un autre joueur. À la révélation, pas de couleur : elle est sur la TV.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion, attendus, depart, brouillons, reponses } = salle.etatMode;
  const logo = questionCourante(salle);
  const numeros = { numero: indexQuestion + 1, total: questions.length };
  const reponse = reponses[joueur.id];
  if (phase === 'choix') {
    const manche = { ...numeros, logo: vueLogo(logo), saturation: saturationDe(logo.cible) };
    if (!reponse) return { ecran: 'nuancier', ...manche, couleur: { ...(brouillons[joueur.id] ?? depart) } };
    return {
      ecran: 'couleur_validee',
      ...manche,
      couleur: { teinte: reponse.teinte, luminosite: reponse.luminosite },
      nbValides: Object.keys(reponses).length,
      nbAttendus: attendus.length,
    };
  }
  const ligne = resultats(salle).find((l) => l.id === joueur.id);
  return {
    ecran: 'resultat',
    ...numeros,
    ressemblance: ligne?.ressemblance ?? null,
    points: ligne?.points ?? 0,
    score: joueur.score,
    rang: rangDe(salle, joueur),
  };
}
