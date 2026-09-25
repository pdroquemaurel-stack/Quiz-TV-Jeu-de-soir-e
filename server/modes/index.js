// Registre des modes de jeu : salles.js et index.js ne passent que par lui.
import * as estimation from './estimation.js';
import * as memeReponse from './meme-reponse.js';
import * as quiDeNous from './qui-de-nous.js';
import * as quiz from './quiz.js';
import * as undercover from './undercover.js';

export const modes = {
  quiz, estimation, 'qui-de-nous': quiDeNous, undercover, 'meme-reponse': memeReponse,
};

// Modes prévus mais pas encore codés : affichés grisés (« Bientôt »), jamais choisis.
// Quand un mode est codé, il quitte cette liste pour entrer dans le registre.
export const modesAVenir = [
  {
    id: 'bluff',
    nom: 'Le bluff',
    regleCourte: 'Inventez une fausse réponse, trouvez la vraie.',
    joueursMin: 4,
  },
];
