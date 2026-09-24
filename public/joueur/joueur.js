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

document.getElementById('bouton-rejouer').addEventListener('click', () => {
  socket.emit('hote:rejouer');
});

const confirmation = document.getElementById('confirmation');

document.getElementById('bouton-terminer').addEventListener('click', () => {
  confirmation.hidden = false;
});

document.getElementById('annuler-terminer').addEventListener('click', () => {
  confirmation.hidden = true;
});

document.getElementById('confirmer-terminer').addEventListener('click', () => {
  confirmation.hidden = true;
  socket.emit('hote:terminer');
});

socket.on('erreur', (erreur) => {
  if (erreur.code === 'salle_introuvable') oublierSalle();
  document.getElementById('entete').hidden = true;
  confirmation.hidden = true;
  afficherEcran('rejoindre');
  messageErreur.textContent = erreur.message;
  messageErreur.hidden = false;
});

// Écrans communs à tous les modes.
const affichagesCommuns = {
  attente: afficherAttente,
  attente_question: () => {},
  fin: afficherFin,
};

// Écrans propres à chaque mode. Remplis par /joueur/modes/<mode>.js.
const modesJoueur = {};

socket.on('joueur:etat', (vue) => {
  stockage.setItem('idJoueur', vue.id);
  stockage.setItem('codeSalle', codeEnCours);
  stockage.setItem('pseudo', vue.pseudo);
  afficherEntete(vue);
  if (affichagesCommuns[vue.ecran]) {
    afficherEcran(vue.ecran);
    affichagesCommuns[vue.ecran](vue);
  } else {
    afficherEcran(`${vue.mode}-${vue.ecran}`);
    modesJoueur[vue.mode][vue.ecran](vue);
  }
  garderEcranAllume();
});

function afficherEntete(vue) {
  document.getElementById('entete').hidden = false;
  document.getElementById('ma-pastille').style.setProperty('--couleur', `var(--joueur-${vue.couleur})`);
  document.getElementById('mon-pseudo-entete').textContent = vue.pseudo;
  document.getElementById('bouton-terminer').hidden = !vue.peutTerminer;
  if (!vue.peutTerminer) confirmation.hidden = true;
}

// Wake Lock : l'écran reste allumé pendant la partie. Il ne marche qu'en HTTPS
// et le navigateur le relâche quand la page passe en arrière-plan.
let verrouEcran = null;

async function garderEcranAllume() {
  if (verrouEcran || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  verrouEcran = 'demande en cours';
  try {
    verrouEcran = await navigator.wakeLock.request('screen');
    verrouEcran.addEventListener('release', () => { verrouEcran = null; });
  } catch {
    verrouEcran = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.getElementById('entete').hidden) garderEcranAllume();
});

function afficherEcran(nom) {
  for (const ecran of document.querySelectorAll('main')) {
    ecran.hidden = ecran.dataset.ecran !== nom;
  }
}

function afficherAttente(vue) {
  document.getElementById('mon-pseudo').textContent = vue.pseudo;
  document.getElementById('grande-pastille').style.setProperty('--couleur', `var(--joueur-${vue.couleur})`);
  document.getElementById('est-hote').hidden = !vue.estHote;
  document.getElementById('attente-hote').hidden = vue.estHote;
  const boutonLancer = document.getElementById('bouton-lancer');
  boutonLancer.hidden = !vue.estHote;
  boutonLancer.disabled = !vue.assezDeJoueurs;
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
