// Écrans du GéoQuiz sur la TV. Les outils communs (pastille, chrono, classement…) viennent
// de tv.js ; L vient de Leaflet (CDN). La TV n'est jamais manipulée : la carte est figée.

const TUILES_GQ = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key={cle}';
const ATTRIBUTION_GQ = '&copy; OpenStreetMap &copy; CARTO';
const ZOOM_MAX_GQ = 10;
// Le classement arrive après 5 s (geoquiz.css) : la carte se recadre alors à droite de lui.
const DELAI_CLASSEMENT_GQ_MS = 5000;
const LARGEUR_CLASSEMENT_GQ = 1100;

const formatKmTv = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const photoGq = document.getElementById('gq-photo');
const photoAbsenteGq = document.getElementById('gq-photo-absente');

let carteGq = null;
let calqueGq = null;
let minuteurRecadrageGq = null;

// ---------- Devinette : la photo en plein écran ----------

// Une photo en hauteur est montrée entière (sur fond sombre), une photo en largeur remplit l'écran.
photoGq.addEventListener('load', () => {
  photoGq.classList.toggle('portrait', photoGq.naturalHeight > photoGq.naturalWidth);
  photoAbsenteGq.hidden = true;
});

photoGq.addEventListener('error', () => {
  photoAbsenteGq.hidden = false;
});

function texteCredit(photo) {
  return `Photo : ${photo.auteur}, ${photo.licence}, Wikimedia Commons`;
}

function afficherDevinetteGeoquiz(salle, nouvelleEtape) {
  const { numero, total, photo, ontRepondu } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('gq-numero-devinette').textContent = `Manche ${numero}/${total}`;
    document.getElementById('gq-credit-devinette').textContent = texteCredit(photo);
  }
  if (photoGq.getAttribute('src') !== photo.image) {
    photoAbsenteGq.hidden = true;
    photoGq.src = photo.image;
  }
  afficherAttenteReponses(salle, nouvelleEtape, {
    barre: 'gq-barre-temps', chrono: 'gq-chrono', pastilles: 'gq-ont-repondu',
  }, ontRepondu);
}

// Pendant la révélation, la photo de la manche suivante est déjà téléchargée.
function prechargerPhotoGeoquiz(photoSuivante) {
  if (photoSuivante) new Image().src = photoSuivante.image;
}

// ---------- Révélation : la carte des pins ----------

function creerCarteGeoquiz(cle) {
  carteGq = L.map('gq-carte', {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0.25,
    maxZoom: ZOOM_MAX_GQ,
  });
  L.tileLayer(TUILES_GQ, { attribution: ATTRIBUTION_GQ, subdomains: 'abcd', maxZoom: ZOOM_MAX_GQ, cle }).addTo(carteGq);
  carteGq.attributionControl.setPrefix(false);
  calqueGq = L.layerGroup().addTo(carteGq);
}

// Les tracés SVG de Leaflet ne lisent pas les variables CSS : on prend la vraie couleur.
function couleurJoueurGq(couleur) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--joueur-${couleur}`).trim();
}

// Le pin décalé d'un tour du monde si besoin, pour que la ligne prenne le plus court chemin.
function pinCoteLieuGq(pin, lieu) {
  let ecart = pin.lng - lieu.lng;
  while (ecart > 180) ecart -= 360;
  while (ecart < -180) ecart += 360;
  return L.latLng(pin.lat, lieu.lng + ecart);
}

function iconeJoueurGq(joueur) {
  const element = pastilleInitiale(joueur);
  element.classList.add('gq-pin-joueur');
  return L.divIcon({ className: 'gq-icone', html: element.outerHTML, iconSize: [72, 72], iconAnchor: [36, 36] });
}

function iconeLieuGq() {
  return L.divIcon({ className: 'gq-icone', html: '<span class="gq-pin-lieu"></span>', iconSize: [80, 80], iconAnchor: [40, 80] });
}

// Renvoie les points à cadrer : le vrai lieu et tous les pins.
function dessinerResultatsGq(salle) {
  const { lieu, resultats } = salle.etatMode;
  const joueurDe = (id) => salle.joueurs.find((joueur) => joueur.id === id);
  calqueGq.clearLayers();
  const points = [L.latLng(lieu.lat, lieu.lng)];
  for (const ligne of resultats) {
    const joueur = joueurDe(ligne.id);
    if (!joueur) continue;
    const pin = pinCoteLieuGq(ligne, lieu);
    points.push(pin);
    L.polyline([pin, points[0]], {
      color: couleurJoueurGq(joueur.couleur), weight: 6, dashArray: '14 12', interactive: false,
    }).addTo(calqueGq);
    L.marker(pin, { icon: iconeJoueurGq(joueur), interactive: false }).addTo(calqueGq);
  }
  // Le vrai lieu par-dessus les pins.
  L.marker(points[0], { icon: iconeLieuGq(), interactive: false, zIndexOffset: 1000 }).addTo(calqueGq);
  return L.latLngBounds(points);
}

// Avant le classement : toute la carte. Après : la partie droite, à côté du classement.
const CADRAGE_PLEIN_GQ = { paddingTopLeft: [160, 220], paddingBottomRight: [160, 160], maxZoom: 6 };
const CADRAGE_A_COTE_GQ = { paddingTopLeft: [LARGEUR_CLASSEMENT_GQ + 60, 220], paddingBottomRight: [120, 160], maxZoom: 6 };

function afficherRevelationGeoquiz(salle, nouvelleEtape) {
  const { numero, total, lieu, photo, cleCarte, photoSuivante } = salle.etatMode;
  if (nouvelleEtape) {
    sonner('revelation');
    document.getElementById('gq-numero-revelation').textContent = `Manche ${numero}/${total}`;
    document.getElementById('gq-lieu').replaceChildren(texte('gq-nom-lieu', lieu.nom), texte('gq-pays', ` · ${lieu.pays}`));
    document.getElementById('gq-credit-revelation').textContent = texteCredit(photo);
    dessinerCarteGq(salle, cleCarte);
  }
  prechargerPhotoGeoquiz(photoSuivante);
  const classement = document.getElementById('gq-classement');
  // Après un rechargement de la TV, le classement est là tout de suite.
  classement.style.animationDelay = premierEtatRecu ? '0s' : '';
  classement.replaceChildren(...lignesClassementGq(salle));
}

function dessinerCarteGq(salle, cle) {
  const element = document.getElementById('gq-carte');
  if (typeof L === 'undefined') {
    element.textContent = 'Carte indisponible';
    return;
  }
  if (!carteGq) creerCarteGeoquiz(cle);
  carteGq.invalidateSize();
  const bornes = dessinerResultatsGq(salle);
  clearTimeout(minuteurRecadrageGq);
  // Après un rechargement de la TV, le classement est déjà là : on cadre tout de suite à côté.
  if (premierEtatRecu) {
    carteGq.fitBounds(bornes, CADRAGE_A_COTE_GQ);
    return;
  }
  carteGq.fitBounds(bornes, CADRAGE_PLEIN_GQ);
  minuteurRecadrageGq = setTimeout(
    () => carteGq.flyToBounds(bornes, { ...CADRAGE_A_COTE_GQ, duration: 1.2 }),
    DELAI_CLASSEMENT_GQ_MS,
  );
}

function texteDistanceGq(km) {
  if (km === undefined) return '';
  return km < 1 ? '< 1 km' : `${formatKmTv.format(km)} km`;
}

// Le classement général commun, avec la distance de la manche avant le score.
function lignesClassementGq(salle) {
  const { classement, resultats, sansReponse } = salle.etatMode;
  return classement.map((ligne) => {
    const element = ligneClassement(ligne, true);
    const resultat = resultats.find((r) => r.id === ligne.id);
    let distance = '';
    if (resultat) distance = texteDistanceGq(resultat.km);
    else if (sansReponse.includes(ligne.id)) distance = 'pas de pin';
    element.querySelector('.score').before(texte('gq-distance', distance));
    return element;
  });
}

modesTv.geoquiz = {
  devinette: afficherDevinetteGeoquiz,
  revelation: afficherRevelationGeoquiz,
};
