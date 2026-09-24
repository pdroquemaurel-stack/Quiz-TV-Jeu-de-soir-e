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

document.getElementById('bouton-lancer').addEventListener('click', () => {
  socket.emit('hote:lancer');
});

document.getElementById('bouton-suivant').addEventListener('click', () => {
  socket.emit('hote:suivant');
});

document.getElementById('bouton-rejouer').addEventListener('click', () => {
  socket.emit('hote:rejouer');
});

for (const bouton of document.querySelectorAll('[data-choix]')) {
  bouton.addEventListener('click', () => {
    socket.emit('joueur:repondre', Number(bouton.dataset.choix));
  });
}

socket.on('erreur', (erreur) => {
  messageErreur.textContent = erreur.message;
  messageErreur.hidden = false;
});

const affichages = {
  attente: afficherAttente,
  repondre: () => {},
  reponse_envoyee: afficherReponseEnvoyee,
  resultat: afficherResultat,
  fin: afficherFin,
};

socket.on('joueur:etat', (vue) => {
  stockage.setItem('idJoueur', vue.id);
  document.body.style.background = vue.couleur;
  afficherEcran(vue.ecran);
  affichages[vue.ecran](vue);
});

function afficherEcran(nom) {
  for (const ecran of document.querySelectorAll('main')) {
    ecran.hidden = ecran.dataset.ecran !== nom;
  }
}

function afficherAttente(vue) {
  document.getElementById('mon-pseudo').textContent = vue.pseudo;
  document.getElementById('est-hote').hidden = !vue.estHote;
  const boutonLancer = document.getElementById('bouton-lancer');
  boutonLancer.hidden = !vue.estHote;
  boutonLancer.disabled = !vue.assezDeJoueurs;
}

function afficherReponseEnvoyee(vue) {
  document.getElementById('choix-envoye').className = `choix choix-${vue.choix}`;
}

function afficherResultat(vue) {
  document.getElementById('resultat').textContent = vue.juste
    ? `Bonne réponse, +${vue.points}`
    : 'Raté';
  document.getElementById('score-resultat').textContent = vue.score;
  document.getElementById('rang-resultat').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant').hidden = !vue.estHote;
}

function afficherFin(vue) {
  document.getElementById('rang-fin').textContent = texteRang(vue.rang);
  document.getElementById('score-fin').textContent = vue.score;
  const boutonRejouer = document.getElementById('bouton-rejouer');
  boutonRejouer.hidden = !vue.estHote;
  boutonRejouer.disabled = !vue.assezDeJoueurs;
}

function texteRang(rang) {
  return rang === 1 ? '1er' : `${rang}e`;
}
