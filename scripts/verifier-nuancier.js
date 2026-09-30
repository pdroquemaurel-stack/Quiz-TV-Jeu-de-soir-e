import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LUMINOSITE_MAX, LUMINOSITE_MIN, tslDe } from '../server/modes/nuancier.js';

// source (la page Commons du logo) est facultative : les premières entrées ont été écrites à la main.
const CHAMPS = ['id', 'nom', 'fichier', 'question', 'cible', 'zones', 'source'];
const DEBUT_SOURCE = 'https://commons.wikimedia.org/wiki/File:';
// Une partie de 10 manches (le plus long réglage) sans revoir un logo.
export const MIN_CONSEILLE = 10;

function texteNonVide(valeur) {
  return typeof valeur === 'string' && valeur.trim() !== '';
}

const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Vrai si le SVG contient une forme avec cet id.
function contientId(svg, id) {
  return new RegExp(`\\sid=["']${echapper(id)}["']`).test(svg);
}

// Vrai si la cible est écrite dans le SVG, en hexadécimal long (#0058a3) ou court (#abc) :
// un joueur pourrait la lire dans les outils de son navigateur.
export function cibleDansLeSvg(svg, cible) {
  const hex = cible.slice(1).toLowerCase();
  const motifs = [hex];
  if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) motifs.push(hex[0] + hex[2] + hex[4]);
  return motifs.some((motif) => new RegExp(`#${motif}(?![0-9a-f])`, 'i').test(svg));
}

// svgs : Map fichier → texte des logos présents dans public/logos/nuancier/.
function erreursLogo(logo, svgs) {
  const enTrop = Object.keys(logo).filter((champ) => !CHAMPS.includes(champ));
  const erreurs = enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
  if (typeof logo.id !== 'string' || !/^n-[a-z0-9-]+$/.test(logo.id)) {
    erreurs.push('id doit être « n- » suivi de minuscules, chiffres et tirets');
  }
  if (!texteNonVide(logo.nom)) erreurs.push('nom vide ou absent');
  if (!texteNonVide(logo.question)) erreurs.push('question vide ou absente');
  else if (!logo.question.trim().endsWith('?')) erreurs.push('la question doit finir par « ? »');

  const cibleValide = typeof logo.cible === 'string' && /^#[0-9A-F]{6}$/i.test(logo.cible);
  if (!cibleValide) erreurs.push('cible doit être au format #RRGGBB');
  else {
    const luminosite = Math.round(tslDe(logo.cible).luminosite);
    if (luminosite < LUMINOSITE_MIN || luminosite > LUMINOSITE_MAX) {
      erreurs.push(`luminosité de la cible ${luminosite} %, hors de ${LUMINOSITE_MIN} à ${LUMINOSITE_MAX} : inatteignable`);
    }
  }
  const zonesValides = Array.isArray(logo.zones) && logo.zones.length > 0 && logo.zones.every(texteNonVide);
  if (!zonesValides) erreurs.push('zones doit être une liste non vide d\'id de formes');
  if ('source' in logo && (typeof logo.source !== 'string' || !logo.source.startsWith(DEBUT_SOURCE))) {
    erreurs.push(`source doit commencer par ${DEBUT_SOURCE}`);
  }

  if (typeof logo.fichier !== 'string' || !/^[a-z0-9-]+\.svg$/.test(logo.fichier)) {
    erreurs.push('fichier doit être en minuscules, chiffres et tirets, et finir par .svg');
    return erreurs;
  }
  const svg = svgs.get(logo.fichier);
  if (svg === undefined) return [...erreurs, `logo absent : public/logos/nuancier/${logo.fichier}`];
  if (zonesValides) {
    for (const zone of logo.zones) {
      if (!contientId(svg, zone)) erreurs.push(`zone « ${zone} » absente du SVG`);
    }
  }
  if (cibleValide && cibleDansLeSvg(svg, logo.cible)) {
    erreurs.push('la cible est encore écrite dans le SVG : zone mal neutralisée (voir scripts/prep-nuancier.html)');
  }
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du catalogue (vide si tout va bien).
export function verifierNuancier(liste, svgs) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de logos'];

  const erreurs = [];
  const idsVus = new Set();
  const fichiersUtilises = new Set();
  liste.forEach((logo, index) => {
    const nom = `Logo ${index + 1} (${logo?.id ?? 'sans id'})`;
    if (typeof logo !== 'object' || logo === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursLogo(logo, svgs)) erreurs.push(`${nom} : ${erreur}`);
    if (idsVus.has(logo.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(logo.id);
    fichiersUtilises.add(logo.fichier);
  });

  // Un logo qu'aucune entrée n'utilise serait commité pour rien.
  for (const fichier of svgs.keys()) {
    if (!fichiersUtilises.has(fichier)) erreurs.push(`public/logos/nuancier/${fichier} : aucune entrée ne l'utilise`);
  }
  return erreurs;
}

// Les logos SVG présents sur le disque, avec leur texte.
export function lireSvgs(dossier) {
  const svgs = new Map();
  if (!existsSync(dossier)) return svgs;
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.svg'))) {
    svgs.set(nom, readFileSync(new URL(nom, dossier), 'utf8'));
  }
  return svgs;
}

// Lancé en ligne de commande : node scripts/verifier-nuancier.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/nuancier.json', import.meta.url));
  let liste;
  let svgs;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
    svgs = lireSvgs(new URL('../public/logos/nuancier/', import.meta.url));
  } catch (e) {
    console.error(`Lecture impossible du catalogue ou de public/logos/nuancier/ : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierNuancier(liste, svgs);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  if (liste.length < MIN_CONSEILLE) {
    console.warn(`Attention : ${liste.length} logos, une partie de ${MIN_CONSEILLE} manches sera plus courte.`);
  }
  console.log(`${liste.length} logos OK`);
}
