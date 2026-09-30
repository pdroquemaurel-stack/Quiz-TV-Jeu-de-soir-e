// Fonctions pures de l'outil de préparation du Nuancier (scripts/prep-nuancier.html),
// testées par prep-nuancier-outils.test.js. Script classique et non module : la page
// est ouverte depuis le disque, où le navigateur refuse les modules.

// « #0058A3 » → { t: 0-359, s: 0-100, l: 0-100 } (TSL, en anglais HSL), arrondis.
function versTsl(hex) {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, v, b);
  const min = Math.min(r, v, b);
  const l = (max + min) / 2;
  const d = max - min;
  let t = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) t = ((v - b) / d) % 6;
    else if (max === v) t = (b - r) / d + 2;
    else t = (r - v) / d + 4;
    t = (t * 60 + 360) % 360;
  }
  return { t: Math.round(t) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Vivacité en % : écart entre le canal le plus fort et le plus faible. Contrairement à la
// saturation TSL, elle reste faible près du noir et du blanc (#181713 : 2 %, saturation 12 %).
function vivacite(hex) {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.round(((Math.max(...canaux) - Math.min(...canaux)) / 255) * 100);
}

// Deux couleurs impossibles à distinguer à l'œil (#0058AB et #0058A3 dans le logo IKEA) :
// aucun canal ne diffère de plus de 12 sur 255.
function procheDe(hex1, hex2) {
  return [1, 3, 5].every((i) => Math.abs(parseInt(hex1.slice(i, i + 2), 16) - parseInt(hex2.slice(i, i + 2), 16)) <= 12);
}

// Une cible jouable : assez de teinte pour que le curseur serve, luminosité atteignable.
function couleurJouable(hex) {
  const { s, l } = versTsl(hex);
  return s >= 10 && vivacite(hex) >= 15 && l >= 5 && l <= 95;
}

// « Crédit Agricole » → « credit-agricole ».
function enSlug(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- Wikimedia Commons ----------

// Le nom du fichier SVG d'une adresse Commons, ou null :
// « https://commons.wikimedia.org/wiki/File:Logo_Lacoste_2026.svg » → « Logo_Lacoste_2026.svg ».
// Accepte aussi « Fichier: », « ?title=File:… » et les adresses directes de upload.wikimedia.org.
function nomDeFichierCommons(url) {
  let adresse;
  try {
    adresse = new URL(url.trim());
  } catch {
    return null;
  }
  let nom = null;
  if (adresse.hostname === 'upload.wikimedia.org') {
    nom = adresse.pathname.split('/').find((morceau) => /\.svg$/i.test(morceau)) ?? null;
  } else if (/(^|\.)(wikimedia|wikipedia)\.org$/.test(adresse.hostname)) {
    nom = adresse.searchParams.get('title') ?? adresse.pathname.replace(/^\/wiki\//, '');
  }
  if (!nom) return null;
  try {
    nom = decodeURIComponent(nom);
  } catch {
    return null;
  }
  nom = nom.replace(/^(File|Fichier|Image):/i, '').replace(/ /g, '_');
  return /\.svg$/i.test(nom) ? nom : null;
}

// La page Commons du fichier, gardée dans le champ « source » du catalogue.
function urlSourceCommons(nomFichier) {
  return `https://commons.wikimedia.org/wiki/File:${nomFichier}`;
}

// L'API de Commons donne l'adresse du fichier original. origin=* : appel permis depuis une page.
function urlApiCommons(nomFichier) {
  const titre = encodeURIComponent(`File:${nomFichier}`);
  return `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&titles=${titre}`;
}

// « Logo_Lacoste_2026.svg » → « Lacoste », « IKEA_logo.svg » → « IKEA ».
function marqueDepuisFichier(nomFichier) {
  return nomFichier
    .replace(/\.svg$/i, '')
    .replace(/_/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(logo|logotype|wordmark|svg)\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '');
}

// ---------- Couleur et question ----------

// Nom de la couleur en français (« bleu »), ou null pour une couleur presque sans teinte.
function nomDeCouleur(hex) {
  const { t, s, l } = versTsl(hex);
  if (s < 10 || vivacite(hex) < 8) return null;
  if (t >= 15 && t < 40 && l < 30) return 'marron';
  if (t < 15 || t >= 340) return 'rouge';
  if (t < 40) return 'orange';
  if (t < 70) return 'jaune';
  if (t < 165) return 'vert';
  if (t < 190) return 'turquoise';
  if (t < 255) return 'bleu';
  if (t < 290) return 'violet';
  return 'rose';
}

const VOYELLE_EN_TETE = /^[aeiouyàâäéèêëîïôöûüœ]/i;

// « Quel est le vert de Lacoste ? », « Quel est l'orange d'Orange ? ».
function questionPour(marque, hex) {
  const de = VOYELLE_EN_TETE.test(marque) ? "d'" : 'de ';
  const couleur = nomDeCouleur(hex);
  if (!couleur) return `Quelle est la couleur ${de}${marque} ?`;
  const le = VOYELLE_EN_TETE.test(couleur) ? "l'" : 'le ';
  return `Quel est ${le}${couleur} ${de}${marque} ?`;
}

// La couleur à deviner la plus probable : la plus étendue des couleurs jouables.
// groupes : [{ hex, aire }]. null si aucune ne convient.
function couleurProbable(groupes) {
  const jouables = groupes.filter((groupe) => couleurJouable(groupe.hex));
  if (!jouables.length) return null;
  return jouables.reduce((meilleur, groupe) => (groupe.aire > meilleur.aire ? groupe : meilleur)).hex;
}

// ---------- Catalogue ----------

// Ajoute les nouvelles entrées à la fin du catalogue, sauf celles dont l'id ou le fichier
// y est déjà. Renvoie { catalogue, ajoutees, ignorees: [{ entree, raison }] }.
function ajouterAuCatalogue(catalogue, nouvelles) {
  const resultat = { catalogue: [...catalogue], ajoutees: [], ignorees: [] };
  for (const entree of nouvelles) {
    let raison = null;
    if (resultat.catalogue.some((autre) => autre.id === entree.id)) raison = 'id déjà dans le catalogue';
    else if (resultat.catalogue.some((autre) => autre.fichier === entree.fichier)) raison = 'fichier déjà utilisé';
    if (raison) {
      resultat.ignorees.push({ entree, raison });
    } else {
      resultat.catalogue.push(entree);
      resultat.ajoutees.push(entree);
    }
  }
  return resultat;
}

// Le texte de data/nuancier.json : une entrée par ligne.
function texteDuCatalogue(catalogue) {
  return `[\n${catalogue.map((entree) => `  ${JSON.stringify(entree)}`).join(',\n')}\n]\n`;
}
