// Registre des modes de jeu : salles.js et index.js ne passent que par lui.
import * as quiz from './quiz.js';

export const modes = { quiz };

// Modes prévus mais pas encore codés : affichés grisés (« Bientôt »), jamais choisis.
// Quand un mode est codé, il quitte cette liste pour entrer dans le registre.
export const modesAVenir = [
  {
    id: 'estimation',
    nom: 'Estimation',
    regleCourte: 'Chacun saisit un nombre, le plus proche gagne.',
    joueursMin: 3,
  },
  {
    id: 'qui-de-nous',
    nom: 'Qui de nous ?',
    regleCourte: 'Chacun vote pour un joueur, la TV affiche les résultats.',
    joueursMin: 4,
  },
  {
    id: 'undercover',
    nom: 'Undercover',
    regleCourte: "Un joueur a un mot différent : démasquez l'intrus.",
    joueursMin: 4,
  },
  {
    id: 'meme-reponse',
    nom: 'Même réponse',
    regleCourte: 'Des points si on donne la même réponse que les autres.',
    joueursMin: 3,
  },
  {
    id: 'bluff',
    nom: 'Le bluff',
    regleCourte: 'Inventez une fausse réponse, trouvez la vraie.',
    joueursMin: 4,
  },
];
