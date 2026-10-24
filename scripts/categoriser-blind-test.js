import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleChanson } from './verifier-blind-test.js';

// Range les chansons du Blind test par playlist (docs/modes/blind-test.md, « Catégories ») :
// chaque chanson reçoit les ids des playlists Deezer d'où elle vient. Les catégories se
// décident par playlist, dans data/playlists-blind-test.json { "id": { nom, categorie } } ;
// importer-deezer.js le complète à chaque import.

export const CHEMIN_PLAYLISTS = fileURLToPath(new URL('../data/playlists-blind-test.json', import.meta.url));

// Deezer accepte 50 requêtes par 5 s : on reste loin en dessous.
const PAUSE_DEEZER_MS = 150;

export function lirePlaylists() {
  return existsSync(CHEMIN_PLAYLISTS) ? JSON.parse(readFileSync(CHEMIN_PLAYLISTS, 'utf8')) : {};
}

export function ecrirePlaylists(playlists) {
  writeFileSync(CHEMIN_PLAYLISTS, JSON.stringify(playlists, null, 2) + '\n');
}

// Une piste Deezer est une chanson du catalogue si elle a son id, ou le même titre et le
// même artiste (la même chanson sous un autre id : album, compilation).
function correspond(chanson, piste) {
  if (chanson.deezer === piste.id) return true;
  return cleChanson(chanson) === cleChanson({ titre: piste.title_short.trim(), artiste: piste.artist.name.trim() });
}

// Ajoute à chaque chanson l'id des playlists où elle se trouve, sans rien changer d'autre :
// une chanson retrouvée nulle part reste le même objet, un id déjà présent n'est pas répété.
// playlists : [{ id, pistes }], pistes de l'API Deezer.
// Renvoie { catalogue, rattachees } (rattachees : le nombre d'ids ajoutés).
export function rattacherPlaylists(catalogue, playlists) {
  let rattachees = 0;
  const nouveau = catalogue.map((chanson) => {
    const ajouts = playlists
      .filter(({ id, pistes }) => !chanson.playlists?.includes(id) && pistes.some((piste) => correspond(chanson, piste)))
      .map(({ id }) => id);
    const uniques = [...new Set(ajouts)];
    if (!uniques.length) return chanson;
    rattachees += uniques.length;
    return { ...chanson, playlists: [...(chanson.playlists ?? []), ...uniques] };
  });
  return { catalogue: nouveau, rattachees };
}

async function lireDeezer(adresse) {
  const reponse = await (await fetch(adresse)).json();
  if (reponse.error) throw new Error(`${adresse} : ${reponse.error.message}`);
  return reponse;
}

// Le titre d'une playlist publique et toutes ses pistes, page après page.
export async function lirePlaylistDeezer(idPlaylist) {
  const { title } = await lireDeezer(`https://api.deezer.com/playlist/${idPlaylist}`);
  const pistes = [];
  let adresse = `https://api.deezer.com/playlist/${idPlaylist}/tracks?limit=100`;
  while (adresse) {
    await new Promise((resolve) => setTimeout(resolve, PAUSE_DEEZER_MS));
    const page = await lireDeezer(adresse);
    pistes.push(...page.data);
    adresse = page.next;
  }
  return { nom: title.trim(), pistes };
}

// Lancé en ligne de commande : node scripts/categoriser-blind-test.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const playlists = lirePlaylists();
  if (!Object.keys(playlists).length) {
    console.error('data/playlists-blind-test.json est vide : ajoute-y « "id": { "nom": …, "categorie": … } ».');
    process.exit(1);
  }
  const chemin = fileURLToPath(new URL('../data/blind-test.json', import.meta.url));
  const catalogue = JSON.parse(readFileSync(chemin, 'utf8'));

  const lues = [];
  for (const [id, { categorie }] of Object.entries(playlists)) {
    const { nom, pistes } = await lirePlaylistDeezer(id);
    console.log(`Playlist ${id} « ${nom} » (catégorie ${categorie}) : ${pistes.length} pistes`);
    lues.push({ id: Number(id), pistes });
  }

  const resultat = rattacherPlaylists(catalogue, lues);
  writeFileSync(chemin, JSON.stringify(resultat.catalogue, null, 2) + '\n');
  console.log(`\n${resultat.rattachees} rattachement(s) ajouté(s).`);
  const orphelines = resultat.catalogue.filter((chanson) => chanson.garder && !chanson.playlists);
  if (orphelines.length) {
    console.log(`\nChansons gardées retrouvées dans aucune playlist (${orphelines.length}), à ranger à la main (« playlists »: [id]) :`);
    for (const chanson of orphelines) console.log(`  ${chanson.id} : ${chanson.artiste} — ${chanson.titre}`);
  }
  console.log('\nRelire, puis : node scripts/verifier-blind-test.js');
}
