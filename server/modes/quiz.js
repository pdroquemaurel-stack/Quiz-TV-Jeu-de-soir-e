import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, listerAttendus, melanger, noterQuestionsVues, participe,
  passerAuPodium, phaseEnCours, rangDe, tirerQuestions, tousOntRepondu,
} from './commun.js';

export const id = 'quiz';
export const nom = 'Quiz';
export const regleCourte = '10 questions, 4 choix : plus tu réponds vite, plus tu marques.';
export const joueursMin = 2;

const NOMBRE_CHOIX = 4;
export const NOMBRE_QUESTIONS = 10;
export const DUREE_TRANSITION_MS = 2500;
export const DUREE_QUESTION_MS = 20000;
export const DUREE_REVELATION_MS = 8000;

// Annoncée par l'écran de transition avant chaque question.
const LIBELLES_CATEGORIE = {
  'art-litterature': 'Art et littérature',
  'cinema-tv': 'Cinéma et TV',
  gastronomie: 'Gastronomie',
  geographie: 'Géographie',
  histoire: 'Histoire',
  'langue-divers': 'Langue et divers',
  musique: 'Musique',
  nature: 'Nature',
  sciences: 'Sciences',
  sport: 'Sport',
};

export const banqueQuestions = JSON.parse(
  readFileSync(new URL('../../data/questions.json', import.meta.url), 'utf8'),
);

// points = arrondi(1000 - 500 × t / 20), avec t en secondes, borné entre 0 et 20 s.
export function calculerPoints(dureeMs) {
  const t = Math.min(Math.max(dureeMs, 0), DUREE_QUESTION_MS) / 1000;
  return Math.round(1000 - (500 * t) / 20);
}

// Copie de la question avec les réponses dans un nouvel ordre,
// et bonneReponse qui pointe toujours vers la même réponse.
export function melangerReponses(question) {
  const ordre = melanger([0, 1, 2, 3]);
  return {
    ...question,
    reponses: ordre.map((index) => question.reponses[index]),
    bonneReponse: ordre.indexOf(question.bonneReponse),
  };
}

// Une partie vise 4 questions faciles, 4 moyennes et 2 difficiles.
const REPARTITION = { 1: 4, 2: 4, 3: 2 };
const MAX_PAR_CATEGORIE = 2;

// Les questions jamais vues passent avant l'équilibre : on ne revoit une question
// que si la banque est épuisée. Dans chaque groupe, on assouplit les règles
// l'une après l'autre (difficulté, puis catégorie) jusqu'à avoir 10 questions.
export function tirerQuestionsEquilibrees(banque, questionsVues) {
  const ordre = tirerQuestions(banque, questionsVues, banque.length);
  const inedites = ordre.filter((question) => !questionsVues.includes(question.id));
  const choisies = [];
  const combien = (champ, valeur) => choisies.filter((question) => question[champ] === valeur).length;
  const categorieLibre = (question) => combien('categorie', question.categorie) < MAX_PAR_CATEGORIE;
  const difficulteLibre = (question) => combien('difficulte', question.difficulte) < REPARTITION[question.difficulte];
  const regles = [
    (question) => categorieLibre(question) && difficulteLibre(question),
    categorieLibre,
    () => true,
  ];
  for (const groupe of [inedites, ordre]) {
    for (const regle of regles) {
      for (const question of groupe) {
        if (choisies.length === NOMBRE_QUESTIONS) break;
        if (!choisies.includes(question) && regle(question)) choisies.push(question);
      }
    }
  }
  return melanger(choisies);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestionsEquilibrees(banqueQuestions, salle.questionsVues);
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions: questions.map(melangerReponses), historique: [] };
  demarrerTransition(salle, 0);
}

// Écran « Question 5/10 : Cinéma et TV » avant la question. Personne n'est encore
// attendu : les joueurs attendus et le chrono de 20 s partent du début de la question.
function demarrerTransition(salle, index) {
  salle.etatMode.phase = 'transition';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutTransitionA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = [];
}

function demarrerQuestion(salle) {
  salle.etatMode.phase = 'question';
  salle.etatMode.debutQuestionA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Renvoie true si la réponse est acceptée.
export function enregistrerReponse(salle, joueurId, choix) {
  if (phaseEnCours(salle) !== 'question' || !participe(salle, joueurId)) return false;
  if (salle.etatMode.reponses[joueurId]) return false;
  if (!Number.isInteger(choix) || choix < 0 || choix >= NOMBRE_CHOIX) return false;
  salle.etatMode.reponses[joueurId] = { choix, recuA: Date.now() };
  return true;
}

// Appelée après chaque réponse et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'question' && tousOntRepondu(salle)) reveler(salle);
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  if (!reponse || reponse.choix !== questionCourante(salle).bonneReponse) return 0;
  return calculerPoints(reponse.recuA - salle.etatMode.debutQuestionA);
}

export function reveler(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutRevelationA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
  salle.etatMode.historique.push(resumerQuestion(salle));
}

// Ce que les prix de fin de partie retiennent d'une question. Un joueur attendu
// qui s'est déconnecté sans répondre n'y figure pas.
function resumerQuestion(salle) {
  const { reponses, attendus, debutQuestionA } = salle.etatMode;
  const { texte, bonneReponse } = questionCourante(salle);
  const resume = { texte, attendus: [], reponses: {} };
  for (const joueur of salle.joueurs) {
    const reponse = reponses[joueur.id];
    if (!attendus.includes(joueur.id) || (!reponse && !joueur.connecte)) continue;
    resume.attendus.push(joueur.id);
    if (reponse) {
      resume.reponses[joueur.id] = {
        juste: reponse.choix === bonneReponse,
        dureeMs: reponse.recuA - debutQuestionA,
      };
    }
  }
  return resume;
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerTransition(salle, suivante);
  else passerAuPodium(salle);
}

// La bonne réponse reçue la première, ou null. À égalité, la première enregistrée.
export function reponseLaPlusRapide(reponses, bonneReponse, debutQuestionA) {
  let plusRapide = null;
  for (const [id, { choix, recuA }] of Object.entries(reponses)) {
    const dureeMs = recuA - debutQuestionA;
    if (choix === bonneReponse && (!plusRapide || dureeMs < plusRapide.dureeMs)) {
      plusRapide = { id, dureeMs };
    }
  }
  return plusRapide;
}

function plusRapideDeLaQuestion(salle) {
  const { reponses, debutQuestionA } = salle.etatMode;
  return reponseLaPlusRapide(reponses, questionCourante(salle).bonneReponse, debutQuestionA);
}

// « Suivant » de l'hôte. Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Heure à laquelle la phase en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'transition') return salle.etatMode.debutTransitionA + DUREE_TRANSITION_MS;
  if (phase === 'question') return salle.etatMode.debutQuestionA + DUREE_QUESTION_MS;
  if (phase === 'revelation') return salle.etatMode.debutRevelationA + DUREE_REVELATION_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'transition') demarrerQuestion(salle);
  else if (phase === 'question') reveler(salle);
  else if (phase === 'revelation') passerALaSuite(salle);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// Ce que reçoit la TV : seulement la question en cours, et sa bonne réponse
// uniquement à partir de la révélation.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'transition') return vueTransition(salle);
  if (phase === 'question') return vueQuestion(salle);
  if (phase === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle), prix: prixDeLaPartie(salle) };
  return {};
}

// Ni le texte de la question ni ses réponses : seulement sa catégorie.
function vueTransition(salle) {
  const { phase, questions, indexQuestion } = salle.etatMode;
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    categorie: LIBELLES_CATEGORIE[questionCourante(salle).categorie],
  };
}

function vueQuestion(salle) {
  const { phase, questions, indexQuestion, reponses } = salle.etatMode;
  const { texte, reponses: propositions } = questionCourante(salle);
  return {
    phase,
    numero: indexQuestion + 1,
    total: questions.length,
    question: { texte, reponses: propositions },
    ontRepondu: Object.keys(reponses),
    tempsRestantMs: Math.max(0, echeance(salle) - Date.now()),
  };
}

function vueRevelation(salle) {
  const nombreParChoix = new Array(NOMBRE_CHOIX).fill(0);
  for (const { choix } of Object.values(salle.etatMode.reponses)) nombreParChoix[choix]++;
  return {
    bonneReponse: questionCourante(salle).bonneReponse,
    nombreParChoix,
    classement: classement(salle),
    plusRapide: plusRapideDeLaQuestion(salle),
  };
}

// Écran du téléphone pendant une partie (le podium est commun à tous les modes).
export function vueJoueur(salle, joueur) {
  if (salle.etatMode.phase === 'transition' || !participe(salle, joueur.id)) {
    return { ecran: 'attente_question' };
  }
  if (salle.etatMode.phase === 'question') {
    const reponse = salle.etatMode.reponses[joueur.id];
    return reponse ? { ecran: 'reponse_envoyee', choix: reponse.choix } : { ecran: 'repondre' };
  }
  const points = pointsGagnes(salle, joueur.id);
  const aRepondu = joueur.id in salle.etatMode.reponses;
  const plusRapide = plusRapideDeLaQuestion(salle)?.id === joueur.id;
  return {
    ecran: 'resultat', juste: points > 0, aRepondu, points, plusRapide, rang: rangDe(salle, joueur),
  };
}

// ---------- Prix de fin de partie ----------

const MAX_PRIX = 4;
const SERIE_MIN = 3;
const SUSPENSE_MIN_MS = 15000;
const LUNE_MIN = 2;
const SOLO_ATTENDUS_MIN = 3;

function prixDeLaPartie(salle) {
  return calculerPrix(salle.etatMode.historique, salle.joueurs.map((joueur) => joueur.id));
}

// Les prix mérités, dans un ordre fixe, 4 au plus. Seuls les joueurs encore
// dans la salle (idsJoueurs) peuvent en gagner un. À égalité, tous le reçoivent.
// historique : [{ texte, attendus: [id], reponses: { id: { juste, dureeMs } } }]
export function calculerPrix(historique, idsJoueurs) {
  const bonnes = historique.flatMap(({ reponses }) => Object.entries(reponses)
    .filter(([id, reponse]) => reponse.juste && idsJoueurs.includes(id))
    .map(([id, { dureeMs }]) => ({ id, dureeMs })));
  const eclair = prixEclair(bonnes);
  const suspense = prixSuspense(bonnes);
  const prix = [
    eclair,
    prixSerie(historique, idsJoueurs),
    prixSolo(historique, idsJoueurs),
    prixPiege(historique),
    // Une seule bonne réponse tardive serait à la fois l'éclair et le suspense.
    suspense?.dureeMs === eclair?.dureeMs ? null : suspense,
    prixLune(historique, idsJoueurs),
  ];
  return prix.filter(Boolean).slice(0, MAX_PRIX);
}

// Les joueurs qui ont la plus grande valeur, et cette valeur. valeurs : Map id → nombre.
function meilleurs(valeurs) {
  const maximum = Math.max(0, ...valeurs.values());
  const ids = [...valeurs].filter(([, valeur]) => valeur === maximum).map(([id]) => id);
  return { ids, valeur: maximum };
}

// La bonne réponse la plus rapide de la partie.
function prixEclair(bonnes) {
  if (bonnes.length === 0) return null;
  const dureeMs = Math.min(...bonnes.map((bonne) => bonne.dureeMs));
  const ids = bonnes.filter((bonne) => bonne.dureeMs === dureeMs).map((bonne) => bonne.id);
  return { type: 'eclair', ids: [...new Set(ids)], dureeMs };
}

// La bonne réponse la plus tardive, si elle arrive après 15 s.
function prixSuspense(bonnes) {
  const tardives = bonnes.filter((bonne) => bonne.dureeMs >= SUSPENSE_MIN_MS);
  if (tardives.length === 0) return null;
  const dureeMs = Math.max(...tardives.map((bonne) => bonne.dureeMs));
  const ids = tardives.filter((bonne) => bonne.dureeMs === dureeMs).map((bonne) => bonne.id);
  return { type: 'suspense', ids: [...new Set(ids)], dureeMs };
}

// La plus longue suite de bonnes réponses. Une question non jouée coupe la série.
function prixSerie(historique, idsJoueurs) {
  const series = new Map();
  for (const id of idsJoueurs) {
    let enCours = 0;
    let meilleure = 0;
    for (const { reponses } of historique) {
      enCours = reponses[id]?.juste ? enCours + 1 : 0;
      meilleure = Math.max(meilleure, enCours);
    }
    series.set(id, meilleure);
  }
  const { ids, valeur } = meilleurs(series);
  return valeur >= SERIE_MIN ? { type: 'serie', ids, longueur: valeur } : null;
}

// Seule bonne réponse d'une question jouée à 3 ou plus : le plus de fois.
function prixSolo(historique, idsJoueurs) {
  const fois = new Map(idsJoueurs.map((id) => [id, 0]));
  for (const { attendus, reponses } of historique) {
    const justes = Object.keys(reponses).filter((id) => reponses[id].juste);
    if (attendus.length >= SOLO_ATTENDUS_MIN && justes.length === 1 && fois.has(justes[0])) {
      fois.set(justes[0], fois.get(justes[0]) + 1);
    }
  }
  const { ids, valeur } = meilleurs(fois);
  return valeur >= 1 ? { type: 'solo', ids, fois: valeur } : null;
}

// La question la plus ratée (une absence de réponse compte comme ratée),
// si moins de la moitié des joueurs l'ont trouvée. À égalité, la première.
function prixPiege(historique) {
  let piege = null;
  for (const { texte, attendus, reponses } of historique) {
    const justes = Object.values(reponses).filter((reponse) => reponse.juste).length;
    const rates = attendus.length - justes;
    if (attendus.length === 0 || justes * 2 >= attendus.length) continue;
    if (!piege || rates / attendus.length > piege.rates / piege.sur) {
      piege = { type: 'piege', texte, rates, sur: attendus.length };
    }
  }
  return piege;
}

// Le plus de questions sans réponse, 2 au moins.
function prixLune(historique, idsJoueurs) {
  const fois = new Map(idsJoueurs.map((id) => [id, 0]));
  for (const { attendus, reponses } of historique) {
    for (const id of attendus) {
      if (!reponses[id] && fois.has(id)) fois.set(id, fois.get(id) + 1);
    }
  }
  const { ids, valeur } = meilleurs(fois);
  return valeur >= LUNE_MIN ? { type: 'lune', ids, fois: valeur } : null;
}
