import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleReponse } from '../server/modes/commun.js';

const CHAMPS = ['id', 'mot'];
export const LONGUEUR_MAX = 30;
// 10 joueurs × 3 mots, deux parties de suite sans répétition.
export const MOTS_MIN = 60;

// Renvoie la liste des problèmes d'un mot, sans tenir compte des autres.
function erreursMot(entree) {
  const erreurs = [];
  const champsEnTrop = Object.keys(entree).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof entree.id !== 'string' || !/^ch-[a-z0-9]+(-[a-z0-9]+)*$/.test(entree.id)) {
    erreurs.push('id doit être au format ch-… (minuscules, chiffres, tirets)');
  }
  const { mot } = entree;
  if (typeof mot !== 'string' || mot.trim() === '') erreurs.push('mot vide ou absent');
  else if (mot !== mot.trim()) erreurs.push('mot avec des espaces au bord');
  else if (mot.length > LONGUEUR_MAX) erreurs.push(`mot de plus de ${LONGUEUR_MAX} caractères`);
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierChapeau(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de mots'];

  const erreurs = [];
  const idsVus = new Set();
  const clesVues = new Set();
  liste.forEach((entree, index) => {
    const nom = `mot ${index + 1} (${entree?.id ?? 'sans id'})`;
    if (typeof entree !== 'object' || entree === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursMot(entree)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(entree.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(entree.id);

    if (typeof entree.mot === 'string') {
      const cle = cleReponse(entree.mot);
      if (clesVues.has(cle)) erreurs.push(`${nom} : mot en double`);
      clesVues.add(cle);
    }
  });
  if (liste.length < MOTS_MIN) erreurs.push(`au moins ${MOTS_MIN} mots attendus (${liste.length})`);
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-chapeau.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/chapeau.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de chapeau.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierChapeau(liste);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  console.log(`${liste.length} mots OK`);
}
