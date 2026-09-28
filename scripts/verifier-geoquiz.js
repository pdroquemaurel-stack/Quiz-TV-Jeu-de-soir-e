import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHAMPS = ['id', 'nom', 'pays', 'lat', 'lng', 'image', 'auteur', 'licence', 'difficulte'];
const HOTE_IMAGES = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;
const NOMS_DIFFICULTES = { 1: 'faciles', 2: 'moyens', 3: 'difficiles' };
// Une partie de 10 manches demande 4 faciles, 4 moyens et 2 difficiles : on garde de la marge
// pour ne pas revoir les mêmes lieux d'une partie à l'autre.
export const MIN_PAR_DIFFICULTE = 10;

function texteNonVide(valeur) {
  return typeof valeur === 'string' && valeur.trim() !== '';
}

function nombreEntre(valeur, min, max) {
  return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= min && valeur <= max;
}

function erreursLieu(lieu) {
  const enTrop = Object.keys(lieu).filter((champ) => !CHAMPS.includes(champ));
  const erreurs = enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
  if (typeof lieu.id !== 'string' || !/^l\d+$/.test(lieu.id)) erreurs.push('id doit être au format l + chiffres');
  if (!texteNonVide(lieu.nom)) erreurs.push('nom vide ou absent');
  if (!texteNonVide(lieu.pays)) erreurs.push('pays vide ou absent');
  if (!nombreEntre(lieu.lat, -90, 90)) erreurs.push('lat doit être un nombre entre -90 et 90');
  if (!nombreEntre(lieu.lng, -180, 180)) erreurs.push('lng doit être un nombre entre -180 et 180');
  if (typeof lieu.image !== 'string' || !HOTE_IMAGES.test(lieu.image)) {
    erreurs.push('image doit être une adresse https de upload.wikimedia.org ou thumb.wikimedia.org');
  }
  if (!texteNonVide(lieu.auteur)) erreurs.push('auteur vide ou absent');
  if (!texteNonVide(lieu.licence)) erreurs.push('licence vide ou absente');
  if (![1, 2, 3].includes(lieu.difficulte)) erreurs.push('difficulte doit valoir 1, 2 ou 3');
  return erreurs;
}

// Nombre de lieux jouables (non exclus) par difficulté : { 1: …, 2: …, 3: … }.
export function compterParDifficulte(pack, exclus) {
  const compte = { 1: 0, 2: 0, 3: 0 };
  for (const lieu of pack) {
    if (!exclus.includes(lieu.id) && lieu.difficulte in compte) compte[lieu.difficulte] += 1;
  }
  return compte;
}

// Renvoie la liste de toutes les erreurs du pack et des exclus (vide si tout va bien).
export function verifierGeoquiz(pack, exclus) {
  if (!Array.isArray(pack)) return ['data/geoquiz.json doit contenir une liste de lieux'];
  if (!Array.isArray(exclus)) return ['data/geoquiz-exclus.json doit contenir une liste d\'ids'];

  const erreurs = [];
  const idsVus = new Set();
  pack.forEach((lieu, index) => {
    const nom = `Lieu ${index + 1} (${lieu?.id ?? 'sans id'})`;
    if (typeof lieu !== 'object' || lieu === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursLieu(lieu)) erreurs.push(`${nom} : ${erreur}`);
    if (idsVus.has(lieu.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(lieu.id);
  });

  // Un id exclu absent du pack est sans doute une faute de frappe.
  for (const id of exclus) {
    if (!idsVus.has(id)) erreurs.push(`exclu « ${id} » : absent de data/geoquiz.json`);
  }
  const compte = compterParDifficulte(pack, exclus);
  for (const [difficulte, nombre] of Object.entries(compte)) {
    if (nombre < MIN_PAR_DIFFICULTE) {
      erreurs.push(`${nombre} lieux ${NOMS_DIFFICULTES[difficulte]} hors exclus, il en faut au moins ${MIN_PAR_DIFFICULTE}`);
    }
  }
  return erreurs;
}

function lireJson(chemin) {
  return JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'));
}

// Lancé en ligne de commande : node scripts/verifier-geoquiz.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pack;
  let exclus;
  try {
    pack = lireJson('../data/geoquiz.json');
    exclus = lireJson('../data/geoquiz-exclus.json');
  } catch (e) {
    console.error(`Lecture impossible de data/geoquiz.json ou data/geoquiz-exclus.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierGeoquiz(pack, exclus);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const compte = compterParDifficulte(pack, exclus);
  const jouables = pack.filter((lieu) => !exclus.includes(lieu.id));
  const pays = new Set(jouables.map((lieu) => lieu.pays)).size;
  console.log(
    `${jouables.length} lieux jouables (faciles ${compte[1]}, moyens ${compte[2]}, difficiles ${compte[3]}), `
    + `${pays} pays, ${exclus.length} exclus. OK`,
  );
}
