// Écrans de Qui suis-je ? sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de tv.js.

const photoQsj = document.getElementById('qsj-photo');
const flashQsj = document.getElementById('qsj-flash');

// Dernières valeurs affichées pendant le jeu : un changement de personnage (trouvé ou passé)
// ou une validation refusée se voient et s'entendent.
let personnageAfficheQsj = null;
let trouvesAffichesQsj = 0;
let validationAfficheeQsj = false;

// Pendant le chargement, l'ancienne photo est cachée : elle irait mal avec le nouveau nom.
// Photo introuvable : le nom seul, en très grand.
photoQsj.addEventListener('load', () => { photoQsj.parentElement.classList.remove('absente', 'chargement'); });
photoQsj.addEventListener('error', () => { photoQsj.parentElement.classList.add('absente'); });

function joueurQsj(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

function pseudoActifQsj(salle) {
  return joueurQsj(salle, salle.etatMode.actif)?.pseudo ?? '?';
}

function numeroTourQsj({ numero, total }) {
  return `Tour ${numero}/${total}`;
}

function prechargerQsj(personnageSuivant) {
  if (personnageSuivant) new Image().src = personnageSuivant.image;
}

function afficherPreparationQsj(salle, nouvelleEtape) {
  if (nouvelleEtape) sonner('etape');
  const actif = joueurQsj(salle, salle.etatMode.actif);
  document.getElementById('qsj-numero-preparation').textContent = numeroTourQsj(salle.etatMode);
  document.getElementById('qsj-actif-preparation').replaceChildren(
    'Au tour de ', ...(actif ? [pastille(actif.couleur), actif.pseudo] : ['?']), ' !',
  );
  document.getElementById('qsj-consigne-preparation').textContent =
    'Tourne le dos à la TV, puis appuie sur « C\'est parti ! »';
  prechargerQsj(salle.etatMode.personnageSuivant);
}

// « Trouvé ! » ou « Passé ! −15 s » un instant par-dessus le personnage.
function flasherQsj(texte, juste) {
  flashQsj.textContent = texte;
  flashQsj.classList.toggle('juste', juste);
  flashQsj.hidden = false;
  flashQsj.classList.remove('rebond');
  void flashQsj.offsetWidth;
  flashQsj.classList.add('rebond');
  clearTimeout(flasherQsj.minuteur);
  flasherQsj.minuteur = setTimeout(() => { flashQsj.hidden = true; }, 1200);
}

// Son et flash quand le personnage change ou qu'une validation est refusée.
// Un « Passer » avance la fin du tour : la barre repart du nouveau temps restant.
function signalerChangementQsj(salle) {
  const { personnage, nbTrouves, enValidation, tempsRestantMs } = salle.etatMode;
  if (personnage.nom !== personnageAfficheQsj) {
    if (nbTrouves > trouvesAffichesQsj) {
      sonner('victoire');
      flasherQsj('Trouvé !', true);
    } else {
      sonner('rate');
      flasherQsj('Passé ! −15 s', false);
      viderBarreTemps(document.getElementById('qsj-barre'), tempsRestantMs);
    }
  } else if (validationAfficheeQsj && !enValidation) {
    sonner('rate');
    flasherQsj('Refusé ! On continue.', false);
  }
}

function afficherJeuQsj(salle, nouvelleEtape) {
  const {
    personnage, nbTrouves, enValidation, tempsEcoule, tempsRestantMs, personnageSuivant,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('lancement');
    viderBarreTemps(document.getElementById('qsj-barre'), tempsRestantMs);
    flashQsj.hidden = true;
  } else signalerChangementQsj(salle);
  personnageAfficheQsj = personnage.nom;
  trouvesAffichesQsj = nbTrouves;
  validationAfficheeQsj = enValidation;

  const pseudo = pseudoActifQsj(salle);
  document.getElementById('qsj-numero-jeu').textContent = numeroTourQsj(salle.etatMode);
  document.getElementById('qsj-actif-jeu').textContent = `${pseudo} devine`;
  if (photoQsj.getAttribute('src') !== personnage.image) {
    photoQsj.parentElement.classList.remove('absente');
    photoQsj.parentElement.classList.add('chargement');
    photoQsj.src = personnage.image;
  }
  document.getElementById('qsj-nom').textContent = personnage.nom;
  document.getElementById('qsj-categorie').textContent = personnage.categorie;
  document.getElementById('qsj-trouves').textContent = nbTrouves > 1 ? `${nbTrouves} trouvés` : `${nbTrouves} trouvé`;
  document.getElementById('qsj-credit').textContent = `Image : ${personnage.auteur}, ${personnage.licence}, Wikimedia`;
  const bandeau = document.getElementById('qsj-bandeau');
  const valideur = joueurQsj(salle, salle.etatMode.valideur)?.pseudo ?? 'Personne pour valider';
  bandeau.hidden = !enValidation;
  bandeau.textContent = tempsEcoule
    ? `Temps écoulé ! ${pseudo} pense avoir trouvé… ${valideur} tranche.`
    : `${pseudo} pense avoir trouvé… ${valideur} vérifie.`;
  lancerChrono(document.getElementById('qsj-chrono'), tempsRestantMs);
  prechargerQsj(personnageSuivant);
}

function vignetteQsj({ nom, image }) {
  const element = document.createElement('li');
  const photo = document.createElement('img');
  photo.src = image;
  photo.alt = '';
  element.append(photo, texte('qsj-nom-vignette', nom));
  return element;
}

function afficherBilanQsj(salle, nouvelleEtape) {
  const {
    trouves, passes, points, classement,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  const pseudo = pseudoActifQsj(salle);
  document.getElementById('qsj-numero-bilan').textContent = numeroTourQsj(salle.etatMode);
  document.getElementById('qsj-verdict').textContent = trouves.length
    ? `${pseudo} : ${trouves.length} trouvé${trouves.length > 1 ? 's' : ''}, +${points}`
    : `${pseudo} : aucun trouvé. Ça arrive. Souvent.`;
  document.getElementById('qsj-vignettes').replaceChildren(...trouves.map(vignetteQsj));
  document.getElementById('qsj-passes').textContent = passes.length
    ? `Passés : ${passes.map((passe) => passe.nom).join(', ')}`
    : '';
  document.getElementById('qsj-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

modesTv['qui-suis-je'] = {
  preparation: afficherPreparationQsj,
  jeu: afficherJeuQsj,
  bilan: afficherBilanQsj,
};
