const NOMBRE_CHOIX = 4;
// Forfait provisoire : les points dégressifs arrivent en tranche 4.
const POINTS_BONNE_REPONSE = 1000;

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

export function tousOntRepondu(salle) {
  if (salle.etat !== 'question') return false;
  return salle.joueurs
    .filter((joueur) => joueur.connecte)
    .every((joueur) => salle.etatMode.reponses[joueur.id]);
}

function pointsGagnes(salle, joueurId) {
  const reponse = salle.etatMode.reponses[joueurId];
  const juste = reponse && reponse.choix === questionCourante(salle).bonneReponse;
  return juste ? POINTS_BONNE_REPONSE : 0;
}

export function reveler(salle) {
  salle.etat = 'revelation';
  for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
}

export function passerALaSuite(salle) {
  const suivante = salle.etatMode.indexQuestion + 1;
  if (suivante < salle.etatMode.questions.length) demarrerQuestion(salle, suivante);
  else salle.etat = 'podium';
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

// Tri simple par score. Rangs et ex æquo : tranche 4.
function classement(salle) {
  return [...salle.joueurs]
    .sort((a, b) => b.score - a.score)
    .map((joueur) => ({
      id: joueur.id,
      pseudo: joueur.pseudo,
      couleur: joueur.couleur,
      score: joueur.score,
      points: pointsGagnes(salle, joueur.id),
    }));
}

export function vueJoueurQuiz(salle, joueur) {
  if (salle.etat === 'question') {
    const reponse = salle.etatMode.reponses[joueur.id];
    return reponse ? { ecran: 'reponse_envoyee', choix: reponse.choix } : { ecran: 'repondre' };
  }
  if (salle.etat === 'revelation') {
    const points = pointsGagnes(salle, joueur.id);
    return { ecran: 'resultat', juste: points > 0, points };
  }
  return { ecran: 'fin' };
}
