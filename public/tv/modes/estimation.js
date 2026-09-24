// Écrans de l'Estimation sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.

const formatNombreTv = new Intl.NumberFormat('fr-FR');

function avecUnite(nombre, unite) {
  const texteNombre = formatNombreTv.format(nombre);
  return unite ? `${texteNombre} ${unite}` : texteNombre;
}

function afficherQuestionEstimation(salle, nouvelleEtape) {
  const { numero, total, question, ontRepondu, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('estimation-numero-question').textContent = `Question ${numero}/${total}`;
    document.getElementById('estimation-texte-question').textContent = question.texte;
    document.getElementById('estimation-unite').textContent =
      question.unite ? `? ${question.unite}` : '?';
    viderBarreTemps(document.getElementById('estimation-barre-temps'), tempsRestantMs);
    document.getElementById('estimation-ont-repondu').replaceChildren();
  }
  lancerChrono(document.getElementById('estimation-chrono'), tempsRestantMs);

  const joueursAyantRepondu = salle.joueurs.filter((joueur) => ontRepondu.includes(joueur.id));
  const reponses = remplirEtiquettes(
    document.getElementById('estimation-ont-repondu'),
    joueursAyantRepondu.map((joueur) => etiquetteJoueur(joueur, false)),
  );
  if (reponses > 0) sonner('reponse');
}

function afficherRevelationEstimation(salle, nouvelleEtape) {
  const {
    numero, total, question, bonneReponse, estimations, sansReponse, classement,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('revelation');
    document.getElementById('estimation-numero-revelation').textContent = `Question ${numero}/${total}`;
    document.getElementById('estimation-texte-revelation').textContent = question.texte;
    document.getElementById('estimation-bonne-reponse').textContent =
      avecUnite(bonneReponse, question.unite);
  }
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  document.getElementById('estimation-liste').replaceChildren(
    ...estimations.map((ligne) => ligneEstimation(ligne, joueurDe(ligne.id), bonneReponse)),
    ...sansReponse.map((id) => ligneSansReponse(joueurDe(id))),
  );
  document.getElementById('estimation-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, false)),
  );
}

// Rang d'écart, joueur, nombre saisi, écart signé (« +120 », « −40 »), points gagnés.
function ligneEstimation(ligne, joueur, bonneReponse) {
  const element = document.createElement('li');
  if (ligne.points > 0) element.classList.add('sur-le-podium');
  element.append(
    texte('rang', `${ligne.rangEcart}.`),
    pastille(joueur.couleur),
    texte('pseudo', joueur.pseudo),
    texte('valeur', formatNombreTv.format(ligne.nombre)),
    texte('ecart', texteEcart(ligne.nombre - bonneReponse)),
  );
  const gain = texte('gain', ligne.points > 0 ? `+${ligne.points}` : '✗');
  if (ligne.points === 0) gain.classList.add('zero');
  element.append(gain);
  griserSiDeconnecte(element, joueur);
  return element;
}

function texteEcart(difference) {
  if (difference === 0) return 'pile !';
  const signe = difference > 0 ? '+' : '−';
  return `${signe}${formatNombreTv.format(Math.abs(difference))}`;
}

function ligneSansReponse(joueur) {
  const element = document.createElement('li');
  element.classList.add('sans-reponse');
  element.append(
    texte('rang', ''),
    pastille(joueur.couleur),
    texte('pseudo', joueur.pseudo),
    texte('valeur', 'pas de réponse'),
  );
  griserSiDeconnecte(element, joueur);
  return element;
}

modesTv.estimation = {
  question: afficherQuestionEstimation,
  revelation: afficherRevelationEstimation,
};
