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
  document.getElementById('bandeau-connexion').hidden = true;
  socket.emit('tv:creer', {
    code: sessionStorage.getItem('codeSalle'),
    jetonTv: sessionStorage.getItem('jetonTv'),
  });
});

// Avant le premier état, l'écran « Connexion au serveur… » est déjà affiché.
// Ensuite, le bandeau signale la coupure par-dessus l'écran figé.
socket.on('disconnect', () => {
  document.getElementById('bandeau-connexion').hidden = premierEtatRecu;
});

// Wake Lock : l'écran de la TV reste allumé si le navigateur le permet (HTTPS seulement).
// Le navigateur le relâche quand la page passe en arrière-plan : on le redemande au retour.
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

document.addEventListener('visibilitychange', garderEcranAllume);

// Écrans de chaque mode pendant une partie, par phase. Remplis par /tv/modes/<mode>.js.
const modesTv = {};

let intervalleChrono = null;

// Étape affichée (« partie:question:3 »…). Tant qu'elle ne change pas, on ne reconstruit
// pas la question et les réponses, pour ne pas rejouer leurs animations d'arrivée.
let etapeAffichee = '';

// Aucun son au premier état reçu après le chargement : un rechargement ne rejoue rien.
// Ensuite, un seul son par état reçu : le premier demandé (le lancement passe avant
// le « ding » de la première question).
let premierEtatRecu = true;
let sonDejaJoue = false;

function sonner(nom) {
  if (premierEtatRecu || sonDejaJoue) return;
  sonDejaJoue = true;
  jouerSon(nom);
}

socket.on('salle:etat', (salle) => {
  sessionStorage.setItem('codeSalle', salle.code);
  sessionStorage.setItem('jetonTv', salle.jetonTv);
  const { phase = '', numero = '' } = salle.etatMode;
  const etape = `${salle.etat}:${phase}:${numero}`;
  const nouvelleEtape = etape !== etapeAffichee;
  const etatPrecedent = etapeAffichee.split(':')[0];
  etapeAffichee = etape;
  clearInterval(intervalleChrono);
  afficherQrCoin(salle);
  jouerSonsCommuns(salle, etatPrecedent, nouvelleEtape);
  if (salle.etat === 'partie') {
    afficherEcran(`${salle.mode}-${phase}`);
    modesTv[salle.mode][phase](salle, nouvelleEtape);
  } else if (salle.etat === 'podium') {
    afficherEcran('podium');
    afficherPodium(salle);
  } else if (salle.etat === 'tableau') {
    afficherEcran('tableau');
    afficherTableau(salle);
  } else if (salle.etat === 'grandGagnant') {
    afficherEcran('grandGagnant');
    afficherGrandGagnant(salle);
  } else {
    afficherEcran('lobby');
    afficherLobby(salle);
  }
  premierEtatRecu = false;
  garderEcranAllume();
});

function jouerSonsCommuns(salle, etatPrecedent, nouvelleEtape) {
  sonDejaJoue = false;
  if (salle.etat === 'lobby') lancerMusique();
  else arreterMusique();
  if (!nouvelleEtape) return;
  if (salle.etat === 'partie' && etatPrecedent !== 'partie') sonner('lancement');
  if (salle.etat === 'podium' || salle.etat === 'grandGagnant') sonner('podium');
}

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
  const arrivees = remplirEtiquettes(
    document.getElementById('liste-joueurs'),
    salle.joueurs.map((joueur) => etiquetteJoueur(joueur, joueur.id === salle.hoteId)),
  );
  if (arrivees > 0) sonner('arrivee');
  afficherModeChoisi(salle.modeChoisi);
  document.getElementById('format-tv').textContent = texteFormat(salle.format);
}

function texteFormat(format) {
  if (format.type === 'petite') return 'Petite partie';
  return `Aventure — ${format.objectif} points pour gagner`;
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
// Renvoie leur nombre, pour jouer un son à l'arrivée d'un joueur ou d'une réponse.
function remplirEtiquettes(liste, etiquettes) {
  const dejaAffiches = [...liste.children].map((element) => element.dataset.id);
  const nouvelles = etiquettes.filter((etiquette) => !dejaAffiches.includes(etiquette.dataset.id));
  for (const etiquette of nouvelles) etiquette.classList.add('nouveau');
  liste.replaceChildren(...etiquettes);
  return nouvelles.length;
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

// Pastille sans pseudo à côté : l'initiale la distingue, y compris pour un joueur daltonien.
// Array.from ne coupe pas un émoji en deux.
function pastilleInitiale(joueur) {
  const element = pastille(joueur.couleur);
  element.classList.add('initiale');
  element.style.setProperty('--couleur-initiale', `var(--texte-joueur-${joueur.couleur})`);
  element.textContent = Array.from(joueur.pseudo)[0].toLocaleUpperCase('fr');
  return element;
}

// Pastilles à initiale, pour une liste d'étiquettes : au-delà de max, les premières puis « +N ».
function pastillesSeules(joueurs, max = Infinity) {
  const visibles = joueurs.length > max ? joueurs.slice(0, max - 1) : joueurs;
  const elements = visibles.map((joueur) => {
    const element = document.createElement('li');
    element.className = 'seule';
    element.append(pastilleInitiale(joueur));
    griserSiDeconnecte(element, joueur);
    return element;
  });
  if (visibles.length < joueurs.length) {
    const reste = document.createElement('li');
    reste.className = 'seule reste';
    reste.textContent = `+${joueurs.length - visibles.length}`;
    elements.push(reste);
  }
  return elements;
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

// Seconde affichée par le chrono : chaque état reçu relance lancerChrono,
// et une même seconde ne doit pas faire deux fois tic-tac.
let secondeAffichee = null;

// Simple affichage : c'est le serveur qui décide de la fin de la manche.
// Le tic-tac suit l'affichage, même après un rechargement.
function lancerChrono(element, tempsRestantMs) {
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    if (secondes !== secondeAffichee && secondes >= 1 && secondes <= 5) {
      jouerSon('tictac', { dernier: secondes === 1 });
    }
    secondeAffichee = secondes;
    element.textContent = secondes;
    element.classList.toggle('urgent', secondes <= 5);
  };
  afficher();
  intervalleChrono = setInterval(afficher, 250);
}

const EMOJI_MEDAILLE = { or: '🥇', argent: '🥈', bronze: '🥉' };

// Tous les joueurs de rang 3 ou mieux : les ex æquo partagent la même marche.
// Un joueur à 0 point peut être sur une marche sans médaille.
function afficherPodium(salle) {
  const { classement } = salle.etatMode;
  for (const rang of [1, 2, 3]) {
    const noms = classement.filter((ligne) => ligne.rang === rang).map((ligne) => {
      const element = document.createElement('li');
      element.append(pastille(ligne.couleur), ligne.pseudo);
      const medaille = salle.medaillesPartie[ligne.id];
      if (medaille) element.append(texte('medaille', EMOJI_MEDAILLE[medaille]));
      griserSiDeconnecte(element, ligne);
      return element;
    });
    const liste = document.getElementById(`podium-${rang}`);
    liste.replaceChildren(...noms);
    liste.parentElement.classList.toggle('vide', noms.length === 0);
  }
  document.getElementById('classement-podium').replaceChildren(
    ...classement.map((ligne) => {
      const element = ligneClassement(ligne, false);
      const medaille = salle.medaillesPartie[ligne.id];
      if (medaille) {
        element.append(texte('gain', `${EMOJI_MEDAILLE[medaille]} +${salle.pointsMedaille[medaille]}`));
      }
      return element;
    }),
  );
  // Un mode peut ajouter une ligne au podium commun (« Le plus désigné »…).
  document.getElementById('plus-designe').hidden = true;
  const { completerPodium } = modesTv[salle.mode];
  if (completerPodium) completerPodium(salle);
}

function afficherTableau(salle) {
  const { format, numeroPartie } = salle;
  const partie = `Après la partie ${numeroPartie}`;
  document.getElementById('sous-titre-tableau').textContent = format.type === 'aventure'
    ? `${partie} — ${format.objectif} points pour gagner`
    : partie;
  document.getElementById('departage').hidden = !salle.departage;
  remplirTableau(document.getElementById('tableau-global'), salle.tableau, format.type === 'aventure');
  document.getElementById('prochain-mode').textContent = salle.modeChoisi.nom;
}

function afficherGrandGagnant(salle) {
  const gagnant = salle.tableau.find((ligne) => ligne.id === salle.grandGagnantId);
  document.getElementById('grand-gagnant').replaceChildren(pastille(gagnant.couleur), gagnant.pseudo);
  remplirTableau(document.getElementById('tableau-final'), salle.tableau, false);
}

// Une ligne par joueur : rang, pseudo, médailles obtenues, points globaux, écart au leader.
function remplirTableau(liste, tableau, avecEcart) {
  liste.replaceChildren(...tableau.map((ligne) => {
    const element = document.createElement('li');
    const medailles = Object.entries(EMOJI_MEDAILLE)
      .filter(([nom]) => ligne.medailles[nom] > 0)
      .map(([nom, emoji]) => `${emoji}${ligne.medailles[nom]}`)
      .join(' ');
    element.append(
      texte('rang', `${ligne.rang}.`), pastille(ligne.couleur), texte('pseudo', ligne.pseudo),
      texte('medailles', medailles), texte('score', `${ligne.pointsGlobaux} pts`),
    );
    if (avecEcart) {
      element.append(texte('ecart', ligne.ecartAuLeader > 0 ? `−${ligne.ecartAuLeader}` : 'en tête'));
    }
    griserSiDeconnecte(element, ligne);
    return element;
  }));
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
