import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Tous obligatoires : chaque personnage a sa photo, tirée de son article Wikipédia.
const CHAMPS = ['id', 'nom', 'categorie', 'niveau', 'wikipedia', 'image', 'auteur', 'licence'];
const NIVEAUX = [1, 2];
export const PERSONNAGES_MIN_PAR_NIVEAU = 30;

// D'où Wikimedia sert ses images et ses miniatures.
const HOTE_IMAGES = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;

// Pour repérer deux fois le même personnage : sans accents ni majuscules.
function cleNom(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Le champ est une chaîne non vide, sans espace au bord : sinon le message d'erreur.
function erreurTexte(valeur, champ) {
  if (typeof valeur !== 'string' || valeur.trim() === '') return `${champ} vide ou absent`;
  if (valeur !== valeur.trim()) return `${champ} avec des espaces au bord`;
  return null;
}

// Renvoie la liste des problèmes d'un personnage, sans tenir compte des autres.
function erreursPersonnage(personnage) {
  const erreurs = [];
  const champsEnTrop = Object.keys(personnage).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof personnage.id !== 'string' || !/^qs-[a-z0-9]+(-[a-z0-9]+)*$/.test(personnage.id)) {
    erreurs.push('id doit être au format qs-… (minuscules, chiffres, tirets)');
  }
  for (const champ of ['nom', 'categorie', 'wikipedia', 'image', 'auteur', 'licence']) {
    const erreur = erreurTexte(personnage[champ], champ);
    if (erreur) erreurs.push(erreur);
  }
  if (!NIVEAUX.includes(personnage.niveau)) erreurs.push('niveau doit valoir 1 ou 2');
  if (typeof personnage.image === 'string' && personnage.image.trim() && !HOTE_IMAGES.test(personnage.image)) {
    erreurs.push('image hors de Wikimedia');
  }
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierQuiSuisJe(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de personnages'];

  const erreurs = [];
  const idsVus = new Set();
  const nomsVus = new Set();
  liste.forEach((personnage, index) => {
    const nom = `personnage ${index + 1} (${personnage?.id ?? 'sans id'})`;
    if (typeof personnage !== 'object' || personnage === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursPersonnage(personnage)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(personnage.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(personnage.id);

    if (typeof personnage.nom === 'string') {
      const cle = cleNom(personnage.nom);
      if (nomsVus.has(cle)) erreurs.push(`${nom} : nom en double`);
      nomsVus.add(cle);
    }
  });
  for (const niveau of NIVEAUX) {
    const nombre = liste.filter((personnage) => personnage?.niveau === niveau).length;
    if (nombre < PERSONNAGES_MIN_PAR_NIVEAU) {
      erreurs.push(`au moins ${PERSONNAGES_MIN_PAR_NIVEAU} personnages de niveau ${niveau} attendus (${nombre})`);
    }
  }
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-qui-suis-je.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/qui-suis-je.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de qui-suis-je.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierQuiSuisJe(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const parNiveau = NIVEAUX.map((niveau) => liste.filter((p) => p.niveau === niveau).length);
  const nonLibres = liste.filter((p) => p.licence === 'Droits réservés').length;
  console.log(`${liste.length} personnages OK (facile ${parNiveau[0]}, difficile ${parNiveau[1]} ; ${nonLibres} images non libres)`);
}
