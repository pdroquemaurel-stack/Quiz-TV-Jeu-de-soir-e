// Écrans de Cherche & trouve sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de
// tv.js, la visionneuse et la paire d'emojis de commun/cherche-trouve.js. Pendant la recherche, la
// TV ne montre que le détail : la scène, on la cherche sur son téléphone.

const visionneuseTvCt = document.getElementById('ct-visionneuse-tv');

function numeroDetailCt({ numero, total }) {
  return `Détail ${numero}/${total}`;
}

function afficherAnnonceCt(salle, nouvelleEtape) {
  const { scene, total } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  document.getElementById('ct-nom-scene').textContent = scene.nom;
  document.getElementById('ct-consigne-annonce').textContent = `${total} détails à trouver dans la scène, sur vos téléphones`;
  // La scène se charge déjà, pour la révélation.
  visionneuseCt(visionneuseTvCt, scene);
}

function afficherRechercheCt(salle, nouvelleEtape) {
  const { detail, ontTrouve } = salle.etatMode;
  document.getElementById('ct-numero-recherche').textContent = numeroDetailCt(salle.etatMode);
  paireCt(document.getElementById('ct-paire-recherche'), detail);
  document.getElementById('ct-texte-recherche').textContent = detail.texte;
  afficherAttenteReponses(salle, nouvelleEtape, { barre: 'ct-barre', chrono: 'ct-chrono', pastilles: 'ct-ont-trouve' }, ontTrouve);
}

function ligneResultatCt(salle, { id, secondes, rates, points }) {
  const joueur = salle.joueurs.find((autre) => autre.id === id);
  const ligne = document.createElement('li');
  ligne.classList.toggle('trouve', secondes !== null);
  const detailRates = rates ? `, ${rates} raté${rates > 1 ? 's' : ''}` : '';
  ligne.append(
    pastille(joueur?.couleur ?? 1),
    texte('pseudo', joueur?.pseudo ?? '?'),
    texte('ct-temps', secondes === null ? 'pas trouvé' : `${secondes} s${detailRates}`),
    texte('ct-points', points ? `+${points}` : '✗'),
  );
  return ligne;
}

function afficherRevelationCt(salle, nouvelleEtape) {
  const {
    scene, detail, position, resultats, classement,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('revelation');
  document.getElementById('ct-numero-revelation').textContent = numeroDetailCt(salle.etatMode);
  document.getElementById('ct-texte-revelation').textContent = `C'était ici : ${detail.texte.toLowerCase()}`;
  document.getElementById('ct-resultats').replaceChildren(...resultats.map((ligne) => ligneResultatCt(salle, ligne)));
  document.getElementById('ct-classement').replaceChildren(...classement.map((ligne) => ligneClassement(ligne, true)));
  if (!nouvelleEtape) return;
  // Toute la scène d'abord, puis le zoom sur le détail entouré.
  visionneuseCt(visionneuseTvCt, scene, () => {
    const { visionneuse } = visionneuseTvCt;
    visionneuse.viewport.goHome(true);
    clearTimeout(afficherRevelationCt.minuteur);
    afficherRevelationCt.minuteur = setTimeout(() => montrerDetailCt(visionneuse, position, 320), 900);
  });
}

modesTv['cherche-trouve'] = {
  annonce: afficherAnnonceCt,
  recherche: afficherRechercheCt,
  revelation: afficherRevelationCt,
};
