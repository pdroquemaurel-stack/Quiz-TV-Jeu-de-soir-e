// Logos du Nuancier (docs/modes/nuancier.md), partagés par la TV et le téléphone.
// Le SVG est inséré dans la page pour pouvoir masquer ou recolorer ses zones. Il vit dans
// un Shadow DOM : ses <style> et ses id ne touchent ni la page ni les autres logos.

const GRIS_ZONE = '#D9D9D9';
const CONTOUR_ZONE = '#555555';
const STYLE_LOGO = `
  :host { display: block; }
  svg { display: block; width: 100%; height: 100%; }
  p { display: flex; align-items: center; justify-content: center; height: 100%; margin: 0;
      font-size: 1.6em; font-weight: bold; text-align: center; }
`;

// fichier → promesse du texte SVG : un logo n'est chargé qu'une fois.
const textesDesLogos = new Map();

function texteDuLogo(fichier) {
  if (!textesDesLogos.has(fichier)) {
    const texte = fetch(`/logos/nuancier/${encodeURIComponent(fichier)}`)
      .then((reponse) => (reponse.ok ? reponse.text() : null))
      .catch(() => null)
      .then((resultat) => {
        // Un échec n'est pas gardé : on réessaiera au prochain affichage.
        if (resultat === null) textesDesLogos.delete(fichier);
        return resultat;
      });
    textesDesLogos.set(fichier, texte);
  }
  return textesDesLogos.get(fichier);
}

// Le SVG prêt à insérer, ou null si le texte n'est pas un SVG lisible.
function lireSvgDuLogo(texte) {
  const doc = new DOMParser().parseFromString(texte, 'image/svg+xml');
  const racine = doc.documentElement;
  if (racine.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
  for (const script of racine.querySelectorAll('script')) script.remove();
  // Sans viewBox, le logo ne s'agrandirait pas avec son cadre.
  if (!racine.hasAttribute('viewBox')) {
    const largeur = parseFloat(racine.getAttribute('width'));
    const hauteur = parseFloat(racine.getAttribute('height'));
    if (largeur > 0 && hauteur > 0) racine.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);
  }
  racine.removeAttribute('width');
  racine.removeAttribute('height');
  return document.importNode(racine, true);
}

// Affiche le logo dans conteneur et renvoie son <svg>, ou null (le nom de la marque est
// alors affiché en gros à sa place). Un logo déjà affiché n'est pas rechargé.
async function afficherLogo(conteneur, logo) {
  const ombre = conteneur.shadowRoot ?? conteneur.attachShadow({ mode: 'open' });
  if (conteneur.dataset.fichier === logo.fichier) return ombre.querySelector('svg');
  conteneur.dataset.fichier = logo.fichier;
  const texte = await texteDuLogo(logo.fichier);
  // Un autre logo a été demandé pendant le chargement : c'est lui qui s'affiche.
  if (conteneur.dataset.fichier !== logo.fichier) return null;
  const style = document.createElement('style');
  style.textContent = STYLE_LOGO;
  const svg = texte && lireSvgDuLogo(texte);
  if (svg) {
    ombre.replaceChildren(style, svg);
    return svg;
  }
  const nom = document.createElement('p');
  nom.textContent = logo.nom;
  ombre.replaceChildren(style, nom);
  // Rien d'affiché pour ce fichier : un nouvel essai au prochain appel.
  delete conteneur.dataset.fichier;
  return null;
}

// Les formes de la zone présentes dans le logo (un id absent est ignoré).
function formesDeLaZone(svg, zones) {
  return zones.map((id) => svg.querySelector(`[id="${CSS.escape(id)}"]`)).filter(Boolean);
}

// Le style en ligne « important » l'emporte sur l'attribut fill, l'attribut style
// et la balise <style> du SVG.
function styler(forme, proprietes) {
  for (const [propriete, valeur] of Object.entries(proprietes)) {
    if (valeur === null) forme.style.removeProperty(propriete);
    else forme.style.setProperty(propriete, valeur, 'important');
  }
}

// Zone grisée avec un contour en pointillés.
function masquerZones(svg, zones) {
  for (const forme of formesDeLaZone(svg, zones)) {
    styler(forme, {
      fill: GRIS_ZONE, stroke: CONTOUR_ZONE, 'stroke-width': '3px', 'stroke-dasharray': '8 6',
      'vector-effect': 'non-scaling-stroke',
    });
  }
}

// couleur : « #RRGGBB » ou toute couleur CSS (« hsl(208 100% 32%) »).
function colorerZones(svg, zones, couleur) {
  for (const forme of formesDeLaZone(svg, zones)) {
    styler(forme, {
      fill: couleur, stroke: null, 'stroke-width': null, 'stroke-dasharray': null, 'vector-effect': null,
    });
  }
}
