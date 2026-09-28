// Écrans du Mot le plus long sur la TV. Les outils communs (pastille, chrono, classement…)
// viennent de tv.js. Validité et points sont calculés par le serveur.

const RAISONS_TV = { lettres: 'lettres absentes', dictionnaire: 'pas dans le dictionnaire' };
// À la révélation, les mots arrivent un par un, du dernier de la liste au premier :
// le plus long arrive en dernier. Le classement prend leur place à 8 s (mot-le-plus-long.css).
const INTERVALLE_MOTS_MS = 400;

// Une tuile par lettre.
function tuilesLettres(mot) {
  return Array.from(mot, (lettre) => texte('mlpl-tuile-tv', lettre));
}

function afficherRechercheMot(salle, nouvelleEtape) {
  const { numero, total, lettres, ontRepondu } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('mlpl-numero-recherche').textContent = `Manche ${numero}/${total}`;
    document.getElementById('mlpl-tirage').replaceChildren(...tuilesLettres(lettres.join('')));
  }
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'mlpl-barre-temps', chrono: 'mlpl-chrono', pastilles: 'mlpl-ont-repondu',
  }, ontRepondu);
}

// Une ligne : pastille, mot en tuiles, longueur, ✓ ou ✗ et sa raison, points de la manche.
function ligneMot(joueur, ligne) {
  const element = document.createElement('li');
  element.append(pastilleInitiale(joueur));
  if (!ligne) {
    element.classList.add('sans-mot');
    element.append(texte('mlpl-verdict', 'pas de mot'));
    return element;
  }
  const mot = document.createElement('span');
  mot.className = 'mlpl-mot-tv';
  mot.append(...tuilesLettres(ligne.mot));
  const verdict = ligne.valide ? `✓ ${ligne.longueur} lettres` : `✗ ${RAISONS_TV[ligne.raison]}`;
  const elementVerdict = texte('mlpl-verdict', verdict);
  elementVerdict.classList.add(ligne.valide ? 'valide' : 'invalide');
  const gain = texte('gain', ligne.points > 0 ? `+${ligne.points}` : '0');
  if (ligne.points === 0) gain.classList.add('zero');
  element.append(mot, elementVerdict, gain);
  if (ligne.points > 0) element.classList.add('gagnant');
  return element;
}

function lignesMots(salle) {
  const { resultats, sansReponse } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  const lignes = [
    ...resultats.map((ligne) => [joueurDe(ligne.id), ligne]),
    ...sansReponse.map((id) => [joueurDe(id), null]),
  ].filter(([joueur]) => joueur);
  return lignes.map(([joueur, ligne], index) => {
    const element = ligneMot(joueur, ligne);
    element.style.animationDelay = `${(lignes.length - 1 - index) * INTERVALLE_MOTS_MS}ms`;
    return element;
  });
}

function afficherRevelationMot(salle, nouvelleEtape) {
  const { numero, total, meilleur } = salle.etatMode;
  const ecran = document.querySelector('main[data-ecran="mot-le-plus-long-revelation"]');
  if (nouvelleEtape) {
    sonner('revelation');
    // Après un rechargement de la TV, le classement est là tout de suite.
    ecran.classList.toggle('sans-delai', premierEtatRecu);
    document.getElementById('mlpl-numero-revelation').textContent = `Manche ${numero}/${total}`;
    const mots = lignesMots(salle);
    document.getElementById('mlpl-mots').replaceChildren(...mots);
    const motMeilleur = texte('mlpl-mot-tv', '');
    motMeilleur.append(...tuilesLettres(meilleur));
    const elementMeilleur = document.getElementById('mlpl-meilleur-tv');
    elementMeilleur.replaceChildren(texte('mlpl-meilleur-titre', 'Le plus long possible'), motMeilleur);
    elementMeilleur.style.animationDelay = `${mots.length * INTERVALLE_MOTS_MS}ms`;
  }
  document.getElementById('mlpl-classement')
    .replaceChildren(...salle.etatMode.classement.map((ligne) => ligneClassement(ligne, true)));
}

modesTv['mot-le-plus-long'] = {
  recherche: afficherRechercheMot,
  revelation: afficherRevelationMot,
};
