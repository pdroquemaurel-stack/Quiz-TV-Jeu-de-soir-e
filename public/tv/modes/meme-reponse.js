// Écrans de Même réponse sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.
// Pendant la saisie, la TV ne connaît que qui a répondu, jamais quoi.

function afficherSaisieMemeReponse(salle, nouvelleEtape) {
  const { numero, total, question, ontRepondu, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('mr-numero-saisie').textContent = `Question ${numero}/${total}`;
    document.getElementById('mr-texte-saisie').textContent = question.texte;
    viderBarreTemps(document.getElementById('mr-barre-temps'), tempsRestantMs);
    document.getElementById('mr-ont-repondu').replaceChildren();
  }
  lancerChrono(document.getElementById('mr-chrono'), tempsRestantMs);

  const joueursAyantRepondu = salle.joueurs.filter((joueur) => ontRepondu.includes(joueur.id));
  const reponses = remplirEtiquettes(
    document.getElementById('mr-ont-repondu'),
    joueursAyantRepondu.map((joueur) => etiquetteJoueur(joueur, false)),
  );
  if (reponses > 0) sonner('reponse');
}

const MAX_PASTILLES_GROUPE = 5;

function afficherResultatsMemeReponse(salle, nouvelleEtape) {
  const {
    numero, total, question, groupes, sansReponse, unanimite, classement,
  } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  if (nouvelleEtape) {
    sonner(unanimite ? 'victoire' : 'revelation');
    document.getElementById('mr-numero-resultats').textContent = `Question ${numero}/${total}`;
    document.getElementById('mr-texte-resultats').textContent = question.texte;
    document.getElementById('mr-verdict').textContent = texteVerdict(groupes, unanimite);
  }
  const ensemble = groupes.filter((groupe) => groupe.taille >= 2);
  const seuls = groupes.filter((groupe) => groupe.taille === 1);
  document.getElementById('mr-groupes').replaceChildren(
    ...ensemble.map((groupe) => carteGroupe(groupe, joueurDe)),
  );
  remplirLigne('mr-seuls', seuls.map((groupe) => reponseSeule(groupe, joueurDe(groupe.joueurs[0]))));
  remplirLigne('mr-absents', pastillesSeules(sansReponse.map(joueurDe)));
  document.getElementById('mr-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

// « Tout le monde d'accord ! », « Fraise ! », « Fraise et Cerise ! », « Chacun sa réponse », « Personne n'a répondu ».
function texteVerdict(groupes, unanimite) {
  if (groupes.length === 0) return 'Personne n\'a répondu';
  if (unanimite) return 'Tout le monde d\'accord !';
  const enTete = groupes.filter((groupe) => groupe.enTete).map((groupe) => groupe.libelle);
  if (enTete.length === 0) return 'Chacun sa réponse';
  return `${enTete.join(' et ')} !`;
}

// Libellé en gros, joueurs du groupe en pastilles à initiale (5 au plus, puis « +N »), points gagnés.
// Les pseudos sont dans le classement, à droite : à 40 px, ils ne tiendraient pas dans la carte.
function carteGroupe(groupe, joueurDe) {
  const element = document.createElement('li');
  if (groupe.enTete) element.classList.add('en-tete');
  const joueurs = document.createElement('ul');
  joueurs.className = 'etiquettes';
  joueurs.append(...pastillesSeules(groupe.joueurs.map(joueurDe), MAX_PASTILLES_GROUPE));
  element.append(texte('libelle', groupe.libelle), joueurs, texte('points', `+${groupe.points}`));
  return element;
}

function reponseSeule(groupe, joueur) {
  const [element] = pastillesSeules([joueur]);
  element.append(texte('reponse-seule', groupe.libelle));
  return element;
}

// Ligne « Seuls » ou « Pas de réponse », masquée si elle est vide.
function remplirLigne(id, etiquettes) {
  const ligne = document.getElementById(id);
  ligne.hidden = etiquettes.length === 0;
  ligne.querySelector('ul').replaceChildren(...etiquettes);
}

modesTv['meme-reponse'] = {
  saisie: afficherSaisieMemeReponse,
  resultats: afficherResultatsMemeReponse,
};
