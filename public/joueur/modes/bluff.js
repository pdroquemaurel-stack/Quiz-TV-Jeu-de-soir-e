// Écrans du bluff sur le téléphone. socket et texteRang viennent de joueur.js.
// La saisie est contrôlée ici pour aider le joueur ; le serveur la valide à nouveau.

const champBluff = document.getElementById('bl-champ');
const boutonValiderBluff = document.getElementById('bl-valider');
const listeChoixBluff = document.getElementById('bl-choix');

// Question dont le champ est affiché : on ne le vide qu'au changement de question,
// pas quand un autre joueur envoie son bluff. Le texte compte aussi : une nouvelle partie repart à 1.
let questionSaisieBluff = null;

// Choix affichés : on ne les recrée que s'ils changent, pour ne pas perdre
// un appui en cours quand un autre joueur vote au même moment.
let choixAffichesBluff = '';

champBluff.addEventListener('input', () => {
  boutonValiderBluff.disabled = champBluff.value.trim() === '';
});

function envoyerBluff() {
  const texte = champBluff.value.trim();
  if (texte === '') return;
  champBluff.blur();
  socket.emit('joueur:repondre', texte);
}

boutonValiderBluff.addEventListener('click', envoyerBluff);
champBluff.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter') envoyerBluff();
});

// Les boutons sont recréés à chaque question : un seul écouteur pour tous.
listeChoixBluff.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-proposition');
  if (bouton) socket.emit('joueur:repondre', Number(bouton.dataset.index));
});

document.getElementById('bl-suivant').addEventListener('click', () => {
  socket.emit('hote:suivant');
});

function afficherEcrireBluff(vue) {
  const question = `${vue.numero} ${vue.question.texte}`;
  if (question === questionSaisieBluff) return;
  questionSaisieBluff = question;
  document.getElementById('bl-numero').textContent = `Question ${vue.numero}/${vue.total}`;
  document.getElementById('bl-question').textContent = vue.question.texte;
  champBluff.value = '';
  boutonValiderBluff.disabled = true;
  champBluff.focus();
}

function afficherBluffEnvoye(vue) {
  document.getElementById('bl-bluff-envoye').textContent = vue.texte;
}

// Un bouton par proposition, dans l'ordre de la TV, sauf la sienne.
function afficherVoterBluff(vue) {
  const choix = JSON.stringify([vue.numero, vue.question.texte, vue.propositions]);
  if (choix === choixAffichesBluff) return;
  choixAffichesBluff = choix;
  document.getElementById('bl-question-vote').textContent = vue.question.texte;
  const boutons = vue.propositions.map((proposition, index) => {
    if (proposition.laTienne) return null;
    const bouton = document.createElement('button');
    bouton.className = 'bouton-proposition';
    bouton.dataset.index = index;
    const numero = document.createElement('span');
    numero.className = 'numero-proposition';
    numero.textContent = index + 1;
    const libelle = document.createElement('span');
    libelle.className = 'libelle-proposition';
    libelle.textContent = proposition.texte;
    bouton.append(numero, libelle);
    return bouton;
  });
  listeChoixBluff.replaceChildren(...boutons.filter(Boolean));
}

function afficherVoteEnvoyeBluff(vue) {
  document.getElementById('bl-vote-envoye').textContent = vue.texte;
}

function afficherResultatBluff(vue) {
  const verite = document.getElementById('bl-verite');
  verite.textContent = texteVeriteBluff(vue);
  verite.classList.toggle('juste', vue.aTrouve);
  document.getElementById('bl-bluff').textContent = texteBluff(vue);
  document.getElementById('bl-score').textContent = vue.score;
  document.getElementById('bl-rang').textContent = texteRang(vue.rang);
  document.getElementById('bl-suivant').hidden = !vue.estHote;
}

// « Bien vu ! C'était : Sel, +1000 », « Raté ! C'était : Sel », « Pas de vote. C'était : Sel ».
function texteVeriteBluff(vue) {
  const verite = `C'était : ${vue.vraieReponse}`;
  if (vue.aTrouve) return `Bien vu ! ${verite}, +${vue.points - vue.pointsBluff}`;
  if (vue.aVote) return `Raté ! ${verite}`;
  if (vue.personneNaBluffe) return verite;
  return `Pas de vote. ${verite}`;
}

function texteBluff(vue) {
  if (vue.bluffVrai) return 'Ton bluff était la vraie réponse !';
  if (vue.sonBluff === null) return 'Pas de bluff';
  if (vue.pieges === 0) return 'Ton bluff n\'a piégé personne';
  const joueurs = vue.pieges > 1 ? `${vue.pieges} joueurs` : '1 joueur';
  return `Ton bluff a piégé ${joueurs}, +${vue.pointsBluff}`;
}

modesJoueur.bluff = {
  ecrire: afficherEcrireBluff,
  bluff_envoye: afficherBluffEnvoye,
  voter: afficherVoterBluff,
  vote_envoye: afficherVoteEnvoyeBluff,
  resultat: afficherResultatBluff,
};
