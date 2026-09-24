const socket = io();
const parametres = new URLSearchParams(location.search);
const modeDev = parametres.has('dev');
// Avec ?dev, chaque onglet est un joueur distinct.
const stockage = modeDev ? sessionStorage : localStorage;
const codeUrl = (parametres.get('code') || '').toUpperCase();

const formulaire = document.getElementById('formulaire');
const champCode = document.getElementById('code');
const champPseudo = document.getElementById('pseudo');
const messageErreur = document.getElementById('message-erreur');
const bandeau = document.getElementById('bandeau-reconnexion');

// Code de la salle qu'on essaie de rejoindre, mémorisé une fois dedans.
let codeEnCours = '';

champCode.value = codeUrl;
champPseudo.value = stockage.getItem('pseudo') || '';

// On reprend sa place seulement si on revient dans la même salle
// (un QR code d'une autre salle l'emporte sur le souvenir).
function salleMemorisee() {
  const code = stockage.getItem('codeSalle');
  if (!code || (codeUrl && codeUrl !== code)) return null;
  return { code, pseudo: stockage.getItem('pseudo'), id: stockage.getItem('idJoueur') };
}

function oublierSalle() {
  for (const cle of ['codeSalle', 'pseudo', 'idJoueur']) stockage.removeItem(cle);
}

// À chaque (re)connexion du socket, y compris au chargement de la page.
socket.on('connect', () => {
  bandeau.hidden = true;
  const memoire = salleMemorisee();
  if (!memoire) return;
  codeEnCours = memoire.code;
  socket.emit('joueur:rejoindre', memoire);
});

socket.on('disconnect', () => {
  bandeau.hidden = false;
});

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  messageErreur.hidden = true;
  codeEnCours = champCode.value.trim().toUpperCase();
  socket.emit('joueur:rejoindre', { code: codeEnCours, pseudo: champPseudo.value });
});

if (modeDev) {
  document.getElementById('outils-dev').hidden = false;
  for (const bouton of document.querySelectorAll('[data-couper]')) {
    bouton.addEventListener('click', () => {
      socket.disconnect();
      setTimeout(() => socket.connect(), Number(bouton.dataset.couper));
    });
  }
}

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
  if (erreur.code === 'salle_introuvable') oublierSalle();
  afficherEcran('rejoindre');
  messageErreur.textContent = erreur.message;
  messageErreur.hidden = false;
});

const affichages = {
  attente: afficherAttente,
  attente_question: () => {},
  repondre: () => {},
  reponse_envoyee: afficherReponseEnvoyee,
  resultat: afficherResultat,
  fin: afficherFin,
};

socket.on('joueur:etat', (vue) => {
  stockage.setItem('idJoueur', vue.id);
  stockage.setItem('codeSalle', codeEnCours);
  stockage.setItem('pseudo', vue.pseudo);
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
