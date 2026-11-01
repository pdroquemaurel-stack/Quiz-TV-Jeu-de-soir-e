// Construit les scènes de Cherche & trouve (docs/modes/cherche-trouve.md) : une image SVG par scène
// dans public/cherche-trouve/ et le catalogue data/cherche-trouve.json (les positions des détails,
// connues du serveur seul). Le tirage est fixé par une graine : relancer redonne les mêmes scènes.
//   node scripts/construire-cherche-trouve.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LARGEUR = 3600;
export const HAUTEUR = 2400;
const CASE = 100;
const TAILLE_EMOJI = 64;
const TAILLE_ACCESSOIRE = 34;
const DETAILS_PAR_SCENE = 10;
const LEURRES_PAR_DETAIL = 4;
// Part des cases restantes occupées par des figurants.
const REMPLISSAGE = 0.62;
const POLICE = 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif';

const ACCESSOIRES = {
  '👑': 'une couronne',
  '🎩': 'un chapeau haut-de-forme',
  '🕶️': 'des lunettes de soleil',
  '🎈': 'un ballon',
  '🌂': 'un parapluie',
  '🎀': 'un nœud',
  '🧢': 'une casquette',
  '🍦': 'une glace',
  '⭐': 'une étoile',
  '🌸': 'une fleur',
};

// Chaque thème : le fond, les bases (qui peuvent porter un accessoire) et des figurants sans accessoire.
export const THEMES = [
  {
    id: 'plage',
    nom: 'La plage',
    graine: 11,
    bases: {
      '🦀': 'le crabe', '🐙': 'la pieuvre', '🐶': 'le chien', '🐱': 'le chat', '🦩': 'le flamant rose',
      '🐬': 'le dauphin', '🧒': 'l’enfant', '👵': 'la mamie', '🦭': 'le phoque', '🐢': 'la tortue',
    },
    figurants: ['🏄', '🏊', '🐚', '🐠', '⛱️', '🏐', '🌴', '🪣', '🩴', '🐟', '🦞', '🪸'],
    fond: fondPlage,
  },
  {
    id: 'zoo',
    nom: 'Le zoo',
    graine: 23,
    bases: {
      '🐧': 'le manchot', '🦁': 'le lion', '🐒': 'le singe', '🦒': 'la girafe', '🐘': 'l’éléphant',
      '🐼': 'le panda', '🦓': 'le zèbre', '🦛': 'l’hippopotame', '🐯': 'le tigre', '🦜': 'le perroquet',
    },
    figurants: ['🦏', '🐊', '🦘', '🐻', '🦩', '🌳', '🪨', '🧒', '👨', '👩', '🍿', '🦔'],
    fond: fondZoo,
  },
  {
    id: 'stade',
    nom: 'Le stade',
    graine: 37,
    bases: {
      '👴': 'le papi', '👵': 'la mamie', '🧒': 'l’enfant', '👩': 'la supportrice', '👨': 'le supporter',
      '🧔': 'le barbu', '👱': 'le blondinet', '🐶': 'le chien', '🐦': 'l’oiseau', '🤖': 'le robot',
    },
    figurants: ['🙋', '🙆', '⚽', '📣', '🚩', '🌭', '🥤', '🏆', '🧑', '👧', '👦', '🥁'],
    fond: fondStade,
  },
];

// Générateur pseudo-aléatoire à graine (mulberry32) : les scènes ne changent pas d'une construction à l'autre.
export function generateur(graine) {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6D2B79F5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function melangerAvec(aleatoire, liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

function auHasard(aleatoire, liste) {
  return liste[Math.floor(aleatoire() * liste.length)];
}

function majuscule(texte) {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ---------- Fonds ----------

function fondPlage() {
  const vagues = Array.from({ length: 9 }, (_, i) => {
    const y = 80 + i * 90;
    return `<path d="M0 ${y} Q 150 ${y - 30} 300 ${y} T 600 ${y} T 900 ${y} T 1200 ${y} T 1500 ${y} T 1800 ${y} T 2100 ${y} T 2400 ${y} T 2700 ${y} T 3000 ${y} T 3300 ${y} T 3600 ${y}" fill="none" stroke="#9FDCF7" stroke-width="8"/>`;
  });
  return [
    `<rect width="${LARGEUR}" height="${HAUTEUR}" fill="#F4D99B"/>`,
    `<rect width="${LARGEUR}" height="860" fill="#3FA7E0"/>`,
    ...vagues,
    `<path d="M0 860 Q 450 940 900 860 T 1800 860 T 2700 860 T 3600 860 V 900 H 0 Z" fill="#FFFFFF" opacity="0.8"/>`,
  ];
}

function fondZoo() {
  const enclos = [];
  for (let colonne = 0; colonne < 4; colonne++) {
    for (let ligne = 0; ligne < 3; ligne++) {
      const x = 60 + colonne * 900;
      const y = 60 + ligne * 780;
      enclos.push(`<rect x="${x}" y="${y}" width="780" height="660" rx="40" fill="#A6D67F" stroke="#8B5A2B" stroke-width="14" stroke-dasharray="40 20"/>`);
    }
  }
  return [`<rect width="${LARGEUR}" height="${HAUTEUR}" fill="#E8D6A8"/>`, ...enclos];
}

function fondStade() {
  const bandes = Array.from({ length: 10 }, (_, i) => `<rect x="${700 + i * 220}" y="560" width="110" height="1280" fill="#4FA84A"/>`);
  return [
    `<rect width="${LARGEUR}" height="${HAUTEUR}" fill="#A9AFB8"/>`,
    ...Array.from({ length: 12 }, (_, i) => `<rect x="0" y="${i * 200}" width="${LARGEUR}" height="100" fill="#BFC4CC"/>`),
    `<rect x="700" y="560" width="2200" height="1280" fill="#5DBB57"/>`,
    ...bandes,
    `<rect x="740" y="600" width="2120" height="1200" fill="none" stroke="#FFFFFF" stroke-width="10"/>`,
    `<line x1="1800" y1="600" x2="1800" y2="1800" stroke="#FFFFFF" stroke-width="10"/>`,
    `<circle cx="1800" cy="1200" r="170" fill="none" stroke="#FFFFFF" stroke-width="10"/>`,
  ];
}

// ---------- Placement ----------

function cases() {
  const liste = [];
  for (let ligne = 0; ligne < HAUTEUR / CASE; ligne++) {
    for (let colonne = 0; colonne < LARGEUR / CASE; colonne++) liste.push({ ligne, colonne });
  }
  return liste;
}

// Centre d'une case, décalé un peu au hasard ; jamais au bord de l'image.
function positionDans(aleatoire, { ligne, colonne }) {
  const decalage = () => Math.round((aleatoire() - 0.5) * 36);
  return {
    x: Math.min(LARGEUR - 60, Math.max(60, colonne * CASE + CASE / 2 + decalage())),
    y: Math.min(HAUTEUR - 60, Math.max(60, ligne * CASE + CASE / 2 + decalage())),
  };
}

// Une scène : { details, objets } ; chaque objet { base, accessoire, x, y }.
export function construireScene(theme) {
  const aleatoire = generateur(theme.graine);
  const bases = Object.keys(theme.bases);
  const accessoires = Object.keys(ACCESSOIRES);
  const libres = melangerAvec(aleatoire, cases());
  const occupees = [];
  // Les détails : sur des cases éloignées les unes des autres (4 cases au moins).
  const prendreCaseEloignee = () => {
    const index = libres.findIndex((c) => occupees.every((o) => Math.hypot(o.ligne - c.ligne, o.colonne - c.colonne) >= 4));
    const [choisie] = libres.splice(index, 1);
    occupees.push(choisie);
    return choisie;
  };
  const paires = melangerAvec(aleatoire, bases).map((base, i) => ({ base, accessoire: accessoires[(i * 3) % accessoires.length] }))
    .slice(0, DETAILS_PAR_SCENE);
  const estDetail = (base, accessoire) => paires.some((p) => p.base === base && p.accessoire === accessoire);
  const details = paires.map(({ base, accessoire }, i) => ({
    id: `${theme.id}-${i + 1}`,
    base,
    accessoire,
    texte: `${majuscule(theme.bases[base])} avec ${ACCESSOIRES[accessoire]}`,
    ...positionDans(aleatoire, prendreCaseEloignee()),
  }));

  const objets = details.map(({ base, accessoire, x, y }) => ({ base, accessoire, x, y }));
  const poser = (base, accessoire) => objets.push({ base, accessoire, ...positionDans(aleatoire, libres.pop()) });
  // Les leurres : la même base avec un autre accessoire, le même accessoire sur une autre base.
  for (const { base, accessoire } of paires) {
    for (let i = 0; i < LEURRES_PAR_DETAIL; i++) {
      const autre = i % 2 === 0
        ? { base, accessoire: auHasard(aleatoire, accessoires) }
        : { base: auHasard(aleatoire, bases), accessoire };
      if (!estDetail(autre.base, autre.accessoire)) poser(autre.base, autre.accessoire);
    }
  }
  // Les figurants : la plupart sans accessoire, quelques-uns avec (jamais une paire de détail).
  const nombre = Math.round(libres.length * REMPLISSAGE);
  for (let i = 0; i < nombre; i++) {
    const avecBase = aleatoire() < 0.45;
    const base = avecBase ? auHasard(aleatoire, bases) : auHasard(aleatoire, theme.figurants);
    let accessoire = null;
    if (avecBase && aleatoire() < 0.25) {
      accessoire = auHasard(aleatoire, accessoires);
      if (estDetail(base, accessoire)) accessoire = null;
    }
    poser(base, accessoire);
  }
  // Dans le fichier, les objets sont mélangés : l'ordre ne trahit pas les détails.
  return { details, objets: melangerAvec(aleatoire, objets) };
}

function dessinObjet({ base, accessoire, x, y }) {
  const corps = `<text x="${x}" y="${y}" font-size="${TAILLE_EMOJI}">${base}</text>`;
  if (!accessoire) return corps;
  return `${corps}<text x="${x + 26}" y="${y - 30}" font-size="${TAILLE_ACCESSOIRE}">${accessoire}</text>`;
}

export function svgDe(theme, objets) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">`,
    ...theme.fond(),
    `<g font-family="${POLICE}" text-anchor="middle" dominant-baseline="central">`,
    ...objets.map(dessinObjet),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

// Lancé en ligne de commande : écrit les SVG et le catalogue.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dossier = fileURLToPath(new URL('../public/cherche-trouve/', import.meta.url));
  mkdirSync(dossier, { recursive: true });
  const catalogue = THEMES.map((theme) => {
    const { details, objets } = construireScene(theme);
    writeFileSync(`${dossier}${theme.id}.svg`, svgDe(theme, objets));
    console.log(`${theme.nom} : ${objets.length} objets, ${details.length} détails`);
    return {
      id: theme.id, nom: theme.nom, image: `/cherche-trouve/${theme.id}.svg`, largeur: LARGEUR, hauteur: HAUTEUR, details,
    };
  });
  const lignes = catalogue.map((scene) => `  ${JSON.stringify(scene)}`);
  writeFileSync(fileURLToPath(new URL('../data/cherche-trouve.json', import.meta.url)), `[\n${lignes.join(',\n')}\n]\n`);
}
