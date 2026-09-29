// Écrans du Compte est bon sur la TV. Les outils communs (pastille, chrono, classement…)
// viennent de tv.js. Écarts et points sont calculés par le serveur.

const SIGNES_COMPTE_TV = { '+': '+', '-': '−', '*': '×', '/': '÷' };
// À la révélation, les joueurs arrivent un par un, du plus loin au plus proche. Les deux
// calculs prennent leur place à 8 s, le classement à 14 s (le-compte-est-bon.css).
const INTERVALLE_RESULTATS_MS = 400;

function tuilesPlaques(plaques) {
  return plaques.map((plaque) => texte('lceb-plaque-tv', plaque));
}

function afficherRechercheCompte(salle, nouvelleEtape) {
  const { numero, total, plaques, cible, ontRepondu } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('lceb-numero-recherche').textContent = `Manche ${numero}/${total}`;
    document.getElementById('lceb-cible-recherche').textContent = cible;
    document.getElementById('lceb-plaques-recherche').replaceChildren(...tuilesPlaques(plaques));
  }
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'lceb-barre-temps', chrono: 'lceb-chrono', pastilles: 'lceb-ont-repondu',
  }, ontRepondu);
}

// Une ligne : pastille, résultat, écart, points de la manche.
function ligneResultatCompte(joueur, ligne) {
  const element = document.createElement('li');
  element.append(pastilleInitiale(joueur));
  if (!ligne) {
    element.classList.add('sans-proposition');
    element.append(texte('lceb-ecart', 'pas de proposition'));
    return element;
  }
  const ecart = texte('lceb-ecart', ligne.ecart === 0 ? 'Le compte est bon !' : `à ${ligne.ecart}`);
  ecart.classList.toggle('exact', ligne.ecart === 0);
  const gain = texte('gain', ligne.points > 0 ? `+${ligne.points}` : '0');
  if (ligne.points === 0) gain.classList.add('zero');
  element.append(texte('lceb-resultat-tv', ligne.resultat), ecart, gain);
  if (ligne.points > 0) element.classList.add('gagnant');
  return element;
}

function lignesResultatsCompte(salle) {
  const { resultats, sansReponse } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  const lignes = [
    ...resultats.map((ligne) => [joueurDe(ligne.id), ligne]),
    ...sansReponse.map((id) => [joueurDe(id), null]),
  ].filter(([joueur]) => joueur);
  return lignes.map(([joueur, ligne], index) => {
    const element = ligneResultatCompte(joueur, ligne);
    element.style.animationDelay = `${(lignes.length - 1 - index) * INTERVALLE_RESULTATS_MS}ms`;
    return element;
  });
}

// Un calcul sous son titre, une étape par ligne : « 75 + 25 = 100 ».
function blocCalcul(titre, etapes) {
  const bloc = document.createElement('section');
  bloc.className = 'lceb-calcul-tv';
  const lignes = document.createElement('ol');
  lignes.append(...etapes.map(({ a, op, b, resultat }) => {
    const ligne = document.createElement('li');
    ligne.textContent = `${a} ${SIGNES_COMPTE_TV[op]} ${b} = ${resultat}`;
    return ligne;
  }));
  bloc.append(texte('lceb-calcul-titre', titre), lignes);
  return bloc;
}

// Le calcul du meilleur joueur (le premier des résultats) et la solution de l'ordinateur.
function blocsCalculs(salle) {
  const { resultats, solution } = salle.etatMode;
  const blocs = [];
  const meilleur = resultats[0] && salle.joueurs.find((joueur) => joueur.id === resultats[0].id);
  if (meilleur) blocs.push(blocCalcul(`Le calcul de ${meilleur.pseudo}`, resultats[0].etapes));
  blocs.push(blocCalcul('La solution de l\'ordinateur', solution));
  return blocs;
}

function afficherRevelationCompte(salle, nouvelleEtape) {
  const { numero, total, plaques, cible } = salle.etatMode;
  const ecran = document.querySelector('main[data-ecran="le-compte-est-bon-revelation"]');
  if (nouvelleEtape) {
    sonner('revelation');
    // Après un rechargement de la TV, le classement est là tout de suite.
    ecran.classList.toggle('sans-delai', premierEtatRecu);
    document.getElementById('lceb-numero-revelation').textContent = `Manche ${numero}/${total}`;
    document.getElementById('lceb-rappel').replaceChildren(
      texte('lceb-rappel-cible', `Cible ${cible}`),
      ...tuilesPlaques(plaques),
    );
    document.getElementById('lceb-resultats').replaceChildren(...lignesResultatsCompte(salle));
    document.getElementById('lceb-calculs').replaceChildren(...blocsCalculs(salle));
  }
  document.getElementById('lceb-classement')
    .replaceChildren(...salle.etatMode.classement.map((ligne) => ligneClassement(ligne, true)));
}

modesTv['le-compte-est-bon'] = {
  recherche: afficherRechercheCompte,
  revelation: afficherRevelationCompte,
};
