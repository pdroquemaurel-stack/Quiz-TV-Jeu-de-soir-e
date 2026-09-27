// Écrans de La légende sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.
// Un seul <video> joue le GIF : il passe dans le cadre de l'écran affiché, sans redémarrer
// tant que le GIF ne change pas. Si la vidéo ne se charge pas, le nom du template la remplace.

// Délai entre deux cartes de la révélation.
const DELAI_CARTE_LEGENDE_MS = 800;
// Au-delà, le titre gagnant passe en plus petit sur 4 lignes pour tenir sur le GIF.
const LONGUEUR_TITRE_LONG_LEGENDE = 60;
// Classement sous le GIF : au-delà, les derniers sont résumés en « et N autres ».
const MAX_LIGNES_CLASSEMENT_LEGENDE = 6;

const gifLegende = document.getElementById('lg-gif');
const videoLegende = document.getElementById('lg-video');
const nomGifLegende = document.getElementById('lg-nom-gif');
const videoSuivanteLegende = document.getElementById('lg-video-suivante');

// La manche continue sans vidéo : le serveur ne l'attend pas.
videoLegende.addEventListener('error', () => {
  if (!videoLegende.getAttribute('src')) return;
  videoLegende.hidden = true;
  nomGifLegende.hidden = false;
});

function placerGifLegende(idCadre, gif) {
  const cadre = document.getElementById(idCadre);
  if (gifLegende.parentElement !== cadre) cadre.append(gifLegende);
  const source = `/${gif.fichier}`;
  if (videoLegende.getAttribute('src') !== source) {
    nomGifLegende.textContent = gif.nom;
    nomGifLegende.hidden = true;
    videoLegende.hidden = false;
    videoLegende.src = source;
  }
  // Déplacer la vidéo dans la page la met en pause : on la relance.
  videoLegende.play().catch(() => {});
}

// Au podium, plus rien ne tourne en arrière-plan sur le stick.
function arreterGifsLegende() {
  for (const video of [videoLegende, videoSuivanteLegende]) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

function afficherSaisieLegende(salle, nouvelleEtape) {
  const {
    numero, total, gif, ontRepondu,
  } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('lg-numero-saisie').textContent = `GIF ${numero}/${total}`;
    document.getElementById('lg-bandeau').hidden = true;
  }
  placerGifLegende('lg-cadre-saisie', gif);
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'lg-barre-temps-saisie', chrono: 'lg-chrono-saisie', pastilles: 'lg-ont-ecrit',
  }, ontRepondu);
}

// Les titres ne sont construits qu'une fois : leur arrivée ne se rejoue pas à chaque vote.
function afficherVoteLegende(salle, nouvelleEtape) {
  const {
    numero, total, gif, propositions, ontRepondu,
  } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('lg-numero-vote').textContent = `GIF ${numero}/${total}`;
    document.getElementById('lg-propositions').replaceChildren(
      ...propositions.map((proposition, index) => {
        const element = document.createElement('li');
        element.append(texte('numero-proposition', index + 1), texte('libelle', proposition.texte));
        return element;
      }),
    );
  }
  placerGifLegende('lg-cadre-vote', gif);
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'lg-barre-temps-vote', chrono: 'lg-chrono-vote', pastilles: 'lg-ont-vote',
  }, ontRepondu);
}

// Les cartes ne sont construites qu'au début de la révélation, pour ne pas rejouer leur
// arrivée échelonnée. Après un rechargement de la TV, elles s'affichent d'un coup.
function afficherRevelationLegende(salle, nouvelleEtape) {
  const {
    numero, total, gif, propositions, sansTitre, classement, gifSuivant,
  } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  placerGifLegende('lg-cadre-revelation', gif);

  if (nouvelleEtape) {
    sonner(salle.etatMode.legendaire ? 'victoire' : 'revelation');
    document.getElementById('lg-numero-revelation').textContent = `GIF ${numero}/${total}`;

    // Du moins voté au plus voté : les gagnants arrivent en dernier.
    const cartes = [...propositions]
      .sort((a, b) => a.votants.length - b.votants.length)
      .map((proposition) => carteLegende(proposition, joueurDe));
    const delai = (rang) => (premierEtatRecu ? '0ms' : `${rang * DELAI_CARTE_LEGENDE_MS}ms`);
    cartes.forEach((carte, rang) => { carte.style.animationDelay = delai(rang); });
    document.getElementById('lg-cartes').replaceChildren(...cartes);

    const bandeau = document.getElementById('lg-bandeau');
    const textesBandeau = textesDuBandeau(salle.etatMode);
    bandeau.replaceChildren(...textesBandeau.map((ligne) => texte('lg-titre-gagnant', ligne)));
    bandeau.hidden = textesBandeau.length === 0;
    bandeau.classList.toggle('deux', textesBandeau.length === 2);
    bandeau.classList.toggle('long', textesBandeau.some((ligne) => ligne.length > LONGUEUR_TITRE_LONG_LEGENDE));
    bandeau.style.animationDelay = delai(cartes.length);

    const verdict = document.getElementById('lg-verdict');
    verdict.textContent = verdictLegende(salle.etatMode);
    verdict.hidden = verdict.textContent === '';
    verdict.style.animationDelay = delai(cartes.length);

    const ligneSansTitre = document.getElementById('lg-sans-titre');
    ligneSansTitre.hidden = sansTitre.length === 0;
    ligneSansTitre.querySelector('ul').replaceChildren(...pastillesSeules(sansTitre.map(joueurDe)));
  }
  if (gifSuivant) prechargerGifLegende(gifSuivant);
  document.getElementById('lg-classement').replaceChildren(...lignesClassementLegende(classement));
}

function prechargerGifLegende(gifSuivant) {
  const source = `/${gifSuivant.fichier}`;
  if (videoSuivanteLegende.getAttribute('src') !== source) videoSuivanteLegende.src = source;
}

// Sous le GIF : le titre gagnant, ou les deux gagnants à égalité ; au-delà, rien (« Égalité ! »).
// Avec un seul titre, le vote a été sauté : il est affiché quand même.
function textesDuBandeau({ propositions, pasAssezDeTitres }) {
  if (pasAssezDeTitres) return propositions.map((proposition) => proposition.texte);
  const gagnants = propositions.filter((proposition) => proposition.gagnant);
  return gagnants.length <= 2 ? gagnants.map((proposition) => proposition.texte) : [];
}

function verdictLegende({ propositions, legendaire, pasAssezDeTitres }) {
  if (pasAssezDeTitres) return 'Pas assez de titres pour voter';
  const gagnants = propositions.filter((proposition) => proposition.gagnant);
  if (legendaire) return 'Légendaire !';
  if (gagnants.length === 0) return 'Aucun vote';
  if (gagnants.length > 1) return 'Égalité !';
  return '';
}

// Une ligne par carte : le nombre de votes, le titre, puis la pastille de son ou ses auteurs.
// Les points apparaissent dans le classement, à gauche.
function carteLegende(proposition, joueurDe) {
  const element = document.createElement('li');
  element.classList.toggle('gagnant', proposition.gagnant);
  const auteurs = document.createElement('ul');
  auteurs.className = 'etiquettes';
  auteurs.append(...pastillesSeules(proposition.auteurs.map(joueurDe)));
  element.append(
    texte('lg-votes', proposition.votants.length),
    texte('libelle', proposition.texte),
    auteurs,
  );
  return element;
}

function lignesClassementLegende(classement) {
  if (classement.length <= MAX_LIGNES_CLASSEMENT_LEGENDE) {
    return classement.map((ligne) => ligneClassement(ligne, true));
  }
  const visibles = classement.slice(0, MAX_LIGNES_CLASSEMENT_LEGENDE - 1);
  const autres = document.createElement('li');
  autres.className = 'lg-autres';
  autres.textContent = `et ${classement.length - visibles.length} autres`;
  return [...visibles.map((ligne) => ligneClassement(ligne, true)), autres];
}

modesTv.legende = {
  saisie: afficherSaisieLegende,
  vote: afficherVoteLegende,
  revelation: afficherRevelationLegende,
  completerPodium: arreterGifsLegende,
};
