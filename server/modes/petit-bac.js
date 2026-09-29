// Mode Petit bac (docs/modes/petit-bac.md) : une lettre, 6 catégories, un mot par catégorie.
// Le premier qui a tout rempli appuie sur STOP, puis l'hôte valide les réponses après débat.
import {
  classement as classementCommun, creerOptions, listerAttendus, melanger, normaliser, participe,
  phaseEnCours, questionCourante, questionSuivanteOuPodium, rangDe, tempsRestantMs, tousOntRepondu, vueOptions,
} from './commun.js';

export const id = 'petit-bac';
export const nom = 'Petit bac';
export const regleCourte = 'Une lettre, 6 catégories : un mot pour chacune. Le premier qui a tout rempli appuie sur STOP. 1 point par réponse acceptée.';
export const joueursMin = 2;

export const DUREE_ECRITURE_MS = 90000;
export const DUREE_APRES_STOP_MS = 10000;
export const DUREE_BILAN_MS = 15000;
export const CATEGORIES = [
  'Prénom', 'Pays', 'Ville', 'Animal', 'Fruit ou légume', 'Métier', 'Objet', 'Marque', 'Sport',
  'Célébrité réelle', 'Film ou série', 'Partie du corps', 'Personnage de fiction',
];
export const NB_CATEGORIES = 6;
export const LONGUEUR_MAX = 30;
export const LETTRES_RARES = ['K', 'Q', 'W', 'X', 'Y', 'Z'];
const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

// ---------- Règles pures ----------

// Article en tête, toléré pour la lettre : « Le Havre » commence par H. L'apostrophe
// peut être la typographique (’), que les téléphones mettent souvent d'eux-mêmes.
const ARTICLE_EN_TETE = /^(?:(?:le|la|les|un|une|des|du) |[ld]['’] ?)/;

// Vrai si le texte commence par la lettre, accents ignorés, ou juste après un article.
export function commenceParLettre(texte, lettre) {
  const forme = normaliser(texte).replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  const initiale = lettre.toLowerCase();
  return forme.startsWith(initiale) || forme.replace(ARTICLE_EN_TETE, '').startsWith(initiale);
}

// Les 6 cases telles que le téléphone les envoie, nettoyées (espaces retirés et réduits),
// ou null si ce ne sont pas 6 textes de 30 caractères au plus.
export function nettoyerTextes(textes) {
  if (!Array.isArray(textes) || textes.length !== NB_CATEGORIES) return null;
  if (!textes.every((texte) => typeof texte === 'string' && texte.length <= LONGUEUR_MAX)) return null;
  return textes.map((texte) => texte.trim().replace(/\s+/g, ' '));
}

// Les lettres permises, dans le désordre : une par manche, jamais deux fois la même.
function tirerLettres(nombre, lettresRares) {
  const permises = lettresRares ? ALPHABET : ALPHABET.filter((lettre) => !LETTRES_RARES.includes(lettre));
  return melanger(permises).slice(0, nombre);
}

// 6 catégories distinctes, dans l'ordre de la liste pour que les cases gardent le même ordre.
function tirerCategories() {
  const tirees = melanger(CATEGORIES).slice(0, NB_CATEGORIES);
  return CATEGORIES.filter((categorie) => tirees.includes(categorie));
}

// [{ lettre, categories }], une par manche.
export function tirerManches(nombre, lettresRares) {
  return tirerLettres(nombre, lettresRares).map((lettre) => ({ lettre, categories: tirerCategories() }));
}

// Les cases acceptées d'office : remplies et commençant par la lettre.
export function accepteesDOffice(textes, lettre) {
  return textes.map((texte) => texte !== '' && commenceParLettre(texte, lettre));
}

// { joueurId: [6 booléens] } → { joueurId: points }. 1 point par réponse acceptée,
// que d'autres aient donné la même ou non.
export function calculerPoints(acceptees) {
  return Object.fromEntries(Object.entries(acceptees).map(([joueurId, liste]) => [joueurId, liste.filter(Boolean).length]));
}

// ---------- Options de l'hôte : nombre de manches, temps pour écrire (en s), lettres rares ----------

const CHOIX = { longueurs: [3, 5, 7], unite: ['manche', 'manches'], temps: [60, DUREE_ECRITURE_MS / 1000, 120] };
const options = creerOptions(id, CHOIX);

export function reglagesParDefaut() {
  return { ...options.reglagesParDefaut(), lettresRares: false };
}

export function validerReglages(donnees) {
  const communes = options.validerReglages(donnees);
  if (!communes || typeof donnees.lettresRares !== 'boolean') return null;
  return { ...communes, lettresRares: donnees.lettresRares };
}

function lireReglages(salle) {
  return salle.reglagesMode?.[id] ?? reglagesParDefaut();
}

export function vueReglages(salle) {
  const reglages = lireReglages(salle);
  const vue = vueOptions(CHOIX, reglages);
  const rares = `${reglages.lettresRares ? 'avec' : 'sans'} ${LETTRES_RARES.join(' ')}`;
  return { titre: 'Options', ...vue, resume: `${vue.resume} · ${rares}` };
}

// ---------- Déroulé d'une partie ----------

// Une « question » est ici une manche : { lettre, categories }, toutes tirées au lancement.
export function demarrerPartie(salle) {
  for (const joueur of salle.joueurs) joueur.score = 0;
  const { longueur, lettresRares } = lireReglages(salle);
  salle.etatMode = { questions: tirerManches(longueur, lettresRares) };
  demarrerManche(salle, 0);
}

function demarrerManche(salle, index) {
  Object.assign(salle.etatMode, {
    phase: 'ecriture',
    indexQuestion: index,
    debutPhaseA: Date.now(),
    attendus: listerAttendus(salle),
    textes: {},
    stop: null,
    reponses: {},
    indexCategorie: 0,
    acceptees: {},
  });
}

// donnees : { action: 'ecrire' | 'stop', textes } pendant l'écriture ; de l'hôte, pendant la
// validation : { action: 'categorie', index } ou { action: 'basculer', categorie, joueurId }.
// Renvoie true s'il y a quelque chose à diffuser.
export function enregistrerReponse(salle, joueurId, donnees) {
  const phase = phaseEnCours(salle);
  if (phase === 'ecriture') return ecrire(salle, joueurId, donnees);
  if (phase === 'validation' && joueurId === salle.hoteId) return gesteDeLHote(salle, donnees);
  return false;
}

// Chaque changement arrive sans diffusion ; STOP (ou « J'ai fini » après un STOP) est diffusé.
function ecrire(salle, joueurId, donnees) {
  const { textes, reponses } = salle.etatMode;
  if (!participe(salle, joueurId) || reponses[joueurId]) return false;
  const cases = nettoyerTextes(donnees?.textes);
  if (!cases) return false;
  if (donnees.action === 'ecrire') {
    textes[joueurId] = cases;
    return false;
  }
  if (donnees.action !== 'stop') return false;
  if (!salle.etatMode.stop) {
    const { lettre } = questionCourante(salle);
    if (!cases.every((texte) => commenceParLettre(texte, lettre))) return false;
    salle.etatMode.stop = { id: joueurId, a: Date.now() };
  }
  textes[joueurId] = cases;
  reponses[joueurId] = { recuA: Date.now() };
  return true;
}

function gesteDeLHote(salle, donnees) {
  const { indexCategorie, acceptees } = salle.etatMode;
  if (donnees?.action === 'categorie') {
    const { index } = donnees;
    if (!Number.isInteger(index) || index < 0 || index >= NB_CATEGORIES || index === indexCategorie) return false;
    salle.etatMode.indexCategorie = index;
    return true;
  }
  if (donnees?.action === 'basculer') {
    const { categorie, joueurId } = donnees;
    const texte = salle.etatMode.textes[joueurId]?.[indexCategorie];
    if (categorie !== indexCategorie || !Object.hasOwn(acceptees, joueurId) || !texte) return false;
    acceptees[joueurId][indexCategorie] = !acceptees[joueurId][indexCategorie];
    return true;
  }
  return false;
}

// Appelée après chaque STOP et chaque déconnexion.
export function verifierFinAnticipee(salle) {
  if (phaseEnCours(salle) === 'ecriture' && tousOntRepondu(salle)) finirEcriture(salle);
}

// Les cases sont prises telles quelles. Si personne n'a rien écrit, pas de validation.
export function finirEcriture(salle) {
  const { lettre } = questionCourante(salle);
  const acceptees = {};
  for (const [joueurId, cases] of Object.entries(salle.etatMode.textes)) {
    if (cases.some((texte) => texte !== '')) acceptees[joueurId] = accepteesDOffice(cases, lettre);
  }
  Object.assign(salle.etatMode, { phase: 'validation', debutPhaseA: Date.now(), indexCategorie: 0, acceptees });
  if (Object.keys(acceptees).length === 0) commencerBilan(salle);
}

function commencerBilan(salle) {
  salle.etatMode.phase = 'bilan';
  salle.etatMode.debutPhaseA = Date.now();
  for (const [joueurId, points] of Object.entries(calculerPoints(salle.etatMode.acceptees))) {
    const joueur = salle.joueurs.find((j) => j.id === joueurId);
    if (joueur) joueur.score += points;
  }
}

export function passerALaSuite(salle) {
  questionSuivanteOuPodium(salle, demarrerManche);
}

// « Voir les scores » sur la dernière catégorie, puis « Suivant » pendant le bilan.
export function suivant(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'validation' && salle.etatMode.indexCategorie === NB_CATEGORIES - 1) commencerBilan(salle);
  else if (phase === 'bilan') passerALaSuite(salle);
  else return false;
  return true;
}

// Écriture : le chrono de l'hôte, raccourci à 10 s après le STOP (jamais prolongé).
// Validation : pas de chrono, l'hôte avance à son rythme.
export function echeance(salle) {
  const phase = phaseEnCours(salle);
  const { debutPhaseA, stop } = salle.etatMode ?? {};
  if (phase === 'ecriture') {
    const finDuChrono = debutPhaseA + lireReglages(salle).temps * 1000;
    return stop ? Math.min(finDuChrono, stop.a + DUREE_APRES_STOP_MS) : finDuChrono;
  }
  if (phase === 'bilan') return debutPhaseA + DUREE_BILAN_MS;
  return null;
}

// Appelée quand l'échéance est atteinte.
export function avancer(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'ecriture') finirEcriture(salle);
  else if (phase === 'bilan') passerALaSuite(salle);
}

// Les points n'existent qu'à partir du bilan.
function pointsGagnes(salle, joueurId) {
  if (salle.etatMode.phase !== 'bilan') return 0;
  return calculerPoints(salle.etatMode.acceptees)[joueurId] ?? 0;
}

export function classement(salle) {
  return classementCommun(salle, pointsGagnes);
}

// ---------- Vues ----------

// Ce que reçoit la TV : jamais les cases d'un joueur pendant l'écriture.
export function vueTv(salle) {
  const phase = phaseEnCours(salle);
  if (phase === 'ecriture') return { ...vueManche(salle), ...vueEcriture(salle) };
  if (phase === 'validation') return { ...vueManche(salle), ...vueValidation(salle) };
  if (phase === 'bilan') return { ...vueManche(salle), ...vueValidation(salle), ...vueBilan(salle) };
  if (salle.etat === 'podium') return { classement: classement(salle) };
  return {};
}

function vueManche(salle) {
  return { phase: salle.etatMode.phase, ...manche(salle) };
}

// Ce que la TV et les téléphones montrent de la manche en cours.
function manche(salle) {
  const { questions, indexQuestion } = salle.etatMode;
  const { lettre, categories } = questionCourante(salle);
  return { numero: indexQuestion + 1, total: questions.length, lettre, categories };
}

function vueEcriture(salle) {
  const { reponses, stop } = salle.etatMode;
  return { ontRepondu: Object.keys(reponses), stop: stop?.id ?? null, tempsRestantMs: tempsRestantMs(salle, echeance) };
}

// horsLettre : les cases refusées d'office, pour afficher « pas un M ».
function vueValidation(salle) {
  const { attendus, textes, acceptees, indexCategorie } = salle.etatMode;
  const { lettre } = questionCourante(salle);
  return {
    indexCategorie,
    lignes: Object.entries(acceptees).map(([joueurId, liste]) => ({
      id: joueurId,
      textes: textes[joueurId],
      acceptees: liste,
      horsLettre: textes[joueurId].map((texte) => texte !== '' && !commenceParLettre(texte, lettre)),
    })),
    sansReponse: attendus.filter((joueurId) => !acceptees[joueurId]),
  };
}

function vueBilan(salle) {
  const points = calculerPoints(salle.etatMode.acceptees);
  return {
    points: salle.etatMode.attendus
      .map((joueurId) => ({ id: joueurId, points: points[joueurId] ?? 0 }))
      .sort((x, y) => y.points - x.points),
    classement: classement(salle),
    tempsRestantMs: tempsRestantMs(salle, echeance),
  };
}

// Écran du téléphone : ses propres cases seulement ; l'hôte voit toutes les réponses
// pendant la validation, même s'il est arrivé en cours de manche (il doit pouvoir valider).
export function vueJoueur(salle, joueur) {
  const { phase } = salle.etatMode;
  const estHote = joueur.id === salle.hoteId;
  if (phase === 'validation' && estHote) return { ...vueValidationJoueur(salle, joueur), ecran: 'validation_hote', lignes: lignesHote(salle) };
  if (!participe(salle, joueur.id)) return { ecran: 'attente_question' };
  if (phase === 'ecriture') return vueEcritureJoueur(salle, joueur);
  if (phase === 'validation') return vueValidationJoueur(salle, joueur);
  const { textes, acceptees } = salle.etatMode;
  return {
    ecran: 'bilan',
    ...manche(salle),
    textes: textes[joueur.id] ?? Array(NB_CATEGORIES).fill(''),
    acceptees: acceptees[joueur.id] ?? Array(NB_CATEGORIES).fill(false),
    points: pointsGagnes(salle, joueur.id),
    rang: rangDe(salle, joueur),
  };
}

function vueEcritureJoueur(salle, joueur) {
  const { attendus, textes, reponses, stop } = salle.etatMode;
  const mesTextes = textes[joueur.id] ?? Array(NB_CATEGORIES).fill('');
  if (reponses[joueur.id]) {
    return { ecran: 'fini', ...manche(salle), textes: mesTextes, nbFinis: Object.keys(reponses).length, nbAttendus: attendus.length };
  }
  return {
    ecran: 'ecriture',
    ...manche(salle),
    textes: mesTextes,
    stop: stop ? salle.joueurs.find((j) => j.id === stop.id)?.pseudo ?? null : null,
    tempsRestantMs: stop ? tempsRestantMs(salle, echeance) : null,
  };
}

function vueValidationJoueur(salle, joueur) {
  const { textes, acceptees, indexCategorie } = salle.etatMode;
  const infos = manche(salle);
  const texte = textes[joueur.id]?.[indexCategorie];
  const miennes = acceptees[joueur.id] ?? [];
  return {
    ecran: 'validation',
    ...infos,
    categorie: infos.categories[indexCategorie],
    indexCategorie,
    maReponse: texte ? { texte, acceptee: miennes[indexCategorie] } : null,
    pointsProvisoires: miennes.slice(0, indexCategorie + 1).filter(Boolean).length,
  };
}

// Une ligne par joueur attendu, pour la catégorie affichée. Case vide : texte ''.
function lignesHote(salle) {
  const { attendus, textes, acceptees, indexCategorie } = salle.etatMode;
  const { lettre } = questionCourante(salle);
  return attendus.map((joueurId) => {
    const texte = textes[joueurId]?.[indexCategorie] ?? '';
    return {
      id: joueurId,
      pseudo: salle.joueurs.find((j) => j.id === joueurId)?.pseudo ?? '',
      texte,
      acceptee: acceptees[joueurId]?.[indexCategorie] ?? false,
      horsLettre: texte !== '' && !commenceParLettre(texte, lettre),
    };
  });
}
