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

for (const bouton of document.querySelectorAll('[data-choix]')) {
  bouton.addEventListener('click', () => {
    socket.emit('joueur:repondre', Number(bouton.dataset.choix));
  });
}

socket.on('erreur', (erreur) => {
  if (erreur.code === 'salle_introuvable') oublierSalle();
  document.getElementById('entete').hidden = true;
  confirmation.hidden = true;
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
  afficherEntete(vue);
  afficherEcran(vue.ecran);
  affichages[vue.ecran](vue);
  garderEcranAllume();
});

// Écrans où une manche est en cours : l'hôte peut y terminer la partie.
const ECRANS_DE_MANCHE = ['repondre', 'reponse_envoyee', 'resultat', 'attente_question'];

function afficherEntete(vue) {
  document.getElementById('entete').hidden = false;
  document.getElementById('ma-pastille').style.setProperty('--couleur', `var(--joueur-${vue.couleur})`);
  document.getElementById('mon-pseudo-entete').textContent = vue.pseudo;
  const peutTerminer = vue.estHote && ECRANS_DE_MANCHE.includes(vue.ecran);
  document.getElementById('bouton-terminer').hidden = !peutTerminer;
  if (!peutTerminer) confirmation.hidden = true;
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

function afficherReponseEnvoyee(vue) {
  document.getElementById('choix-envoye').className =
    `choix choix-envoye rebond choix-${vue.choix} fond-choix-${vue.choix}`;
}

function afficherResultat(vue) {
  const resultat = document.getElementById('resultat');
  resultat.textContent = vue.juste ? `Bonne réponse, +${vue.points}` : 'Raté';
  resultat.classList.toggle('juste', vue.juste);
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
