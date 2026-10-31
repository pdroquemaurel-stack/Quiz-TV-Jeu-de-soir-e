import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import { modes } from './index.js';
import {
  DUREE_BILAN_MS, PENALITE_PASSER_MS, POINTS_PAR_PERSONNAGE, avancer, banquePersonnages, demarrerPartie, echeance,
  enregistrerReponse, ordreDesTours, reglagesParDefaut, suivant, texteDuree, validerReglages, valideurDe,
  verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './qui-suis-je.js';

const DEUX_MIN = 120000;

// On appelle les fonctions du mode directement, sans passer par les événements.
function sallePrete({ joueurs = ['A', 'B', 'C'], reglages } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'qui-suis-je';
  salle.etat = 'partie';
  if (reglages) salle.reglagesMode = { 'qui-suis-je': { ...reglagesParDefaut(), ...reglages } };
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

// Comme le serveur : une réponse acceptée est suivie de verifierFinAnticipee.
function repondre(salle, joueurId, contenu) {
  const accepte = enregistrerReponse(salle, joueurId, contenu);
  if (accepte) verifierFinAnticipee(salle);
  return accepte;
}

function actif(salle) {
  return salle.etatMode.tours[salle.etatMode.indexTour];
}

// Le joueur actif appuie sur « C'est parti ! » : le tour est en phase `jeu`.
function partir(salle) {
  assert.equal(repondre(salle, actif(salle), { partir: true }), true);
  assert.equal(salle.etatMode.phase, 'jeu');
}

// « Trouvé ! » du joueur actif, puis la décision du valideur.
function trouver(salle, accepte = true) {
  assert.equal(repondre(salle, actif(salle), { trouve: true }), true);
  assert.equal(repondre(salle, valideurDe(salle), { valider: accepte }), true);
}

function nomCourant(salle) {
  return salle.etatMode.personnages[salle.etatMode.indexPersonnage].nom;
}

// --- Règles pures et réglages ---

test('qui suis-je : le registre contient le mode, 2 joueurs minimum', () => {
  const mode = modes['qui-suis-je'];
  for (const fonction of ['demarrerPartie', 'enregistrerReponse', 'verifierFinAnticipee', 'suivant', 'echeance',
    'avancer', 'vueTv', 'vueJoueur']) {
    assert.equal(typeof mode[fonction], 'function', fonction);
  }
  assert.equal(mode.joueursMin, 2);
});

test('qui suis-je : ordre des tours, chacun `longueur` fois, jamais deux fois d\'affilée', () => {
  for (let i = 0; i < 200; i++) {
    const tours = ordreDesTours(['a', 'b', 'c'], 3);
    assert.equal(tours.length, 9);
    for (const id of ['a', 'b', 'c']) assert.equal(tours.filter((x) => x === id).length, 3);
    for (let j = 1; j < tours.length; j++) assert.notEqual(tours[j], tours[j - 1]);
  }
  assert.deepEqual(ordreDesTours(['a'], 2), ['a', 'a']);
});

test('qui suis-je : réglages, format, tours, temps selon le format, objectif, affichage, niveaux', () => {
  const base = reglagesParDefaut();
  assert.deepEqual(base, {
    format: 'max', longueur: 1, temps: 120, objectif: 1, affichage: 'tv', niveaux: [1, 2],
  });
  assert.deepEqual(validerReglages({ ...base, longueur: 3, temps: 90, niveaux: [2, 1] }), { ...base, longueur: 3, temps: 90 });
  assert.deepEqual(validerReglages({ ...base, longueur: 2, temps: 180, niveaux: [2] }), { ...base, longueur: 2, temps: 180, niveaux: [2] });
  assert.deepEqual(
    validerReglages({ ...base, format: 'chrono', temps: 300, objectif: 3, affichage: 'telephones' }),
    { ...base, format: 'chrono', temps: 300, objectif: 3, affichage: 'telephones' },
  );
  // Changement de format : un temps de l'autre format devient celui par défaut.
  assert.equal(validerReglages({ ...base, format: 'chrono', temps: 90 }).temps, 180);
  for (const mauvais of [
    { longueur: 4 }, { temps: 60 }, { niveaux: [] }, { niveaux: [3] }, { format: 'rapide' }, { objectif: 4 }, { affichage: 'radio' },
  ]) {
    assert.equal(validerReglages({ ...base, ...mauvais }), null, JSON.stringify(mauvais));
  }
  assert.equal(validerReglages(null), null);
  assert.equal(texteDuree(90), '1 min 30');
  assert.equal(texteDuree(120), '2 min');
  assert.equal(vueReglages(creerSalle('tv')).resume, '1 tour · 2 min · Tous niveaux');
  const salle = creerSalle('tv');
  salle.reglagesMode = { 'qui-suis-je': { ...base, format: 'chrono', temps: 180, objectif: 2, affichage: 'telephones' } };
  assert.equal(vueReglages(salle).resume, 'Contre la montre, 2 personnages · 1 tour · 3 min max · personnage sur les téléphones · Tous niveaux');
  assert.deepEqual(vueReglages(salle).options.temps.map((choix) => choix.id), [120, 180, 300]);
});

test('qui suis-je : un personnage vu mais pas trouvé à la fin du chrono n\'est pas reproposé au suivant', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ joueurs: ['A', 'B'] });
  partir(salle);
  trouver(salle);
  const dernier = nomCourant(salle);
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  assert.equal(vueTv(salle).nonTrouve, dernier);
  suivant(salle);
  partir(salle);
  assert.notEqual(nomCourant(salle), dernier);
});

test('qui suis-je : idem après un « Trouvé ! » refusé à la fin du chrono', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ joueurs: ['A', 'B'] });
  partir(salle);
  const vu = nomCourant(salle);
  repondre(salle, actif(salle), { trouve: true });
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  repondre(salle, valideurDe(salle), { valider: false });
  assert.equal(salle.etatMode.phase, 'bilan');
  suivant(salle);
  partir(salle);
  assert.notEqual(nomCourant(salle), vu);
});

test('qui suis-je contre la montre : le tour s\'arrête à l\'objectif, points selon le temps restant', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete({ reglages: { format: 'chrono', temps: 180, objectif: 2 } });
  partir(salle);
  t.mock.timers.tick(20000);
  trouver(salle);
  assert.equal(salle.etatMode.phase, 'jeu');
  repondre(salle, actif(salle), { passer: true });
  t.mock.timers.tick(10000);
  // Le temps compte au « Trouvé ! », pas à la validation.
  repondre(salle, actif(salle), { trouve: true });
  t.mock.timers.tick(5000);
  repondre(salle, valideurDe(salle), { valider: true });
  assert.equal(salle.etatMode.phase, 'bilan');
  // 30 s de jeu + 15 s pour le « Passer » : 45 s sur 180, il en reste 135 → 1 350 points.
  assert.equal(salle.etatMode.tempsMisMs, 45000);
  const joueurActif = joueurs.find((j) => j.id === actif(salle));
  assert.equal(joueurActif.score, 1350);
  assert.equal(vueTv(salle).tempsMisMs, 45000);
  assert.equal(vueJoueur(salle, joueurActif).points, 1350);
});

test('qui suis-je contre la montre : objectif pas atteint à temps, 0 point', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete({ reglages: { format: 'chrono', temps: 120, objectif: 3 } });
  partir(salle);
  trouver(salle);
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(salle.etatMode.tempsMisMs, null);
  assert.ok(joueurs.every((j) => j.score === 0));
  // Le chrono qui monte : pendant le tour suivant, le temps déjà compté.
  suivant(salle);
  partir(salle);
  t.mock.timers.tick(7000);
  assert.equal(vueTv(salle).tempsEcouleMs, 7000);
});

test('qui suis-je : personnage sur les téléphones, la TV ne le montre jamais', () => {
  const { salle, joueurs } = sallePrete({ reglages: { affichage: 'telephones' } });
  const joueurActif = joueurs.find((j) => j.id === actif(salle));
  const autre = joueurs.find((j) => j.id !== actif(salle));
  assert.equal(vueTv(salle).personnageSuivant, null);
  partir(salle);
  const tv = vueTv(salle);
  assert.equal(tv.personnage, null);
  assert.equal(tv.affichage, 'telephones');
  assert.equal(JSON.stringify(tv).includes(nomCourant(salle)), false);
  // Les autres téléphones ont aussi la photo ; le joueur actif, toujours rien.
  const vueAutre = vueJoueur(salle, autre);
  assert.equal(vueAutre.personnage.nom, nomCourant(salle));
  assert.ok(vueAutre.personnage.image.startsWith('https://'));
  assert.equal(JSON.stringify(vueJoueur(salle, joueurActif)).includes(nomCourant(salle)), false);
});

// --- Partie ---

test('qui suis-je : lancement, préparation sans chrono et sans personnage', () => {
  const { salle, joueurs } = sallePrete({ reglages: { longueur: 2 } });
  assert.equal(salle.etatMode.tours.length, 6);
  assert.equal(salle.etatMode.phase, 'preparation');
  assert.equal(echeance(salle), null);
  assert.equal(vueTv(salle).personnage, undefined);
  const autre = joueurs.find((j) => j.id !== actif(salle));
  assert.equal(repondre(salle, autre.id, { partir: true }), false);
  assert.equal(vueJoueur(salle, autre).ecran, 'preparation');
  assert.equal(vueJoueur(salle, joueurs.find((j) => j.id === actif(salle))).ecran, 'preparation_actif');
});

test('qui suis-je : personnages tirés dans les niveaux cochés, tous distincts', () => {
  const { salle } = sallePrete({ reglages: { niveaux: [2] } });
  const { personnages } = salle.etatMode;
  assert.ok(personnages.length > 30);
  assert.ok(personnages.every((personnage) => personnage.niveau === 2));
  assert.equal(new Set(personnages.map((personnage) => personnage.id)).size, personnages.length);
  // Seuls les personnages montrés sont notés comme vus.
  partir(salle);
  assert.deepEqual(salle.questionsVues, [personnages[0].id]);
});

test('qui suis-je : trouvé validé, refusé, et les appuis interdits', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  partir(salle);
  const premier = nomCourant(salle);
  const valideur = valideurDe(salle);
  assert.equal(repondre(salle, valideur, { trouve: true }), false);
  assert.equal(repondre(salle, actif(salle), { valider: true }), false);
  assert.equal(repondre(salle, valideur, { valider: true }), false); // rien à valider
  assert.equal(repondre(salle, actif(salle), { trouve: true }), true);
  assert.equal(repondre(salle, actif(salle), { trouve: true }), false);
  assert.equal(repondre(salle, actif(salle), { passer: true }), false);
  assert.equal(repondre(salle, valideur, { valider: false }), true);
  assert.equal(nomCourant(salle), premier);
  trouver(salle);
  assert.notEqual(nomCourant(salle), premier);
  assert.equal(salle.etatMode.trouves.length, 1);
});

test('qui suis-je : le valideur est l\'hôte, un autre joueur si l\'hôte est actif ou absent', () => {
  const { salle, joueurs } = sallePrete();
  const [hote, deuxieme, troisieme] = joueurs;
  assert.equal(salle.hoteId, hote.id);
  salle.etatMode.tours = [deuxieme.id];
  salle.etatMode.indexTour = 0;
  assert.equal(valideurDe(salle), hote.id);
  hote.connecte = false;
  assert.equal(valideurDe(salle), troisieme.id);
  hote.connecte = true;
  salle.etatMode.tours = [hote.id];
  assert.equal(valideurDe(salle), deuxieme.id);
  deuxieme.connecte = false;
  troisieme.connecte = false;
  assert.equal(valideurDe(salle), null);
});

test('qui suis-je : « Passer » avance la fin de 15 s, et arrête le tour s\'il en reste 15 ou moins', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  partir(salle);
  const premier = nomCourant(salle);
  assert.equal(repondre(salle, actif(salle), { passer: true }), true);
  assert.notEqual(nomCourant(salle), premier);
  assert.equal(echeance(salle), DEUX_MIN - PENALITE_PASSER_MS);
  t.mock.timers.tick(DEUX_MIN - 2 * PENALITE_PASSER_MS);
  assert.equal(repondre(salle, actif(salle), { passer: true }), true);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(salle.etatMode.passes.length, 2);
});

test('qui suis-je : fin du chrono, bilan et 300 points par personnage au joueur actif', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  partir(salle);
  trouver(salle);
  trouver(salle);
  // Les points ne comptent qu'au bilan.
  assert.ok(joueurs.every((j) => j.score === 0));
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  for (const joueur of joueurs) {
    assert.equal(joueur.score, joueur.id === actif(salle) ? 2 * POINTS_PAR_PERSONNAGE : 0);
  }
  assert.equal(vueTv(salle).points, 2 * POINTS_PAR_PERSONNAGE);
  assert.equal(vueTv(salle).trouves.length, 2);
  assert.equal(echeance(salle), DEUX_MIN + DUREE_BILAN_MS);
});

test('qui suis-je : validation en attente à la fin du chrono, la décision compte encore', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  partir(salle);
  repondre(salle, actif(salle), { trouve: true });
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'jeu');
  assert.equal(salle.etatMode.tempsEcoule, true);
  assert.equal(echeance(salle), null);
  repondre(salle, valideurDe(salle), { valider: true });
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(salle.etatMode.trouves.length, 1);
});

test('qui suis-je : validation en attente à la fin du chrono, refusée, puis sans valideur', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete({ joueurs: ['A', 'B'] });
  partir(salle);
  repondre(salle, actif(salle), { trouve: true });
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  repondre(salle, valideurDe(salle), { valider: false });
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(salle.etatMode.trouves.length, 0);

  // Tour suivant : le valideur part pendant l'attente, le personnage ne compte pas.
  suivant(salle);
  partir(salle);
  repondre(salle, actif(salle), { trouve: true });
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  joueurs.find((j) => j.id !== actif(salle)).connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'bilan');
  assert.equal(salle.etatMode.trouves.length, 0);
});

test('qui suis-je : joueur actif absent à sa préparation, son tour est sauté', () => {
  const { salle, joueurs } = sallePrete();
  const premier = actif(salle);
  joueurs.find((j) => j.id === premier).connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.indexTour, 1);
  assert.equal(salle.etatMode.phase, 'preparation');
  // Les deux derniers absents : podium.
  for (const joueur of joueurs) joueur.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etat, 'podium');
});

test('qui suis-je : bilan, puis tour suivant, puis podium après le dernier', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ joueurs: ['A', 'B'] });
  partir(salle);
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.phase, 'preparation');
  assert.equal(salle.etatMode.indexTour, 1);
  partir(salle);
  assert.equal(suivant(salle), false);
  t.mock.timers.tick(DEUX_MIN);
  avancer(salle);
  t.mock.timers.tick(DUREE_BILAN_MS);
  avancer(salle);
  assert.equal(salle.etat, 'podium');
});

test('qui suis-je : le joueur actif ne reçoit jamais le personnage avant le bilan', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  const joueurActif = joueurs.find((j) => j.id === actif(salle));
  const autre = joueurs.find((j) => j.id !== actif(salle));
  const nomsTires = () => salle.etatMode.personnages.slice(0, 5).map((personnage) => personnage.nom);
  const contientUnNom = (vue) => nomsTires().some((nomPersonnage) => JSON.stringify(vue).includes(nomPersonnage));

  assert.equal(contientUnNom(vueJoueur(salle, joueurActif)), false);
  partir(salle);
  repondre(salle, actif(salle), { trouve: true });
  assert.equal(contientUnNom(vueJoueur(salle, joueurActif)), false);
  assert.equal(vueJoueur(salle, joueurActif).ecran, 'actif');
  // Les autres voient le nom et la catégorie, sans l'image.
  const vueAutre = vueJoueur(salle, autre);
  assert.equal(vueAutre.personnage.nom, nomCourant(salle));
  assert.equal(vueAutre.personnage.image, undefined);
  // La TV : le personnage en cours et l'image du suivant, jamais la liste.
  const tv = vueTv(salle);
  assert.equal(tv.personnage.nom, nomCourant(salle));
  assert.equal(tv.personnages, undefined);
  assert.equal(JSON.stringify(tv).includes(salle.etatMode.personnages[2].nom), false);
});

test('qui suis-je : la banque contient assez de personnages par niveau', () => {
  assert.ok(banquePersonnages.filter((personnage) => personnage.niveau === 1).length >= 30);
  assert.ok(banquePersonnages.filter((personnage) => personnage.niveau === 2).length >= 30);
});
