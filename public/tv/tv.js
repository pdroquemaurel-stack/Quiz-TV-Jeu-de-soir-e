const socket = io();

// La page est conçue en 1920×1080 : on la réduit ou l'agrandit en bloc pour tenir
// entière dans la fenêtre, centrée et sans déformation.
function ajusterEchelle() {
  const echelle = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const decalageX = (window.innerWidth - 1920 * echelle) / 2;
  const decalageY = (window.innerHeight - 1080 * echelle) / 2;
  document.getElementById('scene').style.transform =
    `translate(${decalageX}px, ${decalageY}px) scale(${echelle})`;
}

ajusterEchelle();
window.addEventListener('resize', ajusterEchelle);

// sessionStorage : un rechargement ou une coupure retrouve la salle,
// un nouvel onglet (ou l'app relancée) en crée une nouvelle.
socket.on('connect', () => {
  socket.emit('tv:creer', {
    code: sessionStorage.getItem('codeSalle'),
    jetonTv: sessionStorage.getItem('jetonTv'),
  });
});

// Écrans de chaque mode pendant une partie, par phase. Remplis par /tv/modes/<mode>.js.
const modesTv = {};

let intervalleChrono = null;

// Étape affichée (« partie:question:3 »…). Tant qu'elle ne change pas, on ne reconstruit
// pas la question et les réponses, pour ne pas rejouer leurs animations d'arrivée.
let etapeAffichee = '';

socket.on('salle:etat', (salle) => {
  sessionStorage.setItem('codeSalle', salle.code);
  sessionStorage.setItem('jetonTv', salle.jetonTv);
  const { phase = '', numero = '' } = salle.etatMode;
  const etape = `${salle.etat}:${phase}:${numero}`;
  const nouvelleEtape = etape !== etapeAffichee;
  etapeAffichee = etape;
  clearInterval(intervalleChrono);
  afficherQrCoin(salle);
  if (salle.etat === 'partie') {
    afficherEcran(`${salle.mode}-${phase}`);
    modesTv[salle.mode][phase](salle, nouvelleEtape);
  } else if (salle.etat === 'podium') {
    afficherEcran('podium');
    afficherPodium(salle);
  } else {
    afficherEcran('lobby');
    afficherLobby(salle);
  }
});

// Petit QR code dans un coin pendant la partie, pour les retardataires.
function afficherQrCoin(salle) {
  document.getElementById('qr-coin').hidden = salle.etat === 'lobby';
  document.getElementById('code-coin').textContent = salle.code;
  afficherQr(document.getElementById('qr-coin-image'), salle.code);
}

function afficherQr(image, code) {
  const srcQr = `/qr/${code}.svg`;
  if (image.getAttribute('src') !== srcQr) image.src = srcQr;
}

function afficherEcran(nom) {
  for (const ecran of document.querySelectorAll('main')) {
    ecran.hidden = ecran.dataset.ecran !== nom;
  }
}

function afficherLobby(salle) {
  document.getElementById('code').textContent = salle.code;
  // URL courte : sans le protocole ni le code (affiché en grand juste dessous).
  // Si elle est trop longue, elle passe à la ligne avant « /joueur ».
  const url = salle.urlJoueur.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  const coupure = url.lastIndexOf('/');
  document.getElementById('url').replaceChildren(
    url.slice(0, coupure), document.createElement('wbr'), url.slice(coupure),
  );
  afficherQr(document.getElementById('qr'), salle.code);
  remplirEtiquettes(
    document.getElementById('liste-joueurs'),
    salle.joueurs.map((joueur) => etiquetteJoueur(joueur, joueur.id === salle.hoteId)),
  );
  afficherModeChoisi(salle.modeChoisi);
}

function afficherModeChoisi(mode) {
  document.getElementById('nom-mode').textContent = mode.nom;
  document.getElementById('regle-mode').textContent = mode.regleCourte;
  const minimum = document.getElementById('minimum-mode');
  minimum.textContent = `${mode.joueursMin} joueurs minimum`;
  minimum.hidden = mode.assezDeJoueurs;
}

function etiquetteJoueur(joueur, estHote) {
  const element = document.createElement('li');
  element.dataset.id = joueur.id;
  element.append(pastille(joueur.couleur), texte('pseudo', joueur.pseudo));
  if (estHote) element.append(forme('couronne'));
  griserSiDeconnecte(element, joueur);
  return element;
}

// Seules les étiquettes qui n'étaient pas encore affichées arrivent en rebond.
function remplirEtiquettes(liste, etiquettes) {
  const dejaAffiches = [...liste.children].map((element) => element.dataset.id);
  for (const etiquette of etiquettes) {
    if (!dejaAffiches.includes(etiquette.dataset.id)) etiquette.classList.add('nouveau');
  }
  liste.replaceChildren(...etiquettes);
}

function griserSiDeconnecte(element, joueur) {
  if (!joueur.connecte) element.classList.add('deconnecte');
}

function pastille(couleur) {
  const element = document.createElement('span');
  element.className = 'pastille';
  element.style.setProperty('--couleur', `var(--joueur-${couleur})`);
  return element;
}

function forme(classes) {
  const element = document.createElement('span');
  element.className = `forme ${classes}`;
  return element;
}

// La barre se vide en même temps que le temps restant mesuré par le serveur.
function viderBarreTemps(barre, tempsRestantMs) {
  barre.style.animation = 'none';
  void barre.offsetWidth;
  barre.style.animation = `vider ${tempsRestantMs}ms linear forwards`;
}

// Simple affichage : c'est le serveur qui décide de la fin de la manche.
function lancerChrono(element, tempsRestantMs) {
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    element.textContent = secondes;
    element.classList.toggle('urgent', secondes <= 5);
  };
  afficher();
  intervalleChrono = setInterval(afficher, 250);
}

// Tous les joueurs de rang 3 ou mieux : les ex æquo partagent la même marche.
function afficherPodium(salle) {
  const { classement } = salle.etatMode;
  for (const rang of [1, 2, 3]) {
    const noms = classement.filter((ligne) => ligne.rang === rang).map((ligne) => {
      const element = document.createElement('li');
      element.append(pastille(ligne.couleur), ligne.pseudo);
      griserSiDeconnecte(element, ligne);
      return element;
    });
    const liste = document.getElementById(`podium-${rang}`);
    liste.replaceChildren(...noms);
    liste.parentElement.classList.toggle('vide', noms.length === 0);
  }
  document.getElementById('classement-podium').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, false)),
  );
  document.getElementById('prochain-mode').textContent = salle.modeChoisi.nom;
}

function ligneClassement(ligne, avecGain) {
  const element = document.createElement('li');
  const rang = texte('rang', `${ligne.rang}.`);
  const pseudo = texte('pseudo', ligne.pseudo);
  element.append(rang, pastille(ligne.couleur), pseudo, texte('score', ligne.score));
  if (avecGain) {
    const gain = texte('gain', ligne.points > 0 ? `+${ligne.points}` : '✗');
    if (ligne.points === 0) gain.classList.add('zero');
    element.append(gain);
  }
  griserSiDeconnecte(element, ligne);
  return element;
}

function texte(classe, contenu) {
  const element = document.createElement('span');
  element.className = classe;
  element.textContent = contenu;
  return element;
}
