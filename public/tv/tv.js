const socket = io();

socket.on('connect', () => {
  socket.emit('tv:creer');
});

socket.on('salle:etat', (salle) => {
  if (salle.etat === 'lobby') afficherLobby(salle);
});

function afficherLobby(salle) {
  document.getElementById('lobby').hidden = false;
  document.getElementById('code').textContent = salle.code;
  document.getElementById('url').textContent = salle.urlJoueur.replace(/^https?:\/\//, '');
  const qr = document.getElementById('qr');
  const srcQr = `/qr/${salle.code}.svg`;
  if (qr.getAttribute('src') !== srcQr) qr.src = srcQr;

  const liste = document.getElementById('liste-joueurs');
  liste.replaceChildren(...salle.joueurs.map((joueur) => ligneJoueur(joueur, salle.hoteId)));
}

function ligneJoueur(joueur, hoteId) {
  const ligne = document.createElement('li');
  const pastille = document.createElement('span');
  pastille.className = 'pastille';
  pastille.style.background = joueur.couleur;
  ligne.append(pastille, ' ', joueur.pseudo);
  if (joueur.id === hoteId) ligne.append(' 👑');
  return ligne;
}
