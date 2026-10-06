// Écrans du Défi des enchères sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de tv.js.

// Dernières valeurs affichées, pour sonner à chaque surenchère et à chaque bonne réponse comptée.
let enchereAffichee = null;
let compteurAffiche = null;

function joueurEncheres(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

// « 🔴 Léa », ou rien si le joueur n'existe pas (pas d'arbitre possible).
function nomAvecPastille(salle, id, avant = '') {
  const joueur = joueurEncheres(salle, id);
  if (!joueur) return [];
  return [avant, pastille(joueur.couleur), joueur.pseudo];
}

function numeroMancheEncheres({ numero, total }) {
  return `Manche ${numero}/${total}`;
}

// « Léa doit citer 12 départements français ».
function texteContrat(salle) {
  const { auteur, enchere, defi } = salle.etatMode;
  return `${joueurEncheres(salle, auteur)?.pseudo ?? '?'} doit citer ${enchere} ${defi.sujet}`;
}

// Le chrono des 7 s repart à chaque surenchère : la barre aussi.
function afficherEncheres(salle, nouvelleEtape) {
  const { enchere, auteur, defi, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('de-numero-encheres').textContent = numeroMancheEncheres(salle.etatMode);
    document.getElementById('de-texte-encheres').textContent = defi.texte;
  }
  const montant = document.getElementById('de-montant');
  if (nouvelleEtape || enchere !== enchereAffichee) {
    if (!nouvelleEtape) sonner('reponse');
    montant.textContent = enchere;
    // L'enchère grossit brièvement à chaque surenchère.
    montant.classList.remove('surenchere');
    void montant.offsetWidth;
    montant.classList.add('surenchere');
    viderBarreTemps(document.getElementById('de-barre-encheres'), tempsRestantMs);
  }
  enchereAffichee = enchere;
  document.getElementById('de-auteur').replaceChildren(...nomAvecPastille(salle, auteur));
  lancerChrono(document.getElementById('de-chrono-encheres'), tempsRestantMs);
}

function afficherAnnonceEncheres(salle, nouvelleEtape) {
  if (nouvelleEtape) sonner('lancement');
  document.getElementById('de-numero-annonce').textContent = numeroMancheEncheres(salle.etatMode);
  document.getElementById('de-texte-annonce').textContent = texteContrat(salle);
  afficherArbitreEncheres(salle, 'de-arbitre-annonce');
}

function afficherArbitreEncheres(salle, idElement) {
  const { arbitre } = salle.etatMode;
  document.getElementById(idElement).replaceChildren(
    ...(arbitre ? nomAvecPastille(salle, arbitre, 'Arbitre : ') : ['Pas d\'arbitre disponible']),
  );
}

function afficherDefiEncheres(salle, nouvelleEtape) {
  const { compteur, enchere, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    viderBarreTemps(document.getElementById('de-barre-defi'), tempsRestantMs);
  } else if (compteur > compteurAffiche) sonner('reponse');
  compteurAffiche = compteur;
  document.getElementById('de-numero-defi').textContent = numeroMancheEncheres(salle.etatMode);
  document.getElementById('de-texte-defi').textContent = texteContrat(salle);
  document.getElementById('de-compteur').textContent = compteur;
  document.getElementById('de-objectif').textContent = ` / ${enchere}`;
  document.getElementById('de-progression').style.transform = `scaleX(${Math.min(1, compteur / enchere)})`;
  afficherArbitreEncheres(salle, 'de-arbitre-defi');
  lancerChrono(document.getElementById('de-chrono-defi'), tempsRestantMs);
}

function afficherRevelationEncheres(salle, nouvelleEtape) {
  const {
    releve, compteur, enchere, auteur, arbitre, classement,
  } = salle.etatMode;
  if (nouvelleEtape) sonner(releve ? 'victoire' : 'rate');
  const pseudo = joueurEncheres(salle, auteur)?.pseudo ?? '?';
  document.getElementById('de-numero-revelation').textContent = numeroMancheEncheres(salle.etatMode);
  const verdict = document.getElementById('de-verdict');
  verdict.textContent = releve ? `Défi relevé ! ${pseudo} +${enchere}` : `Raté ! ${pseudo} s'arrête à ${compteur} sur ${enchere}`;
  verdict.classList.toggle('rate', !releve);
  let detail = `${compteur} sur ${enchere}. Promesse tenue, c'est assez rare pour être signalé.`;
  if (!releve) detail = arbitre ? '+1 pour tous les autres, sauf l\'arbitre.' : '+1 pour tous les autres.';
  document.getElementById('de-detail').textContent = detail;
  document.getElementById('de-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

modesTv['defi-encheres'] = {
  encheres: afficherEncheres,
  annonce: afficherAnnonceEncheres,
  defi: afficherDefiEncheres,
  revelation: afficherRevelationEncheres,
};
