import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ecrirePlaylists, lirePlaylistDeezer, lirePlaylists, rattacherPlaylists,
} from './categoriser-blind-test.js';
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

// « 1234567890=Années 80 » → { idPlaylist, categorie } ; « 1234567890 » seul : categorie null
// (celle déjà notée pour cette playlist, sinon son titre Deezer). null si l'id n'en est pas un.
export function lireArgument(argument) {
  const [idPlaylist, ...reste] = argument.split('=');
  const categorie = reste.join('=').trim() || null;
  if (!/^\d+$/.test(idPlaylist.trim()) || (reste.length && !categorie)) return null;
  return { idPlaylist: idPlaylist.trim(), categorie };
}

// Lancé en ligne de commande : node scripts/importer-deezer.js "<id de playlist>[=<catégorie>]" […]
// Les chansons de la playlist y sont rattachées (tranche 42), celles déjà au catalogue aussi,
// et la playlist est notée avec sa catégorie dans data/playlists-blind-test.json.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const playlists = process.argv.slice(2).map(lireArgument);
  if (!playlists.length || playlists.includes(null)) {
    console.error('Usage : node scripts/importer-deezer.js "<id de playlist>[=<catégorie>]" […]');
    console.error('Exemple : node scripts/importer-deezer.js "1234567890=Années 80"');
    process.exit(1);
  }
  const chemin = fileURLToPath(new URL('../data/blind-test.json', import.meta.url));
  let catalogue = existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : [];
  const toutesAjoutees = [];

  const notees = lirePlaylists();
  for (const { idPlaylist, categorie } of playlists) {
    const { nom, pistes } = await lirePlaylistDeezer(idPlaylist);
    const resultat = ajouterChansons(catalogue, await nouvellesPistes(catalogue, pistes.map((piste) => piste.id)));
    const rattachement = rattacherPlaylists(resultat.catalogue, [{ id: Number(idPlaylist), pistes }]);
    catalogue = rattachement.catalogue;
    notees[idPlaylist] = { nom, categorie: categorie ?? notees[idPlaylist]?.categorie ?? nom };
    toutesAjoutees.push(...resultat.ajoutees);
    const ecartees = Object.entries(resultat.ecartees).map(([raison, n]) => `${n} ${raison}`).join(', ');
    console.log(`Playlist ${idPlaylist} « ${nom} » (catégorie ${notees[idPlaylist].categorie}) : ${resultat.ajoutees.length} ajoutée(s), ${rattachement.rattachees} rattachée(s)${ecartees ? `, écartées : ${ecartees}` : ''}`);
  }

  writeFileSync(chemin, JSON.stringify(catalogue, null, 2) + '\n');
  ecrirePlaylists(notees);
  const relire = toutesAjoutees.filter(aRelire);
  if (relire.length) {
    console.log(`\nTitres à relire (${relire.length}) :`);
    for (const chanson of relire) console.log(`  ${chanson.id} : ${chanson.artiste} — ${chanson.titre}`);
  }
  console.log(`\n${catalogue.length} chansons au catalogue. Relire, puis : node scripts/verifier-blind-test.js`);
}
