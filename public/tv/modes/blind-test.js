// Écrans du Blind test sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js,
// la lecture des extraits de tv/extraits.js. Une seule piste joue à la fois ; elle s'arrête
// dès que la manche quitte l'écoute.

let pisteBlindTest = null;
let idPisteBlindTest = null;
// L'extrait de la manche suivante, chargé pendant la révélation et jamais joué.
const pisteSuivanteBlindTest = new Audio();
pisteSuivanteBlindTest.preload = 'auto';

// Si le navigateur refuse la lecture (son pas encore débloqué), on réessaie au prochain appui.
function lirePisteBlindTest(piste) {
  piste.play().catch(() => {
    const reessayer = () => {
      if (piste === pisteBlindTest) piste.play().catch(() => {});
    };
    document.addEventListener('keydown', reessayer, { once: true });
    document.addEventListener('click', reessayer, { once: true });
  });
}

// Après un rechargement de la TV, l'extrait reprend là où il en serait.
function jouerExtraitBlindTest({ id, depart, gain }, tempsEcouleMs) {
  if (idPisteBlindTest === id) return;
  arreterExtraitBlindTest();
  const indisponible = document.getElementById('bt-indisponible');
  indisponible.hidden = true;
  idPisteBlindTest = id;
  pisteBlindTest = creerPiste(id, { depart: depart + tempsEcouleMs / 1000, gain }, () => {
    indisponible.hidden = false;
  });
  lirePisteBlindTest(pisteBlindTest);
}

function arreterExtraitBlindTest() {
  if (pisteBlindTest) arreterPiste(pisteBlindTest);
  pisteBlindTest = null;
  idPisteBlindTest = null;
}

function prechargerExtraitBlindTest(extraitSuivant) {
  const source = `/extrait/${extraitSuivant.id}`;
  if (pisteSuivanteBlindTest.getAttribute('src') !== source) pisteSuivanteBlindTest.src = source;
}

// Au podium, plus rien ne joue ni ne se charge sur le stick.
function arreterToutBlindTest() {
  arreterExtraitBlindTest();
  arreterPiste(pisteSuivanteBlindTest);
}

function joueurBlindTest(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

// Pastille et pseudo du maître de la manche.
function afficherMaitreBlindTest(salle, idElement) {
  const maitre = joueurBlindTest(salle, salle.etatMode.maitre);
  document.getElementById(idElement).replaceChildren(pastille(maitre.couleur), texte('pseudo', maitre.pseudo));
}

// Barre de temps, chrono et numéro : communs à l'écoute et à la désignation.
function afficherEnteteBlindTest(salle, nouvelleEtape, phase) {
  const { numero, total, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById(`bt-numero-${phase}`).textContent = `Chanson ${numero}/${total}`;
    viderBarreTemps(document.getElementById(`bt-barre-temps-${phase}`), tempsRestantMs);
  }
  lancerChrono(document.getElementById(`bt-chrono-${phase}`), tempsRestantMs);
}

function afficherEcouteBlindTest(salle, nouvelleEtape) {
  if (nouvelleEtape) sonner('etape');
  afficherEnteteBlindTest(salle, nouvelleEtape, 'ecoute');
  afficherMaitreBlindTest(salle, 'bt-maitre-ecoute');
  jouerExtraitBlindTest(salle.etatMode.extrait, salle.etatMode.tempsEcouleMs);
}

function afficherDesignationBlindTest(salle, nouvelleEtape) {
  arreterExtraitBlindTest();
  afficherEnteteBlindTest(salle, nouvelleEtape, 'designation');
  afficherMaitreBlindTest(salle, 'bt-maitre-designation');
}

function afficherRevelationBlindTest(salle, nouvelleEtape) {
  arreterExtraitBlindTest();
  const {
    numero, total, chanson, titre, artiste, classement, extraitSuivant,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner(sonRevelationBlindTest(titre, artiste));
    document.getElementById('bt-numero-revelation').textContent = `Chanson ${numero}/${total}`;
    document.getElementById('bt-pochette').src = chanson.pochette;
    document.getElementById('bt-titre').textContent = chanson.titre;
    document.getElementById('bt-artiste').textContent = chanson.artiste;
    const verdict = document.getElementById('bt-verdict');
    verdict.textContent = verdictBlindTest(titre, artiste);
    verdict.hidden = verdict.textContent === '';
  }
  remplirTrouveBlindTest(salle, 'bt-trouve-titre', titre);
  remplirTrouveBlindTest(salle, 'bt-trouve-artiste', artiste);
  if (extraitSuivant) prechargerExtraitBlindTest(extraitSuivant);
  document.getElementById('bt-classement').replaceChildren(...classement.map((ligne) => ligneClassement(ligne, true)));
}

// « Titre : [Léa] +500 », ou « Personne ».
function remplirTrouveBlindTest(salle, idLigne, joueurId) {
  const liste = document.getElementById(idLigne).querySelector('ul');
  if (joueurId === null) {
    liste.replaceChildren(texte('bt-personne', 'Personne'));
    return;
  }
  const etiquette = etiquetteJoueur(joueurBlindTest(salle, joueurId), false);
  etiquette.append(texte('gain', '+500'));
  liste.replaceChildren(etiquette);
}

function verdictBlindTest(titre, artiste) {
  if (titre !== null && titre === artiste) return 'Doublé !';
  if (titre === null && artiste === null) return 'Personne n\'a trouvé';
  return '';
}

function sonRevelationBlindTest(titre, artiste) {
  if (titre !== null && titre === artiste) return 'victoire';
  if (titre === null && artiste === null) return 'rate';
  return 'revelation';
}

modesTv['blind-test'] = {
  ecoute: afficherEcouteBlindTest,
  designation: afficherDesignationBlindTest,
  revelation: afficherRevelationBlindTest,
  completerPodium: arreterToutBlindTest,
};
