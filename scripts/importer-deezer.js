import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleChanson } from './verifier-blind-test.js';

// Deezer accepte 50 requêtes par 5 s : on reste loin en dessous.
const PAUSE_DEEZER_MS = 150;
// Titres souvent à nettoyer à la main : version, featuring, remaster (docs/modes/blind-test.md, « Contenu »).
const A_RELIRE = /\(|\[| - |feat|remaster/i;

// La raison pour laquelle une piste Deezer ne peut pas entrer au catalogue, ou null.
function raisonEcart(piste) {
  if (!piste.readable) return 'illisible';
  if (!piste.preview) return 'sans extrait';
  if (typeof piste.gain !== 'number') return 'sans gain';
  return null;
}

function chansonDe(piste) {
  return {
    id: `d${piste.id}`,
    deezer: piste.id,
    titre: piste.title_short.trim(),
    artiste: piste.artist.name.trim(),
    pochette: piste.album.cover_medium,
    gain: piste.gain,
    garder: true,
  };
}

// Ajoute les pistes nouvelles à la fin du catalogue, sans jamais toucher aux entrées existantes.
// ecartees : { raison: nombre }.
export function ajouterChansons(catalogue, pistes) {
  const ids = new Set(catalogue.map((chanson) => chanson.id));
  const cles = new Set(catalogue.map(cleChanson));
  const ajoutees = [];
  const ecartees = {};
  for (const piste of pistes) {
    if (ids.has(`d${piste.id}`)) continue;
    const raison = raisonEcart(piste);
    if (raison) {
      ecartees[raison] = (ecartees[raison] ?? 0) + 1;
      continue;
    }
    // La même chanson sous un autre id Deezer (album, compilation) : une seule suffit.
    const chanson = chansonDe(piste);
    if (cles.has(cleChanson(chanson))) {
      ecartees.doublon = (ecartees.doublon ?? 0) + 1;
      continue;
    }
    ids.add(chanson.id);
    cles.add(cleChanson(chanson));
    ajoutees.push(chanson);
  }
  return { catalogue: [...catalogue, ...ajoutees], ajoutees, ecartees };
}

export function aRelire(chanson) {
  return A_RELIRE.test(chanson.titre);
}

async function lireDeezer(adresse) {
  const reponse = await (await fetch(adresse)).json();
  if (reponse.error) throw new Error(`${adresse} : ${reponse.error.message}`);
  return reponse;
}

// Les ids des pistes d'une playlist publique, page après page.
async function idsDePlaylist(idPlaylist) {
  const ids = [];
  let adresse = `https://api.deezer.com/playlist/${idPlaylist}/tracks?limit=100`;
  while (adresse) {
    const page = await lireDeezer(adresse);
    ids.push(...page.data.map((piste) => piste.id));
    adresse = page.next;
  }
  return ids;
}

// Le détail complet de chaque piste absente du catalogue : seul /track donne le gain.
async function nouvellesPistes(catalogue, ids) {
  const connus = new Set(catalogue.map((chanson) => chanson.id));
  const pistes = [];
  for (const id of ids.filter((id) => !connus.has(`d${id}`))) {
    // Une piste retirée de Deezer entre-temps est simplement écartée.
    pistes.push(await lireDeezer(`https://api.deezer.com/track/${id}`).catch(() => ({ id, readable: false })));
    await new Promise((resolve) => setTimeout(resolve, PAUSE_DEEZER_MS));
  }
  return pistes;
}

// Lancé en ligne de commande : node scripts/importer-deezer.js <id de playlist> [<id>…]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const playlists = process.argv.slice(2);
  if (!playlists.length) {
    console.error('Usage : node scripts/importer-deezer.js <id de playlist> [<id>…]');
    process.exit(1);
  }
  const chemin = fileURLToPath(new URL('../data/blind-test.json', import.meta.url));
  let catalogue = existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : [];
  const toutesAjoutees = [];

  for (const idPlaylist of playlists) {
    const resultat = ajouterChansons(catalogue, await nouvellesPistes(catalogue, await idsDePlaylist(idPlaylist)));
    catalogue = resultat.catalogue;
    toutesAjoutees.push(...resultat.ajoutees);
    const ecartees = Object.entries(resultat.ecartees).map(([raison, n]) => `${n} ${raison}`).join(', ');
    console.log(`Playlist ${idPlaylist} : ${resultat.ajoutees.length} ajoutée(s)${ecartees ? `, écartées : ${ecartees}` : ''}`);
  }

  writeFileSync(chemin, JSON.stringify(catalogue, null, 2) + '\n');
  const relire = toutesAjoutees.filter(aRelire);
  if (relire.length) {
    console.log(`\nTitres à relire (${relire.length}) :`);
    for (const chanson of relire) console.log(`  ${chanson.id} : ${chanson.artiste} — ${chanson.titre}`);
  }
  console.log(`\n${catalogue.length} chansons au catalogue. Relire, puis : node scripts/verifier-blind-test.js`);
}
