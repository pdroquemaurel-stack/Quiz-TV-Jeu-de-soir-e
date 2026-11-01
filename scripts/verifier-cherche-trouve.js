import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHAMPS_SCENE = ['id', 'nom', 'image', 'largeur', 'hauteur', 'details'];
const CHAMPS_DETAIL = ['id', 'base', 'accessoire', 'texte', 'x', 'y'];
// Une partie de 8 détails, la plus longue, avec un peu de marge.
export const DETAILS_MIN = 8;
// Deux détails trop proches se confondraient au toucher (rayon de 60 px chacun).
export const ECART_MIN = 150;

function texteNonVide(valeur) {
  return typeof valeur === 'string' && valeur.trim() !== '' && valeur === valeur.trim();
}

function erreursDetail(detail, scene) {
  const erreurs = [];
  const champsEnTrop = Object.keys(detail).filter((champ) => !CHAMPS_DETAIL.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);
  for (const champ of ['base', 'accessoire', 'texte']) {
    if (!texteNonVide(detail[champ])) erreurs.push(`${champ} vide ou absent`);
  }
  const dansImage = (valeur, max) => Number.isInteger(valeur) && valeur >= 0 && valeur <= max;
  if (!dansImage(detail.x, scene.largeur) || !dansImage(detail.y, scene.hauteur)) erreurs.push('position hors de l\'image');
  return erreurs;
}

// Renvoie les problèmes d'une scène (cheminPublic : le dossier public/, pour trouver l'image).
function erreursScene(scene, cheminPublic) {
  const erreurs = [];
  const champsEnTrop = Object.keys(scene).filter((champ) => !CHAMPS_SCENE.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);
  if (typeof scene.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(scene.id)) erreurs.push('id doit être en minuscules, chiffres et tirets');
  if (!texteNonVide(scene.nom)) erreurs.push('nom vide ou absent');
  if (!Number.isInteger(scene.largeur) || !Number.isInteger(scene.hauteur) || scene.largeur <= 0 || scene.hauteur <= 0) {
    erreurs.push('largeur et hauteur doivent être des entiers positifs');
  }
  if (typeof scene.image !== 'string' || !/^\/cherche-trouve\/[a-z0-9-]+\.svg$/.test(scene.image)) {
    erreurs.push('image doit être /cherche-trouve/<nom>.svg');
  } else if (cheminPublic && !existsSync(`${cheminPublic}${scene.image}`)) erreurs.push(`image introuvable : ${scene.image}`);
  if (!Array.isArray(scene.details)) return [...erreurs, 'details doit être une liste'];

  const ids = new Set();
  scene.details.forEach((detail, index) => {
    const nom = `détail ${index + 1} (${detail?.id ?? 'sans id'})`;
    if (typeof detail !== 'object' || detail === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    if (typeof detail.id !== 'string' || !detail.id.startsWith(`${scene.id}-`)) erreurs.push(`${nom} : id doit commencer par « ${scene.id}- »`);
    if (ids.has(detail.id)) erreurs.push(`${nom} : id en double`);
    ids.add(detail.id);
    for (const erreur of erreursDetail(detail, scene)) erreurs.push(`${nom} : ${erreur}`);
    const proche = scene.details.slice(0, index).find((autre) => Math.hypot(autre.x - detail.x, autre.y - detail.y) < ECART_MIN);
    if (proche) erreurs.push(`${nom} : à moins de ${ECART_MIN} px de ${proche.id}`);
    const memePaire = scene.details.slice(0, index).find((autre) => autre.base === detail.base && autre.accessoire === detail.accessoire);
    if (memePaire) erreurs.push(`${nom} : même paire d'emojis que ${memePaire.id}`);
  });
  if (scene.details.length < DETAILS_MIN) erreurs.push(`au moins ${DETAILS_MIN} détails attendus (${scene.details.length})`);
  return erreurs;
}

export function verifierChercheTrouve(liste, cheminPublic = null) {
  if (!Array.isArray(liste) || liste.length === 0) return ['le fichier doit contenir une liste de scènes'];
  const erreurs = [];
  const ids = new Set();
  liste.forEach((scene, index) => {
    const nom = `scène ${index + 1} (${scene?.id ?? 'sans id'})`;
    if (typeof scene !== 'object' || scene === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    if (ids.has(scene.id)) erreurs.push(`${nom} : id en double`);
    ids.add(scene.id);
    for (const erreur of erreursScene(scene, cheminPublic)) erreurs.push(`${nom} : ${erreur}`);
  });
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-cherche-trouve.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/cherche-trouve.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de cherche-trouve.json : ${e.message}`);
    process.exit(1);
  }
  const erreurs = verifierChercheTrouve(liste, fileURLToPath(new URL('../public', import.meta.url)));
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} scènes OK (${liste.map((scene) => `${scene.nom} : ${scene.details.length} détails`).join(', ')})`);
}
