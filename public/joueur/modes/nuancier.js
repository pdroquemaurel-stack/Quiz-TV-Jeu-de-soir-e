// Écrans du Nuancier sur le téléphone. socket, texteRang, marquerEnvoi et envoyerSuivant
// viennent de joueur.js ; afficherLogo et colorerZones de commun/nuancier.js.
// Le téléphone ne fait qu'afficher : ressemblance et points sont calculés par le serveur.

const curseurTeinte = document.getElementById('nuancier-teinte');
const curseurLuminosite = document.getElementById('nuancier-luminosite');
const boutonValiderCouleur = document.getElementById('bouton-valider-couleur');
// Un brouillon au plus toutes les 250 ms pendant qu'un curseur bouge.
const DELAI_BROUILLON_MS = 250;

// Manche affichée : les curseurs ne sont remis à la couleur du serveur qu'au changement de manche.
let mancheNuancier = null;
let saturationManche = 100;
let zonesManche = [];
// Le logo de l'écran de choix, recoloré à chaque mouvement de curseur.
let svgChoix = null;
let brouillonPrevu = null;

function couleurChoisie() {
  return { teinte: Number(curseurTeinte.value), luminosite: Number(curseurLuminosite.value) };
}

// La même couleur que celle que le serveur note : hsl() du CSS, avec la saturation de la cible.
function couleurCss(teinte, luminosite) {
  return `hsl(${teinte}, ${saturationManche}%, ${luminosite}%)`;
}

// Le fond de chaque curseur montre ce qu'il donne : les teintes à la luminosité choisie,
// les luminosités à la teinte choisie. Les arrêts tombent là où hsl() change de pente.
function peindreCurseurs() {
  const { teinte, luminosite } = couleurChoisie();
  const teintes = [0, 60, 120, 180, 240, 300, 360].map((t) => couleurCss(t, luminosite));
  curseurTeinte.style.background = `linear-gradient(to right, ${teintes.join(', ')})`;
  const luminosites = [5, 50, 95].map((l) => couleurCss(teinte, l));
  curseurLuminosite.style.background = `linear-gradient(to right, ${luminosites.join(', ')})`;
}

// Logo introuvable : c'est le nom de la marque, affiché à sa place, qui prend la couleur.
function colorerLogo(cadre, svg, couleur) {
  if (svg) colorerZones(svg, zonesManche, couleur);
  cadre.style.color = svg ? '' : couleur;
}

function recolorerLogo() {
  const { teinte, luminosite } = couleurChoisie();
  colorerLogo(document.getElementById('nuancier-logo'), svgChoix, couleurCss(teinte, luminosite));
}

// Brouillon : le serveur validera la dernière couleur lui-même à la fin du chrono.
function envoyerBrouillon() {
  clearTimeout(brouillonPrevu);
  brouillonPrevu = null;
  socket.emit('joueur:repondre', { ...couleurChoisie(), valide: false });
}

function prevoirBrouillon() {
  if (!brouillonPrevu) brouillonPrevu = setTimeout(envoyerBrouillon, DELAI_BROUILLON_MS);
}

for (const curseur of [curseurTeinte, curseurLuminosite]) {
  curseur.addEventListener('input', () => {
    peindreCurseurs();
    recolorerLogo();
    prevoirBrouillon();
  });
  // Au lâcher, la couleur part tout de suite.
  curseur.addEventListener('change', envoyerBrouillon);
}

boutonValiderCouleur.addEventListener('click', () => {
  clearTimeout(brouillonPrevu);
  brouillonPrevu = null;
  marquerEnvoi(boutonValiderCouleur);
  socket.emit('joueur:repondre', { ...couleurChoisie(), valide: true });
});

document.getElementById('bouton-suivant-nuancier').addEventListener('click', envoyerSuivant);

async function afficherChoixNuancier(vue) {
  document.getElementById('nuancier-manche').textContent = `Manche ${vue.numero}/${vue.total}`;
  document.getElementById('nuancier-question').textContent = vue.logo.question;
  if (vue.etape !== mancheNuancier) {
    mancheNuancier = vue.etape;
    saturationManche = vue.saturation;
    zonesManche = vue.logo.zones;
    // Après un rechargement de la page, le serveur rend la couleur déjà choisie.
    curseurTeinte.value = vue.curseurs.teinte;
    curseurLuminosite.value = vue.curseurs.luminosite;
    svgChoix = null;
  }
  peindreCurseurs();
  const svg = await afficherLogo(document.getElementById('nuancier-logo'), vue.logo);
  if (vue.etape !== mancheNuancier) return;
  svgChoix = svg;
  recolorerLogo();
}

async function afficherCouleurValidee(vue) {
  document.getElementById('nuancier-attente').textContent =
    `Les autres cherchent encore… (${vue.nbValides}/${vue.nbAttendus})`;
  saturationManche = vue.saturation;
  zonesManche = vue.logo.zones;
  const cadre = document.getElementById('nuancier-logo-valide');
  const svg = await afficherLogo(cadre, vue.logo);
  colorerLogo(cadre, svg, couleurCss(vue.curseurs.teinte, vue.curseurs.luminosite));
}

// Pas de couleur ici : l'écran du téléphone ne la rend pas comme la TV.
function afficherResultatNuancier(vue) {
  const resultat = document.getElementById('nuancier-ressemblance');
  const aRepondu = vue.ressemblance !== null;
  resultat.textContent = aRepondu
    ? `${vue.ressemblance} % de ressemblance`
    : 'Pas de réponse, 0 point. Le daltonisme a bon dos.';
  resultat.classList.toggle('juste', aRepondu && vue.ressemblance >= 90);
  document.getElementById('nuancier-points').textContent = aRepondu ? `+${vue.points}` : '';
  document.getElementById('score-nuancier').textContent = vue.score;
  document.getElementById('rang-nuancier').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-nuancier').hidden = !vue.estHote;
}

// Tout autre écran clôt la manche : la prochaine repart de la couleur du serveur,
// même si c'est encore « manche 1 » (partie terminée par l'hôte puis relancée).
socket.on('joueur:etat', (vue) => {
  if (vue.ecran !== 'nuancier') {
    mancheNuancier = null;
    clearTimeout(brouillonPrevu);
    brouillonPrevu = null;
  }
});

// Les options de l'hôte (manches et temps) sont les options communes, remplies par joueur.js.
modesJoueur.nuancier = {
  nuancier: afficherChoixNuancier,
  couleur_validee: afficherCouleurValidee,
  resultat: afficherResultatNuancier,
};
