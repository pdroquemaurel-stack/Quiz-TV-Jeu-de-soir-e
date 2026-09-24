// Registre des modes de jeu : salles.js et index.js ne passent que par lui.
import * as estimation from './estimation.js';
import * as quiDeNous from './qui-de-nous.js';
import * as quiz from './quiz.js';
import * as undercover from './undercover.js';

export const modes = {
  quiz, estimation, 'qui-de-nous': quiDeNous, undercover,
};

// Modes prévus mais pas encore codés : affichés grisés (« Bientôt »), jamais choisis.
// Quand un mode est codé, il quitte cette liste pour entrer dans le registre.
export const modesAVenir = [
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
