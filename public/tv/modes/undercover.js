// Écrans d'Undercover sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.
// La TV ne reçoit aucun mot avant la fin de la manche, ni le rôle d'un joueur encore en jeu.

const NOMS_ROLES = { civil: 'civil', undercover: 'undercover', mister_white: 'Mister White' };

function joueurUndercover(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

function afficherNumeroUndercover(idElement, etatMode) {
  const { manche, totalManches, tour } = etatMode;
  document.getElementById(idElement).textContent = `Manche ${manche}/${totalManches} · Tour ${tour}`;
}

// « Paul », « Paul et Léa », « Paul, Léa et Sam ».
function listerPseudos(pseudos, liaison = 'et') {
  if (pseudos.length <= 1) return pseudos.join('');
  return `${pseudos.slice(0, -1).join(', ')} ${liaison} ${pseudos[pseudos.length - 1]}`;
}

function texteComposition({ undercovers, misterWhite }) {
  const intrus = `${undercovers} undercover${undercovers > 1 ? 's' : ''}`;
  return `${misterWhite ? `${intrus} et 1 Mister White` : intrus} parmi vous`;
}

// Étiquette d'un joueur avec son rôle, une fois celui-ci public.
function etiquetteRole(joueur, role) {
  const element = etiquetteJoueur(joueur, false);
  element.append(texte('uc-role', NOMS_ROLES[role]));
  return element;
}

function afficherDescriptionUndercover(salle, nouvelleEtape) {
  const { ordreParole, elimines, composition } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  afficherNumeroUndercover('uc-numero-description', salle.etatMode);
  document.getElementById('uc-composition').textContent = texteComposition(composition);
  document.getElementById('uc-ordre').replaceChildren(...ordreParole.map((id, index) => {
    const joueur = joueurUndercover(salle, id);
    const element = document.createElement('li');
    element.append(texte('rang', `${index + 1}.`), pastille(joueur.couleur), texte('pseudo', joueur.pseudo));
    griserSiDeconnecte(element, joueur);
    return element;
  }));
  document.getElementById('uc-bloc-elimines').hidden = elimines.length === 0;
  document.getElementById('uc-elimines').replaceChildren(
    ...elimines.map(({ id, role }) => etiquetteRole(joueurUndercover(salle, id), role)),
  );
}

function afficherVoteUndercover(salle, nouvelleEtape) {
  const { departage, ontVote, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    afficherNumeroUndercover('uc-numero-vote', salle.etatMode);
    const pseudos = (departage ?? []).map((id) => joueurUndercover(salle, id).pseudo);
    document.getElementById('uc-titre-vote').textContent = departage
      ? `Départage : ${listerPseudos(pseudos, 'ou')} ?`
      : 'Qui éliminer ?';
    viderBarreTemps(document.getElementById('uc-barre-temps'), tempsRestantMs);
    document.getElementById('uc-ont-vote').replaceChildren();
  }
  lancerChrono(document.getElementById('uc-chrono'), tempsRestantMs);
  const joueursAyantVote = salle.joueurs.filter((joueur) => ontVote.includes(joueur.id));
  const votes = remplirEtiquettes(
    document.getElementById('uc-ont-vote'),
    joueursAyantVote.map((joueur) => etiquetteJoueur(joueur, false)),
  );
  if (votes > 0) sonner('reponse');
}

const REVELATIONS = {
  civil: 'Rôle : civil',
  undercover: 'Rôle : undercover !',
  mister_white: "C'était Mister White !",
};

// Sans éliminé (égalité, aucun vote), pas de son : le vote ou le tour suivant joue le sien.
function afficherEliminationUndercover(salle, nouvelleEtape) {
  const {
    elimine, exAequo, departage, votes,
  } = salle.etatMode;
  if (nouvelleEtape && elimine) sonner('revelation');
  const pseudoDe = (id) => joueurUndercover(salle, id).pseudo;
  afficherNumeroUndercover('uc-numero-elimination', salle.etatMode);
  const verdict = document.getElementById('uc-verdict');
  const detail = document.getElementById('uc-detail');
  if (elimine) {
    const joueur = joueurUndercover(salle, elimine.id);
    verdict.replaceChildren(pastille(joueur.couleur), ` ${joueur.pseudo} sort du jeu`);
    detail.textContent = REVELATIONS[elimine.role];
  } else if (departage) {
    verdict.textContent = 'Égalité !';
    detail.textContent = `Vote de départage entre ${listerPseudos(departage.map(pseudoDe))}`;
  } else {
    verdict.textContent = 'Personne ne sort du jeu';
    detail.textContent = exAequo.length > 1 ? 'Encore une égalité' : 'Aucun vote';
  }
  document.getElementById('uc-votes').replaceChildren(...votes.map(({ votant, cible }) => {
    const element = document.createElement('li');
    const de = joueurUndercover(salle, votant);
    const pour = joueurUndercover(salle, cible);
    element.append(pastille(de.couleur), texte('pseudo', de.pseudo), texte('fleche', '→'),
      pastille(pour.couleur), texte('pseudo', pour.pseudo));
    return element;
  }));
}

function afficherDevinetteUndercover(salle, nouvelleEtape) {
  const { devinette, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  const joueur = joueurUndercover(salle, devinette.misterWhite);
  afficherNumeroUndercover('uc-numero-devinette', salle.etatMode);
  document.getElementById('uc-mister-white').replaceChildren(
    pastille(joueur.couleur), ` ${joueur.pseudo} était Mister White !`,
  );
  const chrono = document.getElementById('uc-chrono-devinette');
  chrono.hidden = devinette.resultatConnu;
  const proposition = document.getElementById('uc-proposition');
  const resultat = document.getElementById('uc-resultat-devinette');
  // Le résultat arrive dans la même étape : on le repère à son apparition à l'écran.
  if (resultat.hidden && devinette.resultatConnu) sonner(devinette.trouve ? 'victoire' : 'rate');
  resultat.hidden = !devinette.resultatConnu;
  if (!devinette.resultatConnu) {
    lancerChrono(chrono, tempsRestantMs);
    proposition.textContent = 'Recherche en cours…';
    return;
  }
  proposition.textContent = devinette.proposition
    ? `Proposition : « ${devinette.proposition} »`
    : 'Pas de proposition';
  resultat.textContent = devinette.trouve ? 'Trouvé !' : 'Raté';
  resultat.classList.toggle('trouve', devinette.trouve);
}

const GAGNANTS = {
  civils: 'Les civils gagnent !',
  infiltres: 'Les infiltrés gagnent !',
  mister_white: 'Mister White gagne !',
};

function afficherFinMancheUndercover(salle, nouvelleEtape) {
  const {
    gagnant, motCivils, motUndercover, roles, classement,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('victoire');
  afficherNumeroUndercover('uc-numero-fin', salle.etatMode);
  document.getElementById('uc-gagnant').textContent = GAGNANTS[gagnant];
  document.getElementById('uc-mot-civils').textContent = motCivils;
  document.getElementById('uc-mot-undercover').textContent = motUndercover;
  const infiltres = Object.keys(roles).filter((id) => roles[id] !== 'civil');
  document.getElementById('uc-infiltres').replaceChildren(
    ...infiltres.map((id) => etiquetteRole(joueurUndercover(salle, id), roles[id])),
  );
  document.getElementById('uc-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

// « Manches gagnées : civils 2, infiltrés 1 », Mister White seulement s'il a gagné.
function completerPodiumUndercover(salle) {
  const { victoires } = salle.etatMode;
  // Absent si la partie jouée était d'un autre mode (l'hôte a changé de mode au podium).
  if (!victoires) return;
  const morceaux = [`civils ${victoires.civils}`, `infiltrés ${victoires.infiltres}`];
  if (victoires.misterWhite > 0) morceaux.push(`Mister White ${victoires.misterWhite}`);
  const ligne = document.getElementById('plus-designe');
  const detail = document.createElement('strong');
  detail.textContent = morceaux.join(', ');
  ligne.replaceChildren('Manches gagnées : ', detail);
  ligne.hidden = false;
}

modesTv.undercover = {
  description: afficherDescriptionUndercover,
  vote: afficherVoteUndercover,
  elimination: afficherEliminationUndercover,
  devinette: afficherDevinetteUndercover,
  fin_manche: afficherFinMancheUndercover,
  completerPodium: completerPodiumUndercover,
};
