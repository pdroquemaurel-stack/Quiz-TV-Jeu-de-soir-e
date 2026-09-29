// Mode Le compte est bon (docs/modes/le-compte-est-bon.md) : 6 plaques et une cible,
// chacun construit en secret un calcul qui tombe sur la cible, ou le plus près possible.
import { journaliser } from '../journal.js';
import {
  classement as classementCommun, creerOptions, echeanceDePhase, listerAttendus, melanger, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tousOntRepondu,
} from './commun.js';

export const id = 'le-compte-est-bon';
export const nom = 'Le compte est bon';
export const regleCourte = 'Atteins la cible avec les 6 plaques et les 4 opérations. Compte exact : 10 points, sinon le plus proche : 5.';
export const joueursMin = 2;

export const DUREE_RECHERCHE_MS = 60000;
export const DUREE_REVELATION_MS = 20000;
// 1 à 10 en deux exemplaires, et 25, 50, 75, 100.
export const JEU_DE_PLAQUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((n) => [n, n]).concat([25, 50, 75, 100]);
export const NB_PLAQUES = 6;
export const CIBLE_MIN = 101;
export const CIBLE_MAX = 999;
export const NB_ETAPES_MAX = NB_PLAQUES - 1;
export const NB_PROPOSITIONS_MAX = 3;
export const POINTS_EXACT = 10;
export const POINTS_PLUS_PROCHE = 5;
const OPERATIONS = ['+', '-', '*', '/'];

// ---------- Règles pures ----------

// Résultat d'une étape, ou null si elle est interdite : chaque résultat est un entier
// strictement positif (a et b le sont déjà).
function appliquer(a, op, b) {
  if (op === '+') return a + b;
  if (op === '*') return a * b;
  if (op === '-') return a > b ? a - b : null;
  if (op === '/') return a % b === 0 ? a / b : null;
  return null;
}

// Retire une fois la valeur des nombres disponibles. Faux si elle n'y est pas.
function prendre(disponibles, valeur) {
  const index = disponibles.indexOf(valeur);
  if (index === -1) return false;
  disponibles.splice(index, 1);
  return true;
}

// Rejoue un calcul ([{ a, op, b }]) à partir des plaques : chaque nombre est une plaque ou
// le résultat d'une étape précédente, pas encore utilisé. Renvoie les étapes avec leur
// resultat, calculé ici, ou null si le calcul ne respecte pas les règles.
export function rejouerCalcul(etapes, plaques) {
  if (!Array.isArray(etapes) || etapes.length > NB_ETAPES_MAX) return null;
  const disponibles = [...plaques];
  const rejouees = [];
  for (const etape of etapes) {
    const { a, op, b } = etape ?? {};
    if (!prendre(disponibles, a) || !prendre(disponibles, b)) return null;
    const resultat = appliquer(a, op, b);
    if (resultat === null) return null;
    disponibles.push(resultat);
    rejouees.push({ a, op, b, resultat });
  }
  return rejouees;
}

// Une étape qui ne sert à rien pour chercher : × 1, ÷ 1, ou un résultat égal à b
// (10 − 5 = 5, 25 ÷ 5 = 5) : on retrouve un nombre qu'on avait déjà.
function inutile(op, b, resultat) {
  if ((op === '*' || op === '/') && b === 1) return true;
  return (op === '-' || op === '/') && resultat === b;
}

// Cherche une solution en au plus `reste` étapes, en essayant chaque paire de nombres.
// echecs : les ensembles de nombres déjà explorés sans succès, pour ne pas les refaire.
function chercher(nombres, cible, reste, echecs) {
  const cle = [...nombres].sort((x, y) => x - y).join(',');
  if (echecs.has(cle)) return null;
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const a = Math.max(nombres[i], nombres[j]);
      const b = Math.min(nombres[i], nombres[j]);
      const autres = nombres.filter((_, k) => k !== i && k !== j);
      for (const op of OPERATIONS) {
        const resultat = appliquer(a, op, b);
        if (resultat === null || inutile(op, b, resultat)) continue;
        const etape = { a, op, b, resultat };
        if (resultat === cible) return [etape];
        if (reste > 1) {
          const suite = chercher([...autres, resultat], cible, reste - 1, echecs);
          if (suite) return [etape, ...suite];
        }
      }
    }
  }
  echecs.add(cle);
  return null;
}

// Une solution exacte la plus courte (d'abord en 1 étape, puis 2…), ou null.
export function resoudre(plaques, cible) {
  for (let max = 1; max <= NB_ETAPES_MAX; max++) {
    const etapes = chercher(plaques, cible, max, new Set());
    if (etapes) return etapes;
  }
  return null;
}

// 6 plaques tirées sans remise et une cible, retirées tant qu'il n'y a pas de solution
// exacte : { plaques, cible, solution }.
export function tirerManche() {
  for (;;) {
    const plaques = melanger(JEU_DE_PLAQUES).slice(0, NB_PLAQUES);
    const cible = CIBLE_MIN + Math.floor(Math.random() * (CIBLE_MAX - CIBLE_MIN + 1));
    const solution = resoudre(plaques, cible);
    if (solution) return { plaques, cible, solution };
  }
}

// La meilleure proposition : la plus proche de la cible, la première à égalité.
function meilleureProposition(liste, cible) {
  return liste.reduce((meilleure, proposition) => (
    Math.abs(cible - proposition.resultat) < Math.abs(cible - meilleure.resultat) ? proposition : meilleure
  ));
}

// Propositions ({ joueurId: [{ etapes, resultat, recuA }] }) → [{ id, resultat, ecart, etapes, points }],
// la meilleure de chaque joueur. Compte exact : 10 points à tous ceux qui l'ont ; sinon
// 5 points aux plus proches. Tri : du plus proche au plus loin, à égalité par ordre d'arrivée.
export function calculerResultats(propositions, cible) {
  const lignes = Object.entries(propositions)
    .filter(([, liste]) => liste.length > 0)
    .map(([joueurId, liste]) => {
      const { etapes, resultat, recuA } = meilleureProposition(liste, cible);
      return { id: joueurId, resultat, ecart: Math.abs(cible - resultat), etapes, points: 0, recuA };
    })
    .sort((x, y) => x.ecart - y.ecart || x.recuA - y.recuA);
  const plusPetitEcart = lignes[0]?.ecart;
  const points = plusPetitEcart === 0 ? POINTS_EXACT : POINTS_PLUS_PROCHE;
  return lignes.map(({ recuA, ...ligne }) => ({ ...ligne, points: ligne.ecart === plusPetitEcart ? points : 0 }));
}

// ---------- Options de l'hôte : nombre de manches et temps pour chercher (en s) ----------

const options = creerOptions(id, {
  longueurs: [3, 5, 7], unite: ['manche', 'manches'], temps: [45, DUREE_RECHERCHE_MS / 1000, 90],
});
export const { reglagesParDefaut, validerReglages, vueReglages } = options;

// ---------- Déroulé d'une partie ----------

// Les tirages sont faits au lancement. Une « question » est ici un tirage : { plaques, cible, solution }.
// La recherche des solutions bloque le serveur : sa durée est notée pour la surveiller sur Render.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const debut = Date.now();
  const questions = Array.from({ length: options.lire(salle).longueur }, tirerManche);
  journaliser(salle.code, `${questions.length} tirages du compte est bon en ${Date.now() - debut} ms`);
  salle.etatMode = { questions };
  demarrerManche(salle, 0);
}

function demarrerManche(salle, index) {
  salle.etatMode.phase = 'recherche';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.attendus = listerAttendus(salle);
  salle.etatMode.brouillons = {};
  salle.etatMode.propositions = {};
  salle.etatMode.reponses = {};
}

// Le joueur a fini au compte exact ou à sa dernière proposition possible.
function ajouterProposition(salle, joueurId, etapes) {
  const { propositions, reponses } = salle.etatMode;
  const resultat = etapes.at(-1).resultat;
  const liste = (propositions[joueurId] ??= []);
  liste.push({ etapes, resultat, recuA: Date.now() });
  if (resultat === questionCourante(salle).cible || liste.length === NB_PROPOSITIONS_MAX) {
    reponses[joueurId] = { recuA: Date.now() };
  }
}

// donnees : { action: 'brouillon' | 'proposer' | 'fini', etapes }. Un brouillon (à chaque étape)
// est gardé pour être proposé à la fin du chrono : on renvoie alors false, car il n'y a rien
// à diffuser. Renvoie true après une proposition ou « J'ai fini ».
export function enregistrerReponse(salle, joueurId, donnees) {
  if (phaseEnCours(salle) !== 'recherche' || !participe(salle, joueurId)) return false;
  const { brouillons, propositions, reponses } = salle.etatMode;
  if (reponses[joueurId]) return false;
  if (donnees?.action === 'fini') {
    if (!propositions[joueurId]) return false;
    reponses[joueurId] = { recuA: Date.now() };
    return true;
  }
  const etapes = rejouerCalcul(donnees?.etapes, questionCourante(salle).plaques);
  if (!etapes) return false;
  if (donnees.action === 'brouillon') {
    brouillons[joueurId] = etapes;
    return false;
  }
  if (donnees.action !== 'proposer' || etapes.length === 0) return false;
  ajouterProposition(salle, joueurId, etapes);
  return true;
}

// Appelée après chaque proposition, « J'ai fini » et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'recherche' && tousOntRepondu(salle)) reveler(salle);
}

function resultats(salle) {
  return calculerResultats(salle.etatMode.propositions, questionCourante(salle).cible);
}

// Les points n'existent qu'à partir de la révélation.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'revelation') return 0;
  return resultats(salle).find((ligne) => ligne.id === joueurId)?.points ?? 0;
}

// Le brouillon d'un attendu qui n'a pas fini devient une proposition, s'il a au moins une
// étape et qu'il ne redonne pas un résultat déjà proposé.
export function reveler(salle) {
  const { attendus, brouillons, propositions, reponses } = salle.etatMode;
  for (const joueurId of attendus) {
    const etapes = brouillons[joueurId];
    if (reponses[joueurId] || !etapes?.length) continue;
    const dejaPropose = (propositions[joueurId] ?? []).some((p) => p.resultat === etapes.at(-1).resultat);
    if (!dejaPropose) ajouterProposition(salle, joueurId, etapes);
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

// Ce que reçoit la TV : plaques et cible, mais ni les calculs des joueurs ni la solution
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
  const { plaques, cible } = questionCourante(salle);
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    plaques,
    cible,
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueRevelation(salle) {
  const { attendus, propositions } = salle.etatMode;
  return {
    resultats: resultats(salle),
    sansReponse: attendus.filter((joueurId) => !propositions[joueurId]),
    solution: questionCourante(salle).solution,
    classement: classement(salle),
  };
}

// Écran du téléphone : jamais le calcul d'un autre joueur, jamais la solution avant la révélation.
export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const { phase, questions, indexQuestion, attendus, brouillons, propositions, reponses } = salle.etatMode;
  const { plaques, cible, solution } = questionCourante(salle);
  const manche = { numero: indexQuestion + 1, total: questions.length, plaques, cible };
  const mesPropositions = (propositions[joueur.id] ?? []).map(({ resultat }) => ({ resultat, ecart: Math.abs(cible - resultat) }));
  if (phase === 'recherche') {
    if (!reponses[joueur.id]) {
      return { ecran: 'recherche', ...manche, etapes: brouillons[joueur.id] ?? [], propositions: mesPropositions };
    }
    return {
      ecran: 'fini',
      ...manche,
      propositions: mesPropositions,
      nbFinis: Object.keys(reponses).length,
      nbAttendus: attendus.length,
    };
  }
  const ligne = resultats(salle).find((l) => l.id === joueur.id);
  return {
    ecran: 'resultat',
    ...manche,
    resultat: ligne?.resultat ?? null,
    ecart: ligne?.ecart ?? null,
    etapes: ligne?.etapes ?? [],
    points: ligne?.points ?? 0,
    solution,
    rang: rangDe(salle, joueur),
  };
}
