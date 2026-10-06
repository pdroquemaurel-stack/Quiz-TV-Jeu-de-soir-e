import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  DUREE_ANNONCE_MS, DUREE_DEFI_MS, DUREE_ENCHERES_MS, DUREE_REVELATION_MS, ENCHERE_MAX, avancer, banqueDefis,
  choisirArbitre, demarrerPartie, echeance, enregistrerReponse, pointsDeLaManche, reglagesParDefaut, suivant,
  texteDefi, validerReglages, verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './defi-encheres.js';

// On appelle les fonctions du mode directement, sans passer par les événements.
function sallePrete({ joueurs = ['A', 'B', 'C', 'D'], longueur } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'defi-encheres';
  salle.etat = 'partie';
  if (longueur) salle.reglagesMode = { 'defi-encheres': { longueur } };
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

// Un joueur qui n'est pas l'auteur de l'enchère en cours.
function unAutre(salle, joueurs, sauf = []) {
  return joueurs.find((j) => j.id !== salle.etatMode.auteur && !sauf.includes(j.id));
}

// Laisse passer les enchères puis l'annonce : la manche est en phase `defi`.
function allerAuDefi(t, salle) {
  t.mock.timers.tick(DUREE_ENCHERES_MS);
  avancer(salle);
  t.mock.timers.tick(DUREE_ANNONCE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'defi');
}

const scores = (joueurs) => Object.fromEntries(joueurs.map((j) => [j.pseudo, j.score]));

// --- Règles pures ---

test('texte du défi : « de » ou « d\' » selon le sujet', () => {
  assert.equal(texteDefi('départements français'), 'En 1 minute, combien de départements français peux-tu citer ?');
  assert.equal(texteDefi('oiseaux'), 'En 1 minute, combien d\'oiseaux peux-tu citer ?');
  assert.equal(texteDefi('Pokémon'), 'En 1 minute, combien de Pokémon peux-tu citer ?');
});

test('points : relevé, le relevant marque son enchère ; raté, +1 aux autres sauf l\'arbitre', () => {
  const manche = { attendus: ['a', 'b', 'c', 'd'], enchere: 12, auteur: 'a', arbitre: 'b' };
  const points = (compteur) => ['a', 'b', 'c', 'd'].map((id) => pointsDeLaManche({ ...manche, compteur }, id));
  assert.deepEqual(points(12), [12, 0, 0, 0]);
  assert.deepEqual(points(15), [12, 0, 0, 0]);
  assert.deepEqual(points(11), [0, 0, 1, 1]);
  // Un joueur arrivé en cours de manche (pas attendu) ne marque rien.
  assert.equal(pointsDeLaManche({ ...manche, compteur: 0 }, 'e'), 0);
});

test('arbitre : le moins souvent arbitre d\'abord, null sans candidat', () => {
  for (let i = 0; i < 20; i++) assert.equal(choisirArbitre(['a', 'b', 'c'], { a: 2, b: 1, c: 2 }), 'b');
  assert.ok(['a', 'c'].includes(choisirArbitre(['a', 'c'], {})));
  assert.equal(choisirArbitre([], {}), null);
});

// --- Réglages ---

test('réglages : 5, 8 ou 12 manches, 8 par défaut, pas de réglage de temps', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 8 });
  assert.deepEqual(validerReglages({ longueur: 12 }), { longueur: 12 });
  assert.deepEqual(validerReglages({ longueur: 5, temps: 30 }), { longueur: 5 });
  assert.equal(validerReglages({ longueur: 7 }), null);
  assert.equal(validerReglages(null), null);
  const salle = creerSalle('tv');
  assert.equal(vueReglages(salle).resume, '8 manches');
  assert.deepEqual(vueReglages(salle).options.longueurs.map((choix) => choix.id), [5, 8, 12]);
});

// --- Partie ---

test('partie : défis distincts, ouverture à la mise de départ par un joueur attendu', () => {
  const { salle, joueurs } = sallePrete({ longueur: 12 });
  const ids = salle.etatMode.questions.map((defi) => defi.id);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  const { phase, enchere, auteur, arbitre, compteur } = salle.etatMode;
  assert.equal(phase, 'encheres');
  assert.equal(enchere, salle.etatMode.questions[0].miseDepart);
  assert.ok(joueurs.some((j) => j.id === auteur));
  assert.equal(arbitre, null);
  assert.equal(compteur, 0);
});

test('partie : les défis jamais vus d\'abord, d\'une partie à l\'autre', () => {
  const { salle } = sallePrete({ longueur: 12 });
  const premiers = salle.etatMode.questions.map((defi) => defi.id);
  demarrerPartie(salle);
  const seconds = salle.etatMode.questions.map((defi) => defi.id);
  // 32 défis : les 12 suivants sont tous inédits.
  assert.ok(banqueDefis.length >= 24);
  assert.ok(seconds.every((idDefi) => !premiers.includes(idDefi)));
});

test('enchères : +1 accepté, met à jour l\'enchère et l\'auteur, relance le chrono de 7 s', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  const depart = salle.etatMode.enchere;
  t.mock.timers.tick(5000);
  const encherisseur = unAutre(salle, joueurs);
  assert.equal(repondre(salle, encherisseur.id, { encherir: depart + 1 }), true);
  assert.equal(salle.etatMode.enchere, depart + 1);
  assert.equal(salle.etatMode.auteur, encherisseur.id);
  assert.equal(echeance(salle), 5000 + DUREE_ENCHERES_MS);
});

test('enchères : refusées de l\'auteur, d\'un non-attendu, avec une mauvaise valeur, au-delà de 99, hors enchères', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  const { enchere, auteur } = salle.etatMode;
  assert.equal(repondre(salle, auteur, { encherir: enchere + 1 }), false);
  const autre = unAutre(salle, joueurs);
  for (const contenu of [{ encherir: enchere + 2 }, { encherir: enchere }, { encherir: String(enchere + 1) }, {}, null, 'plus']) {
    assert.equal(repondre(salle, autre.id, contenu), false, JSON.stringify(contenu));
  }
  const retardataire = ajouterJoueur(salle, 'E', 'sE').joueur;
  assert.equal(repondre(salle, retardataire.id, { encherir: enchere + 1 }), false);
  salle.etatMode.enchere = ENCHERE_MAX;
  assert.equal(repondre(salle, autre.id, { encherir: ENCHERE_MAX + 1 }), false);
  salle.etatMode.enchere = enchere;
  allerAuDefi(t, salle);
  assert.equal(repondre(salle, autre.id, { encherir: enchere + 1 }), false);
});

test('enchères : deux appuis simultanés ne font monter que de 1', () => {
  const { salle, joueurs } = sallePrete();
  const { enchere } = salle.etatMode;
  const [premier, second] = joueurs.filter((j) => j.id !== salle.etatMode.auteur);
  assert.equal(repondre(salle, premier.id, { encherir: enchere + 1 }), true);
  assert.equal(repondre(salle, second.id, { encherir: enchere + 1 }), false);
  assert.equal(salle.etatMode.enchere, enchere + 1);
  assert.equal(salle.etatMode.auteur, premier.id);
});

test('adjudication : après 7 s, arbitre tiré parmi les autres, annonce de 5 s puis défi de 60 s', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  assert.equal(echeance(salle), DUREE_ENCHERES_MS);
  t.mock.timers.tick(DUREE_ENCHERES_MS);
  avancer(salle);
  const { phase, auteur, arbitre } = salle.etatMode;
  assert.equal(phase, 'annonce');
  assert.ok(arbitre && arbitre !== auteur);
  assert.equal(echeance(salle), DUREE_ENCHERES_MS + DUREE_ANNONCE_MS);
  t.mock.timers.tick(DUREE_ANNONCE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'defi');
  assert.equal(echeance(salle), DUREE_ENCHERES_MS + DUREE_ANNONCE_MS + DUREE_DEFI_MS);
});

test('arbitre : chacun son tour, avant que quiconque le soit deux fois', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete({ joueurs: ['A', 'B', 'C'], longueur: 5 });
  const arbitres = [];
  for (let manche = 0; manche < 3; manche++) {
    // L'enchère va toujours au même joueur, pour que les deux autres se partagent l'arbitrage.
    salle.etatMode.auteur = joueurs[0].id;
    t.mock.timers.tick(DUREE_ENCHERES_MS);
    avancer(salle);
    arbitres.push(salle.etatMode.arbitre);
    t.mock.timers.tick(DUREE_ANNONCE_MS);
    avancer(salle);
    t.mock.timers.tick(DUREE_DEFI_MS);
    avancer(salle);
    suivant(salle);
  }
  assert.deepEqual(new Set(arbitres.slice(0, 2)), new Set([joueurs[1].id, joueurs[2].id]));
});

test('défi : compter refusé d\'un autre joueur que l\'arbitre et hors défi, compteur jamais négatif', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  t.mock.timers.tick(DUREE_ENCHERES_MS);
  avancer(salle);
  const { arbitre, auteur } = salle.etatMode;
  // Pendant l'annonce, les flèches sont inactives.
  assert.equal(repondre(salle, arbitre, { compter: 1 }), false);
  t.mock.timers.tick(DUREE_ANNONCE_MS);
  avancer(salle);
  assert.equal(repondre(salle, auteur, { compter: 1 }), false);
  const autre = joueurs.find((j) => j.id !== auteur && j.id !== arbitre);
  assert.equal(repondre(salle, autre.id, { compter: 1 }), false);
  for (const contenu of [{ compter: 2 }, { compter: '1' }, { compter: 0 }, null]) {
    assert.equal(repondre(salle, arbitre, contenu), false, JSON.stringify(contenu));
  }
  assert.equal(repondre(salle, arbitre, { compter: -1 }), true);
  assert.equal(salle.etatMode.compteur, 0);
  assert.equal(repondre(salle, arbitre, { compter: 1 }), true);
  assert.equal(repondre(salle, arbitre, { compter: 1 }), true);
  assert.equal(repondre(salle, arbitre, { compter: -1 }), true);
  assert.equal(salle.etatMode.compteur, 1);
});

test('défi relevé dès que le compteur atteint l\'enchère : le relevant marque son enchère', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  allerAuDefi(t, salle);
  const { arbitre, auteur, enchere } = salle.etatMode;
  for (let i = 0; i < enchere - 1; i++) repondre(salle, arbitre, { compter: 1 });
  assert.equal(salle.etatMode.phase, 'defi');
  repondre(salle, arbitre, { compter: 1 });
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(vueTv(salle).releve, true);
  for (const joueur of joueurs) assert.equal(joueur.score, joueur.id === auteur ? enchere : 0, joueur.pseudo);
  const ligne = vueTv(salle).classement.find((l) => l.id === auteur);
  assert.equal(ligne.points, enchere);
});

test('défi raté à la fin des 60 s : +1 aux autres, rien au relevant ni à l\'arbitre', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  allerAuDefi(t, salle);
  const { arbitre, auteur } = salle.etatMode;
  repondre(salle, arbitre, { compter: 1 });
  t.mock.timers.tick(DUREE_DEFI_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(vueTv(salle).releve, false);
  for (const joueur of joueurs) {
    const attendu = joueur.id === auteur || joueur.id === arbitre ? 0 : 1;
    assert.equal(joueur.score, attendu, joueur.pseudo);
  }
  assert.ok(Object.values(scores(joueurs)).includes(1));
});

test('révélation : 10 s ou « Suivant » de l\'hôte, podium après la dernière manche', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ longueur: 5 });
  assert.equal(suivant(salle), false);
  allerAuDefi(t, salle);
  t.mock.timers.tick(DUREE_DEFI_MS);
  avancer(salle);
  const finRevelation = echeance(salle);
  assert.equal(finRevelation, Date.now() + DUREE_REVELATION_MS);
  t.mock.timers.tick(DUREE_REVELATION_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'encheres');
  assert.equal(salle.etatMode.indexQuestion, 1);
  assert.equal(salle.etatMode.compteur, 0);
  assert.equal(salle.etatMode.arbitre, null);
  for (let manche = 1; manche < 5; manche++) {
    allerAuDefi(t, salle);
    t.mock.timers.tick(DUREE_DEFI_MS);
    avancer(salle);
    assert.equal(suivant(salle), true);
  }
  assert.equal(salle.etat, 'podium');
});

test('arbitre déconnecté pendant le défi : remplacé, compteur gardé ; personne pour le remplacer : compteur figé', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  allerAuDefi(t, salle);
  const { arbitre, auteur } = salle.etatMode;
  repondre(salle, arbitre, { compter: 1 });
  joueurs.find((j) => j.id === arbitre).connecte = false;
  verifierFinAnticipee(salle);
  const nouveau = salle.etatMode.arbitre;
  assert.ok(nouveau && nouveau !== arbitre && nouveau !== auteur);
  assert.equal(salle.etatMode.compteur, 1);
  assert.equal(repondre(salle, nouveau, { compter: 1 }), true);
  assert.equal(salle.etatMode.compteur, 2);
  // Plus personne d'autre que le relevant.
  for (const joueur of joueurs) if (joueur.id !== auteur) joueur.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.arbitre, null);
  assert.equal(salle.etatMode.compteur, 2);
  assert.equal(repondre(salle, auteur, { compter: 1 }), false);
});

test('relevant déconnecté : le défi continue', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  allerAuDefi(t, salle);
  const { auteur, arbitre } = salle.etatMode;
  joueurs.find((j) => j.id === auteur).connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'defi');
  assert.equal(salle.etatMode.arbitre, arbitre);
});

// --- Vues ---

test('vues : la TV a le défi, l\'enchère et son auteur ; le compteur et l\'arbitre après l\'adjudication', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  const enEncheres = vueTv(salle);
  assert.equal(enEncheres.phase, 'encheres');
  assert.equal(enEncheres.defi.texte, texteDefi(salle.etatMode.questions[0].sujet));
  assert.equal(enEncheres.auteur, salle.etatMode.auteur);
  assert.equal(enEncheres.tempsRestantMs, DUREE_ENCHERES_MS);
  assert.ok(!('compteur' in enEncheres) && !('arbitre' in enEncheres));
  allerAuDefi(t, salle);
  const enDefi = vueTv(salle);
  assert.equal(enDefi.compteur, 0);
  assert.equal(enDefi.arbitre, salle.etatMode.arbitre);
  assert.equal(enDefi.tempsRestantMs, DUREE_DEFI_MS);
});

test('vues : chaque téléphone a son écran selon son rôle', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete();
  const auteurAvant = joueurs.find((j) => j.id === salle.etatMode.auteur);
  assert.equal(vueJoueur(salle, auteurAvant).ecran, 'encheres');
  assert.equal(vueJoueur(salle, auteurAvant).estAuteur, true);
  assert.equal(vueJoueur(salle, unAutre(salle, joueurs)).estAuteur, false);
  allerAuDefi(t, salle);
  const { auteur, arbitre } = salle.etatMode;
  const ecranDe = (joueur) => vueJoueur(salle, joueur).ecran;
  for (const joueur of joueurs) {
    let attendu = 'ecouter_defi';
    if (joueur.id === auteur) attendu = 'releve';
    else if (joueur.id === arbitre) attendu = 'arbitre';
    assert.equal(ecranDe(joueur), attendu, joueur.pseudo);
  }
  const retardataire = ajouterJoueur(salle, 'E', 'sE').joueur;
  assert.equal(ecranDe(retardataire), 'attente_question');
  t.mock.timers.tick(DUREE_DEFI_MS);
  avancer(salle);
  const roles = Object.fromEntries(joueurs.map((j) => [j.id, vueJoueur(salle, j).role]));
  assert.equal(roles[auteur], 'releveur');
  assert.equal(roles[arbitre], 'arbitre');
  const resultat = vueJoueur(salle, joueurs.find((j) => j.id !== auteur && j.id !== arbitre));
  assert.equal(resultat.ecran, 'resultat');
  assert.equal(resultat.points, 1);
});
