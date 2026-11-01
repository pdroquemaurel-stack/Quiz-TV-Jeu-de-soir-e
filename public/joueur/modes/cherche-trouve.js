// Écrans de Cherche & trouve sur le téléphone. socket, vibrer, texteRang, envoyerSuivant et
// afficherEcran viennent de joueur.js, la visionneuse et la paire d'emojis de commun/cherche-trouve.js.
// Le téléphone envoie la position touchée ; c'est le serveur qui dit trouvé ou raté.

const visionneuseJoueurCt = document.getElementById('ct-visionneuse-joueur');
const flashCt = document.getElementById('ct-flash');
let intervalleChronoCt = null;
// Dernière vue reçue (le toucher la consulte) et ce qui a déjà été signalé dans la manche.
let vueCt = null;
let signaleCt = { numero: null, rates: 0, trouve: false };

document.getElementById('ct-suivant').addEventListener('click', envoyerSuivant);
document.getElementById('ct-recharger').addEventListener('click', () => {
  visionneuseJoueurCt.imageOuverte = null;
  if (vueCt) ouvrirSceneCt(vueCt.scene);
});

function lancerChronoCt(tempsRestantMs) {
  const element = document.getElementById('ct-chrono-joueur');
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    element.textContent = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
  };
  clearInterval(intervalleChronoCt);
  afficher();
  intervalleChronoCt = setInterval(afficher, 250);
}

// Un appui bref sans glisser : la position, en pixels de l'image, part au serveur.
function toucherCt(evenement) {
  if (!evenement.quick || vueCt?.ecran !== 'recherche' || vueCt.trouve) return;
  const { viewport } = visionneuseJoueurCt.visionneuse;
  const point = viewport.viewerElementToImageCoordinates(evenement.position);
  vibrer(20);
  socket.emit('joueur:repondre', { x: Math.round(point.x), y: Math.round(point.y) });
}

function ouvrirSceneCt(scene, quandOuverte) {
  document.getElementById('ct-erreur').hidden = true;
  visionneuseJoueurCt.quandEchec = () => { document.getElementById('ct-erreur').hidden = false; };
  const visionneuse = visionneuseCt(visionneuseJoueurCt, scene, () => {
    document.getElementById('ct-chargement-joueur').textContent = 'La scène est prête !';
    quandOuverte?.();
  });
  if (!visionneuseJoueurCt.toucherBranche) {
    visionneuse.addHandler('canvas-click', toucherCt);
    visionneuseJoueurCt.toucherBranche = true;
  }
}

function flasherCt(texteFlash, juste) {
  flashCt.textContent = texteFlash;
  flashCt.classList.toggle('juste', juste);
  flashCt.hidden = false;
  clearTimeout(flasherCt.minuteur);
  flasherCt.minuteur = setTimeout(() => { flashCt.hidden = true; }, 900);
}

// « Raté ! » ou « Trouvé ! » quand le serveur a répondu à un toucher.
function signalerToucherCt(vue) {
  if (signaleCt.numero !== vue.numero) signaleCt = { numero: vue.numero, rates: 0, trouve: false };
  if (vue.trouve && !signaleCt.trouve) {
    flasherCt('Trouvé !', true);
    vibrer(120);
  } else if (vue.rates > signaleCt.rates) flasherCt('Raté ! −100', false);
  signaleCt.rates = vue.rates;
  signaleCt.trouve = vue.trouve;
}

function afficherAnnonceCt(vue) {
  vueCt = vue;
  clearInterval(intervalleChronoCt);
  document.getElementById('ct-nom-scene-joueur').textContent = vue.scene.nom;
  document.getElementById('ct-consigne-joueur').textContent = `${vue.total} détails à trouver. Zoome avec deux doigts, glisse, et touche le bon !`;
  document.getElementById('ct-chargement-joueur').textContent = 'Chargement de la scène…';
  // La scène se charge pendant l'annonce, pour être prête à la première recherche.
  ouvrirSceneCt(vue.scene);
}

function afficherBandeauCt(vue) {
  paireCt(document.getElementById('ct-paire-joueur'), vue.detail);
  document.getElementById('ct-texte-joueur').textContent = vue.detail.texte;
}

function afficherRechercheCt(vue) {
  const nouvelleManche = vueCt?.ecran !== 'recherche' || vueCt.numero !== vue.numero;
  vueCt = vue;
  afficherBandeauCt(vue);
  lancerChronoCt(vue.tempsRestantMs);
  let etat = `Détail ${vue.numero}/${vue.total}`;
  if (vue.trouve) etat = 'Trouvé ! Attends les autres…';
  else if (vue.rates) etat += ` · ${vue.rates} raté${vue.rates > 1 ? 's' : ''}`;
  document.getElementById('ct-etat-joueur').textContent = etat;
  document.getElementById('ct-resultat-joueur').hidden = true;
  if (nouvelleManche) {
    // Nouvelle manche : toute la scène, sans le cercle de la manche d'avant.
    ouvrirSceneCt(vue.scene, () => {
      visionneuseJoueurCt.visionneuse.clearOverlays();
      visionneuseJoueurCt.visionneuse.viewport.goHome(true);
    });
  }
  signalerToucherCt(vue);
}

function afficherRevelationCt(vue) {
  const nouvelleRevelation = vueCt?.ecran !== 'revelation' || vueCt.numero !== vue.numero;
  vueCt = vue;
  // Même écran que la recherche : la scène reste chargée.
  afficherEcran('cherche-trouve-recherche');
  clearInterval(intervalleChronoCt);
  document.getElementById('ct-chrono-joueur').textContent = '';
  afficherBandeauCt(vue);
  document.getElementById('ct-etat-joueur').textContent = 'C\'était ici !';
  const resultat = document.getElementById('ct-resultat-texte');
  resultat.textContent = vue.trouve ? `Trouvé en ${vue.secondes} s, +${vue.points}` : 'Pas trouvé. Il était bien caché.';
  resultat.classList.toggle('juste', vue.trouve);
  document.getElementById('score-ct').textContent = vue.score;
  document.getElementById('rang-ct').textContent = texteRang(vue.rang);
  document.getElementById('ct-suivant').hidden = !vue.estHote;
  document.getElementById('ct-resultat-joueur').hidden = false;
  if (nouvelleRevelation) {
    ouvrirSceneCt(vue.scene, () => montrerDetailCt(visionneuseJoueurCt.visionneuse, vue.position, 260));
  }
}

modesJoueur['cherche-trouve'] = {
  annonce: afficherAnnonceCt,
  recherche: afficherRechercheCt,
  revelation: afficherRevelationCt,
};
