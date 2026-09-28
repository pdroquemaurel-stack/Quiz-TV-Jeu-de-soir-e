// Écrans du Mot le plus long sur le téléphone. socket, texteRang, marquerEnvoi et
// envoyerSuivant viennent de joueur.js.
// Le mot se forme en touchant les tuiles des lettres tirées : pas de clavier, donc ni
// correcteur, ni accent, ni lettre absente. Le serveur vérifie tout de même le mot.

const NB_CASES = 9;
const TEXTES_RAISONS = { lettres: 'Lettres absentes', dictionnaire: 'Pas dans le dictionnaire' };

const elementMot = document.getElementById('mlpl-mot');
const elementTuiles = document.getElementById('mlpl-tuiles');
const boutonValiderMot = document.getElementById('mlpl-valider');

// Les lettres de la manche affichée, et les numéros des tuiles touchées, dans l'ordre du mot.
let lettresManche = [];
let tuilesPrises = [];
// Manche affichée : le mot n'est repris du serveur qu'au changement de manche (ou au
// rechargement de la page), pas à chaque mise à jour (un autre joueur valide…).
let mancheAfficheeMot = null;

function motEnCours() {
  return tuilesPrises.map((numero) => lettresManche[numero]).join('');
}

// Le mot en cases : les lettres posées, puis des cases vides jusqu'à 9.
function dessinerMot(element, mot) {
  element.replaceChildren();
  for (let i = 0; i < Math.max(NB_CASES, mot.length); i++) {
    const caseMot = document.createElement('span');
    caseMot.className = 'mlpl-case';
    caseMot.textContent = mot[i] ?? '';
    caseMot.classList.toggle('vide', !mot[i]);
    element.append(caseMot);
  }
}

function dessinerTuiles() {
  elementTuiles.replaceChildren();
  lettresManche.forEach((lettre, numero) => {
    const tuile = document.createElement('button');
    tuile.className = 'mlpl-tuile';
    tuile.textContent = lettre;
    tuile.disabled = tuilesPrises.includes(numero);
    tuile.addEventListener('click', () => changerMot([...tuilesPrises, numero]));
    elementTuiles.append(tuile);
  });
}

function redessiner() {
  dessinerMot(elementMot, motEnCours());
  dessinerTuiles();
  boutonValiderMot.disabled = tuilesPrises.length < 2;
}

// Chaque changement part au serveur comme brouillon : il le validera à la fin du chrono.
function changerMot(nouvellesTuiles) {
  tuilesPrises = nouvellesTuiles;
  redessiner();
  socket.emit('joueur:repondre', { mot: motEnCours(), valide: false });
}

// Après un rechargement, le brouillon du serveur redevient une suite de tuiles :
// chaque lettre prend la première tuile libre qui la porte.
function tuilesDuMot(mot) {
  const prises = [];
  for (const lettre of mot) {
    const numero = lettresManche.findIndex((l, n) => l === lettre && !prises.includes(n));
    if (numero >= 0) prises.push(numero);
  }
  return prises;
}

document.getElementById('mlpl-retirer').addEventListener('click', () => {
  if (tuilesPrises.length) changerMot(tuilesPrises.slice(0, -1));
});
document.getElementById('mlpl-effacer').addEventListener('click', () => {
  if (tuilesPrises.length) changerMot([]);
});
boutonValiderMot.addEventListener('click', () => {
  if (tuilesPrises.length < 2) return;
  marquerEnvoi(boutonValiderMot);
  socket.emit('joueur:repondre', { mot: motEnCours(), valide: true });
});
document.getElementById('bouton-suivant-mlpl').addEventListener('click', envoyerSuivant);

function afficherRecherche(vue) {
  document.getElementById('mlpl-manche').textContent = `Manche ${vue.numero}/${vue.total}`;
  const manche = `${vue.numero} ${vue.lettres.join('')}`;
  if (manche !== mancheAfficheeMot) {
    mancheAfficheeMot = manche;
    lettresManche = vue.lettres;
    tuilesPrises = tuilesDuMot(vue.mot);
  }
  redessiner();
}

function afficherMotValide(vue) {
  dessinerMot(document.getElementById('mlpl-mot-valide'), vue.mot);
  document.getElementById('mlpl-attente').textContent =
    `En attente des autres joueurs… (${vue.nbValides}/${vue.nbAttendus})`;
}

function texteResultat(vue) {
  if (vue.mot === null) return 'Pas de mot, 0 point';
  if (!vue.valide) return '0 point';
  if (vue.points > 0) return `+${vue.points}, le plus long !`;
  return '0 point : il y avait plus long';
}

function afficherResultatMot(vue) {
  dessinerMot(document.getElementById('mlpl-mot-resultat'), vue.mot ?? '');
  const validite = document.getElementById('mlpl-validite');
  validite.textContent = vue.valide ? 'Valide ✓' : (TEXTES_RAISONS[vue.raison] ?? '');
  validite.classList.toggle('juste', vue.valide);
  const points = document.getElementById('mlpl-points');
  points.textContent = texteResultat(vue);
  points.classList.toggle('juste', vue.points > 0);
  document.getElementById('mlpl-meilleur').textContent =
    `Le plus long possible : ${vue.meilleur} (${vue.meilleur.length} lettres)`;
  document.getElementById('score-mlpl').textContent = vue.score;
  document.getElementById('rang-mlpl').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-mlpl').hidden = !vue.estHote;
}

// Tout autre écran clôt la manche : la prochaine recherche repart d'un mot vide,
// même si c'est encore « manche 1 » avec les mêmes lettres (peu probable, mais possible).
socket.on('joueur:etat', (vue) => {
  if (vue.ecran !== 'recherche') mancheAfficheeMot = null;
});

// Les options de l'hôte (manches et temps) sont les options communes, remplies par joueur.js.
modesJoueur['mot-le-plus-long'] = {
  recherche: afficherRecherche,
  mot_valide: afficherMotValide,
  resultat: afficherResultatMot,
};
