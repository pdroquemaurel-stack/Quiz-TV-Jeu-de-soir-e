import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import { modes } from './index.js';
import {
  DUREES_MS, NOMBRE_MANCHES, avancer, banqueMots, composerMots, demarrerPartie, echeance, enregistrerReponse,
  formerEquipes, reglagesParDefaut, suivant, validerMots, validerReglages, verifierFinAnticipee, vueJoueur,
  vueReglages, vueTv,
} from './chapeau.js';

const TRENTE_S = 30000;

function sallePrete({ joueurs = ['A', 'B', 'C', 'D'], reglages } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'chapeau';
  salle.etat = 'partie';
  salle.reglagesMode = { chapeau: { ...reglagesParDefaut(), ...reglages } };
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

function repondre(salle, joueurId, contenu) {
  const accepte = enregistrerReponse(salle, joueurId, contenu);
  if (accepte) verifierFinAnticipee(salle);
  return accepte;
}

// Une partie aux mots tirés au hasard, jusqu'à la préparation du premier tour.
function partieLancee(options) {
  const prete = sallePrete({ ...options, reglages: { mots: 'hasard', ...options?.reglages } });
  assert.equal(prete.salle.etatMode.phase, 'annonce');
  suivant(prete.salle);
  assert.equal(prete.salle.etatMode.phase, 'preparation');
  return prete;
}

function actif(salle) {
  return salle.etatMode.actif;
}

function partir(salle) {
  assert.equal(repondre(salle, actif(salle), { partir: true }), true);
  assert.equal(salle.etatMode.phase, 'jeu');
}

// --- Registre, réglages, règles pures ---

test('chapeau : le registre contient le mode, 4 joueurs minimum', () => {
  const mode = modes.chapeau;
  for (const fonction of ['demarrerPartie', 'enregistrerReponse', 'verifierFinAnticipee', 'suivant', 'echeance',
    'avancer', 'decalerHeures', 'vueTv', 'vueJoueur']) {
    assert.equal(typeof mode[fonction], 'function', fonction);
  }
  assert.equal(mode.joueursMin, 4);
  assert.ok(banqueMots.length >= 150);
});

test('chapeau : réglages, mots écrits ou au hasard, 30, 45 ou 60 s', () => {
  assert.deepEqual(reglagesParDefaut(), { mots: 'joueurs', temps: 30 });
  assert.deepEqual(validerReglages({ mots: 'hasard', temps: 60 }), { mots: 'hasard', temps: 60 });
  for (const mauvais of [{ mots: 'aucun', temps: 30 }, { mots: 'joueurs', temps: 20 }, null]) {
    assert.equal(validerReglages(mauvais), null, JSON.stringify(mauvais));
  }
  const salle = creerSalle('tv');
  assert.equal(vueReglages(salle).resume, 'Mots écrits par les joueurs · 30 s par tour');
});

test('chapeau : deux équipes tirées au sort, une de plus d\'un côté si impair', () => {
  for (const nombre of [4, 5, 10]) {
    const ids = Array.from({ length: nombre }, (_, i) => `j${i}`);
    const [rouges, bleus] = formerEquipes(ids);
    assert.equal(rouges.length + bleus.length, nombre);
    assert.ok(rouges.length - bleus.length <= 1 && rouges.length >= bleus.length);
    assert.deepEqual([...rouges, ...bleus].sort(), [...ids].sort());
  }
});

test('chapeau : 3 mots de 1 à 30 caractères, sinon refusés', () => {
  assert.deepEqual(validerMots({ mots: [' Pizza ', 'Tour  Eiffel', 'Zorro'] }), ['Pizza', 'Tour Eiffel', 'Zorro']);
  for (const mauvais of [
    { mots: ['Pizza', 'Zorro'] }, { mots: ['Pizza', 'Zorro', ''] }, { mots: ['Pizza', 'Zorro', 'x'.repeat(31)] },
    { mots: ['Pizza', 'Zorro', 3] }, { mots: ['Pizza', 'Zorro', '!!!'] }, {}, null,
  ]) {
    assert.equal(validerMots(mauvais), null, JSON.stringify(mauvais));
  }
});

test('chapeau : doublons et mots manquants remplacés par le catalogue', () => {
  const reserve = [{ id: 'ch-a', mot: 'Pizza' }, { id: 'ch-b', mot: 'Girafe' }, { id: 'ch-c', mot: 'Zorro' }, { id: 'ch-d', mot: 'Lune' }];
  const { mots, tires } = composerMots(
    { a: ['Pizza', 'Tour Eiffel', 'Les pizzas'] },
    ['a', 'b'],
    reserve,
  );
  assert.deepEqual(mots.map((mot) => mot.texte), ['Pizza', 'Tour Eiffel', 'Girafe', 'Zorro', 'Lune']);
  // « Les pizzas » est un doublon de « Pizza » ; le catalogue n'a plus assez de mots pour b.
  assert.deepEqual(tires.map((entree) => entree.id), ['ch-b', 'ch-c', 'ch-d']);
  assert.deepEqual(mots.map((mot) => mot.auteur), ['a', 'a', 'a', 'b', 'b']);
});

// --- Saisie ---

test('chapeau : saisie, chacun ses 3 mots, fin quand tous ont fini', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  assert.equal(salle.etatMode.phase, 'saisie');
  assert.equal(echeance(salle), salle.etatMode.debutPhaseA + DUREES_MS.saisie);
  assert.equal(repondre(salle, a.id, { mots: ['Pizza', 'Zorro', 'Lune'] }), true);
  assert.equal(repondre(salle, a.id, { mots: ['Pizza'] }), false);
  // Chacun ne voit que ses mots ; la TV, seulement qui a fini.
  assert.deepEqual(vueJoueur(salle, a).mesMots, ['Pizza', 'Zorro', 'Lune']);
  assert.deepEqual(vueJoueur(salle, b).mesMots, []);
  assert.ok(!JSON.stringify(vueTv(salle)).includes('Zorro'));
  assert.deepEqual(vueTv(salle).ontFini, [a.id]);
  assert.equal(repondre(salle, b.id, { piocher: true }), true);
  assert.equal(vueJoueur(salle, b).mesMots.length, 3);
  repondre(salle, c.id, { mots: ['Chat', 'Chien', 'Poule'] });
  assert.equal(salle.etatMode.phase, 'saisie');
  repondre(salle, d.id, { mots: ['Ski', 'Surf', 'Yoga'] });
  assert.equal(salle.etatMode.phase, 'annonce');
  assert.equal(salle.etatMode.mots.length, 12);
  assert.ok(salle.etatMode.mots.some((mot) => mot.texte === 'Zorro'));
});

test('chapeau : fin du chrono de saisie, mots au hasard pour ceux qui n\'ont rien donné', () => {
  const { salle, joueurs: [a] } = sallePrete();
  repondre(salle, a.id, { mots: ['Pizza', 'Zorro', 'Lune'] });
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'annonce');
  assert.equal(salle.etatMode.mots.length, 12);
});

test('chapeau : option « au hasard », pas de saisie, mots inédits notés comme vus', () => {
  const { salle } = sallePrete({ reglages: { mots: 'hasard' } });
  assert.equal(salle.etatMode.phase, 'annonce');
  assert.equal(salle.etatMode.mots.length, 12);
  assert.equal(salle.questionsVues.length, 12);
  assert.equal(salle.etatMode.chapeau.length, 12);
});

// --- Tours ---

test('chapeau : les équipes alternent, chacun son tour dans son équipe', () => {
  const { salle } = partieLancee({ joueurs: ['A', 'B', 'C', 'D', 'E'] });
  const [rouges, bleus] = salle.etatMode.equipes;
  const ordre = [];
  for (let tour = 0; tour < 6; tour++) {
    ordre.push(actif(salle));
    partir(salle);
    avancer(salle);
    suivant(salle);
  }
  assert.deepEqual(ordre, [rouges[0], bleus[0], rouges[1], bleus[1], rouges[2], bleus[0]]);
});

test('chapeau : joueur actif absent à sa préparation, son tour est sauté', () => {
  const { salle, joueurs } = partieLancee();
  const absent = actif(salle);
  joueurs.find((j) => j.id === absent).connecte = false;
  verifierFinAnticipee(salle);
  assert.notEqual(actif(salle), absent);
  assert.equal(salle.etatMode.phase, 'preparation');
  for (const joueur of joueurs) joueur.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etat, 'podium');
});

test('chapeau : « Trouvé ! » +1 pour l\'équipe, « Passer » au fond, seulement le joueur actif', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = partieLancee();
  const autre = joueurs.find((j) => j.id !== actif(salle));
  assert.equal(repondre(salle, autre.id, { partir: true }), false);
  partir(salle);
  assert.equal(repondre(salle, autre.id, { trouve: true }), false);
  const [premier, deuxieme] = salle.etatMode.chapeau;
  assert.equal(repondre(salle, actif(salle), { passer: true }), true);
  assert.equal(salle.etatMode.chapeau[0], deuxieme);
  assert.equal(salle.etatMode.chapeau.at(-1), premier);
  assert.equal(repondre(salle, actif(salle), { trouve: true }), true);
  assert.equal(salle.etatMode.scores[salle.etatMode.equipeActive], 1);
  assert.equal(salle.etatMode.chapeau.length, 11);
  // Les points des joueurs n'arrivent qu'au bilan.
  assert.ok(joueurs.every((j) => j.score === 0));
  t.mock.timers.tick(TRENTE_S);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  const equipe = salle.etatMode.equipes[salle.etatMode.equipeActive];
  for (const joueur of joueurs) assert.equal(joueur.score, equipe.includes(joueur.id) ? 100 : 0);
  assert.equal(vueTv(salle).trouvesDuTour.length, 1);
  assert.equal(echeance(salle), TRENTE_S + DUREES_MS.bilan);
});

test('chapeau : chapeau vide, fin de manche, mêmes mots à la manche suivante, podium après la 3e', () => {
  const { salle } = partieLancee();
  const mots = salle.etatMode.mots.map((mot) => mot.id).sort();
  for (let manche = 1; manche <= NOMBRE_MANCHES; manche++) {
    assert.equal(salle.etatMode.manche, manche);
    assert.deepEqual([...salle.etatMode.chapeau].sort(), mots);
    partir(salle);
    while (salle.etatMode.phase === 'jeu') repondre(salle, actif(salle), { trouve: true });
    assert.equal(salle.etatMode.phase, 'finManche');
    assert.equal(vueJoueur(salle, salle.joueurs[0]).finManche, true);
    suivant(salle);
    if (manche < NOMBRE_MANCHES) {
      assert.equal(salle.etatMode.phase, 'annonce');
      suivant(salle);
    }
  }
  assert.equal(salle.etat, 'podium');
  // Une seule équipe a tout trouvé (chaque manche en un tour) : ses joueurs ex æquo en tête.
  const scores = salle.joueurs.map((j) => j.score).sort((x, y) => y - x);
  assert.equal(scores[0], scores[1]);
});

// --- Secret ---

test('chapeau : la TV et les coéquipiers ne reçoivent jamais le mot, l\'actif et les adversaires oui', () => {
  const { salle, joueurs } = partieLancee();
  partir(salle);
  const mot = salle.etatMode.mots.find((m) => m.id === salle.etatMode.chapeau[0]).texte;
  const equipeActive = salle.etatMode.equipes[salle.etatMode.equipeActive];
  assert.ok(!JSON.stringify(vueTv(salle)).includes(mot));
  for (const joueur of joueurs) {
    const vue = vueJoueur(salle, joueur);
    if (joueur.id === actif(salle)) {
      assert.equal(vue.ecran, 'faire_deviner');
      assert.equal(vue.mot, mot);
    } else if (equipeActive.includes(joueur.id)) {
      assert.equal(vue.ecran, 'deviner');
      assert.ok(!JSON.stringify(vue).includes(mot));
    } else {
      assert.equal(vue.ecran, 'surveiller');
      assert.equal(vue.mot, mot);
    }
  }
});

test('chapeau : un joueur arrivé en cours de partie regarde, sans équipe', () => {
  const { salle } = partieLancee();
  const nouveau = ajouterJoueur(salle, 'Z', 'sz').joueur;
  assert.equal(vueJoueur(salle, nouveau).ecran, 'attente_question');
  assert.equal(enregistrerReponse(salle, nouveau.id, { trouve: true }), false);
});
