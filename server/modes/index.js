// Registre des modes de jeu : salles.js et index.js ne passent que par lui.
import * as blindTest from './blind-test.js';
import * as bluff from './bluff.js';
import * as estimation from './estimation.js';
import * as geoquiz from './geoquiz.js';
import * as legende from './legende.js';
import * as memeReponse from './meme-reponse.js';
import * as motLePlusLong from './mot-le-plus-long.js';
import * as quiDeNous from './qui-de-nous.js';
import * as quiz from './quiz.js';
import * as undercover from './undercover.js';

export const modes = {
  quiz, estimation, 'qui-de-nous': quiDeNous, undercover, 'meme-reponse': memeReponse, bluff, legende, 'blind-test': blindTest, geoquiz,
  'mot-le-plus-long': motLePlusLong,
};

// Modes prévus mais pas encore codés : affichés grisés (« Bientôt »), jamais choisis.
// Quand un mode est codé, il quitte cette liste pour entrer dans le registre.
export const modesAVenir = [];
