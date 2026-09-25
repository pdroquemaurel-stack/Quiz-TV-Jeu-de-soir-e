// Écrans du bluff sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.
// Les noms finissent par « Bluff » : tous les scripts de la TV partagent le même espace global.
// Avant la révélation, la TV ne connaît ni la vraie réponse ni les auteurs des bluffs.

// Délai entre deux cartes de la révélation : les bluffs un par un, puis la vérité.
const DELAI_CARTE_BLUFF_MS = 1000;

// À 40 px, pour que la révélation tienne à 10 joueurs (tranche 19).
const MAX_BLUFFS_AFFICHES = 5;
const MAX_PASTILLES_CARTE = 3;
const MAX_PASTILLES_VERITE = 8;

function afficherSaisieBluff(salle, nouvelleEtape) {
  const { numero, total, question, ontRepondu, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('bl-numero-saisie').textContent = `Question ${numero}/${total}`;
    document.getElementById('bl-texte-saisie').textContent = question.texte;
    viderBarreTemps(document.getElementById('bl-barre-temps-saisie'), tempsRestantMs);
    document.getElementById('bl-ont-ecrit').replaceChildren();
  }
  lancerChrono(document.getElementById('bl-chrono-saisie'), tempsRestantMs);
  afficherOntReponduBluff(salle, 'bl-ont-ecrit', ontRepondu);
}

// Les propositions ne sont construites qu'une fois : leur arrivée ne se rejoue pas à chaque vote.
function afficherVoteBluff(salle, nouvelleEtape) {
  const {
    numero, total, question, propositions, ontRepondu, tempsRestantMs,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    document.getElementById('bl-numero-vote').textContent = `Question ${numero}/${total}`;
    document.getElementById('bl-texte-vote').textContent = question.texte;
    viderBarreTemps(document.getElementById('bl-barre-temps-vote'), tempsRestantMs);
    document.getElementById('bl-propositions').replaceChildren(
      ...propositions.map((proposition, index) => {
        const element = document.createElement('li');
        element.append(texte('numero-proposition', index + 1), texte('libelle', proposition.texte));
        return element;
      }),
    );
    document.getElementById('bl-ont-vote').replaceChildren();
  }
  lancerChrono(document.getElementById('bl-chrono-vote'), tempsRestantMs);
  afficherOntReponduBluff(salle, 'bl-ont-vote', ontRepondu);
}

function afficherOntReponduBluff(salle, id, ontRepondu) {
  const joueurs = salle.joueurs.filter((joueur) => ontRepondu.includes(joueur.id));
  const nouveaux = remplirEtiquettes(
    document.getElementById(id),
    joueurs.map((joueur) => etiquetteJoueur(joueur, false)),
  );
  if (nouveaux > 0) sonner('reponse');
}

// Les cartes ne sont construites qu'au début de la révélation, pour ne pas rejouer leur
// arrivée échelonnée. Après un rechargement de la TV, elles s'affichent d'un coup.
function afficherRevelationBluff(salle, nouvelleEtape) {
  const {
    numero, total, question, propositions, sansBluff, sansVote, classement,
  } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  const pastilles = (ids, max) => pastillesSeules(ids.map(joueurDe), max);

  if (nouvelleEtape) {
    sonner(sonRevelationBluff(salle.etatMode));
    document.getElementById('bl-numero-revelation').textContent = `Question ${numero}/${total}`;
    document.getElementById('bl-texte-revelation').textContent = question.texte;

    // Les bluffs qui ont piégé quelqu'un, du moins au plus voté, puis la vérité.
    // Au-delà de MAX_BLUFFS_AFFICHES, les moins votés sont résumés en « et N autres bluffs ».
    const piegeurs = propositions
      .filter((proposition) => !proposition.vraie && proposition.votants.length > 0)
      .sort((a, b) => a.votants.length - b.votants.length);
    const affiches = piegeurs.slice(-MAX_BLUFFS_AFFICHES);
    const vraie = propositions.find((proposition) => proposition.vraie);
    const cartes = [
      ...affiches.map((p) => carteBluff(p, pastilles)),
      carteVeriteBluff(vraie, pastilles),
    ];
    if (piegeurs.length > affiches.length) cartes.unshift(carteAutresBluffs(piegeurs.length - affiches.length));
    const delai = (rang) => (premierEtatRecu ? '0ms' : `${rang * DELAI_CARTE_BLUFF_MS}ms`);
    cartes.forEach((carte, rang) => { carte.style.animationDelay = delai(rang); });
    document.getElementById('bl-cartes').replaceChildren(...cartes);

    const verdict = document.getElementById('bl-verdict');
    verdict.textContent = verdictBluff(salle.etatMode);
    verdict.hidden = verdict.textContent === '';
    verdict.style.animationDelay = delai(cartes.length - 1);

    // Seuls les auteurs : à 40 px, les textes de ces bluffs ne tiendraient pas sous les cartes.
    const personneNyACru = propositions.filter((p) => !p.vraie && p.votants.length === 0);
    remplirLigneBluff('bl-personne-ny-a-cru', pastilles(personneNyACru.flatMap((p) => p.auteurs)));
    remplirLigneBluff('bl-sans-bluff', pastilles(sansBluff));
    remplirLigneBluff('bl-sans-vote', pastilles(sansVote));
  }
  document.getElementById('bl-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

function sonRevelationBluff({ tousOntTrouve, personneNaTrouve }) {
  if (tousOntTrouve) return 'victoire';
  if (personneNaTrouve) return 'rate';
  return 'revelation';
}

function verdictBluff({ personneNaBluffe, tousOntTrouve, personneNaTrouve }) {
  if (personneNaBluffe) return 'Personne n\'a bluffé';
  if (tousOntTrouve) return 'Personne ne s\'est fait avoir !';
  if (personneNaTrouve) return 'Tout le monde s\'est fait avoir !';
  return '';
}

// Une ligne par carte : « Riz », +1000, de (P), a piégé (L)(S)+2.
// Auteurs et piégés en pastilles à initiale : à 40 px, les pseudos ne tiendraient pas.
function carteBluff(proposition, pastilles) {
  const element = document.createElement('li');
  element.append(
    texte('libelle', proposition.texte),
    texte('points', `+${proposition.points}`),
    groupeBluff('de', pastilles(proposition.auteurs)),
    groupeBluff('a piégé', pastilles(proposition.votants, MAX_PASTILLES_CARTE)),
  );
  return element;
}

function carteAutresBluffs(nombre) {
  const element = document.createElement('li');
  element.className = 'autres';
  element.textContent = nombre > 1 ? `et ${nombre} autres bluffs` : 'et 1 autre bluff';
  return element;
}

// « Sel », la vérité, puis dessous ceux qui l'ont trouvée et ceux qui l'avaient écrite comme bluff.
function carteVeriteBluff(proposition, pastilles) {
  const element = document.createElement('li');
  element.className = 'verite';
  element.append(ligneBluff(texte('libelle', proposition.texte), texte('mention', 'La vérité !')));
  const groupes = [];
  if (proposition.votants.length) {
    groupes.push(groupeBluff('trouvée par', pastilles(proposition.votants, MAX_PASTILLES_VERITE)));
  }
  if (proposition.ontEcritLaVerite.length) {
    groupes.push(groupeBluff('l\'avait écrite :', pastilles(proposition.ontEcritLaVerite)));
  }
  if (groupes.length) element.append(ligneBluff(...groupes));
  return element;
}

function ligneBluff(...elements) {
  const ligne = document.createElement('span');
  ligne.className = 'bl-ligne';
  ligne.append(...elements);
  return ligne;
}

function groupeBluff(titre, elements) {
  const groupe = document.createElement('span');
  groupe.className = 'bl-groupe';
  const liste = document.createElement('ul');
  liste.className = 'etiquettes';
  liste.append(...elements);
  groupe.append(texte('titre-groupe', titre), liste);
  return groupe;
}

// Ligne « Personne n'y a cru », « Pas de bluff » ou « Pas de vote », masquée si elle est vide.
function remplirLigneBluff(id, etiquettes) {
  const ligne = document.getElementById(id);
  ligne.hidden = etiquettes.length === 0;
  ligne.querySelector('ul').replaceChildren(...etiquettes);
}

modesTv.bluff = {
  saisie: afficherSaisieBluff,
  vote: afficherVoteBluff,
  revelation: afficherRevelationBluff,
};
