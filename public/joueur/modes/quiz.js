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

// ---------- Réglages de l'hôte : thèmes et niveaux ----------
// Le nombre de questions et le temps pour répondre sont les options communes (joueur.js).

// Tout est coché au départ : un appui coche ou décoche. Le dernier coché ne se décoche pas.
function boutonsACocher(options, selection, champ) {
  return options.map(({ id, libelle }) => {
    const coche = selection.includes(id);
    const suivants = coche ? selection.filter((autre) => autre !== id) : [...selection, id];
    const envoyer = suivants.length ? () => envoyerReglages({ [champ]: suivants }) : null;
    return boutonReglage(libelle, coche, envoyer);
  });
}

function remplirReglagesQuiz(reglages) {
  const { categories, niveaux, options, inedites } = reglages;
  document.getElementById('choix-themes').replaceChildren(
    ...boutonsACocher(options.categories, categories, 'categories'),
  );
  document.getElementById('choix-difficulte').replaceChildren(
    ...boutonsACocher(options.niveaux, niveaux, 'niveaux'),
  );
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
