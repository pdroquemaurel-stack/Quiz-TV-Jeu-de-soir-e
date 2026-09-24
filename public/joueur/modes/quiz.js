// Écrans du quiz sur le téléphone. socket et texteRang viennent de joueur.js.

for (const bouton of document.querySelectorAll('[data-choix]')) {
  bouton.addEventListener('click', () => {
    socket.emit('joueur:repondre', Number(bouton.dataset.choix));
  });
}

document.getElementById('bouton-suivant').addEventListener('click', () => {
  socket.emit('hote:suivant');
});

function afficherReponseEnvoyeeQuiz(vue) {
  document.getElementById('choix-envoye').className =
    `choix choix-envoye rebond choix-${vue.choix} fond-choix-${vue.choix}`;
}

function afficherResultatQuiz(vue) {
  const resultat = document.getElementById('resultat');
  resultat.textContent = vue.juste ? `Bonne réponse, +${vue.points}` : 'Raté';
  resultat.classList.toggle('juste', vue.juste);
  document.getElementById('score-resultat').textContent = vue.score;
  document.getElementById('rang-resultat').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant').hidden = !vue.estHote;
}

modesJoueur.quiz = {
  repondre: () => {},
  reponse_envoyee: afficherReponseEnvoyeeQuiz,
  resultat: afficherResultatQuiz,
};
