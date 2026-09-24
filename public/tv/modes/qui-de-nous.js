// Écrans de Qui de nous ? sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.
// Le vote est anonyme : la TV ne connaît que le nombre de votes reçus par chacun.

function afficherVoteQuiDeNous(salle, nouvelleEtape) {
  const { numero, total, question, ontVote, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('qdn-numero-vote').textContent = `Question ${numero}/${total}`;
    document.getElementById('qdn-texte-vote').textContent = question.texte;
    viderBarreTemps(document.getElementById('qdn-barre-temps'), tempsRestantMs);
    document.getElementById('qdn-ont-vote').replaceChildren();
  }
  lancerChrono(document.getElementById('qdn-chrono'), tempsRestantMs);

  const joueursAyantVote = salle.joueurs.filter((joueur) => ontVote.includes(joueur.id));
  const votes = remplirEtiquettes(
    document.getElementById('qdn-ont-vote'),
    joueursAyantVote.map((joueur) => etiquetteJoueur(joueur, false)),
  );
  if (votes > 0) sonner('reponse');
}

function afficherResultatsQuiDeNous(salle, nouvelleEtape) {
  const {
    numero, total, question, resultats, elus, classement,
  } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  if (nouvelleEtape) {
    sonner('revelation');
    document.getElementById('qdn-numero-resultats').textContent = `Question ${numero}/${total}`;
    document.getElementById('qdn-texte-resultats').textContent = question.texte;
    afficherElus(elus.map(joueurDe));
  }
  const maximum = Math.max(1, ...resultats.map((ligne) => ligne.votes));
  document.getElementById('qdn-barres').replaceChildren(
    ...resultats.map((ligne) => ligneVotes(ligne, joueurDe(ligne.id), maximum, elus)),
  );
  document.getElementById('qdn-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

// « Paul ! », « Paul et Léa ! », ou « Personne n'a voté ».
function afficherElus(joueurs) {
  const cadre = document.getElementById('qdn-elus');
  if (joueurs.length === 0) {
    cadre.replaceChildren('Personne n\'a voté');
    return;
  }
  const morceaux = [];
  joueurs.forEach((joueur, index) => {
    if (index > 0) morceaux.push(index === joueurs.length - 1 ? ' et ' : ', ');
    morceaux.push(pastille(joueur.couleur), ` ${joueur.pseudo}`);
  });
  cadre.replaceChildren(...morceaux, ' !');
}

// Pastille, pseudo, barre proportionnelle au nombre de votes, nombre de votes.
function ligneVotes(ligne, joueur, maximum, elus) {
  const element = document.createElement('li');
  if (elus.includes(ligne.id)) element.classList.add('elu');
  const piste = document.createElement('span');
  piste.className = 'piste-votes';
  const barre = document.createElement('span');
  barre.className = 'barre-votes';
  barre.style.setProperty('--couleur', `var(--joueur-${joueur.couleur})`);
  barre.style.transform = `scaleX(${ligne.votes / maximum})`;
  piste.append(barre);
  element.append(
    pastille(joueur.couleur),
    texte('pseudo', joueur.pseudo),
    piste,
    texte('votes', ligne.votes),
  );
  griserSiDeconnecte(element, joueur);
  return element;
}

function completerPodiumQuiDeNous(salle) {
  const { plusDesignes } = salle.etatMode;
  if (!plusDesignes || plusDesignes.length === 0) return;
  const ligne = document.getElementById('plus-designe');
  const noms = plusDesignes
    .map((designe) => salle.joueurs.find((joueur) => joueur.id === designe.id).pseudo)
    .join(' et ');
  const votes = plusDesignes[0].votes;
  const titre = plusDesignes.length > 1 ? 'Les plus désignés' : 'Le plus désigné';
  const nom = document.createElement('strong');
  nom.textContent = noms;
  ligne.replaceChildren(`${titre} de la partie : `, nom, ` (${votes} vote${votes > 1 ? 's' : ''})`);
  ligne.hidden = false;
}

modesTv['qui-de-nous'] = {
  vote: afficherVoteQuiDeNous,
  resultats: afficherResultatsQuiDeNous,
  completerPodium: completerPodiumQuiDeNous,
};
