import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHAMPS = ['id', 'nom', 'fichier', 'garder'];
// Au-delà, la vidéo alourdit le dépôt et le chargement sur le stick (docs/modes/legende.md).
export const TAILLE_MAX_OCTETS = 1000000;
export const GIF_PAR_PARTIE = 8;

// Le fichier se déduit de l'id : « g222516354 » → « gifs/222516354.mp4 », chemin relatif à public/.
export function fichierAttendu(id) {
  return `gifs/${id.slice(1)}.mp4`;
}

function enMo(octets) {
  return `${(octets / 1e6).toFixed(1).replace('.', ',')} Mo`;
}

// tailles : Map fichier → octets des vidéos présentes dans public/gifs/.
function erreursGif(gif, tailles) {
  const enTrop = Object.keys(gif).filter((champ) => !CHAMPS.includes(champ));
  const erreurs = enTrop.length ? [`champ(s) en trop : ${enTrop.join(', ')}`] : [];
  if (typeof gif.id !== 'string' || !/^g\d+$/.test(gif.id)) return [...erreurs, 'id doit être au format g + chiffres'];
  if (typeof gif.nom !== 'string' || gif.nom.trim() === '') erreurs.push('nom vide ou absent');
  else if (gif.nom !== gif.nom.trim()) erreurs.push('nom avec des espaces au début ou à la fin');
  if (typeof gif.garder !== 'boolean') erreurs.push('garder doit valoir true ou false');
  if (gif.fichier !== fichierAttendu(gif.id)) erreurs.push(`fichier doit valoir « ${fichierAttendu(gif.id)} »`);
  else if (gif.garder === true) {
    if (!tailles.has(gif.fichier)) erreurs.push(`vidéo absente : public/${gif.fichier}`);
    else if (tailles.get(gif.fichier) > TAILLE_MAX_OCTETS) {
      erreurs.push(`vidéo trop lourde (${enMo(tailles.get(gif.fichier))} > ${enMo(TAILLE_MAX_OCTETS)})`);
    }
  }
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du catalogue (vide si tout va bien).
export function verifierLegende(liste, tailles) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de GIF'];

  const erreurs = [];
  const idsVus = new Set();
  const fichiersGardes = new Set();
  liste.forEach((gif, index) => {
    const nom = `GIF ${index + 1} (${gif?.id ?? 'sans id'})`;
    if (typeof gif !== 'object' || gif === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursGif(gif, tailles)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(gif.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(gif.id);
    // Une seule erreur par problème : un GIF mal écrit reste compté, avec le fichier que son id impose.
    if (gif.garder !== false && typeof gif.id === 'string') fichiersGardes.add(fichierAttendu(gif.id));
  });

  // Une vidéo qu'aucun GIF gardé n'utilise serait commitée pour rien.
  for (const fichier of tailles.keys()) {
    if (!fichiersGardes.has(fichier)) erreurs.push(`public/${fichier} : aucun GIF gardé ne l'utilise, à supprimer`);
  }
  if (fichiersGardes.size < GIF_PAR_PARTIE) {
    erreurs.push(`${fichiersGardes.size} GIF gardés, il en faut au moins ${GIF_PAR_PARTIE} pour une partie`);
  }
  return erreurs;
}

// Les vidéos présentes sur le disque, avec leur poids.
export function lireTailles(dossierPublic) {
  const tailles = new Map();
  for (const nom of readdirSync(new URL('gifs/', dossierPublic))) {
    tailles.set(`gifs/${nom}`, statSync(new URL(`gifs/${nom}`, dossierPublic)).size);
  }
  return tailles;
}

// Lancé en ligne de commande : node scripts/verifier-legende.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/legende.json', import.meta.url));
  let liste;
  let tailles;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
    tailles = lireTailles(new URL('../public/', import.meta.url));
  } catch (e) {
    console.error(`Lecture impossible du catalogue ou de public/gifs/ : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierLegende(liste, tailles);
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const gardes = liste.filter((gif) => gif.garder);
  const poids = gardes.reduce((total, gif) => total + tailles.get(gif.fichier), 0);
  console.log(`${gardes.length} GIF gardés, ${liste.length - gardes.length} exclus, ${enMo(poids)} OK`);
}
