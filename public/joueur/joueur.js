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
const boutonEntrer = formulaire.querySelector('button[type="submit"]');

// Code de la salle qu'on essaie de rejoindre, mémorisé une fois dedans.
let codeEnCours = '';
// Vrai quand ce code vient du QR code ou de la mémoire, et non de la saisie.
let codeNonSaisi = false;

// Étape affichée, renvoyée avec « Suivant » : le serveur ignore un « Suivant »
// d'une étape déjà passée (double appui).
let etapeRecue = '';

function envoyerSuivant() {
  socket.emit('hote:suivant', { etape: etapeRecue });
}

// Android seulement : iOS ne connaît pas navigator.vibrate. Chrome refuse
// (avec une erreur en console) tant que la page n'a pas été touchée.
function vibrer(dureeMs) {
  if (!navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(dureeMs);
}

// Retour immédiat à l'appui, purement visuel : le prochain joueur:etat
// redessine l'écran, que le serveur ait accepté l'appui ou non.
function marquerAppui(bouton) {
  vibrer(30);
  bouton.classList.add('appuye');
  bouton.parentElement.classList.add('appui-en-cours');
}

// Pour les boutons « Valider » des saisies.
function marquerEnvoi(bouton) {
  vibrer(30);
  bouton.disabled = true;
  bouton.classList.add('envoi-en-cours');
}

function relacherAppuis() {
  for (const bouton of document.querySelectorAll('.appuye')) bouton.classList.remove('appuye');
  for (const liste of document.querySelectorAll('.appui-en-cours')) liste.classList.remove('appui-en-cours');
  for (const bouton of document.querySelectorAll('.envoi-en-cours')) {
    bouton.classList.remove('envoi-en-cours');
    bouton.disabled = false;
  }
}

// Une vibration à l'arrivée sur un résultat, la même que l'on ait gagné ou perdu :
// elle ne doit rien révéler au voisin avant la TV.
const ECRANS_RESULTAT = ['resultat', 'fin_manche'];
let ecranPrecedent = '';

function vibrerAuResultat(ecran) {
  if (ECRANS_RESULTAT.includes(ecran) && ecran !== ecranPrecedent) vibrer(120);
  ecranPrecedent = ecran;
}

champCode.value = codeUrl;
champPseudo.value = stockage.getItem('pseudo') || '';

// On reprend sa place seulement si on revient dans la même salle
// (un QR code d'une autre salle l'emporte sur le souvenir).
function salleMemorisee() {
  const code = stockage.getItem('codeSalle');
  if (!code || (codeUrl && codeUrl !== code)) return null;
  return {
    code,
    pseudo: stockage.getItem('pseudo'),
    id: stockage.getItem('idJoueur'),
    cle: stockage.getItem('cleJoueur'),
  };
}

function oublierSalle() {
  for (const nom of ['codeSalle', 'pseudo', 'idJoueur', 'cleJoueur']) stockage.removeItem(nom);
}

// À chaque (re)connexion du socket, y compris au chargement de la page.
socket.on('connect', () => {
  bandeau.hidden = true;
  const memoire = salleMemorisee();
  if (!memoire) return;
  codeEnCours = memoire.code;
  codeNonSaisi = true;
  socket.emit('joueur:rejoindre', memoire);
});

socket.on('disconnect', () => {
  bandeau.hidden = false;
});

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  messageErreur.hidden = true;
  codeEnCours = champCode.value.trim().toUpperCase();
  codeNonSaisi = codeEnCours === codeUrl;
  // Réactivé à la réponse du serveur : un double appui ne crée pas deux joueurs.
  boutonEntrer.disabled = true;
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

document.getElementById('bouton-nouvelle-aventure').addEventListener('click', () => {
  socket.emit('hote:rejouer');
});

document.getElementById('bouton-suivant-fin').addEventListener('click', envoyerSuivant);

for (const bouton of document.querySelectorAll('.bouton-changer-format')) {
  bouton.addEventListener('click', () => socket.emit('hote:changerFormat'));
}

// Format reçu du serveur, que l'hôte modifie. Les bornes sont vérifiées par le serveur :
// ici, elles ne servent qu'à griser − et +.
const OBJECTIF_MIN = 3;
const OBJECTIF_MAX = 15;
let formatRecu = { type: 'petite', objectif: 5 };

function configurerFormat(changement) {
  socket.emit('hote:configurer', { ...formatRecu, ...changement });
}

for (const bouton of document.querySelectorAll('[data-format]')) {
  bouton.addEventListener('click', () => configurerFormat({ type: bouton.dataset.format }));
}

document.getElementById('objectif-moins').addEventListener('click', () => {
  configurerFormat({ objectif: formatRecu.objectif - 1 });
});

document.getElementById('objectif-plus').addEventListener('click', () => {
  configurerFormat({ objectif: formatRecu.objectif + 1 });
});

// Thèmes et difficulté du quiz reçus du serveur, que l'hôte modifie.
let reglagesRecus = null;
const panneauReglages = document.getElementById('panneau-reglages');

function reglerQuestions(changement) {
  const { categories, difficulte } = reglagesRecus;
  socket.emit('hote:reglerMode', { categories, difficulte, ...changement });
}

document.getElementById('bouton-reglages').addEventListener('click', () => {
  panneauReglages.hidden = false;
});

document.getElementById('fermer-reglages').addEventListener('click', () => {
  panneauReglages.hidden = true;
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
  boutonEntrer.disabled = false;
  if (erreur.code === 'salle_introuvable') oublierSalle();
  document.getElementById('entete').hidden = true;
  confirmation.hidden = true;
  panneauReglages.hidden = true;
  afficherEcran('rejoindre');
  const partieDisparue = erreur.code === 'salle_introuvable' && codeNonSaisi;
  if (partieDisparue) oublierCodeUrl();
  messageErreur.textContent = partieDisparue
    ? 'Cette partie n\'existe plus. Scanne le nouveau QR code sur la TV'
    : erreur.message;
  messageErreur.hidden = false;
});

// Après un redémarrage du serveur, l'ancien code (QR ou mémoire) ne marche plus :
// on vide le champ et on le retire de l'URL, pour qu'on rescanne au lieu de réessayer.
function oublierCodeUrl() {
  champCode.value = '';
  codeNonSaisi = false;
  const url = new URL(location.href);
  url.searchParams.delete('code');
  history.replaceState(null, '', url);
}

// Écrans communs à tous les modes.
const affichagesCommuns = {
  attente: afficherAttente,
  attente_question: () => {},
  fin: afficherFin,
  tableau: afficherTableau,
  grandGagnant: afficherGrandGagnant,
};

// Écrans propres à chaque mode. Remplis par /joueur/modes/<mode>.js.
const modesJoueur = {};

socket.on('joueur:etat', (vue) => {
  boutonEntrer.disabled = false;
  etapeRecue = vue.etape;
  stockage.setItem('idJoueur', vue.id);
  stockage.setItem('cleJoueur', vue.cle);
  stockage.setItem('codeSalle', codeEnCours);
  stockage.setItem('pseudo', vue.pseudo);
  afficherEntete(vue);
  relacherAppuis();
  vibrerAuResultat(vue.ecran);
  if (vue.ecran !== 'attente') panneauReglages.hidden = true;
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
  afficherModes('attente', vue);
  afficherFormat(vue);
  afficherReglages(vue);
}

// Seulement pour un mode qui a des réglages (le quiz). L'hôte les change, les autres les voient.
function afficherReglages(vue) {
  reglagesRecus = vue.reglages;
  const texte = document.getElementById('reglages-choisis');
  const bouton = document.getElementById('bouton-reglages');
  texte.hidden = !vue.reglages || vue.estHote;
  bouton.hidden = !vue.reglages || !vue.estHote;
  if (bouton.hidden) panneauReglages.hidden = true;
  if (!vue.reglages) return;
  texte.textContent = `Questions : ${vue.reglages.resume}`;
  document.getElementById('resume-reglages').textContent = `Questions : ${vue.reglages.resume}`;
  if (vue.estHote) remplirPanneauReglages(vue.reglages);
}

// « Tous » coché, un appui sur un thème ne garde que lui. Le dernier thème ne se décoche pas.
function remplirPanneauReglages({ categories, difficulte, options, inedites }) {
  const toutes = categories.length === options.categories.length;
  const themes = options.categories.map(({ id, libelle }) => {
    const choisi = !toutes && categories.includes(id);
    let suivantes = choisi ? categories.filter((autre) => autre !== id) : [...categories, id];
    if (toutes) suivantes = [id];
    return boutonReglage(libelle, choisi, suivantes.length ? { categories: suivantes } : null);
  });
  const tous = boutonReglage('Tous', toutes, { categories: options.categories.map(({ id }) => id) });
  document.getElementById('choix-themes').replaceChildren(tous, ...themes);
  document.getElementById('choix-difficulte').replaceChildren(...options.difficultes.map(
    ({ id, libelle }) => boutonReglage(libelle, id === difficulte, { difficulte: id }),
  ));
  document.getElementById('inedites-reglages').textContent = texteInedites(inedites);
}

// changement null : l'appui ne change rien (dernier thème coché).
function boutonReglage(texte, choisi, changement) {
  const bouton = document.createElement('button');
  bouton.className = 'bouton-mode';
  bouton.classList.toggle('choisi', choisi);
  bouton.textContent = texte;
  bouton.addEventListener('click', () => changement && reglerQuestions(changement));
  return bouton;
}

// Moins de 10 : la partie reprendra des questions déjà vues.
function texteInedites(nombre) {
  const jamaisVues = nombre > 1 ? `${nombre} questions jamais vues` : `${nombre} question jamais vue`;
  return nombre < 10 ? `Seulement ${jamaisVues} : certaines reviendront` : jamaisVues;
}

// L'hôte règle le format, les autres le voient.
function afficherFormat(vue) {
  formatRecu = vue.format;
  const { type, objectif } = vue.format;
  const texte = document.getElementById('format-choisi');
  texte.textContent = type === 'petite' ? 'Petite partie' : `Aventure — premier à ${objectif} points`;
  texte.hidden = vue.estHote;
  document.getElementById('reglage-format').hidden = !vue.estHote;
  for (const bouton of document.querySelectorAll('[data-format]')) {
    bouton.classList.toggle('choisi', bouton.dataset.format === type);
  }
  document.getElementById('reglage-objectif').hidden = type !== 'aventure';
  document.getElementById('objectif').textContent = objectif;
  document.getElementById('objectif-moins').disabled = objectif <= OBJECTIF_MIN;
  document.getElementById('objectif-plus').disabled = objectif >= OBJECTIF_MAX;
}

// Salle d'attente et tableau : l'hôte choisit le mode, les autres voient le mode choisi.
function afficherModes(nomEcran, vue) {
  const ecran = document.querySelector(`main[data-ecran="${nomEcran}"]`);
  const texte = ecran.querySelector('.mode-choisi');
  texte.textContent = `Mode : ${vue.modeChoisi}`;
  texte.hidden = vue.estHote;
  const liste = ecran.querySelector('.choix-modes');
  liste.hidden = !vue.estHote;
  if (vue.estHote) liste.replaceChildren(...vue.modes.map((mode) => boutonMode(mode, vue.mode)));
}

function boutonMode(mode, modeChoisi) {
  const bouton = document.createElement('button');
  bouton.className = 'bouton-mode';
  bouton.classList.toggle('choisi', mode.id === modeChoisi);
  bouton.dataset.mode = mode.id;
  bouton.disabled = !mode.disponible;
  const detail = document.createElement('small');
  if (mode.bientot) detail.textContent = 'Bientôt';
  else if (!mode.disponible) detail.textContent = `${mode.joueursMin} joueurs min.`;
  bouton.append(mode.nom, detail);
  return bouton;
}

// Les boutons sont recréés à chaque mise à jour : un seul écouteur pour tous.
document.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-mode[data-mode]');
  if (bouton && !bouton.disabled) socket.emit('hote:choisirMode', bouton.dataset.mode);
});

const MEDAILLES = { or: '🥇 Médaille d\'or', argent: '🥈 Médaille d\'argent', bronze: '🥉 Médaille de bronze' };

function afficherFin(vue) {
  document.getElementById('rang-fin').textContent = texteRang(vue.rang);
  document.getElementById('score-fin').textContent = vue.score;
  document.getElementById('medaille-fin').textContent = vue.medaille
    ? `${MEDAILLES[vue.medaille]}, +${vue.gain}`
    : 'Pas de médaille cette fois';
  document.getElementById('bouton-suivant-fin').hidden = !vue.estHote;
}

function afficherTableau(vue) {
  document.getElementById('rang-tableau').textContent = texteRang(vue.rangGlobal);
  document.getElementById('points-tableau').textContent = textePoints(vue.pointsGlobaux);
  const boutonRejouer = document.getElementById('bouton-rejouer');
  boutonRejouer.textContent = vue.format.type === 'aventure' ? 'Partie suivante' : 'Rejouer';
  boutonRejouer.hidden = !vue.estHote;
  boutonRejouer.disabled = !vue.assezDeJoueurs;
  afficherChangerFormat('tableau', vue);
  afficherModes('tableau', vue);
}

function afficherGrandGagnant(vue) {
  document.getElementById('titre-grand-gagnant').textContent = vue.estGrandGagnant
    ? '🏆 Tu gagnes l\'aventure !'
    : `🏆 ${vue.grandGagnant} gagne l'aventure`;
  document.getElementById('rang-grand-gagnant').textContent = texteRang(vue.rangGlobal);
  document.getElementById('points-grand-gagnant').textContent = textePoints(vue.pointsGlobaux);
  const boutonNouvelle = document.getElementById('bouton-nouvelle-aventure');
  boutonNouvelle.hidden = !vue.estHote;
  boutonNouvelle.disabled = !vue.assezDeJoueurs;
  afficherChangerFormat('grandGagnant', vue);
}

function afficherChangerFormat(nomEcran, vue) {
  document.querySelector(`main[data-ecran="${nomEcran}"] .bouton-changer-format`).hidden = !vue.estHote;
}

function textePoints(points) {
  return points > 1 ? `${points} points` : `${points} point`;
}

function texteRang(rang) {
  return rang === 1 ? '1er' : `${rang}e`;
}
