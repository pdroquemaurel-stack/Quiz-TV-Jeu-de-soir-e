// Écrans de Qui suis-je ? sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de tv.js.

const photoQsj = document.getElementById('qsj-photo');
const flashQsj = document.getElementById('qsj-flash');

// Dernières valeurs affichées pendant le jeu : un personnage trouvé ou passé, ou une
// validation refusée, se voient et s'entendent (même quand la TV ne montre pas le personnage).
let trouvesAffichesQsj = 0;
let passesAffichesQsj = 0;
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
  document.getElementById('qsj-consigne-preparation').textContent = salle.etatMode.affichage === 'telephones'
    ? 'Le personnage sera sur les téléphones des autres. Appuie sur « C\'est parti ! »'
    : 'Tourne le dos à la TV, puis appuie sur « C\'est parti ! »';
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
  const {
    nbTrouves, nbPasses, enValidation, tempsRestantMs,
  } = salle.etatMode;
  if (nbTrouves > trouvesAffichesQsj) {
    sonner('victoire');
    flasherQsj('Trouvé !', true);
  } else if (nbPasses > passesAffichesQsj) {
    sonner('rate');
    flasherQsj('Passé ! −15 s', false);
    viderBarreTemps(document.getElementById('qsj-barre'), tempsRestantMs);
  } else if (validationAfficheeQsj && !enValidation) {
    sonner('rate');
    flasherQsj('Refusé ! On continue.', false);
  }
}

function texteMinutesQsj(millisecondes) {
  const secondes = Math.max(0, Math.ceil(millisecondes / 1000));
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

// Contre la montre : le chrono monte, du temps déjà compté jusqu'au temps maximal.
function lancerChronoMontantQsj(element, { tempsEcouleMs, tempsRestantMs }) {
  const recuA = Date.now();
  const afficher = () => {
    element.textContent = texteMinutesQsj(tempsEcouleMs + Math.min(Date.now() - recuA, tempsRestantMs));
  };
  afficher();
  intervalleChrono = setInterval(afficher, 250);
}

function texteTrouvesTvQsj({ nbTrouves, format, objectif }) {
  const compte = format === 'chrono' ? `${nbTrouves}/${objectif}` : nbTrouves;
  return nbTrouves > 1 ? `${compte} trouvés` : `${compte} trouvé`;
}

function afficherPersonnageQsj(personnage) {
  if (photoQsj.getAttribute('src') !== personnage.image) {
    photoQsj.parentElement.classList.remove('absente');
    photoQsj.parentElement.classList.add('chargement');
    photoQsj.src = personnage.image;
  }
  document.getElementById('qsj-nom').textContent = personnage.nom;
  document.getElementById('qsj-categorie').textContent = personnage.categorie;
  document.getElementById('qsj-credit').textContent = `Image : ${personnage.auteur}, ${personnage.licence}, Wikimedia`;
}

function afficherJeuQsj(salle, nouvelleEtape) {
  const {
    personnage, nbTrouves, nbPasses, enValidation, tempsEcoule, tempsRestantMs, personnageSuivant, format,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('lancement');
    viderBarreTemps(document.getElementById('qsj-barre'), tempsRestantMs);
    flashQsj.hidden = true;
  } else signalerChangementQsj(salle);
  trouvesAffichesQsj = nbTrouves;
  passesAffichesQsj = nbPasses;
  validationAfficheeQsj = enValidation;

  const pseudo = pseudoActifQsj(salle);
  document.getElementById('qsj-numero-jeu').textContent = numeroTourQsj(salle.etatMode);
  document.getElementById('qsj-actif-jeu').textContent = `${pseudo} devine`;
  // Personnage sur les téléphones : la TV ne le reçoit pas, le joueur actif la regarde.
  const surTelephones = personnage === null;
  document.getElementById('qsj-sur-telephones').hidden = !surTelephones;
  photoQsj.closest('.qsj-personnage').classList.toggle('sur-telephones', surTelephones);
  photoQsj.parentElement.hidden = surTelephones;
  for (const id of ['qsj-nom', 'qsj-categorie', 'qsj-credit']) document.getElementById(id).hidden = surTelephones;
  if (!surTelephones) afficherPersonnageQsj(personnage);
  document.getElementById('qsj-trouves').textContent = texteTrouvesTvQsj(salle.etatMode);
  const bandeau = document.getElementById('qsj-bandeau');
  const valideur = joueurQsj(salle, salle.etatMode.valideur)?.pseudo ?? 'Personne pour valider';
  bandeau.hidden = !enValidation;
  bandeau.textContent = tempsEcoule
    ? `Temps écoulé ! ${pseudo} pense avoir trouvé… ${valideur} tranche.`
    : `${pseudo} pense avoir trouvé… ${valideur} vérifie.`;
  const chrono = document.getElementById('qsj-chrono');
  chrono.classList.toggle('chrono-minutes', format === 'chrono');
  if (format === 'chrono') lancerChronoMontantQsj(chrono, salle.etatMode);
  else lancerChrono(chrono, tempsRestantMs);
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
    trouves, passes, points, classement, nonTrouve,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  const pseudo = pseudoActifQsj(salle);
  document.getElementById('qsj-numero-bilan').textContent = numeroTourQsj(salle.etatMode);
  document.getElementById('qsj-verdict').textContent = verdictQsj(salle.etatMode, pseudo);
  document.getElementById('qsj-vignettes').replaceChildren(...trouves.map(vignetteQsj));
  const lignes = [];
  if (passes.length) lignes.push(`Passés : ${passes.map((passe) => passe.nom).join(', ')}`);
  if (nonTrouve) lignes.push(`Pas trouvé : ${nonTrouve}`);
  document.getElementById('qsj-passes').textContent = lignes.join(' · ');
  document.getElementById('qsj-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

function verdictQsj({
  trouves, points, format, tempsMisMs,
}, pseudo) {
  if (format === 'chrono') {
    if (tempsMisMs === null) return `${pseudo} n'a pas fini à temps. Le chrono gagne.`;
    return `${pseudo} : ${trouves.length > 1 ? `${trouves.length} trouvés` : 'trouvé'} en ${texteMinutesQsj(tempsMisMs)}, +${points}`;
  }
  return trouves.length
    ? `${pseudo} : ${trouves.length} trouvé${trouves.length > 1 ? 's' : ''}, +${points}`
    : `${pseudo} : aucun trouvé. Ça arrive. Souvent.`;
}

modesTv['qui-suis-je'] = {
  preparation: afficherPreparationQsj,
  jeu: afficherJeuQsj,
  bilan: afficherBilanQsj,
};
