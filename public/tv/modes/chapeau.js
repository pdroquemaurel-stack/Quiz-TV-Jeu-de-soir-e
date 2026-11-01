// Écrans du chapeau sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de tv.js.
// La TV ne montre jamais le mot en cours : les coéquipiers du joueur actif la regardent.

// Trouvés déjà affichés pendant le tour : chaque nouveau mot trouvé s'entend.
let trouvesAffichesCh = 0;

function joueurCh(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

function numeroMancheCh({ manche, mancheMax, consigne }) {
  return `Manche ${manche}/${mancheMax} · ${consigne.titre}`;
}

// Les deux équipes côte à côte : nom, score, joueurs (le joueur actif en avant).
function afficherEquipesCh(idConteneur, salle) {
  const { equipes, actif } = salle.etatMode;
  document.getElementById(idConteneur).replaceChildren(...equipes.map((equipe, index) => {
    const bloc = document.createElement('section');
    bloc.className = `ch-equipe equipe-${index}`;
    const titre = document.createElement('p');
    titre.className = 'ch-nom-equipe';
    titre.append(texte('', equipe.nom), texte('ch-score-equipe', equipe.score));
    const liste = document.createElement('ul');
    liste.replaceChildren(...equipe.joueurs.map((id) => {
      const joueur = joueurCh(salle, id);
      const ligne = document.createElement('li');
      ligne.classList.toggle('actif', id === actif);
      ligne.append(pastille(joueur?.couleur ?? 1), texte('pseudo', joueur?.pseudo ?? '?'));
      if (joueur) griserSiDeconnecte(ligne, joueur);
      return ligne;
    }));
    bloc.append(titre, liste);
    return bloc;
  }));
}

function texteMotsRestantsCh(nombre) {
  return nombre > 1 ? `${nombre} mots dans le chapeau` : `${nombre} mot dans le chapeau`;
}

// « Léa fait deviner aux Rouges », avec sa pastille.
function phraseActifCh(salle, verbe) {
  const { actif, equipeActive, equipes } = salle.etatMode;
  const joueur = joueurCh(salle, actif);
  return [...(joueur ? [pastille(joueur.couleur), joueur.pseudo] : ['?']), ` ${verbe} aux ${equipes[equipeActive].nom}`];
}

function afficherSaisieCh(salle, nouvelleEtape) {
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'ch-barre-saisie', chrono: 'ch-chrono-saisie', pastilles: 'ch-ont-fini',
  }, salle.etatMode.ontFini);
}

function afficherAnnonceCh(salle, nouvelleEtape) {
  const { manche, mancheMax, consigne } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  document.getElementById('ch-numero-annonce').textContent = `Manche ${manche}/${mancheMax}`;
  document.getElementById('ch-titre-annonce').textContent = consigne.titre;
  document.getElementById('ch-regle-annonce').textContent = consigne.regle;
  afficherEquipesCh('ch-equipes-annonce', salle);
}

function afficherPreparationCh(salle, nouvelleEtape) {
  if (nouvelleEtape) sonner('etape');
  trouvesAffichesCh = 0;
  document.getElementById('ch-numero-preparation').textContent = numeroMancheCh(salle.etatMode);
  document.getElementById('ch-regle-preparation').textContent = salle.etatMode.consigne.regle;
  document.getElementById('ch-actif-preparation').replaceChildren('Au tour de ', ...phraseActifCh(salle, 'qui fait deviner'));
  document.getElementById('ch-mots-preparation').textContent = texteMotsRestantsCh(salle.etatMode.motsRestants);
  afficherEquipesCh('ch-equipes-preparation', salle);
}

function afficherJeuCh(salle, nouvelleEtape) {
  const { tempsRestantMs, nbTrouvesDuTour, motsRestants } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('lancement');
    viderBarreTemps(document.getElementById('ch-barre-jeu'), tempsRestantMs);
  } else if (nbTrouvesDuTour > trouvesAffichesCh) sonner('reponse');
  trouvesAffichesCh = nbTrouvesDuTour;
  document.getElementById('ch-numero-jeu').textContent = numeroMancheCh(salle.etatMode);
  document.getElementById('ch-regle-jeu').textContent = salle.etatMode.consigne.regle;
  document.getElementById('ch-actif-jeu').replaceChildren(...phraseActifCh(salle, 'fait deviner'));
  document.getElementById('ch-trouves-jeu').textContent = nbTrouvesDuTour > 1 ? `${nbTrouvesDuTour} trouvés` : `${nbTrouvesDuTour} trouvé`;
  document.getElementById('ch-mots-jeu').textContent = texteMotsRestantsCh(motsRestants);
  lancerChrono(document.getElementById('ch-chrono-jeu'), tempsRestantMs);
  afficherEquipesCh('ch-equipes-jeu', salle);
}

function motsTrouvesCh(idListe, trouves) {
  document.getElementById(idListe).replaceChildren(...trouves.map((mot) => {
    const element = document.createElement('li');
    element.textContent = mot;
    return element;
  }));
}

function verdictTourCh(salle) {
  const { actif, trouvesDuTour } = salle.etatMode;
  const pseudo = joueurCh(salle, actif)?.pseudo ?? '?';
  const nombre = trouvesDuTour.length;
  if (nombre === 0) return `${pseudo} : aucun mot trouvé. Le chapeau résiste.`;
  return `${pseudo} : ${nombre} mot${nombre > 1 ? 's' : ''} trouvé${nombre > 1 ? 's' : ''}, +${nombre}`;
}

function afficherBilanCh(salle, nouvelleEtape) {
  if (nouvelleEtape) sonner('etape');
  document.getElementById('ch-numero-bilan').textContent = numeroMancheCh(salle.etatMode);
  document.getElementById('ch-verdict-bilan').textContent = verdictTourCh(salle);
  motsTrouvesCh('ch-mots-bilan', salle.etatMode.trouvesDuTour);
  afficherEquipesCh('ch-equipes-bilan', salle);
}

function afficherFinMancheCh(salle, nouvelleEtape) {
  const {
    manche, mancheMax, equipes, classement,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('victoire');
  document.getElementById('ch-numero-fin').textContent = numeroMancheCh(salle.etatMode);
  const [rouges, bleus] = equipes;
  let enTete = 'Égalité parfaite !';
  if (rouges.score !== bleus.score) enTete = `${(rouges.score > bleus.score ? rouges : bleus).nom} en tête`;
  document.getElementById('ch-verdict-fin').textContent = manche < mancheMax
    ? `Le chapeau est vide ! Fin de la manche ${manche}. ${enTete}`
    : `Le chapeau est vide ! Fin de la partie. ${enTete.replace('en tête', 'gagnent')}`;
  motsTrouvesCh('ch-mots-fin', salle.etatMode.trouvesDuTour);
  afficherEquipesCh('ch-equipes-fin', salle);
  document.getElementById('ch-classement').replaceChildren(...classement.map((ligne) => ligneClassement(ligne, true)));
}

modesTv.chapeau = {
  saisie: afficherSaisieCh,
  annonce: afficherAnnonceCh,
  preparation: afficherPreparationCh,
  jeu: afficherJeuCh,
  bilan: afficherBilanCh,
  finManche: afficherFinMancheCh,
};
