import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHAMPS = ['id', 'depart', 'cible', 'niveau'];
const NIVEAUX = [1, 2];
// Une partie de 5 courses, la plus longue, sur un seul niveau, avec de la marge.
export const COUPLES_MIN_PAR_NIVEAU = 10;
// Un départ doit laisser le choix : au moins 20 liens vers d'autres articles.
export const LIENS_MIN_DEPART = 20;

const API = 'https://fr.wikipedia.org/w/api.php';
const ENTETES = { 'User-Agent': 'QuizTV/1.0 (jeu de soirée, https://github.com/pdroquemaurel-stack)' };

function titreValide(titre) {
  return typeof titre === 'string' && titre.trim() !== '' && titre === titre.trim();
}

// Renvoie la liste des problèmes d'un couple, sans tenir compte des autres.
function erreursCouple(couple) {
  const erreurs = [];
  const champsEnTrop = Object.keys(couple).filter((champ) => !CHAMPS.includes(champ));
  if (champsEnTrop.length) erreurs.push(`champ(s) en trop : ${champsEnTrop.join(', ')}`);

  if (typeof couple.id !== 'string' || !/^wc-[a-z0-9]+(-[a-z0-9]+)*$/.test(couple.id)) {
    erreurs.push('id doit être au format wc-… (minuscules, chiffres, tirets)');
  }
  for (const champ of ['depart', 'cible']) {
    if (!titreValide(couple[champ])) erreurs.push(`${champ} vide, absent ou avec des espaces au bord`);
  }
  if (titreValide(couple.depart) && couple.depart === couple.cible) erreurs.push('départ et cible identiques');
  if (!NIVEAUX.includes(couple.niveau)) erreurs.push('niveau doit valoir 1 ou 2');
  return erreurs;
}

// Renvoie la liste de toutes les erreurs du fichier (vide si tout va bien).
export function verifierWikiCourse(liste) {
  if (!Array.isArray(liste)) return ['le fichier doit contenir une liste de couples'];

  const erreurs = [];
  const idsVus = new Set();
  const couplesVus = new Set();
  liste.forEach((couple, index) => {
    const nom = `couple ${index + 1} (${couple?.id ?? 'sans id'})`;
    if (typeof couple !== 'object' || couple === null) {
      erreurs.push(`${nom} : ce n'est pas un objet`);
      return;
    }
    for (const erreur of erreursCouple(couple)) erreurs.push(`${nom} : ${erreur}`);

    if (idsVus.has(couple.id)) erreurs.push(`${nom} : id en double`);
    idsVus.add(couple.id);

    const cle = `${couple.depart} → ${couple.cible}`;
    if (couplesVus.has(cle)) erreurs.push(`${nom} : couple en double`);
    couplesVus.add(cle);
  });
  for (const niveau of NIVEAUX) {
    const nombre = liste.filter((couple) => couple?.niveau === niveau).length;
    if (nombre < COUPLES_MIN_PAR_NIVEAU) erreurs.push(`au moins ${COUPLES_MIN_PAR_NIVEAU} couples de niveau ${niveau} attendus (${nombre})`);
  }
  return erreurs;
}

async function interroger(parametres, chercher) {
  const adresse = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...parametres })}`;
  const reponse = await chercher(adresse, { headers: ENTETES });
  return reponse.json();
}

// En ligne : chaque titre existe, n'est ni une redirection ni une homonymie, et chaque
// départ a assez de liens. Renvoie la liste des erreurs.
export async function verifierEnLigne(liste, chercher = fetch) {
  const erreurs = [];
  const titres = [...new Set(liste.flatMap((couple) => [couple.depart, couple.cible]))];
  for (let debut = 0; debut < titres.length; debut += 50) {
    const lot = titres.slice(debut, debut + 50);
    const { query } = await interroger({
      titles: lot.join('|'), redirects: '1', prop: 'pageprops', ppprop: 'disambiguation',
    }, chercher);
    for (const { from, to } of query.normalized ?? []) erreurs.push(`« ${from} » s'écrit « ${to} »`);
    for (const { from, to } of query.redirects ?? []) erreurs.push(`« ${from} » redirige vers « ${to} »`);
    for (const page of query.pages) {
      if (page.missing) erreurs.push(`« ${page.title} » n'existe pas`);
      else if (page.pageprops) erreurs.push(`« ${page.title} » est une page d'homonymie`);
    }
  }
  for (const depart of new Set(liste.map((couple) => couple.depart))) {
    const { query } = await interroger({
      titles: depart, prop: 'links', plnamespace: '0', pllimit: String(LIENS_MIN_DEPART),
    }, chercher);
    const liens = query.pages[0]?.links ?? [];
    if (liens.length < LIENS_MIN_DEPART) erreurs.push(`le départ « ${depart} » a moins de ${LIENS_MIN_DEPART} liens`);
  }
  return erreurs;
}

// Lancé en ligne de commande : node scripts/verifier-wiki-course.js [--wikipedia]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = fileURLToPath(new URL('../data/wiki-course.json', import.meta.url));
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`Lecture impossible de wiki-course.json : ${e.message}`);
    process.exit(1);
  }

  const erreurs = verifierWikiCourse(liste);
  if (erreurs.length === 0 && process.argv.includes('--wikipedia')) erreurs.push(...await verifierEnLigne(liste));
  if (erreurs.length) {
    for (const erreur of erreurs) console.error(erreur);
    console.error(`\n${erreurs.length} erreur(s).`);
    process.exit(1);
  }
  const parNiveau = NIVEAUX.map((niveau) => `${liste.filter((couple) => couple.niveau === niveau).length} de niveau ${niveau}`);
  console.log(`${liste.length} couples OK (${parNiveau.join(', ')})`);
}
