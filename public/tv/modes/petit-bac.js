// Écrans du Petit bac sur la TV. Les outils communs (pastille, chrono, classement…)
// viennent de tv.js. Ce qui est accepté ou refusé est décidé par le serveur (et l'hôte).

// STOP déjà affiché (id du joueur) : bandeau, jingle et barre ne repartent qu'une fois.
let stopAfficheTv = null;
// Validation affichée : la catégorie (« manche:index ») et ce qui y était accepté, pour
// repérer une nouvelle catégorie et une réponse que l'hôte vient de basculer.
let validationAfficheeTv = null;

function joueurTv(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

// ---------- Écriture ----------

function afficherEcriturePb(salle, nouvelleEtape) {
  const { numero, total, lettre, categories, ontRepondu, stop, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    stopAfficheTv = null;
    document.getElementById('pb-numero-ecriture').textContent = `Manche ${numero}/${total}`;
    document.getElementById('pb-lettre-ecriture').textContent = lettre;
    document.getElementById('pb-categories-ecriture').replaceChildren(...categories.map((categorie) => {
      const element = document.createElement('li');
      element.textContent = categorie;
      return element;
    }));
  }
  if (stop && stop !== stopAfficheTv) {
    stopAfficheTv = stop;
    // Avant les pastilles : un seul son par état, et c'est celui-ci qui compte.
    sonner('lancement');
    document.getElementById('pb-stop-texte').textContent = `STOP ! ${joueurTv(salle, stop)?.pseudo ?? ''} a fini`;
    if (!nouvelleEtape) viderBarreTemps(document.getElementById('pb-barre-temps'), tempsRestantMs);
  }
  document.querySelector('main[data-ecran="petit-bac-ecriture"]').classList.toggle('apres-stop', Boolean(stop));
  document.getElementById('pb-stop-tv').hidden = !stop;
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'pb-barre-temps', chrono: stop ? 'pb-compte-stop' : 'pb-chrono', pastilles: 'pb-ont-repondu',
  }, ontRepondu);
}

// ---------- Validation ----------

function ongletsPb(categories, indexCategorie) {
  return categories.map((categorie, i) => {
    const element = document.createElement('li');
    element.textContent = i < indexCategorie ? `✓ ${categorie}` : categorie;
    element.classList.toggle('en-cours', i === indexCategorie);
    element.classList.toggle('vue', i < indexCategorie);
    return element;
  });
}

// Une carte : pastille, pseudo et ✓/✗, puis la réponse, verte si acceptée, rouge et barrée sinon.
function cartePb(joueur, ligne, salle) {
  const { indexCategorie, lettre } = salle.etatMode;
  const element = document.createElement('li');
  const qui = document.createElement('p');
  qui.className = 'pb-qui';
  qui.append(pastilleInitiale(joueur), texte('pb-pseudo-tv', joueur.pseudo));
  element.append(qui);
  const reponse = ligne?.textes[indexCategorie];
  if (!reponse) {
    element.classList.add('vide');
    element.append(texte('pb-reponse-tv', '—'));
    return element;
  }
  const acceptee = ligne.acceptees[indexCategorie];
  element.classList.add(acceptee ? 'acceptee' : 'refusee');
  qui.append(texte('pb-marque-tv', acceptee ? '✓' : '✗'));
  element.append(texte('pb-reponse-tv', reponse));
  if (ligne.horsLettre[indexCategorie]) element.append(texte('pb-hors-lettre', `pas un ${lettre}`));
  return element;
}

function afficherValidationPb(salle, nouvelleEtape) {
  const { numero, total, lettre, categories, indexCategorie, lignes, sansReponse } = salle.etatMode;
  const cle = `${numero}:${indexCategorie}`;
  const acceptees = Object.fromEntries(lignes.map((ligne) => [ligne.id, ligne.acceptees[indexCategorie]]));
  const nouvelleCategorie = nouvelleEtape || validationAfficheeTv?.cle !== cle;
  const basculees = nouvelleCategorie ? [] : lignes
    .map((ligne) => ligne.id)
    .filter((id) => validationAfficheeTv.acceptees[id] !== acceptees[id]);
  validationAfficheeTv = { cle, acceptees };

  if (nouvelleCategorie) sonner('etape');
  else if (basculees.some((id) => !acceptees[id])) sonner('rate');

  document.getElementById('pb-numero-validation').textContent = `Manche ${numero}/${total}`;
  document.getElementById('pb-lettre-validation').textContent = lettre;
  document.getElementById('pb-categorie-validation').textContent = categories[indexCategorie];
  document.getElementById('pb-onglets').replaceChildren(...ongletsPb(categories, indexCategorie));

  // Les joueurs de la manche, dans l'ordre de la salle : ceux qui ont écrit et les autres.
  const ids = [...lignes.map((ligne) => ligne.id), ...sansReponse];
  const cartes = salle.joueurs
    .filter((joueur) => ids.includes(joueur.id))
    .map((joueur) => {
      const carte = cartePb(joueur, lignes.find((ligne) => ligne.id === joueur.id), salle);
      carte.classList.toggle('secousse', basculees.includes(joueur.id));
      return carte;
    });
  const liste = document.getElementById('pb-cartes');
  liste.classList.toggle('arrivee', nouvelleCategorie);
  liste.replaceChildren(...cartes);
}

// ---------- Bilan ----------

// Une ligne : pastille, pseudo, points de la manche, et une marque par catégorie.
function lignePointsPb(joueur, points, ligne) {
  const element = document.createElement('li');
  const gain = texte('gain', points > 0 ? `+${points}` : '0');
  if (points === 0) gain.classList.add('zero');
  const marques = document.createElement('span');
  marques.className = 'pb-marques';
  marques.append(...(ligne?.textes ?? Array(6).fill('')).map((reponse, i) => {
    if (!reponse) return texte('pb-marque-vide', '—');
    return ligne.acceptees[i] ? texte('pb-marque-oui', '✓') : texte('pb-marque-non', '✗');
  }));
  element.append(pastilleInitiale(joueur), texte('pb-pseudo-tv', joueur.pseudo), gain, marques);
  return element;
}

function afficherBilanPb(salle, nouvelleEtape) {
  const { numero, total, lettre, points, lignes } = salle.etatMode;
  const ecran = document.querySelector('main[data-ecran="petit-bac-bilan"]');
  if (nouvelleEtape) {
    sonner('revelation');
    // Après un rechargement de la TV, le classement est là tout de suite.
    ecran.classList.toggle('sans-delai', premierEtatRecu);
    document.getElementById('pb-numero-bilan').textContent = `Manche ${numero}/${total}`;
    document.getElementById('pb-lettre-bilan').textContent = lettre;
    document.getElementById('pb-points-tv').replaceChildren(...points
      .map(({ id, points: gagnes }) => [joueurTv(salle, id), gagnes, lignes.find((ligne) => ligne.id === id)])
      .filter(([joueur]) => joueur)
      .map(([joueur, gagnes, ligne]) => lignePointsPb(joueur, gagnes, ligne)));
  }
  document.getElementById('pb-classement')
    .replaceChildren(...salle.etatMode.classement.map((ligne) => ligneClassement(ligne, true)));
}

modesTv['petit-bac'] = {
  ecriture: afficherEcriturePb,
  validation: afficherValidationPb,
  bilan: afficherBilanPb,
};
