// Mode Blind test (docs/modes/blind-test.md). Chaque manche a son maître du jeu, qui voit
// la réponse et désigne qui a trouvé. Deux formats choisis par l'hôte :
// - classique : une chanson par manche (une « question » est une chanson du catalogue) ;
// - mix : 5 chansons jouées ensemble (une « question » est une liste de 5 chansons).
import { banqueBlindTest } from '../extraits.js';
import {
  classement as classementCommun, echeanceDePhase, listerAttendus, maintenant, melanger, noterQuestionsVues,
  participe, passerAuPodium, phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe,
  tempsRestantMs, tirerQuestions,
} from './commun.js';

export const id = 'blind-test';
export const nom = 'Blind test';
export const regleCourte = 'Chacun son tour maître du jeu : trouvez le titre et l\'artiste !';
export const joueursMin = 3;
// Reprise après une pause de l'hôte : toutes les heures de etatMode avancent d'autant.
export { decalerHeures } from './commun.js';

export const DUREE_ECOUTE_MS = 30000;
export const DUREE_DESIGNATION_MS = 15000;
export const POINTS_TITRE = 500;
export const POINTS_ARTISTE = 500;

export const CHANSONS_PAR_MIX = 5;
export const DUREE_ECOUTE_MIX_MS = 120000;
export const DUREE_DESIGNATION_MIX_MS = 20000;
// Ce qu'a trouvé le gagnant d'une chanson du mix.
export const POINTS_MIX = { titre: 500, artiste: 500, 'les-deux': 1000 };
// Mix (tranche 42) : pendant le relais, la TV charge les 5 extraits, puis les démarre ensemble.
// Le maître lance quand tout est chargé, ou au bout de 10 s (TV absente ou trop lente).
export const DELAI_CHARGEMENT_MIX_MS = 10000;
// Un extrait qui ne se charge pas est remplacé par une autre chanson, 2 fois au plus par place.
export const REMPLACEMENTS_MAX = 2;

// Position de départ dans l'extrait de 30 s, tirée pour chaque chanson.
const DEPART_MAX_S = 10;

const FORMATS = { classique: 'Classique', mix: 'Mix' };

// ---------- Réglages de l'hôte ----------
// Classique : le nombre de chansons (curseur). Mix : combien de fois chacun est maître,
// et la durée d'écoute de chaque mix (en s). Les deux : les catégories (tranche 42).

export const CHANSONS_MIN = 1;
export const CHANSONS_MAX = 20;
export const TOURS_MIX = [1, 2];
export const ECOUTES_MIX = [90, DUREE_ECOUTE_MIX_MS / 1000, 180];

// Toutes les catégories sont choisies par défaut.
export function reglagesParDefaut() {
  return {
    format: 'classique', chansons: 10, tours: 1, ecoute: DUREE_ECOUTE_MIX_MS / 1000, categories: categoriesDe(banqueBlindTest()),
  };
}

export function validerReglages(donnees) {
  const {
    format, chansons, tours, ecoute, categories,
  } = donnees ?? {};
  if (typeof format !== 'string' || !Object.hasOwn(FORMATS, format)) return null;
  if (!Number.isInteger(chansons) || chansons < CHANSONS_MIN || chansons > CHANSONS_MAX) return null;
  if (!TOURS_MIX.includes(tours) || !ECOUTES_MIX.includes(ecoute)) return null;
  if (!categoriesValides(categories, categoriesDe(banqueBlindTest()))) return null;
  return {
    format, chansons, tours, ecoute, categories,
  };
}

// ---------- Catégories (tranche 42) ----------

// Les catégories des chansons, dans l'ordre où elles apparaissent au catalogue.
export function categoriesDe(banque) {
  return [...new Set(banque.flatMap((chanson) => chanson.categories))];
}

// Au moins une, toutes connues, sans doublon. Un catalogue sans catégorie n'en propose aucune.
export function categoriesValides(categories, connues) {
  if (!Array.isArray(categories) || new Set(categories).size !== categories.length) return false;
  if (connues.length && !categories.length) return false;
  return categories.every((categorie) => connues.includes(categorie));
}

// Les chansons du choix de l'hôte. Toutes les catégories : tout le catalogue, chansons
// pas encore rangées comprises.
export function chansonsDuChoix(banque, categories) {
  if (categoriesDe(banque).every((categorie) => categories.includes(categorie))) return banque;
  return banque.filter((chanson) => chanson.categories.some((categorie) => categories.includes(categorie)));
}

// Comme au quiz : les chansons jamais entendues du choix, puis ses déjà entendues (les plus
// anciennes d'abord), puis, s'il n'y en a pas assez, les autres catégories, dans le même ordre.
export function tirerChansons(banque, categories, questionsVues, nombre) {
  const choisies = chansonsDuChoix(banque, categories);
  const autres = banque.filter((chanson) => !choisies.includes(chanson));
  const tirees = tirerQuestions(choisies, questionsVues, nombre);
  return [...tirees, ...tirerQuestions(autres, questionsVues, nombre - tirees.length)];
}

function reglagesDe(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

const pluriel = (nombre, mot) => `${nombre} ${mot}${nombre > 1 ? 's' : ''}`;

// « Classique · 10 chansons », « Mix · 1 tour · 120 s · Années 80, Rap français ».
function resumerReglages({
  format, chansons, tours, ecoute, categories,
}, connues) {
  const choix = format === 'classique'
    ? `Classique · ${pluriel(chansons, 'chanson')}`
    : `Mix · ${pluriel(tours, 'tour')} · ${ecoute} s`;
  return categories.length < connues.length ? `${choix} · ${resumerCategories(categories)}` : choix;
}

// « Années 80, Rap français », ou « Années 80 et 3 autres » au-delà de 2.
function resumerCategories(categories) {
  if (categories.length <= 2) return categories.join(', ');
  return `${categories[0]} et ${categories.length - 1} autres`;
}

export function vueReglages(salle) {
  const reglages = reglagesDe(salle);
  const banque = banqueBlindTest();
  const connues = categoriesDe(banque);
  const choisies = chansonsDuChoix(banque, reglages.categories);
  return {
    ...reglages,
    valeurs: reglages,
    titre: 'Format',
    resume: resumerReglages(reglages, connues),
    nombreChansons: choisies.length,
    inedites: choisies.filter((chanson) => !salle.questionsVues.includes(chanson.id)).length,
    options: {
      formats: Object.entries(FORMATS).map(([idFormat, libelle]) => ({ id: idFormat, libelle })),
      chansons: { min: CHANSONS_MIN, max: CHANSONS_MAX },
      tours: TOURS_MIX,
      ecoutes: ECOUTES_MIX,
      categories: connues.map((categorie) => ({ id: categorie, libelle: categorie })),
    },
  };
}

// ---------- Ordre des maîtres ----------

// Les joueurs, du plus haut au plus bas du classement global (au hasard entre ex æquo).
function parClassementGlobal(salle, joueurIds) {
  const points = (joueurId) => salle.joueurs.find((joueur) => joueur.id === joueurId).pointsGlobaux;
  return melanger(joueurIds).sort((a, b) => points(b) - points(a));
}

// Un maître par manche. joueurs : du plus haut au plus bas du classement global.
// Chacun son tour, dans un ordre tiré au sort à chaque tour ; quand le nombre ne tombe pas
// juste, les manches en plus vont aux premiers du classement (les derniers jouent plus pour
// remonter). Elles passent en premier, et personne n'est maître deux fois d'affilée.
export function repartirMaitres(joueurs, nombre) {
  const tours = [melanger(joueurs.slice(0, nombre % joueurs.length))];
  for (let tour = 0; tour < Math.floor(nombre / joueurs.length); tour++) tours.push(melanger(joueurs));
  const maitres = [];
  for (const tour of tours) {
    if (tour.length > 1 && tour[0] === maitres.at(-1)) [tour[0], tour[1]] = [tour[1], tour[0]];
    maitres.push(...tour);
  }
  return maitres;
}

// ---------- Règles pures ----------

// designation : { titre, artiste }, chacun l'id du joueur qui a trouvé, ou null.
export function pointsClassique(designation, joueurId) {
  if (!designation) return 0;
  return (designation.titre === joueurId ? POINTS_TITRE : 0)
    + (designation.artiste === joueurId ? POINTS_ARTISTE : 0);
}

// trouvees : { index de la chanson dans le mix: { joueur, trouve } }.
export function pointsDuMix(trouvees, joueurId) {
  return Object.values(trouvees)
    .filter((trouvee) => trouvee.joueur === joueurId)
    .reduce((total, trouvee) => total + POINTS_MIX[trouvee.trouve], 0);
}

function tirerDepart() {
  return Math.floor(Math.random() * (DEPART_MAX_S + 1));
}

// ---------- Maîtres et désignables ----------

function maitreCourant(salle) {
  return salle.etatMode.maitres[salle.etatMode.indexQuestion];
}

function estConnecte(salle, joueurId) {
  return salle.joueurs.some((joueur) => joueur.id === joueurId && joueur.connecte);
}

// Seuls les joueurs attendus de la manche, sauf le maître, peuvent être désignés.
function peutEtreDesigne(salle, joueurId) {
  return participe(salle, joueurId) && joueurId !== maitreCourant(salle);
}

export function designationValide(salle, contenu) {
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (!Object.hasOwn(contenu, 'titre') || !Object.hasOwn(contenu, 'artiste')) return false;
  return [contenu.titre, contenu.artiste].every((joueurId) => joueurId === null || peutEtreDesigne(salle, joueurId));
}

// ---------- Déroulé commun ----------

// Classique : le nombre de chansons choisi par l'hôte. Mix : chacun des joueurs connectés
// au lancement est maître une ou deux fois.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const {
    format, chansons: nombreChansons, tours, ecoute, categories,
  } = reglagesDe(salle);
  const joueurs = parClassementGlobal(salle, listerAttendus(salle));
  const maitres = repartirMaitres(joueurs, format === 'mix' ? tours * joueurs.length : nombreChansons);
  const parManche = format === 'mix' ? CHANSONS_PAR_MIX : 1;
  const chansons = tirerChansons(banqueBlindTest(), categories, salle.questionsVues, maitres.length * parManche);
  noterQuestionsVues(salle, chansons);
  const questions = format === 'mix'
    ? maitres.map((_, manche) => chansons.slice(manche * parManche, (manche + 1) * parManche))
    : chansons;
  salle.etatMode = { format, questions, maitres, dureeEcouteMixMs: ecoute * 1000, enEchec: [] };
  preparerRelais(salle, 0);
}

// La première manche, à partir de index, dont le maître est connecté ; null s'il n'y en a plus.
function mancheJouable(salle, index) {
  const { maitres } = salle.etatMode;
  let suivante = index;
  while (suivante < maitres.length && !estConnecte(salle, maitres[suivante])) suivante++;
  return suivante < maitres.length ? suivante : null;
}

// Avant chaque manche, sans chrono : le maître la lance lui-même depuis son téléphone, ce qui
// lui annonce son rôle avant la musique. Une manche dont le maître est déconnecté est sautée ;
// plus aucune : podium.
function preparerRelais(salle, index) {
  const manche = mancheJouable(salle, index);
  if (manche === null) {
    passerAuPodium(salle);
    return;
  }
  Object.assign(salle.etatMode, {
    phase: 'relais',
    indexQuestion: manche,
    debutPhaseA: Date.now(),
    attendus: listerAttendus(salle),
  });
  // Les départs sont tirés dès le relais : la TV place chaque piste avant de la lancer.
  if (salle.etatMode.format === 'mix') {
    Object.assign(salle.etatMode, {
      departs: Array.from({ length: CHANSONS_PAR_MIX }, tirerDepart),
      chargement: {
        prets: [], remplacements: Array(CHANSONS_PAR_MIX).fill(0), indisponibles: [], delaiEcoule: false,
      },
    });
  }
}

// ---------- Chargement des extraits du mix (relais) ----------

// Chaque place du mix est chargée sur la TV, ou indisponible.
function chargementFini(salle) {
  const { prets, indisponibles } = salle.etatMode.chargement;
  return questionCourante(salle).every((chanson, index) => prets.includes(chanson.id) || indisponibles.includes(index));
}

// En classique, rien à attendre : la TV lit une seule piste.
function peutLancer(salle) {
  if (salle.etatMode.format !== 'mix') return true;
  return chargementFini(salle) || salle.etatMode.chargement.delaiEcoule;
}

// La TV dit, pendant le relais du mix, quels extraits sont chargés et lesquels ont échoué :
// { numero, prets: [id], echecs: [id] }. Un extrait en échec est remplacé par une autre
// chanson, sinon sa place devient indisponible. Renvoie true si quelque chose a changé.
export function recevoirExtraits(salle, donnees) {
  const { numero, prets, echecs } = donnees ?? {};
  if (phaseEnCours(salle) !== 'relais' || salle.etatMode.format !== 'mix') return false;
  if (numero !== salle.etatMode.indexQuestion + 1 || !Array.isArray(prets) || !Array.isArray(echecs)) return false;
  const { chargement } = salle.etatMode;
  const mix = questionCourante(salle);
  const avant = JSON.stringify([mix.map((chanson) => chanson.id), chargement]);
  mix.forEach((chanson, index) => {
    if (echecs.includes(chanson.id) && !chargement.indisponibles.includes(index)) remplacerExtrait(salle, index);
  });
  chargement.prets = mix.map((chanson) => chanson.id).filter((idChanson) => prets.includes(idChanson));
  return JSON.stringify([mix.map((chanson) => chanson.id), chargement]) !== avant;
}

function remplacerExtrait(salle, index) {
  const { chargement, enEchec } = salle.etatMode;
  const mix = questionCourante(salle);
  enEchec.push(mix[index].id);
  const remplacante = chargement.remplacements[index] < REMPLACEMENTS_MAX ? chansonDeRemplacement(salle) : null;
  if (!remplacante) {
    chargement.indisponibles.push(index);
    return;
  }
  chargement.remplacements[index]++;
  mix[index] = remplacante;
  noterQuestionsVues(salle, [remplacante]);
}

// Une chanson absente de la partie et jamais en échec : du choix de l'hôte et jamais
// entendue d'abord, comme au tirage.
function chansonDeRemplacement(salle) {
  const { questions, enEchec } = salle.etatMode;
  const ecartees = new Set([...questions.flat().map((chanson) => chanson.id), ...enEchec]);
  const possibles = banqueBlindTest().filter((chanson) => !ecartees.has(chanson.id));
  return tirerChansons(possibles, reglagesDe(salle).categories, salle.questionsVues, 1)[0] ?? null;
}

// « Lancer la chanson » du maître : la musique démarre.
function lancerManche(salle) {
  Object.assign(salle.etatMode, {
    phase: 'ecoute',
    debutPhaseA: Date.now(),
    attendus: listerAttendus(salle),
  });
  if (salle.etatMode.format === 'mix') {
    Object.assign(salle.etatMode, {
      ecouteRestanteMs: salle.etatMode.dureeEcouteMixMs,
      trouvees: {},
      chansonEnDesignation: null,
    });
  } else {
    Object.assign(salle.etatMode, { depart: tirerDepart(), designation: null });
  }
}

// Seul le maître répond. Relais : { lancer: true }, en mix une fois les extraits chargés. Révélation : { passer: true }, qui passe
// la modération au maître suivant (l'hôte le peut aussi, avec « Suivant »). Écoute et
// désignation : ses désignations. Renvoie true si c'est accepté.
export function enregistrerReponse(salle, joueurId, contenu) {
  const phase = phaseEnCours(salle);
  if (!phase || joueurId !== maitreCourant(salle)) return false;
  if (phase === 'relais') {
    if (contenu?.lancer !== true || !peutLancer(salle)) return false;
    lancerManche(salle);
    return true;
  }
  if (phase === 'revelation') {
    if (contenu?.passer !== true) return false;
    passerALaSuite(salle);
    return true;
  }
  return salle.etatMode.format === 'mix'
    ? enregistrerReponseMix(salle, phase, contenu)
    : enregistrerReponseClassique(salle, contenu);
}

// Relais : le maître attendu s'est déconnecté, le relais passe au suivant.
// Classique : la validation termine la manche. Mix : les 5 chansons trouvées (ou indisponibles) aussi.
export function verifierFinAnticipee(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'relais' && !estConnecte(salle, maitreCourant(salle))) {
    preparerRelais(salle, salle.etatMode.indexQuestion);
    return;
  }
  const { format, designation, trouvees } = salle.etatMode;
  if (format === 'classique' && (phase === 'ecoute' || phase === 'designation') && designation) {
    montrerRevelation(salle);
  }
  if (format === 'mix' && phase === 'ecoute'
    && Object.keys(trouvees).length + indisponibles(salle).length === CHANSONS_PAR_MIX) {
    montrerRevelation(salle);
  }
}

// Classique : points ajoutés à la révélation. Mix : ajoutés dès la désignation de chaque chanson.
function pointsGagnes(salle, joueurId) {
  const { format, phase, designation, trouvees } = salle.etatMode;
  if (format === 'mix') return pointsDuMix(trouvees, joueurId);
  return phase === 'revelation' ? pointsClassique(designation, joueurId) : 0;
}

function montrerRevelation(salle) {
  salle.etatMode.phase = 'revelation';
  salle.etatMode.debutPhaseA = Date.now();
  if (salle.etatMode.format === 'classique') {
    for (const joueur of salle.joueurs) joueur.score += pointsGagnes(salle, joueur.id);
  }
}

function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, preparerRelais);
}

// « Suivant » de l'hôte pendant la révélation : la modération passe au maître suivant.
// Renvoie true si quelque chose a changé.
export function suivant(salle) {
  if (phaseEnCours(salle) !== 'revelation') return false;
  passerALaSuite(salle);
  return true;
}

// Ni le relais ni la révélation n'ont de chrono : ils attendent un appui.
const DUREES_CLASSIQUE = { ecoute: DUREE_ECOUTE_MS, designation: DUREE_DESIGNATION_MS };
const DUREES_MIX = { designation: DUREE_DESIGNATION_MIX_MS };

// En mix, l'écoute dure ce qui reste du décompte, mis en pause pendant les désignations,
// et le relais attend le chargement des extraits 10 s au plus.
export function echeance(salle) {
  if (salle.etatMode.format === 'mix' && phaseEnCours(salle) === 'ecoute') {
    return salle.etatMode.debutPhaseA + salle.etatMode.ecouteRestanteMs;
  }
  if (phaseEnCours(salle) === 'relais' && !peutLancer(salle)) {
    return salle.etatMode.debutPhaseA + DELAI_CHARGEMENT_MIX_MS;
  }
  return echeanceDePhase(salle, salle.etatMode.format === 'mix' ? DUREES_MIX : DUREES_CLASSIQUE);
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'relais') salle.etatMode.chargement.delaiEcoule = true;
  else if (salle.etatMode.format === 'mix') avancerMix(salle, phase);
  else avancerClassique(salle, phase);
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Classique ----------

function enregistrerReponseClassique(salle, contenu) {
  if (salle.etatMode.designation || !designationValide(salle, contenu)) return false;
  salle.etatMode.designation = { titre: contenu.titre, artiste: contenu.artiste };
  return true;
}

// Sans validation, la chanson ne rapporte rien.
function avancerClassique(salle, phase) {
  if (phase === 'ecoute') {
    salle.etatMode.phase = 'designation';
    salle.etatMode.debutPhaseA = Date.now();
  } else if (phase === 'designation') montrerRevelation(salle);
}

// ---------- Mix ----------

// En écoute : { arreter: index } d'une chanson pas encore trouvée.
// En désignation : { joueur, trouve } pour la chanson arrêtée, ou { annuler: true }.
function enregistrerReponseMix(salle, phase, contenu) {
  if (typeof contenu !== 'object' || contenu === null) return false;
  if (phase === 'ecoute') return arreterMix(salle, contenu.arreter);
  if (contenu.annuler === true) {
    reprendreEcoute(salle);
    return true;
  }
  return designerMix(salle, contenu.joueur, contenu.trouve);
}

// Le décompte d'écoute est figé pendant la désignation.
function arreterMix(salle, index) {
  const { etatMode } = salle;
  if (!Number.isInteger(index) || index < 0 || index >= CHANSONS_PAR_MIX || etatMode.trouvees[index]) return false;
  if (indisponibles(salle).includes(index)) return false;
  etatMode.ecouteRestanteMs = ecouteRestante(salle);
  etatMode.phase = 'designation';
  etatMode.debutPhaseA = Date.now();
  etatMode.chansonEnDesignation = index;
  return true;
}

function designerMix(salle, joueurId, trouve) {
  if (!peutEtreDesigne(salle, joueurId) || typeof trouve !== 'string' || !Object.hasOwn(POINTS_MIX, trouve)) {
    return false;
  }
  const { etatMode } = salle;
  etatMode.trouvees[etatMode.chansonEnDesignation] = { joueur: joueurId, trouve };
  salle.joueurs.find((joueur) => joueur.id === joueurId).score += POINTS_MIX[trouve];
  reprendreEcoute(salle);
  return true;
}

function reprendreEcoute(salle) {
  salle.etatMode.phase = 'ecoute';
  salle.etatMode.debutPhaseA = Date.now();
  salle.etatMode.chansonEnDesignation = null;
}

// Désignation sans réponse : annulée. Décompte d'écoute écoulé : révélation.
function avancerMix(salle, phase) {
  if (phase === 'designation') reprendreEcoute(salle);
  else if (phase === 'ecoute') {
    salle.etatMode.ecouteRestanteMs = 0;
    montrerRevelation(salle);
  }
}

// Les places du mix dont aucun extrait n'a pu se charger : elles ne jouent pas.
function indisponibles(salle) {
  return salle.etatMode.chargement?.indisponibles ?? [];
}

// Ce qui reste du décompte d'écoute, figé hors de l'écoute.
function ecouteRestante(salle) {
  const { phase, ecouteRestanteMs, debutPhaseA } = salle.etatMode;
  if (phase !== 'ecoute') return ecouteRestanteMs;
  return Math.max(0, ecouteRestanteMs - (maintenant(salle) - debutPhaseA));
}

// ---------- Vues ----------
// Construites champ par champ. Le titre et l'artiste ne partent que vers le téléphone du maître
// avant la révélation (ou, en mix, avant que la chanson soit trouvée) ; l'id Deezer ne part
// que vers la TV, qui joue les extraits.

function vueCommune(salle) {
  const {
    format, phase, indexQuestion, maitres,
  } = salle.etatMode;
  return {
    format,
    phase,
    numero: indexQuestion + 1,
    total: maitres.length,
    maitre: maitreCourant(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

function vueChanson(chanson) {
  return { titre: chanson.titre, artiste: chanson.artiste, pochette: chanson.pochette };
}

function pseudoDe(salle, joueurId) {
  return salle.joueurs.find((joueur) => joueur.id === joueurId)?.pseudo ?? null;
}

// Les boutons du maître : les joueurs attendus encore connectés, sauf lui.
function designables(salle) {
  return salle.joueurs
    .filter((joueur) => joueur.connecte && peutEtreDesigne(salle, joueur.id))
    .map(({ id: idJoueur, pseudo, couleur }) => ({ id: idJoueur, pseudo, couleur }));
}

// Le maître de la prochaine manche jouable, à la révélation ; null si c'est la dernière.
function prochainMaitre(salle) {
  const manche = mancheJouable(salle, salle.etatMode.indexQuestion + 1);
  return manche === null ? null : salle.etatMode.maitres[manche];
}

export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'relais') return vueTvRelais(salle);
  if (phase) return salle.etatMode.format === 'mix' ? vueTvMix(salle) : vueTvClassique(salle);
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

// Le prochain maître, et les extraits de sa manche, que la TV charge sans les jouer.
// Mix : chaque extrait avec son départ, null pour une place indisponible, et l'avancement.
function vueTvRelais(salle) {
  if (salle.etatMode.format !== 'mix') {
    return { ...vueCommune(salle), extraitsSuivants: [{ id: questionCourante(salle).id }] };
  }
  const { departs, chargement } = salle.etatMode;
  return {
    ...vueCommune(salle),
    extraits: questionCourante(salle).map((chanson, index) => (chargement.indisponibles.includes(index)
      ? null
      : { id: chanson.id, depart: departs[index], gain: chanson.gain })),
    chargement: vueChargement(salle),
  };
}

// « 3/5 » : les places chargées ou indisponibles, et si le maître peut lancer.
function vueChargement(salle) {
  const { prets, indisponibles: horsJeu } = salle.etatMode.chargement;
  return { faits: prets.length + horsJeu.length, total: CHANSONS_PAR_MIX, peutLancer: peutLancer(salle) };
}

export function vueJoueur(salle, joueur) {
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  const estMaitre = joueur.id === maitreCourant(salle);
  const { format, phase, indexQuestion, maitres } = salle.etatMode;
  const base = { format, numero: indexQuestion + 1, total: maitres.length };
  if (phase === 'relais' && estMaitre) {
    return { ...base, ecran: 'relais', chargement: format === 'mix' ? vueChargement(salle) : null };
  }
  if (phase !== 'revelation' && !estMaitre) {
    return { ...base, ecran: 'ecouter', phase, maitre: pseudoDe(salle, maitreCourant(salle)) };
  }
  const vue = format === 'mix'
    ? vueJoueurMix(salle, joueur, estMaitre)
    : vueJoueurClassique(salle, joueur, estMaitre);
  if (phase === 'revelation') vue.prochainMaitre = pseudoDe(salle, prochainMaitre(salle));
  return { ...base, ...vue };
}

// ---------- Vues du classique ----------

function vueTvClassique(salle) {
  const { phase, depart, debutPhaseA } = salle.etatMode;
  const vue = vueCommune(salle);
  if (phase === 'ecoute') {
    const { id: idChanson, gain } = questionCourante(salle);
    return {
      ...vue, extrait: { id: idChanson, depart, gain }, tempsEcouleMs: maintenant(salle) - debutPhaseA,
    };
  }
  if (phase === 'designation') return vue;
  const { designation, questions, indexQuestion } = salle.etatMode;
  const revelation = {
    ...vue,
    chanson: vueChanson(questionCourante(salle)),
    titre: designation?.titre ?? null,
    artiste: designation?.artiste ?? null,
    classement: classement(salle),
  };
  const suivante = questions[indexQuestion + 1];
  if (suivante) revelation.extraitSuivant = { id: suivante.id };
  return revelation;
}

function vueJoueurClassique(salle, joueur, estMaitre) {
  const { phase, designation } = salle.etatMode;
  const chanson = vueChanson(questionCourante(salle));
  if (phase === 'revelation') {
    return {
      ecran: 'resultat',
      estMaitre,
      chanson,
      trouveTitre: pseudoDe(salle, designation?.titre ?? null),
      trouveArtiste: pseudoDe(salle, designation?.artiste ?? null),
      aTrouveTitre: designation?.titre === joueur.id,
      aTrouveArtiste: designation?.artiste === joueur.id,
      points: pointsGagnes(salle, joueur.id),
      rang: rangDe(salle, joueur),
    };
  }
  return {
    ecran: 'maitre_classique',
    phase,
    chanson,
    designables: designables(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

// ---------- Vues du mix ----------

// Une chanson pas encore trouvée ne donne que son extrait, jusqu'à la révélation.
// Une place indisponible ne joue rien et ne dit rien de sa chanson.
function vueCarte(salle, chanson, index) {
  const { phase, trouvees, departs } = salle.etatMode;
  const trouvee = trouvees[index];
  if (indisponibles(salle).includes(index)) return { indisponible: true };
  if (trouvee) {
    return {
      ...vueChanson(chanson), joueur: trouvee.joueur, trouve: trouvee.trouve, points: POINTS_MIX[trouvee.trouve],
    };
  }
  if (phase === 'revelation') return { ...vueChanson(chanson), joueur: null, trouve: null, points: 0 };
  return { extrait: { id: chanson.id, depart: departs[index], gain: chanson.gain } };
}

function vueTvMix(salle) {
  const { phase, chansonEnDesignation } = salle.etatMode;
  const vue = {
    ...vueCommune(salle),
    cartes: questionCourante(salle).map((chanson, index) => vueCarte(salle, chanson, index)),
    dureeEcouteMs: salle.etatMode.dureeEcouteMixMs,
    ecouteRestanteMs: ecouteRestante(salle),
    tempsEcouteMs: salle.etatMode.dureeEcouteMixMs - ecouteRestante(salle),
  };
  if (phase === 'designation') vue.chansonEnDesignation = chansonEnDesignation;
  // Les extraits du mix suivant se chargent au relais, pas avant : jamais plus de 5 pistes à la fois.
  if (phase === 'revelation') vue.classement = classement(salle);
  return vue;
}

function vueJoueurMix(salle, joueur, estMaitre) {
  const { phase, trouvees, chansonEnDesignation } = salle.etatMode;
  const chansons = questionCourante(salle);
  if (phase === 'revelation') {
    return {
      ecran: 'resultat',
      estMaitre,
      chansons: chansons.map((chanson, index) => ({
        ...vueChanson(chanson),
        trouvePar: pseudoDe(salle, trouvees[index]?.joueur ?? null),
        trouve: trouvees[index]?.trouve ?? null,
      })),
      points: pointsGagnes(salle, joueur.id),
      rang: rangDe(salle, joueur),
    };
  }
  if (phase === 'designation') {
    return {
      ecran: 'maitre_designation',
      chanson: vueChanson(chansons[chansonEnDesignation]),
      designables: designables(salle),
      tempsRestantMs: tempsRestantMs(salle, echeance),
    };
  }
  return {
    ecran: 'maitre_mix',
    chansons: chansons.map((chanson, index) => ({
      titre: chanson.titre,
      artiste: chanson.artiste,
      trouvee: Boolean(trouvees[index]),
      indisponible: indisponibles(salle).includes(index),
      joueur: pseudoDe(salle, trouvees[index]?.joueur ?? null),
    })),
  };
}
