// Écrans du Nuancier sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js ;
// afficherLogo, masquerZones et colorerZones de commun/nuancier.js.

async function afficherChoixNuancier(salle, nouvelleEtape) {
  const { numero, total, logo, ontRepondu } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('nuancier-numero-choix').textContent = `Manche ${numero}/${total}`;
    document.getElementById('nuancier-question-choix').textContent = `${logo.nom} · ${logo.question}`;
  }
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'nuancier-barre-temps', chrono: 'nuancier-chrono', pastilles: 'nuancier-ont-repondu',
  }, ontRepondu);
  const svg = await afficherLogo(document.getElementById('nuancier-logo-choix'), logo);
  if (svg) masquerZones(svg, logo.zones);
}

async function afficherRevelationNuancier(salle, nouvelleEtape) {
  const {
    numero, total, logo, cible, resultats, sansReponse, classement,
  } = salle.etatMode;
  if (nouvelleEtape) {
    // « Victoire » si quelqu'un a trouvé la couleur exacte.
    sonner(resultats.some((ligne) => ligne.ressemblance === 100) ? 'victoire' : 'revelation');
    document.getElementById('nuancier-numero-revelation').textContent = `Manche ${numero}/${total}`;
    document.getElementById('nuancier-question-revelation').textContent = `${logo.nom} · ${logo.question}`;
    document.getElementById('nuancier-carre-cible').style.background = cible;
  }
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  document.getElementById('nuancier-resultats').replaceChildren(
    ...resultats.map((ligne) => ligneNuancier(ligne, joueurDe(ligne.id), cible)),
    ...sansReponse.map((id) => ligneSansCouleur(joueurDe(id))),
  );
  document.getElementById('nuancier-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, false)),
  );
  const svg = await afficherLogo(document.getElementById('nuancier-logo-revelation'), logo);
  if (svg) colorerZones(svg, logo.zones, cible);
}

// Deux carrés collés : la couleur du joueur à gauche, la vraie à droite.
function duoDeCouleurs(couleur, cible) {
  const duo = document.createElement('span');
  duo.className = 'nuancier-duo';
  for (const fond of [couleur, cible]) {
    const carre = document.createElement('span');
    carre.className = 'nuancier-carre';
    carre.style.background = fond;
    duo.append(carre);
  }
  return duo;
}

// Joueur, sa couleur à côté de la vraie, ressemblance, points gagnés.
function ligneNuancier(ligne, joueur, cible) {
  const element = document.createElement('li');
  element.append(
    pastille(joueur.couleur),
    texte('pseudo', joueur.pseudo),
    duoDeCouleurs(ligne.couleur, cible),
    texte('valeur', `${ligne.ressemblance} %`),
  );
  const gain = texte('gain', ligne.points > 0 ? `+${ligne.points}` : '✗');
  if (ligne.points === 0) gain.classList.add('zero');
  element.append(gain);
  griserSiDeconnecte(element, joueur);
  return element;
}

function ligneSansCouleur(joueur) {
  const element = document.createElement('li');
  element.classList.add('sans-reponse');
  element.append(pastille(joueur.couleur), texte('pseudo', joueur.pseudo), texte('valeur', 'pas de réponse'));
  griserSiDeconnecte(element, joueur);
  return element;
}

modesTv.nuancier = {
  choix: afficherChoixNuancier,
  revelation: afficherRevelationNuancier,
};
