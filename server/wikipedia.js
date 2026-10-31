// Wikipédia en français pour la Wiki course (docs/modes/wiki-course.md, « Wikipédia »).
// Le serveur ne lit que de petites réponses : le résumé de la cible et la vérification
// des clics. Les articles eux-mêmes sont chargés par les téléphones.

import { journaliserErreur } from './journal.js';

const RACINE = 'https://fr.wikipedia.org';
const DELAI_MS = 5000;
// Les règles de Wikimedia demandent un User-Agent qui nomme l'outil.
const ENTETES = { 'User-Agent': 'QuizTV/1.0 (jeu de soirée, https://github.com/pdroquemaurel-stack)' };
export const LIENS_MIN_DEPART = 20;
const TITRE_MAX = 255;

let chercher = fetch;

// Pour les tests : un faux Wikipédia à la place de fetch. Renvoie de quoi remettre le vrai.
export function remplacerChercher(faux) {
  chercher = faux;
  cacheLiens.clear();
  cacheTitres.clear();
  return () => { chercher = fetch; };
}

// « Tour_Eiffel » → « Tour Eiffel ». null si ce n'est pas un titre possible.
export function nettoyerTitre(titre) {
  if (typeof titre !== 'string') return null;
  const propre = titre.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return propre && propre.length <= TITRE_MAX ? propre : null;
}

async function lireJson(adresse) {
  const reponse = await chercher(adresse, { headers: ENTETES, signal: AbortSignal.timeout(DELAI_MS) });
  if (!reponse.ok) throw new Error(`Wikipédia a répondu ${reponse.status}`);
  return reponse.json();
}

function interroger(parametres) {
  const requete = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...parametres });
  return lireJson(`${RACINE}/w/api.php?${requete}`);
}

function adresseRest(chemin, titre) {
  return `${RACINE}/api/rest_v1/page/${chemin}/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
}

// Résumé de la cible pour l'annonce : { titre, extrait, image }, ou null si Wikipédia ne répond pas.
export async function resumer(titre) {
  try {
    const resume = await lireJson(adresseRest('summary', titre));
    return { titre, extrait: resume.extract ?? '', image: resume.thumbnail?.source ?? null };
  } catch (e) {
    journaliserErreur(`wikipédia résumé ${titre}`, e.message);
    return null;
  }
}

// « depuis|titre » → vrai si l'article depuis a un lien vers titre. Gardé pendant la vie du serveur.
const cacheLiens = new Map();
// titre cliqué → titre réel après redirection, ou null si la page n'existe pas.
const cacheTitres = new Map();

async function aUnLien(depuis, titre) {
  const cle = `${depuis}|${titre}`;
  if (!cacheLiens.has(cle)) {
    const { query } = await interroger({
      titles: depuis, prop: 'links', plnamespace: '0', pltitles: titre, pllimit: 'max',
    });
    cacheLiens.set(cle, (query.pages[0]?.links ?? []).length > 0);
  }
  return cacheLiens.get(cle);
}

async function titreReel(titre) {
  if (!cacheTitres.has(titre)) {
    const { query } = await interroger({ titles: titre, redirects: '1' });
    const page = query.pages[0];
    cacheTitres.set(titre, page && !page.missing && page.ns === 0 ? page.title : null);
  }
  return cacheTitres.get(titre);
}

// Un clic de depuis vers titre : { ok: true, titre } avec le titre après redirection,
// ou { ok: false, raison: 'absent' | 'indisponible' }.
export async function verifierLien(depuis, titre) {
  try {
    if (!await aUnLien(depuis, titre)) return { ok: false, raison: 'absent' };
    const reel = await titreReel(titre);
    return reel ? { ok: true, titre: reel } : { ok: false, raison: 'absent' };
  } catch (e) {
    journaliserErreur(`wikipédia lien ${depuis} → ${titre}`, e.message);
    return { ok: false, raison: 'indisponible' };
  }
}

// Un article au hasard pour le départ, ni homonymie ni trop pauvre en liens. null si
// Wikipédia ne répond pas ou si l'article tiré ne convient pas.
export async function articleAuHasard() {
  try {
    const resume = await lireJson(`${RACINE}/api/rest_v1/page/random/summary`);
    if (resume.type !== 'standard' || !resume.titles?.normalized) return null;
    const titre = resume.titles.normalized;
    const { query } = await interroger({
      titles: titre, prop: 'links', plnamespace: '0', pllimit: String(LIENS_MIN_DEPART),
    });
    return (query.pages[0]?.links ?? []).length >= LIENS_MIN_DEPART ? titre : null;
  } catch (e) {
    journaliserErreur('wikipédia article au hasard', e.message);
    return null;
  }
}
