// Écrans du quiz sur le téléphone. socket et texteRang viennent de joueur.js.

for (const bouton of document.querySelectorAll('[data-choix]')) {
  bouton.addEventListener('click', () => {
    marquerAppui(bouton);
    socket.emit('joueur:repondre', Number(bouton.dataset.choix));
  });
}

document.getElementById('bouton-suivant').addEventListener('click', envoyerSuivant);

function afficherReponseEnvoyeeQuiz(vue) {
  document.getElementById('choix-envoye').className =
    `choix choix-envoye rebond choix-${vue.choix} fond-choix-${vue.choix}`;
}

function afficherResultatQuiz(vue) {
  const resultat = document.getElementById('resultat');
  if (vue.juste) resultat.textContent = `Bonne réponse, +${vue.points}`;
  else resultat.textContent = vue.aRepondu ? 'Raté' : 'Pas de réponse';
  resultat.classList.toggle('juste', vue.juste);
  document.getElementById('plus-rapide-resultat').hidden = !vue.plusRapide;
  document.getElementById('score-resultat').textContent = vue.score;
  document.getElementById('rang-resultat').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant').hidden = !vue.estHote;
}

// ---------- Réglages de l'hôte : thèmes et difficulté ----------

// Les réglages reçus du serveur : un appui n'en change qu'une partie.
let reglagesQuiz = null;

function reglerQuestions(changement) {
  const { categories, difficulte } = reglagesQuiz;
  socket.emit('hote:reglerMode', { categories, difficulte, ...changement });
}

// changement null : l'appui ne change rien (dernier thème coché).
function boutonReglageQuiz(texte, choisi, changement) {
  return boutonReglage(texte, choisi, changement && (() => reglerQuestions(changement)));
}

// « Tous » coché, un appui sur un thème ne garde que lui. Le dernier thème ne se décoche pas.
function remplirReglagesQuiz(reglages) {
  reglagesQuiz = reglages;
  const { categories, difficulte, options, inedites } = reglages;
  const toutes = categories.length === options.categories.length;
  const themes = options.categories.map(({ id, libelle }) => {
    const choisi = !toutes && categories.includes(id);
    let suivantes = choisi ? categories.filter((autre) => autre !== id) : [...categories, id];
    if (toutes) suivantes = [id];
    return boutonReglageQuiz(libelle, choisi, suivantes.length ? { categories: suivantes } : null);
  });
  const tous = boutonReglageQuiz('Tous', toutes, { categories: options.categories.map(({ id }) => id) });
  document.getElementById('choix-themes').replaceChildren(tous, ...themes);
  document.getElementById('choix-difficulte').replaceChildren(...options.difficultes.map(
    ({ id, libelle }) => boutonReglageQuiz(libelle, id === difficulte, { difficulte: id }),
  ));
  document.getElementById('inedites-reglages').textContent = texteInedites(inedites);
}

// Moins de 10 : la partie reprendra des questions déjà vues.
function texteInedites(nombre) {
  const jamaisVues = nombre > 1 ? `${nombre} questions jamais vues` : `${nombre} question jamais vue`;
  return nombre < 10 ? `Seulement ${jamaisVues} : certaines reviendront` : jamaisVues;
}

modesJoueur.quiz = {
  remplirReglages: remplirReglagesQuiz,
  repondre: () => {},
  reponse_envoyee: afficherReponseEnvoyeeQuiz,
  resultat: afficherResultatQuiz,
};
