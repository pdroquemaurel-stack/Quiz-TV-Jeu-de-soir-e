const socket = io();
const parametres = new URLSearchParams(location.search);
// Avec ?dev, chaque onglet est un joueur distinct.
const stockage = parametres.has('dev') ? sessionStorage : localStorage;

const formulaire = document.getElementById('formulaire');
const champCode = document.getElementById('code');
const champPseudo = document.getElementById('pseudo');
const messageErreur = document.getElementById('message-erreur');

champCode.value = (parametres.get('code') || '').toUpperCase();

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  messageErreur.hidden = true;
  socket.emit('joueur:rejoindre', { code: champCode.value, pseudo: champPseudo.value });
});

socket.on('erreur', (erreur) => {
  messageErreur.textContent = erreur.message;
  messageErreur.hidden = false;
});

socket.on('joueur:etat', (vue) => {
  stockage.setItem('idJoueur', vue.id);
  if (vue.ecran === 'attente') afficherAttente(vue);
});

function afficherAttente(vue) {
  document.getElementById('ecran-rejoindre').hidden = true;
  const ecran = document.getElementById('ecran-attente');
  ecran.hidden = false;
  document.body.style.background = vue.couleur;
  document.getElementById('mon-pseudo').textContent = vue.pseudo;
  document.getElementById('est-hote').hidden = !vue.estHote;
}
