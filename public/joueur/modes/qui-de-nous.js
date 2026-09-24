// Écrans de Qui de nous ? sur le téléphone. socket et texteRang viennent de joueur.js.

const listeCandidats = document.getElementById('candidats');

// Les boutons sont recréés à chaque mise à jour : un seul écouteur pour tous.
listeCandidats.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-candidat');
  if (bouton) socket.emit('joueur:repondre', bouton.dataset.id);
});

document.getElementById('bouton-suivant-qdn').addEventListener('click', () => {
  socket.emit('hote:suivant');
});

function boutonCandidat(candidat) {
  const bouton = document.createElement('button');
  bouton.className = 'bouton-candidat';
  bouton.classList.toggle('deconnecte', !candidat.connecte);
  bouton.dataset.id = candidat.id;
  const rond = document.createElement('span');
  rond.className = 'pastille';
  rond.style.setProperty('--couleur', `var(--joueur-${candidat.couleur})`);
  const pseudo = document.createElement('span');
  pseudo.className = 'pseudo-candidat';
  pseudo.textContent = candidat.pseudo;
  bouton.append(rond, pseudo);
  return bouton;
}

// Grille affichée : on ne la recrée que si elle change, pour ne pas perdre
// un appui en cours quand un autre joueur vote au même moment.
let grilleAffichee = '';

function afficherVoterQuiDeNous(vue) {
  const grille = JSON.stringify([vue.numero, vue.candidats]);
  if (grille === grilleAffichee) return;
  grilleAffichee = grille;
  listeCandidats.replaceChildren(...vue.candidats.map(boutonCandidat));
}

function afficherVoteEnvoyeQuiDeNous(vue) {
  document.getElementById('pastille-vote').style.setProperty('--couleur', `var(--joueur-${vue.choisi.couleur})`);
  document.getElementById('pseudo-vote').textContent = vue.choisi.pseudo;
}

// « Paul », « Paul et Léa », « Paul, Léa et Sam ».
function listerNoms(noms) {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

function afficherResultatQuiDeNous(vue) {
  const resultat = document.getElementById('resultat-qdn');
  if (vue.vote === null) resultat.textContent = 'Pas de vote';
  else if (vue.commeLeGroupe) resultat.textContent = `Comme le groupe, +${vue.points}`;
  else resultat.textContent = 'Pas comme le groupe';
  resultat.classList.toggle('juste', vue.commeLeGroupe);

  document.getElementById('elus-qdn').textContent = vue.elus.length === 0
    ? 'Personne n\'a voté'
    : `${vue.elus.length > 1 ? 'Élus' : 'Élu'} : ${listerNoms(vue.elus)}`;
  const { votesRecus } = vue;
  document.getElementById('votes-recus-qdn').textContent =
    `Tu as reçu ${votesRecus} vote${votesRecus > 1 ? 's' : ''}`;
  document.getElementById('score-qdn').textContent = vue.score;
  document.getElementById('rang-qdn').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-qdn').hidden = !vue.estHote;
}

modesJoueur['qui-de-nous'] = {
  voter: afficherVoterQuiDeNous,
  vote_envoye: afficherVoteEnvoyeQuiDeNous,
  resultat: afficherResultatQuiDeNous,
};
