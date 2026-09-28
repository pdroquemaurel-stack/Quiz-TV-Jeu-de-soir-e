// Écrans de La légende sur le téléphone. socket et texteRang viennent de joueur.js.
// Pas de GIF ici : il ne passe que sur la TV. La saisie est contrôlée ici pour aider
// le joueur ; le serveur la valide à nouveau.

const champLegende = document.getElementById('lg-champ');
const boutonValiderLegende = document.getElementById('lg-valider');
const listeChoixLegende = document.getElementById('lg-choix');
const compteurLegende = document.getElementById('lg-compteur');

// GIF dont le champ est affiché : on ne le vide qu'au changement de GIF, pas quand un autre
// joueur envoie son titre. Oublié dès qu'un autre écran s'affiche (y compris le podium) :
// une nouvelle partie qui repart au GIF 1 vide donc bien le champ.
let gifSaisieLegende = null;

socket.on('joueur:etat', (vue) => {
  if (vue.ecran !== 'ecrire') gifSaisieLegende = null;
});

// Choix affichés : on ne les recrée que s'ils changent, pour ne pas perdre
// un appui en cours quand un autre joueur vote au même moment.
let choixAffichesLegende = '';

function mettreAJourSaisieLegende() {
  boutonValiderLegende.disabled = champLegende.value.trim() === '';
  compteurLegende.textContent = `${champLegende.value.length} / ${champLegende.maxLength}`;
}

champLegende.addEventListener('input', mettreAJourSaisieLegende);

function envoyerTitreLegende() {
  const texte = champLegende.value.trim();
  if (texte === '') return;
  champLegende.blur();
  marquerEnvoi(boutonValiderLegende);
  socket.emit('joueur:repondre', texte);
}

boutonValiderLegende.addEventListener('click', envoyerTitreLegende);
// Pas de retour à la ligne dans un titre : « Entrée » l'envoie.
champLegende.addEventListener('keydown', (evenement) => {
  if (evenement.key !== 'Enter') return;
  evenement.preventDefault();
  envoyerTitreLegende();
});

// Les boutons sont recréés à chaque GIF : un seul écouteur pour tous.
listeChoixLegende.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-proposition');
  if (!bouton) return;
  marquerAppui(bouton);
  socket.emit('joueur:repondre', Number(bouton.dataset.index));
});

document.getElementById('lg-suivant').addEventListener('click', envoyerSuivant);

function afficherEcrireLegende(vue) {
  const gif = `${vue.numero}/${vue.total}`;
  if (gif === gifSaisieLegende) return;
  gifSaisieLegende = gif;
  document.getElementById('lg-numero').textContent = `GIF ${vue.numero}/${vue.total}`;
  champLegende.value = '';
  mettreAJourSaisieLegende();
  champLegende.focus();
}

function afficherTitreEnvoyeLegende(vue) {
  document.getElementById('lg-titre-envoye').textContent = vue.texte;
}

// Un bouton par titre, dans l'ordre de la TV, sauf le sien.
function afficherVoterLegende(vue) {
  const choix = JSON.stringify([vue.numero, vue.propositions]);
  if (choix === choixAffichesLegende) return;
  choixAffichesLegende = choix;
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
  listeChoixLegende.replaceChildren(...boutons.filter(Boolean));
}

function afficherVoteEnvoyeLegende(vue) {
  document.getElementById('lg-vote-envoye').textContent = vue.texte;
}

function afficherResultatLegende(vue) {
  choixAffichesLegende = '';
  const resultat = document.getElementById('lg-resultat');
  resultat.textContent = texteResultatLegende(vue);
  resultat.classList.toggle('juste', vue.gagnant);
  document.getElementById('lg-score').textContent = vue.score;
  document.getElementById('lg-rang').textContent = texteRang(vue.rang);
  document.getElementById('lg-suivant').hidden = !vue.estHote;
}

// « Légendaire ! +2500 », « Ton titre a reçu 3 votes, +1500 », « Ton titre n'a reçu aucun vote »…
function texteResultatLegende(vue) {
  if (vue.pasAssezDeTitres) return 'Pas assez de titres pour voter';
  if (vue.sonTitre === null) return 'Pas de titre. Page blanche.';
  if (vue.votesRecus === 0) return 'Ton titre n\'a reçu aucun vote. Humour incompris.';
  if (vue.legendaire) return `Légendaire ! +${vue.points}`;
  const votes = vue.votesRecus > 1 ? `${vue.votesRecus} votes` : '1 vote';
  return `Ton titre a reçu ${votes}, +${vue.points}`;
}

modesJoueur.legende = {
  ecrire: afficherEcrireLegende,
  titre_envoye: afficherTitreEnvoyeLegende,
  voter: afficherVoterLegende,
  vote_envoye: afficherVoteEnvoyeLegende,
  resultat: afficherResultatLegende,
};
