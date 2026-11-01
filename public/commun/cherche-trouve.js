// Cherche & trouve : ce que la TV et le téléphone partagent. La visionneuse OpenSeadragon
// d'une scène (une seule image SVG, sans tuiles ni boutons), la paire d'emojis d'un détail,
// et le zoom sur un détail entouré à la révélation.

// Crée la visionneuse dans `element`, ou la réutilise, et ouvre l'image de la scène si elle a changé.
// quandOuverte() est appelée quand l'image est prête.
function visionneuseCt(element, scene, quandOuverte) {
  if (!element.visionneuse) {
    element.visionneuse = OpenSeadragon({
      element,
      showNavigationControl: false,
      // Sans boutons, OpenSeadragon ne charge aucune image à lui.
      prefixUrl: '',
      visibilityRatio: 1,
      constrainDuringPan: true,
      maxZoomPixelRatio: 3,
      animationTime: 0.8,
      gestureSettingsMouse: { clickToZoom: false, scrollToZoom: true },
      gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchToZoom: true, flickEnabled: true },
    });
    element.visionneuse.addHandler('open', () => {
      element.pret = true;
      element.quandOuverte?.();
    });
    element.visionneuse.addHandler('open-failed', () => element.quandEchec?.());
  }
  element.quandOuverte = quandOuverte;
  if (element.imageOuverte === scene.image) {
    // Déjà ouverte : tout de suite. En cours d'ouverture : à l'événement « open ».
    if (element.pret) quandOuverte?.();
    return element.visionneuse;
  }
  element.imageOuverte = scene.image;
  element.pret = false;
  element.visionneuse.open({ type: 'image', url: scene.image, buildPyramid: false });
  return element.visionneuse;
}

// Zoome sur le détail (position en pixels de l'image) et l'entoure d'un cercle.
function montrerDetailCt(visionneuse, { x, y }, rayonVue) {
  visionneuse.clearOverlays();
  const cercle = document.createElement('div');
  cercle.className = 'ct-cercle';
  const taille = 170;
  visionneuse.addOverlay({
    element: cercle,
    location: visionneuse.viewport.imageToViewportRectangle(x - taille / 2, y - taille / 2, taille, taille),
  });
  const cadre = visionneuse.viewport.imageToViewportRectangle(x - rayonVue, y - rayonVue * 0.66, rayonVue * 2, rayonVue * 1.33);
  visionneuse.viewport.fitBounds(cadre);
}

// « 🦀 » avec « 👑 » en petit, en haut à droite, comme dans la scène.
function paireCt(element, { base, accessoire }) {
  const corps = document.createElement('span');
  corps.className = 'ct-base';
  corps.textContent = base;
  const petit = document.createElement('span');
  petit.className = 'ct-accessoire';
  petit.textContent = accessoire;
  element.replaceChildren(corps, petit);
}
