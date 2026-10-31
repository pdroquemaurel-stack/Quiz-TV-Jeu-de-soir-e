// Écrans de la Wiki course sur la TV. Les outils communs (pastille, chrono, sonner…) viennent de tv.js.
// La TV n'affiche aucun article : seulement les titres et la miniature de la cible.

const imageAnnonceWc = document.getElementById('wc-image-annonce');
imageAnnonceWc.addEventListener('error', () => { imageAnnonceWc.hidden = true; });

// Les joueurs déjà arrivés à la course affichée : une nouvelle arrivée se fête.
let arrivesAffichesWc = new Set();

function joueurWc(salle, id) {
  return salle.joueurs.find((joueur) => joueur.id === id);
}

function numeroCourseWc({ numero, total }) {
  return `Course ${numero}/${total}`;
}

// « 1er », « 2e ».
function texteRangWc(rang) {
  return rang === 1 ? '1er' : `${rang}e`;
}

function afficherImageCible(element, cible) {
  element.hidden = !cible.image;
  if (cible.image && element.getAttribute('src') !== cible.image) element.src = cible.image;
}

function afficherAnnonceWc(salle, nouvelleEtape) {
  const { depart, cible, format } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('etape');
    arrivesAffichesWc = new Set();
  }
  document.getElementById('wc-numero-annonce').textContent = numeroCourseWc(salle.etatMode);
  document.getElementById('wc-format-annonce').textContent = format === 'libre' ? 'Course libre' : 'En manches';
  document.getElementById('wc-depart-annonce').textContent = depart ?? 'Au hasard…';
  document.getElementById('wc-cible-annonce').textContent = cible.titre;
  document.getElementById('wc-extrait-annonce').textContent = cible.extrait;
  afficherImageCible(imageAnnonceWc, cible);
}

// Une ligne par joueur : sa page courante, ses clics, et son arrivée.
function ligneJoueurWc(salle, ligne) {
  const joueur = joueurWc(salle, ligne.id);
  const element = document.createElement('li');
  element.className = 'wc-ligne';
  const etat = texte('wc-etat', '');
  if (ligne.arrive) {
    element.classList.add('arrive');
    etat.textContent = ligne.rangArrivee ? `${texteRangWc(ligne.rangArrivee)} !` : `Arrivé (manche ${ligne.arriveeManche})`;
  } else if (ligne.aChoisi) etat.textContent = '✔';
  element.append(
    pastille(joueur?.couleur ?? 1),
    texte('pseudo', joueur?.pseudo ?? '?'),
    texte('wc-page', ligne.page),
    texte('wc-clics', `${ligne.clics} clic${ligne.clics > 1 ? 's' : ''}`),
    etat,
  );
  if (joueur) griserSiDeconnecte(element, joueur);
  return element;
}

function afficherCourseWc(salle, nouvelleEtape) {
  const {
    format, cible, manche, mancheMax, tempsRestantMs, joueurs,
  } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('lancement');
    viderBarreTemps(document.getElementById('wc-barre'), tempsRestantMs);
  }
  const nouveauxArrives = joueurs.filter((ligne) => ligne.arrive && !arrivesAffichesWc.has(ligne.id));
  if (nouveauxArrives.length && !nouvelleEtape) sonner('victoire');
  for (const ligne of nouveauxArrives) arrivesAffichesWc.add(ligne.id);

  const numero = format === 'libre' ? numeroCourseWc(salle.etatMode) : `Manche ${manche}/${mancheMax}`;
  document.getElementById('wc-numero-course').textContent = numero;
  document.getElementById('wc-cible-course').textContent = `🎯 ${cible.titre}`;
  afficherImageCible(document.getElementById('wc-image-course'), cible);
  const chrono = document.getElementById('wc-chrono');
  chrono.classList.toggle('chrono-minutes', format === 'libre');
  lancerChrono(chrono, tempsRestantMs);
  document.getElementById('wc-lignes').replaceChildren(...joueurs.map((ligne) => ligneJoueurWc(salle, ligne)));
}

// Manches : le déplacement de chacun, « Fer → Italie ».
function afficherRevelationWc(salle, nouvelleEtape) {
  const {
    cible, manche, mancheMax, joueurs, deplacements,
  } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  const nouveauxArrives = joueurs.filter((ligne) => ligne.arrive && !arrivesAffichesWc.has(ligne.id));
  if (nouveauxArrives.length) sonner('victoire');
  for (const ligne of nouveauxArrives) arrivesAffichesWc.add(ligne.id);

  document.getElementById('wc-numero-revelation').textContent = `Manche ${manche}/${mancheMax}`;
  document.getElementById('wc-cible-revelation').textContent = `🎯 ${cible.titre}`;
  document.getElementById('wc-lignes-revelation').replaceChildren(...joueurs.map((ligne) => {
    const element = ligneJoueurWc(salle, ligne);
    const deplacement = deplacements.find((autre) => autre.id === ligne.id);
    const page = element.querySelector('.wc-page');
    if (deplacement) {
      page.textContent = `${deplacement.de} → ${deplacement.vers}`;
      element.classList.add('bouge');
    } else if (!ligne.arrive) page.textContent = `${ligne.page} (sur place)`;
    return element;
  }));
}

// « Puddlage → Fer → … → Pizza » : les chaînes trop longues sont coupées au milieu.
function texteParcoursWc(pages) {
  const gardees = pages.length > 7 ? [...pages.slice(0, 3), '…', ...pages.slice(-3)] : pages;
  return gardees.join(' → ');
}

function ligneParcoursWc(salle, parcours) {
  const joueur = joueurWc(salle, parcours.id);
  const element = document.createElement('li');
  element.classList.toggle('arrive', parcours.arrive);
  const entete = document.createElement('p');
  entete.className = 'wc-entete-parcours';
  entete.append(
    pastille(joueur?.couleur ?? 1),
    texte('pseudo', joueur?.pseudo ?? '?'),
    texte('wc-clics', `${parcours.clics} clic${parcours.clics > 1 ? 's' : ''}`),
    texte('wc-points', parcours.arrive ? `+${parcours.points}` : 'Pas arrivé'),
  );
  element.append(entete, texte('wc-chemin', texteParcoursWc(parcours.pages)));
  return element;
}

function afficherBilanWc(salle, nouvelleEtape) {
  const { parcours, classement, cible } = salle.etatMode;
  if (nouvelleEtape) sonner('etape');
  document.getElementById('wc-numero-bilan').textContent = numeroCourseWc(salle.etatMode);
  const arrives = parcours.filter((ligne) => ligne.arrive).length;
  document.getElementById('wc-verdict').textContent = arrives
    ? `${arrives} arrivé${arrives > 1 ? 's' : ''} à « ${cible.titre} »`
    : `Personne n'a trouvé « ${cible.titre} ». Wikipédia gagne.`;
  document.getElementById('wc-parcours').replaceChildren(...parcours.map((ligne) => ligneParcoursWc(salle, ligne)));
  document.getElementById('wc-classement').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

modesTv['wiki-course'] = {
  annonce: afficherAnnonceWc,
  course: afficherCourseWc,
  revelation: afficherRevelationWc,
  bilan: afficherBilanWc,
};
