// Écrans de Même réponse sur le téléphone. socket et texteRang viennent de joueur.js.
// La saisie est contrôlée ici pour aider le joueur ; le serveur la valide à nouveau.

const champReponseMr = document.getElementById('mr-champ');
const boutonValiderMr = document.getElementById('mr-valider');

// Question dont le champ est affiché : on ne le vide qu'au changement de question,
// pas quand un autre joueur répond. Le texte compte aussi : une nouvelle partie repart à 1.
let questionSaisieMr = null;

champReponseMr.addEventListener('input', () => {
  boutonValiderMr.disabled = champReponseMr.value.trim() === '';
});

function envoyerReponseMr() {
  const texte = champReponseMr.value.trim();
  if (texte === '') return;
  champReponseMr.blur();
  marquerEnvoi(boutonValiderMr);
  socket.emit('joueur:repondre', texte);
}

boutonValiderMr.addEventListener('click', envoyerReponseMr);
champReponseMr.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter') envoyerReponseMr();
});

document.getElementById('mr-suivant').addEventListener('click', envoyerSuivant);

function afficherRepondreMr(vue) {
  const question = `${vue.numero} ${vue.question.texte}`;
  if (question === questionSaisieMr) return;
  questionSaisieMr = question;
  document.getElementById('mr-numero').textContent = `Question ${vue.numero}/${vue.total}`;
  document.getElementById('mr-question').textContent = vue.question.texte;
  champReponseMr.value = '';
  boutonValiderMr.disabled = true;
  champReponseMr.focus();
}

function afficherReponseEnvoyeeMr(vue) {
  document.getElementById('mr-texte-envoye').textContent = vue.texte;
}

function afficherResultatMr(vue) {
  const resultat = document.getElementById('mr-resultat');
  if (vue.texte === null) resultat.textContent = 'Pas de réponse';
  else if (vue.taille >= 2) {
    const autres = vue.taille - 1;
    resultat.textContent = `Même réponse que ${autres} autre${autres > 1 ? 's' : ''}, +${vue.points}`;
  } else resultat.textContent = `Tu es seul avec : ${vue.libelle}`;
  resultat.classList.toggle('juste', vue.points > 0);

  document.getElementById('mr-en-tete').hidden = !vue.enTete;
  // « Fraises → Fraise » : la réponse a été rattachée à une autre forme.
  document.getElementById('mr-rattachement').textContent =
    vue.texte !== null && vue.texte !== vue.libelle ? `${vue.texte} → ${vue.libelle}` : '';
  document.getElementById('mr-score').textContent = vue.score;
  document.getElementById('mr-rang').textContent = texteRang(vue.rang);
  document.getElementById('mr-suivant').hidden = !vue.estHote;
}

modesJoueur['meme-reponse'] = {
  repondre: afficherRepondreMr,
  reponse_envoyee: afficherReponseEnvoyeeMr,
  resultat: afficherResultatMr,
};
