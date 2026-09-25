// Sons et musique de la TV, synthétisés par le navigateur (docs/sons.md).
// Aucun fichier audio : chaque son est une petite suite de notes jouées par des oscillateurs.
// Sans Web Audio, tout reste silencieux et le jeu marche normalement.

const contexteAudio = window.AudioContext ? new AudioContext() : null;

const VOLUME_SONS = 0.3;
const VOLUME_MUSIQUE = 0.1;

// Deux sorties : on règle et on coupe la musique sans toucher aux sons.
const sortieSons = contexteAudio && sortie(VOLUME_SONS);
const sortieMusique = contexteAudio && sortie(VOLUME_MUSIQUE);

function sortie(volume) {
  const gain = contexteAudio.createGain();
  gain.gain.value = volume;
  gain.connect(contexteAudio.destination);
  return gain;
}

function sonDebloque() {
  return contexteAudio !== null && contexteAudio.state === 'running';
}

// Hauteur d'une note à partir de son numéro MIDI (60 = do central, 69 = la 440 Hz).
function midi(numero) {
  return 440 * 2 ** ((numero - 69) / 12);
}

// Une note à l'heure `debut` de l'horloge audio. Le volume monte vite puis s'éteint,
// pour éviter les claquements. `glisseVers` fait glisser la hauteur jusqu'à la fin de la note.
function note(frequence, debut, duree, {
  forme = 'square', volume = 1, glisseVers = null, vers = sortieSons,
} = {}) {
  const oscillateur = contexteAudio.createOscillator();
  const enveloppe = contexteAudio.createGain();
  oscillateur.type = forme;
  oscillateur.frequency.setValueAtTime(frequence, debut);
  if (glisseVers) oscillateur.frequency.exponentialRampToValueAtTime(glisseVers, debut + duree);
  enveloppe.gain.setValueAtTime(0, debut);
  enveloppe.gain.linearRampToValueAtTime(volume, debut + 0.01);
  enveloppe.gain.exponentialRampToValueAtTime(0.001, debut + duree);
  oscillateur.connect(enveloppe);
  enveloppe.connect(vers);
  oscillateur.start(debut);
  oscillateur.stop(debut + duree + 0.05);
}

// Plusieurs notes à la suite : [numéro MIDI, décalage en s, durée en s].
function suite(t, notes, options) {
  for (const [numero, decalage, duree] of notes) note(midi(numero), t + decalage, duree, options);
}

// Les 9 sons. Chacun reçoit l'heure de départ `t` sur l'horloge audio.
const SONS = {
  arrivee(t) {
    note(midi(72), t, 0.15, { forme: 'sine', glisseVers: midi(86) });
  },
  lancement(t) {
    suite(t, [[60, 0, 0.15], [64, 0.15, 0.15], [67, 0.3, 0.15], [72, 0.45, 0.55]], { volume: 0.5 });
  },
  etape(t) {
    note(midi(84), t, 0.4, { forme: 'sine' });
    note(midi(96), t, 0.2, { forme: 'sine', volume: 0.3 });
  },
  reponse(t) {
    note(midi(96), t, 0.05, { forme: 'triangle', volume: 0.3 });
  },
  tictac(t, { dernier = false } = {}) {
    note(midi(dernier ? 88 : 81), t, 0.08, { volume: 0.4 });
  },
  revelation(t) {
    note(midi(67), t, 0.12, { volume: 0.4 });
    suite(t, [[72, 0.15, 0.65], [76, 0.15, 0.65], [79, 0.15, 0.65]], { volume: 0.25 });
  },
  victoire(t) {
    suite(t, [[72, 0, 0.12], [76, 0.1, 0.12], [79, 0.2, 0.12], [84, 0.3, 0.12], [88, 0.4, 0.6]],
      { forme: 'triangle' });
  },
  rate(t) {
    note(midi(67), t, 0.3, { forme: 'sawtooth', volume: 0.3, glisseVers: midi(66) });
    note(midi(65), t + 0.3, 0.7, { forme: 'sawtooth', volume: 0.3, glisseVers: midi(60) });
  },
  podium(t) {
    suite(t, [[67, 0, 0.1], [67, 0.13, 0.1], [67, 0.26, 0.1], [72, 0.4, 0.4], [67, 0.85, 0.15],
      [72, 1.05, 1.2], [76, 1.05, 1.2], [79, 1.05, 1.2]], { volume: 0.3 });
    suite(t, [[48, 0.4, 0.4], [43, 0.85, 0.15], [36, 1.05, 1.2]], { forme: 'triangle' });
  },
};

// Joue un son s'il est débloqué. `{ dans: 1.5 }` le décale de 1,5 s (podium).
// `tictac` a en plus `{ dernier: true }`, plus aigu.
function jouerSon(nom, options = {}) {
  if (!sonDebloque()) return;
  SONS[nom](contexteAudio.currentTime + (options.dans || 0), options);
}

// ---------- Musique de salle d'attente ----------

// Boucle chiptune de 8 mesures : une note de mélodie par croche (null = silence),
// une note de basse par noire, sur les accords do, la, fa, sol (deux fois).
const CROCHE = 60 / 112 / 2;
const MELODIE = [
  72, null, 76, 79, 76, null, 72, null,
  69, null, 72, 76, 74, 72, 69, null,
  65, 69, 72, null, 74, 72, 69, null,
  67, null, 71, 74, 79, null, 74, null,
  72, null, 76, 79, 84, null, 79, null,
  81, null, 79, 76, 72, null, 76, null,
  77, 76, 74, 72, 69, 72, 74, null,
  71, null, 74, null, 79, null, 74, null,
];
const BASSE = [48, 45, 41, 43, 48, 45, 41, 43].flatMap((racine) => [racine, racine + 12, racine, racine + 12]);

let musiqueDemandee = false;
let intervalleMusique = null;
let prochainPas = 0;
let heureProchainPas = 0;

// Programme sur l'horloge audio les notes des 0,5 s à venir : la musique ne hoquette pas
// si la page est occupée un instant.
function programmerMusique() {
  while (heureProchainPas < contexteAudio.currentTime + 0.5) {
    jouerPas(prochainPas, heureProchainPas);
    prochainPas = (prochainPas + 1) % MELODIE.length;
    heureProchainPas += CROCHE;
  }
}

function jouerPas(pas, heure) {
  const options = { vers: sortieMusique };
  if (MELODIE[pas]) note(midi(MELODIE[pas]), heure, CROCHE * 0.9, { ...options, volume: 0.5 });
  if (pas % 2 === 0) note(midi(BASSE[pas / 2]), heure, CROCHE * 1.8, { ...options, forme: 'triangle' });
}

// Peut être appelée à chaque état reçu. Si le son est bloqué, la musique démarre au déblocage.
function lancerMusique() {
  musiqueDemandee = true;
  if (!sonDebloque() || intervalleMusique) return;
  const t = contexteAudio.currentTime;
  sortieMusique.gain.cancelScheduledValues(t);
  sortieMusique.gain.setValueAtTime(VOLUME_MUSIQUE, t);
  prochainPas = 0;
  heureProchainPas = t + 0.1;
  programmerMusique();
  intervalleMusique = setInterval(programmerMusique, 200);
}

// Fondu d'une demi-seconde. Peut être appelée à chaque état reçu.
function arreterMusique() {
  musiqueDemandee = false;
  if (!intervalleMusique) return;
  clearInterval(intervalleMusique);
  intervalleMusique = null;
  const t = contexteAudio.currentTime;
  sortieMusique.gain.cancelScheduledValues(t);
  sortieMusique.gain.setValueAtTime(VOLUME_MUSIQUE, t);
  sortieMusique.gain.linearRampToValueAtTime(0, t + 0.5);
}

// ---------- Déblocage ----------

// Les navigateurs bloquent le son tant qu'on n'a pas interagi avec la page :
// le bandeau reste affiché jusqu'au premier clic ou à la première touche.
function suivreDeblocage() {
  const bandeau = document.getElementById('bandeau-son');
  const mettreAJour = () => {
    bandeau.hidden = sonDebloque();
    if (sonDebloque() && musiqueDemandee) lancerMusique();
  };
  const debloquer = () => {
    if (!sonDebloque()) contexteAudio.resume();
  };
  contexteAudio.addEventListener('statechange', mettreAJour);
  document.addEventListener('click', debloquer);
  document.addEventListener('keydown', debloquer);
  mettreAJour();
}

if (contexteAudio) suivreDeblocage();

// ---------- Planche de sons (/tv?sons) ----------

// Le clic débloque le son s'il le faut, puis joue : le premier clic s'entend déjà.
function boutonPlanche(libelle, action) {
  const bouton = document.createElement('button');
  bouton.textContent = libelle;
  bouton.addEventListener('click', () => {
    if (contexteAudio) contexteAudio.resume().then(action);
  });
  return bouton;
}

function afficherPlanche() {
  const planche = document.createElement('div');
  planche.className = 'planche-sons';
  for (const nom of Object.keys(SONS)) {
    planche.append(boutonPlanche(nom, () => jouerSon(nom)));
    if (nom === 'tictac') {
      planche.append(boutonPlanche('tictac (1 s)', () => jouerSon('tictac', { dernier: true })));
    }
  }
  planche.append(boutonPlanche('Musique', () => (intervalleMusique ? arreterMusique() : lancerMusique())));
  document.getElementById('scene').append(planche);
}

if (new URLSearchParams(location.search).has('sons')) afficherPlanche();
