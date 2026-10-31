import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import { remplacerChercher } from '../wikipedia.js';
import { modes } from './index.js';
import {
  DUREE_ANNONCE_MS, MANCHES_MAX, avancer, banqueCouples, decalerHeures, demarrerPartie, echeance, enregistrerReponse,
  pointsCourseLibre, pointsDeLaCourse, pointsManche, reglagesParDefaut, suivant, synchroniser, validerReglages,
  verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './wiki-course.js';

// Un faux Wikipédia : chaque page et ses liens. « Pizzas » redirige vers « Pizza ».
const PAGES = {
  Départ: ['Fer', 'Italie', 'Lune'],
  Fer: ['Départ', 'Italie'],
  Italie: ['Pizzas', 'Rome', 'Fer'],
  Rome: ['Italie'],
  Lune: ['Fer'],
  Pizza: ['Italie'],
  Hasard: Array.from({ length: 25 }, (_, i) => `Lien ${i}`),
};
const REDIRECTIONS = { Pizzas: 'Pizza' };

function reponseJson(donnees) {
  return { ok: true, json: async () => donnees };
}

// Compte les appels ; `panne` fait échouer toutes les requêtes.
function fauxWikipedia({ panne = false } = {}) {
  const etat = { appels: 0, panne };
  const chercher = async (adresse) => {
    etat.appels += 1;
    if (etat.panne) throw new Error('réseau coupé');
    const url = new URL(adresse);
    if (url.pathname.includes('/page/summary/')) {
      const titre = decodeURIComponent(url.pathname.split('/').pop()).replace(/_/g, ' ');
      return reponseJson({ extract: `Résumé de ${titre}`, thumbnail: { source: `https://img/${titre}.jpg` } });
    }
    if (url.pathname.includes('/page/random/summary')) {
      return reponseJson({ type: 'standard', titles: { normalized: 'Hasard' } });
    }
    const p = url.searchParams;
    const titre = p.get('titles');
    if (p.get('prop') === 'links') {
      const liens = PAGES[titre] ?? [];
      const filtre = p.get('pltitles');
      const gardes = filtre ? liens.filter((lien) => lien === filtre) : liens;
      return reponseJson({ query: { pages: [{ ns: 0, title: titre, links: gardes.map((lien) => ({ ns: 0, title: lien })) }] } });
    }
    const reel = REDIRECTIONS[titre] ?? titre;
    const existe = reel in PAGES;
    return reponseJson({ query: { pages: [existe ? { ns: 0, title: reel } : { ns: 0, title: reel, missing: true }] } });
  };
  return { chercher, etat };
}

const COUPLE = { id: 'wc-test', depart: 'Départ', cible: 'Pizza', niveau: 1 };

// On appelle les fonctions du mode directement. Les couples tirés sont remplacés par le couple de test.
function sallePrete({ joueurs = ['A', 'B', 'C'], reglages, courses = 3 } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'wiki-course';
  salle.etat = 'partie';
  salle.reglagesMode = { 'wiki-course': { ...reglagesParDefaut(), longueur: courses, ...reglages } };
  demarrerPartie(salle);
  salle.etatMode.courses = salle.etatMode.courses.map(() => COUPLE);
  if (!salle.etatMode.departHasard) salle.etatMode.depart = COUPLE.depart;
  salle.etatMode.cible = { titre: COUPLE.cible, extrait: '', image: null };
  return { salle, joueurs: liste };
}

function avecWikipedia(t, options) {
  const faux = fauxWikipedia(options);
  t.after(remplacerChercher(faux.chercher));
  return faux.etat;
}

function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

// Comme le serveur : réponse, fin anticipée, puis les vérifications auprès de Wikipédia.
async function cliquer(salle, joueurId, contenu) {
  const accepte = enregistrerReponse(salle, joueurId, contenu);
  if (!accepte) return false;
  verifierFinAnticipee(salle);
  await synchroniser(salle, () => verifierFinAnticipee(salle));
  return true;
}

function commencer(salle) {
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.phase, 'course');
}

function page(salle, joueur) {
  return salle.etatMode.parcours[joueur.id].pile.at(-1);
}

// --- Registre et réglages ---

test('wiki course : le registre contient le mode, 2 joueurs minimum', () => {
  const mode = modes['wiki-course'];
  for (const fonction of ['demarrerPartie', 'enregistrerReponse', 'verifierFinAnticipee', 'suivant', 'echeance',
    'avancer', 'decalerHeures', 'vueTv', 'vueJoueur', 'synchroniser']) {
    assert.equal(typeof mode[fonction], 'function', fonction);
  }
  assert.equal(mode.joueursMin, 2);
});

test('wiki course : réglages, format, courses, temps selon le format, départ, niveaux', () => {
  const base = reglagesParDefaut();
  assert.deepEqual(base, {
    format: 'libre', longueur: 3, temps: 300, departHasard: false, niveaux: [1, 2],
  });
  assert.deepEqual(validerReglages({ ...base, format: 'manches', temps: 10, niveaux: [2, 1] }),
    { ...base, format: 'manches', temps: 10, niveaux: [1, 2] });
  // Changement de format : le temps de l'autre format devient celui par défaut.
  assert.equal(validerReglages({ ...base, format: 'manches' }).temps, 15);
  assert.equal(validerReglages({ ...base, temps: 20 }).temps, 300);
  for (const mauvais of [
    { format: 'rapide' }, { longueur: 2 }, { temps: 60 }, { departHasard: 'oui' }, { niveaux: [] }, { niveaux: [3] },
  ]) {
    assert.equal(validerReglages({ ...base, ...mauvais }), null, JSON.stringify(mauvais));
  }
  assert.equal(validerReglages(null), null);
  const salle = creerSalle('tv');
  salle.reglagesMode = { 'wiki-course': { ...base, format: 'manches', temps: 15 } };
  const vue = vueReglages(salle);
  assert.deepEqual(vue.options.temps.map((choix) => choix.id), [10, 15, 20]);
  assert.match(vue.resume, /Manches · 3 courses · manches de 15 s/);
});

test('wiki course : tirage de couples distincts parmi les niveaux cochés', () => {
  const { salle } = sallePrete();
  const salle2 = creerSalle('tv');
  ajouterJoueur(salle2, 'A', 's0');
  salle2.mode = 'wiki-course';
  salle2.etat = 'partie';
  salle2.reglagesMode = { 'wiki-course': { ...reglagesParDefaut(), longueur: 5, niveaux: [2] } };
  demarrerPartie(salle2);
  const { courses } = salle2.etatMode;
  assert.equal(courses.length, 5);
  assert.equal(new Set(courses.map((couple) => couple.id)).size, 5);
  assert.ok(courses.every((couple) => couple.niveau === 2));
  assert.ok(banqueCouples.length >= 40);
  assert.equal(salle.etatMode.phase, 'annonce');
});

// --- Points ---

test('wiki course : points par rang d\'arrivée et par manche', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(pointsCourseLibre), [1000, 850, 700, 550, 400, 250, 250]);
  assert.equal(pointsManche(1), 1000);
  assert.equal(pointsManche(MANCHES_MAX), 300);
  const etatMode = {
    parcours: {
      a: { arriveeA: 500, arriveeManche: null },
      b: { arriveeA: 200, arriveeManche: null },
      c: { arriveeA: 500, arriveeManche: null },
      d: { arriveeA: null, arriveeManche: null },
    },
  };
  assert.deepEqual(pointsDeLaCourse(etatMode), {
    a: 850, b: 1000, c: 850, d: 0,
  });
});

// --- Annonce ---

test('wiki course : l\'annonce charge le résumé de la cible, puis la course commence', async (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle } = sallePrete();
  let rappels = 0;
  await synchroniser(salle, () => { rappels += 1; });
  assert.equal(rappels, 1);
  assert.deepEqual(salle.etatMode.cible, { titre: 'Pizza', extrait: 'Résumé de Pizza', image: 'https://img/Pizza.jpg' });
  assert.equal(vueTv(salle).cible.extrait, 'Résumé de Pizza');
  // Lancé une seule fois.
  await synchroniser(salle, () => { rappels += 1; });
  assert.equal(rappels, 1);
  assert.equal(echeance(salle), DUREE_ANNONCE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'course');
});

test('wiki course : départ au hasard, ou celui du couple si Wikipédia ne répond pas', async (t) => {
  avecWikipedia(t);
  const { salle } = sallePrete({ reglages: { departHasard: true } });
  assert.equal(salle.etatMode.depart, null);
  assert.equal(vueTv(salle).depart, null);
  await synchroniser(salle, () => {});
  assert.equal(salle.etatMode.depart, 'Hasard');
  commencer(salle);
  assert.equal(salle.etatMode.parcours[salle.joueurs[0].id].pile[0], 'Hasard');

  const etat = avecWikipedia(t, { panne: true });
  const { salle: salle2 } = sallePrete({ reglages: { departHasard: true } });
  await synchroniser(salle2, () => {});
  assert.ok(etat.appels >= 3);
  commencer(salle2);
  assert.equal(salle2.etatMode.depart, 'Départ');
});

// --- Clics ---

test('wiki course : un clic n\'est accepté que si le lien est sur la page courante', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  assert.equal(await cliquer(salle, a.id, { aller: 'Fer' }), true);
  assert.equal(page(salle, a), 'Fer');
  assert.equal(salle.etatMode.parcours[a.id].clics, 1);
  // Rome n'est pas sur la page Fer.
  assert.equal(await cliquer(salle, a.id, { aller: 'Rome' }), true);
  assert.equal(page(salle, a), 'Fer');
  assert.equal(salle.etatMode.parcours[a.id].refus, 'absent');
  assert.equal(salle.etatMode.parcours[a.id].clics, 1);
  // Lien vers la page où l'on est, titre invalide : refusés tout de suite.
  assert.equal(await cliquer(salle, a.id, { aller: 'Fer' }), false);
  assert.equal(await cliquer(salle, a.id, { aller: '' }), false);
  assert.equal(await cliquer(salle, a.id, { aller: 'x'.repeat(300) }), false);
  assert.equal(await cliquer(salle, a.id, 'Fer'), false);
  // Les tirets bas comptent comme des espaces.
  assert.equal(await cliquer(salle, a.id, { aller: 'Italie' }), true);
  assert.deepEqual(salle.etatMode.parcours[a.id].pages, ['Départ', 'Fer', 'Italie']);
});

test('wiki course : redirection résolue, arrivée à la cible', async (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Italie' });
  t.mock.timers.tick(4000);
  await cliquer(salle, a.id, { aller: 'Pizzas' });
  assert.equal(page(salle, a), 'Pizza');
  assert.equal(salle.etatMode.parcours[a.id].arriveeA, 4000);
  assert.equal(vueJoueur(salle, a).ecran, 'arrive');
  assert.equal(vueJoueur(salle, a).rangArrivee, 1);
  // Arrivé : plus de clic.
  assert.equal(await cliquer(salle, a.id, { aller: 'Italie' }), false);
});

test('wiki course : second clic ignoré pendant une vérification', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  assert.equal(enregistrerReponse(salle, a.id, { aller: 'Fer' }), true);
  assert.equal(enregistrerReponse(salle, a.id, { aller: 'Italie' }), false);
  assert.equal(vueJoueur(salle, a).enVerification, true);
  await synchroniser(salle, () => {});
  assert.equal(page(salle, a), 'Fer');
  assert.equal(vueJoueur(salle, a).enVerification, false);
});

test('wiki course : Wikipédia en panne, le clic est refusé', async (t) => {
  avecWikipedia(t, { panne: true });
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Fer' });
  assert.equal(page(salle, a), 'Départ');
  assert.equal(vueJoueur(salle, a).refus, 'indisponible');
});

test('wiki course : un résultat arrivé après la fin de la course est ignoré', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  enregistrerReponse(salle, a.id, { aller: 'Fer' });
  const attente = synchroniser(salle, () => {});
  suivant(salle);
  await attente;
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.deepEqual(salle.etatMode.parcours[a.id].pages, ['Départ']);
});

test('wiki course : retour à la page précédente, 1 clic, refusé au départ', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  assert.equal(await cliquer(salle, a.id, { retour: true }), false);
  await cliquer(salle, a.id, { aller: 'Fer' });
  await cliquer(salle, a.id, { aller: 'Italie' });
  assert.equal(await cliquer(salle, a.id, { retour: true }), true);
  assert.equal(page(salle, a), 'Fer');
  assert.equal(await cliquer(salle, a.id, { retour: true }), true);
  assert.equal(page(salle, a), 'Départ');
  assert.equal(salle.etatMode.parcours[a.id].clics, 4);
  assert.deepEqual(salle.etatMode.parcours[a.id].pages, ['Départ', 'Fer', 'Italie', 'Fer', 'Départ']);
  assert.equal(vueJoueur(salle, a).peutRetour, false);
});

// --- Course libre ---

test('wiki course libre : tous arrivés → bilan, points ajoutés au bilan', async (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B'] });
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Italie' });
  await cliquer(salle, b.id, { aller: 'Italie' });
  await cliquer(salle, b.id, { aller: 'Pizzas' });
  assert.equal(salle.etatMode.phase, 'course');
  assert.equal(b.score, 0);
  t.mock.timers.tick(1000);
  await cliquer(salle, a.id, { aller: 'Pizzas' });
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(b.score, 1000);
  assert.equal(a.score, 850);
  const { parcours } = vueTv(salle);
  assert.deepEqual(parcours.map((ligne) => ligne.id), [b.id, a.id]);
  assert.deepEqual(parcours[0].pages, ['Départ', 'Italie', 'Pizza']);
  assert.equal(vueJoueur(salle, a).points, 850);
});

test('wiki course libre : fin du chrono → bilan, sans points pour qui n\'est pas arrivé', (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  assert.equal(echeance(salle), 300000);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(a.score, 0);
});

test('wiki course libre : « Terminer la course » de l\'hôte, puis course suivante et podium', (t) => {
  avecWikipedia(t);
  const { salle } = sallePrete({ courses: 1 });
  commencer(salle);
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(suivant(salle), true);
  assert.equal(salle.etat, 'podium');
});

test('wiki course libre : un joueur déconnecté n\'est pas attendu', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B'] });
  commencer(salle);
  b.connecte = false;
  await cliquer(salle, a.id, { aller: 'Italie' });
  await cliquer(salle, a.id, { aller: 'Pizzas' });
  assert.equal(salle.etatMode.phase, 'bilan');
});

test('wiki course : un joueur arrivé en cours de partie attend la course suivante', (t) => {
  avecWikipedia(t);
  const { salle } = sallePrete();
  const nouveau = ajouterJoueur(salle, 'Z', 'sz').joueur;
  assert.equal(vueJoueur(salle, nouveau).ecran, 'attente_question');
  commencer(salle);
  assert.equal(vueJoueur(salle, nouveau).ecran, 'attente_question');
  assert.equal(enregistrerReponse(salle, nouveau.id, { aller: 'Fer' }), false);
  suivant(salle);
  suivant(salle);
  assert.equal(vueJoueur(salle, nouveau).ecran, 'annonce');
});

// --- Manches ---

test('wiki course manches : le choix remplace le précédent, rien n\'est appliqué avant la fin', async (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle, joueurs: [a, b, c] } = sallePrete({ reglages: { format: 'manches', temps: 15 } });
  commencer(salle);
  assert.equal(echeance(salle), 15000);
  await cliquer(salle, a.id, { aller: 'Fer' });
  await cliquer(salle, a.id, { aller: 'Italie' });
  assert.equal(page(salle, a), 'Départ');
  assert.deepEqual(vueJoueur(salle, a).choix, { titre: 'Italie' });
  // Secret : ni la TV ni les autres ne voient le choix.
  assert.ok(!JSON.stringify(vueTv(salle)).includes('Italie'));
  assert.ok(!JSON.stringify(vueJoueur(salle, b)).includes('Italie'));
  assert.equal(vueTv(salle).joueurs.find((ligne) => ligne.id === a.id).aChoisi, true);
  // Fin de la manche : a avance, b et c restent sur place.
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(page(salle, a), 'Italie');
  assert.equal(page(salle, b), 'Départ');
  assert.deepEqual(vueTv(salle).deplacements, [{ id: a.id, de: 'Départ', vers: 'Italie' }]);
  assert.equal(salle.etatMode.parcours[c.id].clics, 0);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'course');
  assert.equal(salle.etatMode.manche, 2);
});

test('wiki course manches : tous ont choisi → révélation ; points selon la manche d\'arrivée', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B'], reglages: { format: 'manches', temps: 10 } });
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Italie' });
  assert.equal(salle.etatMode.phase, 'course');
  await cliquer(salle, b.id, { aller: 'Italie' });
  assert.equal(salle.etatMode.phase, 'revelation');
  avancer(salle);
  await cliquer(salle, a.id, { aller: 'Pizzas' });
  await cliquer(salle, b.id, { retour: true });
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(salle.etatMode.parcours[a.id].arriveeManche, 2);
  avancer(salle);
  // b, seul restant, choisit : révélation tout de suite.
  await cliquer(salle, b.id, { aller: 'Italie' });
  avancer(salle);
  await cliquer(salle, b.id, { aller: 'Pizzas' });
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(a.score, 950);
  // b arrive à la manche 4 (Italie, retour, Italie, Pizza).
  assert.equal(b.score, 850);
});

test('wiki course manches : arrêt après la manche 15', (t) => {
  avecWikipedia(t);
  const { salle } = sallePrete({ reglages: { format: 'manches', temps: 10 } });
  commencer(salle);
  for (let manche = 1; manche < MANCHES_MAX; manche++) {
    avancer(salle);
    avancer(salle);
  }
  assert.equal(salle.etatMode.manche, MANCHES_MAX);
  avancer(salle);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
});

// --- Pause et vues ---

test('wiki course : la pause décale le chrono et les heures d\'arrivée', async (t) => {
  simulerTemps(t);
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Italie' });
  await cliquer(salle, a.id, { aller: 'Pizzas' });
  decalerHeures(salle, 5000);
  assert.equal(echeance(salle), 305000);
  assert.equal(salle.etatMode.parcours[a.id].arriveeA, 5000);
});

test('wiki course : vues de la TV et du téléphone pendant la course', async (t) => {
  avecWikipedia(t);
  const { salle, joueurs: [a] } = sallePrete();
  const annonce = vueJoueur(salle, a);
  assert.equal(annonce.ecran, 'annonce');
  assert.equal(annonce.depart, 'Départ');
  commencer(salle);
  await cliquer(salle, a.id, { aller: 'Fer' });
  const tv = vueTv(salle);
  assert.equal(tv.phase, 'course');
  assert.deepEqual(tv.joueurs[0], {
    id: a.id, page: 'Fer', clics: 1, arrive: false, rangArrivee: null, arriveeManche: null, aChoisi: false,
  });
  const vue = vueJoueur(salle, a);
  assert.equal(vue.ecran, 'course');
  assert.equal(vue.page, 'Fer');
  assert.equal(vue.cible.titre, 'Pizza');
  assert.equal(vue.peutRetour, true);
});
