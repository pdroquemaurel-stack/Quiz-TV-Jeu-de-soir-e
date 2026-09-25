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

modesJoueur.quiz = {
  repondre: () => {},
  reponse_envoyee: afficherReponseEnvoyeeQuiz,
  resultat: afficherResultatQuiz,
};
