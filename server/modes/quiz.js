const NOMBRE_CHOIX = 4;
export const DUREE_QUESTION_MS = 20000;
export const DUREE_REVELATION_MS = 8000;

// Provisoire : remplacées par questions.json en tranche 5.
export const QUESTIONS_PROVISOIRES = [
  {
    id: 'q0001',
    texte: "Quelle est la capitale de l'Australie ?",
    reponses: ['Sydney', 'Canberra', 'Melbourne', 'Perth'],
    bonneReponse: 1,
    categorie: 'geographie',
    difficulte: 2,
  },
  {
    id: 'q0002',
    texte: 'Combien de pattes a une araignée ?',
    reponses: ['Six', 'Dix', 'Douze', 'Huit'],
    bonneReponse: 3,
    categorie: 'nature',
    difficulte: 1,
  },
  {
    id: 'q0003',
    texte: 'Qui a peint « La Joconde » ?',
    reponses: ['Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Botticelli'],
    bonneReponse: 0,
    categorie: 'art',
    difficulte: 1,
  },
];

// points = arrondi(1000 - 500 × t / 20), avec t en secondes, borné entre 0 et 20 s.
export function calculerPoints(dureeMs) {
  const t = Math.min(Math.max(dureeMs, 0), DUREE_QUESTION_MS) / 1000;
  return Math.round(1000 - (500 * t) / 20);
}

export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  salle.etatMode = { questions: [...QUESTIONS_PROVISOIRES] };
  demarrerQuestion(salle, 0);
}

function demarrerQuestion(salle, index) {
  salle.etat = 'question';
  salle.etatMode.indexQuestion = index;
  salle.etatMode.debutQuestionA = Date.now();
  salle.etatMode.reponses = {};
  // Seuls les joueurs connectés au début de la manche sont attendus.
  salle.etatMode.attendus = salle.joueurs
    .filter((joueur) => joueur.connecte)
    .map((joueur) => joueur.id);
}

function questionCourante(salle) {
  return salle.etatMode.questions[salle.etatMode.indexQuestion];
}

// Renvoie true si la réponse est acceptée.
export function enregistrerReponse(salle, joueurId, choix) {
  if (salle.etat !== 'question' || salle.etatMode.reponses[joueurId]) return false;
  if (!Number.isInteger(choix) || choix < 0 || choix >= NOMBRE_CHOIX) return false;
  salle.etatMode.reponses[joueurId] = { choix, recuA: Date.now() };
  return true;
}

// Vrai quand tous les joueurs attendus encore connectés ont répondu.
export function tousOntRepondu(salle) {
  if (salle.etat !== 'question') return false;
  const { attendus, reponses } = salle.etatMode;
  return salle.joueurs
    .filter((joueur) => joueur.connecte && attendus.includes(joueur.id))
    .every((joueur) => reponses[joueur.id]);
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  if (!reponse || reponse.choix !== questionCourante(salle).bonneReponse) return 0;
  return calculerPoints(reponse.recuA - salle.etatMode.debutQuestionA);
}

export function reveler(salle) {
  salle.etat = 'revelation';
  salle.etatMode.debutRevelationA = Date.now();
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else salle.etat = 'podium';
}

// Heure à laquelle l'étape en cours se termine d'elle-même, ou null.
export function echeance(salle) {
  if (salle.etat === 'question') return salle.etatMode.debutQuestionA + DUREE_QUESTION_MS;
  if (salle.etat === 'revelation') return salle.etatMode.debutRevelationA + DUREE_REVELATION_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  if (salle.etat === 'question') reveler(salle);
  else if (salle.etat === 'revelation') passerALaSuite(salle);
}

// Ce que reçoit la TV : seulement la question en cours, et sa bonne réponse
// uniquement à partir de la révélation.
export function vueTvQuiz(salle) {
  if (salle.etat === 'question') return vueQuestion(salle);
  if (salle.etat === 'revelation') return { ...vueQuestion(salle), ...vueRevelation(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueQuestion(salle) {
  const { questions, indexQuestion, reponses } = salle.etatMode;
  const { texte, reponses: propositions } = questionCourante(salle);
  return {
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
  };
}

// Ex æquo : même rang, et le rang suivant est sauté (1, 1, 3).
function rangDe(salle, joueur) {
  return 1 + salle.joueurs.filter((autre) => autre.score > joueur.score).length;
}

// Le tri est stable : à égalité, l'ordre d'arrivée est conservé.
export function classement(salle) {
  return [...salle.joueurs]
    .sort((a, b) => b.score - a.score)
    .map((joueur) => ({
      id: joueur.id,
      pseudo: joueur.pseudo,
      couleur: joueur.couleur,
      score: joueur.score,
      rang: rangDe(salle, joueur),
      points: pointsGagnes(salle, joueur.id),
    }));
}

export function vueJoueurQuiz(salle, joueur) {
  if (salle.etat === 'question') {
    const reponse = salle.etatMode.reponses[joueur.id];
    return reponse ? { ecran: 'reponse_envoyee', choix: reponse.choix } : { ecran: 'repondre' };
  }
  const rang = rangDe(salle, joueur);
  if (salle.etat === 'revelation') {
    const points = pointsGagnes(salle, joueur.id);
    return { ecran: 'resultat', juste: points > 0, points, rang };
  }
  return { ecran: 'fin', rang };
}
