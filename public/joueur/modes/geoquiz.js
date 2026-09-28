// Écrans du GéoQuiz sur le téléphone. socket, texteRang, marquerEnvoi, boutonReglage et
// envoyerSuivant viennent de joueur.js ; L vient de Leaflet (CDN).
// Le téléphone ne fait qu'afficher : distance et points sont calculés par le serveur.

// La clé CARTO vient du serveur (variable CLE_CARTO), avec chaque vue.
const TUILES = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key={cle}';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
  + '&copy; <a href="https://carto.com/attributions">CARTO</a>';
const MONDE = [[-58, -170], [75, 170]];
const ZOOM_MAX = 10;

const elementCarte = document.getElementById('geoquiz-carte');
const boutonValiderPin = document.getElementById('bouton-valider-pin');
const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// Créée au premier affichage : Leaflet doit connaître la taille de son conteneur.
let carte = null;
// Ce qui est dessiné sur la carte (pins, ligne), effacé d'un écran à l'autre.
let calque = null;
// Pin posé pendant la devinette : { lat, lng } tel que tapé sur la carte.
let monPin = null;
let maCouleur = 1;
// Manche affichée : la carte n'est remise à zéro qu'au changement de manche.
let mancheAffichee = null;

function leafletDisponible() {
  return typeof L !== 'undefined';
}

function creerCarte(cle) {
  carte = L.map(elementCarte, {
    zoomControl: false,
    zoomSnap: 0.25,
    maxZoom: ZOOM_MAX,
    worldCopyJump: true,
  });
  L.tileLayer(TUILES, { attribution: ATTRIBUTION, subdomains: 'abcd', maxZoom: ZOOM_MAX, cle }).addTo(carte);
  carte.attributionControl.setPrefix(false);
  calque = L.layerGroup().addTo(carte);
  carte.on('click', (evenement) => poserPin(evenement.latlng));
}

// Déplace l'unique carte dans l'emplacement de l'écran affiché.
// Renvoie false si Leaflet n'a pas pu être chargé.
function placerCarte(nomEcran, cle) {
  const emplacement = document.querySelector(`main[data-ecran="${nomEcran}"] .emplacement-carte`);
  if (!leafletDisponible()) {
    elementCarte.textContent = 'Carte indisponible';
    emplacement.append(elementCarte);
    return false;
  }
  emplacement.append(elementCarte);
  if (!carte) creerCarte(cle);
  carte.invalidateSize();
  return true;
}

function vueMonde() {
  carte.setMinZoom(0);
  carte.fitBounds(MONDE);
  carte.setMinZoom(carte.getZoom());
}

// Carte verrouillée : plus de tap, de glisser ni de zoom.
function verrouiller(verrouillee) {
  const interactions = [carte.dragging, carte.touchZoom, carte.doubleClickZoom, carte.scrollWheelZoom, carte.boxZoom, carte.keyboard];
  for (const interaction of interactions) {
    if (verrouillee) interaction.disable();
    else interaction.enable();
  }
  elementCarte.classList.toggle('verrouillee', verrouillee);
}

function icone(classe, couleur) {
  return L.divIcon({
    className: `pin-geoquiz ${classe}`,
    html: `<span style="--couleur: ${couleur}"></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function dessinerMonPin(pin) {
  L.marker(pin, { icon: icone('pin-joueur', `var(--joueur-${maCouleur})`), interactive: false }).addTo(calque);
}

function poserPin(latlng) {
  if (mancheAffichee === null || elementCarte.classList.contains('verrouillee')) return;
  monPin = { lat: latlng.lat, lng: latlng.lng };
  calque.clearLayers();
  dessinerMonPin(monPin);
  boutonValiderPin.disabled = false;
  // Brouillon : le serveur le validera lui-même à la fin du chrono.
  socket.emit('joueur:repondre', { ...monPin, valide: false });
}

boutonValiderPin.addEventListener('click', () => {
  if (!monPin) return;
  marquerEnvoi(boutonValiderPin);
  socket.emit('joueur:repondre', { ...monPin, valide: true });
});

document.getElementById('bouton-suivant-geoquiz').addEventListener('click', envoyerSuivant);

function afficherDevinette(vue) {
  maCouleur = vue.couleur;
  document.getElementById('geoquiz-manche').textContent = `Manche ${vue.numero}/${vue.total}`;
  const manche = vue.etape;
  if (!placerCarte('geoquiz-devinette', vue.cleCarte)) return;
  verrouiller(false);
  if (manche === mancheAffichee) return;
  mancheAffichee = manche;
  // Après un rechargement de la page, le serveur rend le pin déjà posé.
  monPin = vue.pin;
  calque.clearLayers();
  if (monPin) dessinerMonPin(monPin);
  boutonValiderPin.disabled = !monPin;
  vueMonde();
}

function afficherPinValide(vue) {
  maCouleur = vue.couleur;
  document.getElementById('geoquiz-attente').textContent =
    `En attente des autres joueurs… (${vue.nbValides}/${vue.nbAttendus})`;
  if (!placerCarte('geoquiz-pin_valide', vue.cleCarte)) return;
  verrouiller(true);
  calque.clearLayers();
  dessinerMonPin(vue.pin);
}

// Le pin décalé d'un tour du monde si besoin, pour que la ligne prenne le plus court chemin.
function pinCoteLieu(pin, lieu) {
  let ecart = pin.lng - lieu.lng;
  while (ecart > 180) ecart -= 360;
  while (ecart < -180) ecart += 360;
  return { lat: pin.lat, lng: lieu.lng + ecart };
}

function texteDistance(km) {
  return km < 1 ? 'moins de 1 km' : `${formatKm.format(km)} km`;
}

function afficherResultatGeoquiz(vue) {
  maCouleur = vue.couleur;
  const { lieu, pin, km, points } = vue;
  document.getElementById('geoquiz-lieu').textContent = `${lieu.nom} (${lieu.pays})`;
  const resultat = document.getElementById('geoquiz-points');
  resultat.textContent = pin ? `+${points}` : 'Pas de pin, 0 point';
  resultat.classList.toggle('juste', points > 0);
  document.getElementById('geoquiz-distance').textContent = pin ? `Ton pin : à ${texteDistance(km)}` : '';
  document.getElementById('score-geoquiz').textContent = vue.score;
  document.getElementById('rang-geoquiz').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-geoquiz').hidden = !vue.estHote;

  if (!placerCarte('geoquiz-resultat', vue.cleCarte)) return;
  verrouiller(true);
  calque.clearLayers();
  L.marker(lieu, { icon: icone('pin-lieu', 'var(--juste)'), interactive: false }).addTo(calque);
  if (!pin) {
    carte.setView(lieu, 4);
    return;
  }
  const pinProche = pinCoteLieu(pin, lieu);
  dessinerMonPin(pinProche);
  L.polyline([pinProche, lieu], { color: '#1B1035', weight: 3, dashArray: '8 8', interactive: false }).addTo(calque);
  carte.fitBounds(L.latLngBounds([pinProche, lieu]), { padding: [40, 40], maxZoom: 6 });
}

// Tout autre écran clôt la manche : la prochaine devinette repart d'une carte vierge,
// même si c'est encore « manche 1 » (partie terminée par l'hôte puis relancée).
socket.on('joueur:etat', (vue) => {
  if (vue.ecran !== 'devinette') mancheAffichee = null;
});

// Réglages de l'hôte : le nombre de manches.
function remplirReglagesGeoquiz({ manches, options }) {
  document.getElementById('choix-manches').replaceChildren(...options.manches.map((nombre) => {
    const envoyer = nombre === manches ? null : () => socket.emit('hote:reglerMode', { manches: nombre });
    return boutonReglage(String(nombre), nombre === manches, envoyer);
  }));
}

modesJoueur.geoquiz = {
  remplirReglages: remplirReglagesGeoquiz,
  devinette: afficherDevinette,
  pin_valide: afficherPinValide,
  resultat: afficherResultatGeoquiz,
};
