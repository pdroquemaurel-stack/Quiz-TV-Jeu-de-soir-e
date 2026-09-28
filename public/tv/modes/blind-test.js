// Écrans du Blind test sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js,
// la lecture des extraits de tv/extraits.js.
// Classique : une piste, arrêtée dès que la manche quitte l'écoute.
// Mix : 5 pistes, mises en pause pendant une désignation ; une chanson trouvée est arrêtée.

// Délai entre deux chansons non trouvées qui se retournent à la révélation du mix.
const DELAI_RETOURNEMENT_MIX_MS = 800;

let pisteBlindTest = null;
let idPisteBlindTest = null;
// Les pistes du mix en cours, par index de chanson, et celles qui ne se chargent pas.
let pistesMix = new Map();
let indisponiblesMix = new Set();
// Mix affiché (son numéro) et nombre de chansons trouvées, pour ne jouer les sons qu'une fois.
let numeroMixAffiche = null;
let trouveesMixAffichees = 0;
// Cartes affichées : on ne les reconstruit que si elles changent.
let cartesMixAffichees = '';
// Les extraits de la manche suivante, chargés pendant la révélation et jamais joués.
let pistesSuivantes = [];

// Si le navigateur refuse la lecture (son pas encore débloqué), on réessaie au prochain appui.
function lirePiste(piste) {
  piste.play().catch(() => {
    const reessayer = () => {
      if (piste.getAttribute('src')) piste.play().catch(() => {});
    };
    document.addEventListener('keydown', reessayer, { once: true });
    document.addEventListener('click', reessayer, { once: true });
  });
}

function prechargerExtraits(ids) {
  const sources = ids.map((idExtrait) => `/extrait/${idExtrait}`);
  if (sources.join() === pistesSuivantes.map((piste) => piste.getAttribute('src')).join()) return;
  for (const piste of pistesSuivantes) arreterPiste(piste);
  pistesSuivantes = sources.map((source) => {
    const piste = new Audio();
    piste.preload = 'auto';
    piste.src = source;
    return piste;
  });
}

// Au podium, plus rien ne joue ni ne se charge sur le stick.
function arreterToutBlindTest() {
  arreterExtraitClassique();
  arreterMix();
  for (const piste of pistesSuivantes) arreterPiste(piste);
  pistesSuivantes = [];
}

function joueurBlindTest(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

// Pastille et pseudo du maître de la manche.
function afficherMaitreBlindTest(salle, idElement) {
  const maitre = joueurBlindTest(salle, salle.etatMode.maitre);
  document.getElementById(idElement).replaceChildren(pastille(maitre.couleur), texte('pseudo', maitre.pseudo));
}

function libelleManche({ format, numero, total }) {
  return `${format === 'mix' ? 'Mix' : 'Chanson'} ${numero}/${total}`;
}

// Le disque en classique, les cartes en mix.
function montrerDisqueOuCartes(phase, format) {
  document.getElementById(`bt-disque-${phase}`).hidden = format === 'mix';
  document.getElementById(`bt-cartes-${phase}`).hidden = format !== 'mix';
}

// « Suivi » d'une étiquette de joueur par ses points : « [Léa] +500 ».
function etiquetteGagnant(salle, joueurId, points) {
  const etiquette = etiquetteJoueur(joueurBlindTest(salle, joueurId), false);
  etiquette.append(texte('gain', `+${points}`));
  return etiquette;
}

// ---------- Relais ----------

// Rien ne joue : les extraits de la manche se chargent, le maître lance la musique.
function afficherRelaisBlindTest(salle) {
  arreterExtraitClassique();
  arreterMix();
  numeroMixAffiche = null;
  document.getElementById('bt-numero-relais').textContent = libelleManche(salle.etatMode);
  afficherMaitreBlindTest(salle, 'bt-maitre-relais');
  prechargerExtraits(salle.etatMode.extraitsSuivants.map((extrait) => extrait.id));
}

// ---------- Écoute ----------

function afficherEcouteBlindTest(salle, nouvelleEtape) {
  const { format, tempsRestantMs } = salle.etatMode;
  montrerDisqueOuCartes('ecoute', format);
  afficherMaitreBlindTest(salle, 'bt-maitre-ecoute');
  lancerChrono(document.getElementById('bt-chrono-ecoute'), tempsRestantMs);
  if (format === 'mix') afficherEcouteMix(salle, nouvelleEtape);
  else afficherEcouteClassique(salle, nouvelleEtape);
}

function afficherEcouteClassique(salle, nouvelleEtape) {
  const { extrait, tempsEcouleMs, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('bt-numero-ecoute').textContent = libelleManche(salle.etatMode);
    viderBarreTemps(document.getElementById('bt-barre-temps-ecoute'), tempsRestantMs);
  }
  jouerExtraitClassique(extrait, tempsEcouleMs);
}

// Après un rechargement de la TV, l'extrait reprend là où il en serait.
function jouerExtraitClassique({ id, depart, gain }, tempsEcouleMs) {
  if (idPisteBlindTest === id) return;
  arreterExtraitClassique();
  const indisponible = document.getElementById('bt-indisponible');
  indisponible.hidden = true;
  idPisteBlindTest = id;
  pisteBlindTest = creerPiste(id, { depart: depart + tempsEcouleMs / 1000, gain }, () => {
    indisponible.hidden = false;
  });
  lirePiste(pisteBlindTest);
}

function arreterExtraitClassique() {
  if (pisteBlindTest) arreterPiste(pisteBlindTest);
  pisteBlindTest = null;
  idPisteBlindTest = null;
}

// L'écoute du mix revient après chaque désignation : le « ding » ne sonne qu'au début du mix,
// et chaque chanson trouvée fait « tadam ».
function afficherEcouteMix(salle, nouvelleEtape) {
  const { numero, cartes } = salle.etatMode;
  if (numero !== numeroMixAffiche) {
    arreterMix();
    numeroMixAffiche = numero;
    trouveesMixAffichees = 0;
    sonner('etape');
  }
  const trouvees = cartes.filter((carte) => carte.joueur).length;
  if (trouvees > trouveesMixAffichees) sonner('revelation');
  trouveesMixAffichees = trouvees;
  if (nouvelleEtape) {
    document.getElementById('bt-numero-ecoute').textContent = libelleManche(salle.etatMode);
    decompterEcoute(salle.etatMode);
  }
  jouerMix(salle);
  afficherCartesMix(salle, 'bt-cartes-ecoute');
}

// La barre reprend à la fraction du décompte d'écoute qui reste, après une désignation.
function decompterEcoute({ dureeEcouteMs, ecouteRestanteMs }) {
  const barre = document.getElementById('bt-barre-temps-ecoute');
  barre.style.animation = 'none';
  void barre.offsetWidth;
  barre.style.animation = `vider ${dureeEcouteMs}ms linear ${ecouteRestanteMs - dureeEcouteMs}ms forwards`;
}

// Chaque chanson pas encore trouvée joue (ou reprend après une pause) ; une trouvée s'arrête.
function jouerMix(salle) {
  const { cartes, tempsEcouteMs } = salle.etatMode;
  cartes.forEach((carte, index) => {
    const piste = pistesMix.get(index);
    if (!carte.extrait) {
      if (piste) arreterPiste(piste);
      pistesMix.delete(index);
      return;
    }
    if (piste) {
      if (piste.paused) lirePiste(piste);
      return;
    }
    const { id, depart, gain } = carte.extrait;
    const nouvelle = creerPiste(id, { depart: depart + tempsEcouteMs / 1000, gain }, () => {
      indisponiblesMix.add(index);
      cartesMixAffichees = '';
      afficherCartesMix(salle, 'bt-cartes-ecoute');
    });
    pistesMix.set(index, nouvelle);
    lirePiste(nouvelle);
  });
}

function mettreMixEnPause() {
  for (const piste of pistesMix.values()) piste.pause();
}

function arreterMix() {
  for (const piste of pistesMix.values()) arreterPiste(piste);
  pistesMix = new Map();
  indisponiblesMix = new Set();
  cartesMixAffichees = '';
}

// Une carte « ? » par chanson qui joue, retournée (pochette, titre, gagnant) dès qu'elle est trouvée.
function afficherCartesMix(salle, idListe) {
  const { cartes, chansonEnDesignation } = salle.etatMode;
  const signature = JSON.stringify([idListe, cartes, chansonEnDesignation, [...indisponiblesMix]]);
  if (signature === cartesMixAffichees) return;
  cartesMixAffichees = signature;
  document.getElementById(idListe).replaceChildren(...cartes.map((carte, index) => {
    const element = document.createElement('li');
    element.className = 'bt-carte';
    element.classList.toggle('arretee', index === chansonEnDesignation);
    if (carte.extrait) {
      element.classList.toggle('indisponible', indisponiblesMix.has(index));
      const disque = document.createElement('div');
      disque.className = `bt-mini-disque${chansonEnDesignation === undefined ? ' tourne' : ''}`;
      disque.append(texte('bt-etiquette-disque', '?'));
      element.append(disque, texte('bt-titre-carte', indisponiblesMix.has(index) ? 'Indisponible' : ''));
      return element;
    }
    element.classList.add('trouvee');
    const pochette = document.createElement('img');
    pochette.className = 'bt-pochette-carte';
    pochette.src = carte.pochette;
    pochette.alt = '';
    const gagnant = document.createElement('ul');
    gagnant.className = 'etiquettes';
    gagnant.append(etiquetteGagnant(salle, carte.joueur, carte.points));
    element.append(pochette, texte('bt-titre-carte', carte.titre), texte('bt-artiste-carte', carte.artiste), gagnant);
    return element;
  }));
}

// ---------- Désignation ----------

function afficherDesignationBlindTest(salle, nouvelleEtape) {
  const { format, tempsRestantMs, ecouteRestanteMs } = salle.etatMode;
  montrerDisqueOuCartes('designation', format);
  afficherMaitreBlindTest(salle, 'bt-maitre-designation');
  if (nouvelleEtape) {
    document.getElementById('bt-numero-designation').textContent = libelleManche(salle.etatMode);
    viderBarreTemps(document.getElementById('bt-barre-temps-designation'), tempsRestantMs);
  }
  lancerChrono(document.getElementById('bt-chrono-designation'), tempsRestantMs);
  const figee = document.getElementById('bt-ecoute-figee');
  figee.hidden = format !== 'mix';
  if (format === 'mix') {
    figee.textContent = `Écoute en pause : ${Math.ceil(ecouteRestanteMs / 1000)} s restantes`;
    mettreMixEnPause();
    afficherCartesMix(salle, 'bt-cartes-designation');
  } else {
    arreterExtraitClassique();
  }
}

// ---------- Révélation ----------

function afficherRevelationBlindTest(salle, nouvelleEtape) {
  const { format, classement } = salle.etatMode;
  arreterExtraitClassique();
  arreterMix();
  numeroMixAffiche = null;
  document.getElementById('bt-reponse').hidden = format === 'mix';
  document.getElementById('bt-liste-mix').hidden = format !== 'mix';
  if (nouvelleEtape) {
    document.getElementById('bt-numero-revelation').textContent = libelleManche(salle.etatMode);
    if (format === 'mix') revelerMix(salle);
    else revelerClassique(salle);
  }
  if (format === 'classique') {
    remplirTrouveClassique(salle, 'bt-trouve-titre', salle.etatMode.titre);
    remplirTrouveClassique(salle, 'bt-trouve-artiste', salle.etatMode.artiste);
    if (salle.etatMode.extraitSuivant) prechargerExtraits([salle.etatMode.extraitSuivant.id]);
  } else if (salle.etatMode.extraitsSuivants) {
    prechargerExtraits(salle.etatMode.extraitsSuivants.map((extrait) => extrait.id));
  }
  document.getElementById('bt-classement').replaceChildren(...classement.map((ligne) => ligneClassement(ligne, true)));
}

function revelerClassique(salle) {
  const { chanson, titre, artiste } = salle.etatMode;
  sonner(sonRevelationClassique(titre, artiste));
  document.getElementById('bt-pochette').src = chanson.pochette;
  document.getElementById('bt-titre').textContent = chanson.titre;
  document.getElementById('bt-artiste').textContent = chanson.artiste;
  afficherVerdict(verdictClassique(titre, artiste));
}

function afficherVerdict(texteVerdict) {
  const verdict = document.getElementById('bt-verdict');
  verdict.textContent = texteVerdict;
  verdict.hidden = texteVerdict === '';
}

// « Titre : [Léa] +500 », ou « Personne ».
function remplirTrouveClassique(salle, idLigne, joueurId) {
  const liste = document.getElementById(idLigne).querySelector('ul');
  if (joueurId === null) liste.replaceChildren(texte('bt-personne', 'Personne'));
  else liste.replaceChildren(etiquetteGagnant(salle, joueurId, 500));
}

function verdictClassique(titre, artiste) {
  if (titre !== null && titre === artiste) return 'Doublé !';
  if (titre === null && artiste === null) return 'Personne n\'a trouvé';
  return '';
}

function sonRevelationClassique(titre, artiste) {
  if (titre !== null && titre === artiste) return 'victoire';
  if (titre === null && artiste === null) return 'rate';
  return 'revelation';
}

// Une ligne par chanson : les trouvées d'abord en place, les autres se retournent une par une.
// Après un rechargement de la TV, tout s'affiche d'un coup.
function revelerMix(salle) {
  const { cartes } = salle.etatMode;
  const toutes = cartes.every((carte) => carte.joueur);
  if (toutes) sonner('victoire');
  afficherVerdict(toutes ? 'Toutes trouvées !' : '');
  let retournees = 0;
  document.getElementById('bt-liste-mix').replaceChildren(...cartes.map((carte) => {
    const element = document.createElement('li');
    const pochette = document.createElement('img');
    pochette.className = 'bt-pochette-ligne';
    pochette.src = carte.pochette;
    pochette.alt = '';
    const textes = document.createElement('div');
    textes.append(texte('bt-titre-ligne', carte.titre), texte('bt-artiste-ligne', carte.artiste));
    const gagnant = document.createElement('ul');
    gagnant.className = 'etiquettes';
    gagnant.append(carte.joueur ? etiquetteGagnant(salle, carte.joueur, carte.points) : texte('bt-personne', 'Personne'));
    element.append(pochette, textes, gagnant);
    if (!carte.joueur) {
      element.classList.add('non-trouvee');
      element.style.animationDelay = premierEtatRecu ? '0ms' : `${retournees * DELAI_RETOURNEMENT_MIX_MS}ms`;
      retournees++;
    }
    return element;
  }));
}

modesTv['blind-test'] = {
  relais: afficherRelaisBlindTest,
  ecoute: afficherEcouteBlindTest,
  designation: afficherDesignationBlindTest,
  revelation: afficherRevelationBlindTest,
  completerPodium: arreterToutBlindTest,
};
