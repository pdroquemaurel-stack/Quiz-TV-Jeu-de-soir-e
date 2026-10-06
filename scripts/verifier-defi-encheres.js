import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHAMPS = ['id', 'sujet', 'miseDepart'];
export const MISE_MIN = 1;
export const MISE_MAX = 20;
// Une partie de 12 manches, la plus longue.
export const DEFIS_MIN = 12;

// « En 1 minute, combien de … » : le sujet ne commence pas par un article.
const ARTICLE_EN_TETE = /^(les|des|le|la|l'|un|une|du|de)\s/i;

// Pour repérer deux fois le même sujet : sans accents ni majuscules.
function cleSujet(sujet) {
  return sujet.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Renvoie la liste des problèmes d'un défi, sans tenir compte des autres.
function erreursDefi(defi) {
  const erreurs = [];
  const champsEnTrop = Object.keys(defi).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof defi.id !== 'string' || !/^de-[a-z0-9]+(-[a-z0-9]+)*$/.test(defi.id)) {
    erreurs.push('id doit être au format de-… (minuscules, chiffres, tirets)');
  }

  const { sujet, miseDepart } = defi;
  if (typeof sujet !== 'string' || sujet.trim() === '') erreurs.push('sujet vide ou absent');
  else if (sujet !== sujet.trim()) erreurs.push('sujet avec des espaces au bord');
  else if (ARTICLE_EN_TETE.test(sujet)) erreurs.push('le sujet ne doit pas commencer par un article');

  if (!Number.isInteger(miseDepart) || miseDepart < MISE_MIN || miseDepart > MISE_MAX) {
    erreurs.push(`miseDepart doit être un entier de ${MISE_MIN} à ${MISE_MAX}`);
  }
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierDefiEncheres(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de défis'];

  const erreurs = [];
  const idsVus = new Set();
  const sujetsVus = new Set();
  liste.forEach((defi, index) => {
    const nom = `défi ${index + 1} (${defi?.id ?? 'sans id'})`;
    if (typeof defi !== 'object' || defi === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursDefi(defi)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(defi.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(defi.id);

    if (typeof defi.sujet === 'string') {
      const cle = cleSujet(defi.sujet);
      if (sujetsVus.has(cle)) erreurs.push(`${nom} : sujet en double`);
      sujetsVus.add(cle);
    }
  });
  if (liste.length < DEFIS_MIN) erreurs.push(`au moins ${DEFIS_MIN} défis attendus (${liste.length})`);
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-defi-encheres.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/defi-encheres.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de defi-encheres.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierDefiEncheres(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} défis OK`);
}
