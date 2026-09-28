import { readFileSync } from 'node:fs';
import {
  classement as classementCommun, echeanceDePhase, listerAttendus, melanger, noterQuestionsVues,
  optionsParDefaut, participe, phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe,
  tempsRestantMs, tirerQuestions, tousOntRepondu, validerOptions, vueOptions,
} from './commun.js';

export const id = 'quiz';
export const nom = 'Quiz';
export const regleCourte = '4 choix : plus tu réponds vite, plus tu marques. Réfléchir est permis.';
export const joueursMin = 2;

const NOMBRE_CHOIX = 4;
export const NOMBRE_QUESTIONS = 10;
export const DUREE_TRANSITION_MS = 2500;
export const DUREE_QUESTION_MS = 20000;
export const DUREE_REVELATION_MS = 8000;

// Annoncée par l'écran de transition avant chaque question, et proposée à l'hôte.
export const LIBELLES_CATEGORIE = {
  geographie: 'Géographie',
  histoire: 'Histoire',
  sciences: 'Sciences',
  nature: 'Nature',
  'art-litterature': 'Art et littérature',
  'cinema-tv': 'Cinéma et TV',
  musique: 'Musique',
  sport: 'Sport',
  gastronomie: 'Gastronomie',
  'langue-divers': 'Langue et divers',
  'maths-logique': 'Maths et logique',
};

// Niveaux que l'hôte coche ou décoche : la difficulté (1 à 3) des questions.
export const NIVEAUX = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };

// Nombre de questions de chaque difficulté dans une partie, selon les niveaux cochés.
export const REPARTITIONS = {
  '1,2,3': { 1: 4, 2: 4, 3: 2 },
  '1,2': { 1: 6, 2: 4 },
  '2,3': { 2: 5, 3: 5 },
  '1,3': { 1: 5, 3: 5 },
  1: { 1: 10 },
  2: { 2: 10 },
  3: { 3: 10 },
};

// « Tous niveaux », « Facile + Moyen », « Difficile ».
export function libelleNiveaux(niveaux) {
  if (niveaux.length === Object.keys(NIVEAUX).length) return 'Tous niveaux';
  return niveaux.map((niveau) => NIVEAUX[niveau]).join(' + ');
}

export const banqueQuestions = JSON.parse(
  readFileSync(new URL('../../data/questions.json', import.meta.url), 'utf8'),
);

// points = arrondi(1000 - 500 × t / T), avec t le temps de réponse borné entre 0 et T,
// et T le temps pour répondre (20 s par défaut, une option de l'hôte).
export function calculerPoints(dureeMs, dureeQuestionMs = DUREE_QUESTION_MS) {
  const t = Math.min(Math.max(dureeMs, 0), dureeQuestionMs);
  return Math.round(1000 - (500 * t) / dureeQuestionMs);
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

// ---------- Réglages de l'hôte : thèmes, niveaux, nombre de questions et temps pour répondre ----------

export const OPTIONS = {
  longueurs: [5, NOMBRE_QUESTIONS, 15], unite: ['question', 'questions'], temps: [10, DUREE_QUESTION_MS / 1000, 30],
};

// Par défaut, tout est coché : l'hôte décoche ce qu'il ne veut pas.
export function reglagesParDefaut() {
  return { categories: Object.keys(LIBELLES_CATEGORIE), niveaux: [1, 2, 3], ...optionsParDefaut(OPTIONS) };
}

// Une liste non vide d'éléments connus, remise dans l'ordre de la référence et sans doublon, ou null.
function listeConnue(liste, reference) {
  if (!Array.isArray(liste) || liste.length === 0 || !liste.every((element) => reference.includes(element))) {
    return null;
  }
  return reference.filter((element) => liste.includes(element));
}

// Renvoie des réglages propres (thèmes et niveaux dans l'ordre des listes), ou null.
export function validerReglages(donnees) {
  const categories = listeConnue(donnees?.categories, Object.keys(LIBELLES_CATEGORIE));
  const niveaux = listeConnue(donnees?.niveaux, Object.keys(NIVEAUX).map(Number));
  const options = validerOptions(OPTIONS, donnees);
  return categories && niveaux && options ? { categories, niveaux, ...options } : null;
}

function reglagesDe(salle) {
  return salle.reglagesMode?.quiz ?? reglagesParDefaut();
}

// « Tous les thèmes · Tous niveaux », « Cinéma et TV · Facile + Moyen », « 4 thèmes · Difficile ».
function resumerThemes({ categories, niveaux }) {
  const toutes = categories.length === Object.keys(LIBELLES_CATEGORIE).length;
  let themes = `${categories.length} thèmes`;
  if (toutes) themes = 'Tous les thèmes';
  else if (categories.length <= 2) themes = categories.map((id) => LIBELLES_CATEGORIE[id]).join(' + ');
  return `${themes} · ${libelleNiveaux(niveaux)}`;
}

const dansLesThemes = (reglages) => (question) => reglages.categories.includes(question.categorie);
const dansLeChoix = (reglages) => (question) => dansLesThemes(reglages)(question)
  && reglages.niveaux.includes(question.difficulte);

export function compterInedites(banque, questionsVues, reglages) {
  return banque.filter((question) => dansLeChoix(reglages)(question) && !questionsVues.includes(question.id)).length;
}

// Public : ni question ni réponse, seulement le choix et le nombre de questions jamais vues.
// « Tous les thèmes · Tous niveaux · 10 questions · 20 s ».
export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  const { resume, options } = vueOptions(OPTIONS, reglages);
  return {
    ...reglages,
    valeurs: reglages,
    titre: 'Questions',
    resume: `${resumerThemes(reglages)} · ${resume}`,
    inedites: compterInedites(banqueQuestions, salle.questionsVues, reglages),
    options: {
      ...options,
      categories: Object.entries(LIBELLES_CATEGORIE).map(([id, libelle]) => ({ id, libelle })),
      niveaux: Object.entries(NIVEAUX).map(([niveau, libelle]) => ({ id: Number(niveau), libelle })),
    },
  };
}

// ---------- Tirage ----------

// Pour 10 questions : au plus 2 par catégorie, davantage quand l'hôte a choisi peu de thèmes.
const MAX_PAR_CATEGORIE = 2;

// La répartition des 10 questions (REPARTITIONS), mise à l'échelle du nombre de questions :
// arrondie en dessous, puis le reste va aux niveaux les plus faciles (5/5 sur 5 questions → 3/2).
export function repartitionPour(niveaux, nombre) {
  const repartition = {};
  for (const [niveau, sur10] of Object.entries(REPARTITIONS[niveaux.join(',')])) {
    repartition[niveau] = Math.floor((sur10 * nombre) / NOMBRE_QUESTIONS);
  }
  let reste = nombre - Object.values(repartition).reduce((total, n) => total + n, 0);
  for (const niveau of Object.keys(repartition)) {
    if (reste === 0) break;
    repartition[niveau]++;
    reste--;
  }
  return repartition;
}

// Groupes, dans l'ordre : les inédites du choix de l'hôte, puis ses déjà vues
// (les plus anciennes d'abord). Si le choix ne compte pas assez de questions : les thèmes
// choisis toutes difficultés confondues, puis toute la banque. Dans chaque groupe,
// on assouplit les règles l'une après l'autre (difficulté, puis catégorie).
export function tirerQuestionsEquilibrees(banque, questionsVues, reglages = reglagesParDefaut()) {
  const nombre = reglages.longueur;
  const repartition = repartitionPour(reglages.niveaux, nombre);
  const maxParCategorie = Math.max(
    Math.ceil((MAX_PAR_CATEGORIE * nombre) / NOMBRE_QUESTIONS),
    Math.ceil(nombre / reglages.categories.length),
  );
  const ordre = tirerQuestions(banque, questionsVues, banque.length);
  const choix = ordre.filter(dansLeChoix(reglages));
  const groupes = [
    choix.filter((question) => !questionsVues.includes(question.id)),
    choix,
    ordre.filter(dansLesThemes(reglages)),
    ordre,
  ];
  const choisies = [];
  const combien = (champ, valeur) => choisies.filter((question) => question[champ] === valeur).length;
  const categorieLibre = (question) => combien('categorie', question.categorie) < maxParCategorie;
  const difficulteLibre = (question) => combien('difficulte', question.difficulte) < (repartition[question.difficulte] ?? 0);
  const regles = [
    (question) => categorieLibre(question) && difficulteLibre(question),
    categorieLibre,
    () => true,
  ];
  for (const groupe of groupes) {
    for (const regle of regles) {
      for (const question of groupe) {
        if (choisies.length === nombre) break;
        if (!choisies.includes(question) && regle(question)) choisies.push(question);
      }
    }
  }
  return melanger(choisies);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const questions = tirerQuestionsEquilibrees(banqueQuestions, salle.questionsVues, reglagesDe(salle));
  noterQuestionsVues(salle, questions);
  salle.etatMode = { questions: questions.map(melangerReponses), historique: [] };
  demarrerTransition(salle, 0);
}

// Écran « Question 5/10 : Cinéma et TV » avant la question. Personne n'est encore
// attendu : les joueurs attendus et le chrono de 20 s partent du début de la question.
function demarrerTransition(salle, index) {
  salle.etatMode.phase = 'transition';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = [];
}

// debutQuestionA reste après la question : il mesure le temps de chaque réponse.
function demarrerQuestion(salle) {
  salle.etatMode.phase = 'question';
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.debutQuestionA = salle.etatMode.debutPhaseA;
  salle.etatMode.reponses = {};
  salle.etatMode.attendus = listerAttendus(salle);
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

// Le temps pour répondre, une option de l'hôte, qui ne change pas pendant la partie.
function dureeQuestionMs(salle) {
  return reglagesDe(salle).temps * 1000;
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  if (!reponse || reponse.choix !== questionCourante(salle).bonneReponse) return 0;
  return calculerPoints(reponse.recuA - salle.etatMode.debutQuestionA, dureeQuestionMs(salle));
}

export function reveler(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
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
  questionSuivanteOuPodium(salle, demarrerTransition);
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

export function echeance(salle) {
  return echeanceDePhase(salle, {
    transition: DUREE_TRANSITION_MS, question: dureeQuestionMs(salle), revelation: DUREE_REVELATION_MS,
  });
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
    tempsRestantMs: tempsRestantMs(salle, echeance),
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
// Suspense : une bonne réponse dans le dernier quart du temps (après 15 s sur 20).
const SUSPENSE_PART_DU_TEMPS = 3 / 4;
const LUNE_MIN = 2;
const SOLO_ATTENDUS_MIN = 3;

function prixDeLaPartie(salle) {
  return calculerPrix(salle.etatMode.historique, salle.joueurs.map((joueur) => joueur.id), dureeQuestionMs(salle));
}

// Les prix mérités, dans un ordre fixe, 4 au plus. Seuls les joueurs encore
// dans la salle (idsJoueurs) peuvent en gagner un. À égalité, tous le reçoivent.
// historique : [{ texte, attendus: [id], reponses: { id: { juste, dureeMs } } }]
export function calculerPrix(historique, idsJoueurs, dureeQuestionMs = DUREE_QUESTION_MS) {
  const bonnes = historique.flatMap(({ reponses }) => Object.entries(reponses)
    .filter(([id, reponse]) => reponse.juste && idsJoueurs.includes(id))
    .map(([id, { dureeMs }]) => ({ id, dureeMs })));
  const eclair = prixEclair(bonnes);
  const suspense = prixSuspense(bonnes, dureeQuestionMs * SUSPENSE_PART_DU_TEMPS);
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

// La bonne réponse la plus tardive, si elle arrive après suspenseMinMs (15 s sur 20).
function prixSuspense(bonnes, suspenseMinMs) {
  const tardives = bonnes.filter((bonne) => bonne.dureeMs >= suspenseMinMs);
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
