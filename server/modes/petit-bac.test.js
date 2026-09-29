import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  CATEGORIES, DUREE_APRES_STOP_MS, DUREE_BILAN_MS, DUREE_ECRITURE_MS, LETTRES_RARES, avancer, calculerPoints,
  commenceParLettre, demarrerPartie, echeance, enregistrerReponse, finirEcriture, nettoyerTextes, reglagesParDefaut,
  suivant, tirerManches, validerReglages, verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './petit-bac.js';

// On appelle les fonctions du mode directement, sans passer par le registre.
function sallePrete({ joueurs = ['A', 'B'], manches } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'petit-bac';
  if (manches) salle.reglagesMode['petit-bac'] = { ...reglagesParDefaut(), longueur: manches };
  salle.etat = 'partie';
  demarrerPartie(salle);
  avecLettre(salle, 'M');
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

// La lettre de la manche en cours est remplacée par une lettre connue.
function avecLettre(salle, lettre) {
  salle.etatMode.questions[salle.etatMode.indexQuestion].lettre = lettre;
}

const PLEIN = ['Martin', 'Maroc', 'Marseille', 'Marmotte', 'Mangue', 'Maçon'];
const VIDE = ['', '', '', '', '', ''];
const ecrire = (salle, joueur, textes) => enregistrerReponse(salle, joueur.id, { action: 'ecrire', textes });
const stop = (salle, joueur, textes = PLEIN) => enregistrerReponse(salle, joueur.id, { action: 'stop', textes });
const basculer = (salle, joueur, joueurId, categorie = salle.etatMode.indexCategorie) => (
  enregistrerReponse(salle, joueur.id, { action: 'basculer', categorie, joueurId })
);
const allerA = (salle, joueur, index) => enregistrerReponse(salle, joueur.id, { action: 'categorie', index });

// --- La lettre ---

test('lettre : accents, majuscules, espaces et article en tête ignorés', () => {
  const acceptes = [
    ['Maroc', 'M'], ['maroc', 'M'], ['  Maroc', 'M'], ['Élan', 'E'], ['Œuf', 'O'], ['Le Havre', 'H'],
    ["L'Oréal", 'O'], ['L’Oréal', 'O'], ['Les Simpson', 'S'], ['Lion', 'L'], ['Le', 'L'], ['Ça', 'C'],
  ];
  for (const [texte, lettre] of acceptes) assert.equal(commenceParLettre(texte, lettre), true, `${texte} (${lettre})`);
  const refuses = [['Paris', 'M'], ['', 'M'], ['123', 'M'], ['Le', 'M'], ['Lemans', 'M'], ['-Maroc', 'M']];
  for (const [texte, lettre] of refuses) assert.equal(commenceParLettre(texte, lettre), false, `${texte} (${lettre})`);
});

test('nettoyage : espaces retirés et réduits, 6 textes de 30 caractères au plus', () => {
  assert.deepEqual(nettoyerTextes(['  Maroc ', 'Le   Mans', '', '   ', 'a', 'b']), ['Maroc', 'Le Mans', '', '', 'a', 'b']);
  assert.ok(nettoyerTextes(['x'.repeat(30), '', '', '', '', '']));
  const invalides = [['x'.repeat(31), '', '', '', '', ''], ['', '', '', '', ''], [...VIDE, ''], [1, '', '', '', '', ''], 'MAROC', null];
  for (const textes of invalides) assert.equal(nettoyerTextes(textes), null, JSON.stringify(textes));
});

// --- Tirage ---

test('tirage : 6 catégories distinctes dans l\'ordre de la liste, lettres toutes différentes, sans lettres rares', () => {
  const vues = new Set();
  for (let i = 0; i < 1000; i++) {
    const manches = tirerManches(7, false);
    assert.equal(manches.length, 7);
    const lettres = manches.map((m) => m.lettre);
    assert.equal(new Set(lettres).size, 7, lettres.join(''));
    for (const { lettre, categories } of manches) {
      assert.equal(LETTRES_RARES.includes(lettre), false, lettre);
      vues.add(lettre);
      assert.equal(categories.length, 6);
      assert.deepEqual(categories, CATEGORIES.filter((c) => categories.includes(c)), 'ordre de la liste, sans doublon');
    }
  }
  assert.equal(vues.size, 20);
});

test('tirage : avec l\'option, les 26 lettres possibles', () => {
  const vues = new Set();
  for (let i = 0; i < 1000; i++) for (const { lettre } of tirerManches(7, true)) vues.add(lettre);
  assert.equal(vues.size, 26);
});

// --- Points ---

test('points : 1 par réponse acceptée, identiques comprises', () => {
  assert.deepEqual(calculerPoints({
    a: [true, true, false, true, false, false],
    b: [true, true, true, true, true, true],
    c: [false, false, false, false, false, false],
  }), { a: 3, b: 6, c: 0 });
});

test('points : deux réponses identiques valent 1 point chacune', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  stop(salle, a);
  stop(salle, b);
  verifierFinAnticipee(salle);
  allerA(salle, a, 5);
  suivant(salle);
  assert.deepEqual([a.score, b.score], [6, 6]);
});

// --- Réglages ---

test('réglages : 3, 5 ou 7 manches, 60, 90 ou 120 s, lettres rares ; 5, 90 et sans par défaut', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 5, temps: 90, lettresRares: false });
  for (const longueur of [3, 5, 7]) {
    for (const temps of [60, 90, 120]) {
      for (const lettresRares of [true, false]) {
        assert.deepEqual(validerReglages({ longueur, temps, lettresRares }), { longueur, temps, lettresRares });
      }
    }
  }
  const invalides = [
    { longueur: 6, temps: 90, lettresRares: false }, { longueur: 5, temps: 45, lettresRares: false },
    { longueur: 5, temps: 90 }, { longueur: 5, temps: 90, lettresRares: 'oui' }, {}, null,
  ];
  for (const donnees of invalides) assert.equal(validerReglages(donnees), null, JSON.stringify(donnees));
  const salle = creerSalle('tv');
  assert.equal(vueReglages(salle).resume, '5 manches · 90 s · sans K Q W X Y Z');
  salle.reglagesMode['petit-bac'] = { longueur: 3, temps: 120, lettresRares: true };
  assert.equal(vueReglages(salle).resume, '3 manches · 120 s · avec K Q W X Y Z');
  assert.deepEqual(vueReglages(salle).valeurs, { longueur: 3, temps: 120, lettresRares: true });
});

test('partie : 5 manches par défaut, 7 si l\'hôte l\'a choisi, lettres rares si l\'option est choisie', () => {
  assert.equal(sallePrete().salle.etatMode.questions.length, 5);
  assert.equal(sallePrete({ manches: 7 }).salle.etatMode.questions.length, 7);
  const vues = new Set();
  for (let i = 0; i < 100; i++) {
    const salle = creerSalle('tv');
    ajouterJoueur(salle, 'A', 's0');
    salle.reglagesMode['petit-bac'] = { longueur: 7, temps: 90, lettresRares: true };
    salle.etat = 'partie';
    demarrerPartie(salle);
    for (const { lettre } of salle.etatMode.questions) vues.add(lettre);
  }
  assert.ok(LETTRES_RARES.some((lettre) => vues.has(lettre)));
});

// --- Écriture ---

test('écrire : les cases sont remplacées à chaque envoi, sans rien à diffuser', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(ecrire(salle, a, ['Ma', '', '', '', '', '']), false);
  assert.equal(ecrire(salle, a, ['  Martin ', 'Maroc', '', '', '', '']), false);
  assert.deepEqual(salle.etatMode.textes[a.id], ['Martin', 'Maroc', '', '', '', '']);
  assert.deepEqual(salle.etatMode.reponses, {});
});

test('écrire : envois trafiqués refusés sans message', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const invalides = [
    null, 'MAROC', 42, {}, { action: 'ecrire' }, { action: 'ecrire', textes: 'Maroc' },
    { action: 'ecrire', textes: ['Maroc'] }, { action: 'ecrire', textes: ['x'.repeat(31), '', '', '', '', ''] },
    { action: 'deviner', textes: PLEIN }, { textes: PLEIN }, { action: 'categorie', index: 1 },
  ];
  for (const donnees of invalides) assert.equal(enregistrerReponse(salle, a.id, donnees), false, JSON.stringify(donnees));
  assert.deepEqual(salle.etatMode.textes, {});
  assert.equal(salle.etatMode.stop, null);
});

test('écrire : refusé d\'un joueur non attendu ou qui a fini', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.equal(ecrire(salle, retard, PLEIN), false);
  assert.equal(stop(salle, retard), false);
  stop(salle, a);
  ecrire(salle, a, VIDE);
  assert.deepEqual(salle.etatMode.textes[a.id], PLEIN);
  assert.equal(stop(salle, a), false);
  assert.equal(salle.etatMode.textes[retard.id], undefined);
});

test('STOP : il faut 6 cases qui commencent par la lettre', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(stop(salle, a, ['Martin', 'Maroc', 'Marseille', 'Marmotte', 'Mangue', '']), false);
  assert.equal(stop(salle, a, ['Martin', 'Maroc', 'Marseille', 'Marmotte', 'Mangue', 'Plombier']), false);
  assert.equal(salle.etatMode.stop, null);
  assert.equal(stop(salle, a, ['Martin', 'Maroc', 'Le Mans', 'Marmotte', 'Mangue', 'Maçon']), true);
  assert.equal(salle.etatMode.stop.id, a.id);
  assert.ok(salle.etatMode.reponses[a.id]);
});

test('« J\'ai fini » après un STOP : accepté avec des cases vides, sans changer le STOP', () => {
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  assert.equal(stop(salle, b, ['Maman', '', '', '', '', '']), false, 'pas de STOP sans les 6 cases');
  stop(salle, a);
  assert.equal(stop(salle, b, ['Maman', '', '', '', '', '']), true);
  assert.equal(salle.etatMode.stop.id, a.id);
  assert.deepEqual(salle.etatMode.textes[b.id], ['Maman', '', '', '', '', '']);
  assert.deepEqual(Object.keys(salle.etatMode.reponses), [a.id, b.id]);
});

// --- Chrono ---

test('chrono : sans STOP, fin à 90 s', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  assert.equal(echeance(salle), DUREE_ECRITURE_MS);
  t.mock.timers.tick(DUREE_ECRITURE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'bilan', 'personne n\'a rien écrit : bilan direct');
});

test('chrono : le STOP laisse 10 s, sans jamais prolonger', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a] } = sallePrete({ joueurs: ['A', 'B'] });
  t.mock.timers.tick(30000);
  stop(salle, a);
  assert.equal(echeance(salle), 30000 + DUREE_APRES_STOP_MS);
  assert.equal(vueTv(salle).tempsRestantMs, DUREE_APRES_STOP_MS);

  // Une seconde salle, lancée à 30 s : STOP 85 s après son début, il ne reste que 5 s.
  const { salle: tard, joueurs: [c] } = sallePrete();
  t.mock.timers.tick(85000);
  stop(tard, c);
  assert.equal(echeance(tard), 30000 + DUREE_ECRITURE_MS);
});

test('chrono : le temps choisi par l\'hôte', () => {
  const { salle } = sallePrete();
  salle.reglagesMode['petit-bac'] = { longueur: 5, temps: 120, lettresRares: false };
  assert.equal(echeance(salle), salle.etatMode.debutPhaseA + 120000);
});

test('fin anticipée : tous les attendus ont fini', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  stop(salle, a);
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'ecriture');
  stop(salle, b, VIDE);
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'validation');
});

test('fin anticipée : le dernier attendu se déconnecte, ses cases comptent', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  ecrire(salle, b, ['Marie', '', '', '', '', '']);
  stop(salle, a);
  b.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'validation');
  assert.deepEqual(salle.etatMode.acceptees[b.id], [true, false, false, false, false, false]);
});

// --- Validation ---

test('validation : acceptées d\'office si remplies et commençant par la lettre', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  ecrire(salle, a, ['Martin', 'Pérou', '', 'Le Mouton', 'Mangue', 'Maçon']);
  ecrire(salle, c, VIDE);
  finirEcriture(salle);
  assert.equal(salle.etatMode.phase, 'validation');
  assert.equal(salle.etatMode.indexCategorie, 0);
  assert.deepEqual(salle.etatMode.acceptees, { [a.id]: [true, false, false, true, true, true] });
  const tv = vueTv(salle);
  assert.deepEqual(tv.lignes, [{
    id: a.id, textes: ['Martin', 'Pérou', '', 'Le Mouton', 'Mangue', 'Maçon'],
    acceptees: [true, false, false, true, true, true], horsLettre: [false, true, false, false, false, false],
  }]);
  assert.deepEqual(tv.sansReponse, [b.id, c.id]);
});

test('validation : l\'hôte seul bascule, jamais une case vide ni une autre catégorie', () => {
  const { salle, joueurs: [hote, b] } = sallePrete();
  assert.equal(salle.hoteId, hote.id);
  ecrire(salle, b, ['Marie', 'Pérou', '', '', '', '']);
  finirEcriture(salle);
  assert.equal(basculer(salle, b, b.id), false, 'pas l\'hôte');
  assert.equal(basculer(salle, hote, b.id, 1), false, 'pas la catégorie affichée');
  assert.equal(basculer(salle, hote, hote.id), false, 'l\'hôte n\'a rien écrit');
  assert.equal(basculer(salle, hote, 'inconnu'), false);
  assert.equal(basculer(salle, hote, b.id), true);
  assert.deepEqual(salle.etatMode.acceptees[b.id], [false, false, false, false, false, false]);
  assert.equal(allerA(salle, hote, 1), true);
  assert.equal(basculer(salle, hote, b.id), true, 'réaccepter une réponse refusée d\'office');
  assert.deepEqual(salle.etatMode.acceptees[b.id], [false, true, false, false, false, false]);
  allerA(salle, hote, 2);
  assert.equal(basculer(salle, hote, b.id), false, 'case vide');
});

test('validation : changer de catégorie, de l\'hôte seulement, de 0 à 5', () => {
  const { salle, joueurs: [hote, b] } = sallePrete();
  stop(salle, hote);
  finirEcriture(salle);
  assert.equal(allerA(salle, b, 1), false);
  for (const index of [-1, 6, 1.5, '1', null]) assert.equal(allerA(salle, hote, index), false, String(index));
  assert.equal(allerA(salle, hote, 0), false, 'déjà affichée : un double appui ne change rien');
  assert.equal(allerA(salle, hote, 3), true);
  assert.equal(allerA(salle, hote, 2), true, '« ← Précédente »');
  assert.equal(salle.etatMode.indexCategorie, 2);
});

test('validation : « Voir les scores » sur la 6ᵉ catégorie seulement, pas de chrono', () => {
  const { salle, joueurs: [hote] } = sallePrete();
  stop(salle, hote);
  finirEcriture(salle);
  assert.equal(echeance(salle), null);
  assert.equal(suivant(salle), false);
  allerA(salle, hote, 4);
  assert.equal(suivant(salle), false);
  allerA(salle, hote, 5);
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.phase, 'bilan');
});

test('validation : les gestes sont ignorés hors validation', () => {
  const { salle, joueurs: [hote] } = sallePrete();
  stop(salle, hote);
  assert.equal(allerA(salle, hote, 1), false);
  finirEcriture(salle);
  allerA(salle, hote, 5);
  suivant(salle);
  assert.equal(allerA(salle, hote, 1), false);
  assert.equal(basculer(salle, hote, hote.id, 5), false);
});

// --- Bilan et enchaînement ---

test('bilan : points ajoutés au début du bilan seulement', () => {
  const { salle, joueurs: [hote, b] } = sallePrete();
  stop(salle, hote);
  stop(salle, b, ['Marie', 'Pérou', '', '', '', '']);
  finirEcriture(salle);
  basculer(salle, hote, hote.id);
  assert.deepEqual([hote.score, b.score], [0, 0]);
  assert.equal(vueTv(salle).classement, undefined);
  allerA(salle, hote, 5);
  suivant(salle);
  assert.deepEqual([hote.score, b.score], [5, 1]);
  const tv = vueTv(salle);
  assert.deepEqual(tv.points, [{ id: hote.id, points: 5 }, { id: b.id, points: 1 }]);
  assert.equal(tv.classement[0].points, 5);
});

test('bilan : 15 s puis manche suivante, podium après la dernière', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ manches: 3 });
  for (let manche = 1; manche <= 3; manche++) {
    assert.equal(salle.etatMode.indexQuestion, manche - 1);
    assert.equal(salle.etatMode.phase, 'ecriture');
    avancer(salle); // personne n'a rien écrit : bilan direct
    assert.equal(salle.etatMode.phase, 'bilan');
    assert.equal(echeance(salle), Date.now() + DUREE_BILAN_MS);
    t.mock.timers.tick(DUREE_BILAN_MS);
    avancer(salle);
  }
  assert.equal(salle.etat, 'podium');
});

test('« Suivant » : pendant le bilan, manche suivante avec tout remis à zéro', () => {
  const { salle, joueurs: [hote] } = sallePrete();
  assert.equal(suivant(salle), false);
  stop(salle, hote);
  finirEcriture(salle);
  allerA(salle, hote, 5);
  suivant(salle);
  assert.equal(suivant(salle), true);
  const { phase, indexQuestion, textes, stop: leStop, reponses, acceptees, indexCategorie } = salle.etatMode;
  assert.deepEqual({ phase, indexQuestion, textes, leStop, reponses, acceptees, indexCategorie }, {
    phase: 'ecriture', indexQuestion: 1, textes: {}, leStop: null, reponses: {}, acceptees: {}, indexCategorie: 0,
  });
});

test('l\'hôte termine pendant la validation : la manche n\'est pas comptée', () => {
  const { salle, joueurs: [hote] } = sallePrete();
  stop(salle, hote);
  finirEcriture(salle);
  salle.etat = 'podium'; // ce que fait terminerPartie
  assert.equal(hote.score, 0);
  assert.equal(vueTv(salle).classement[0].points, 0);
});

// --- Le secret ---

test('secret : pendant l\'écriture, ni la TV ni les autres ne voient les cases d\'un joueur', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  ecrire(salle, a, ['Martin', 'Maroc', '', '', '', '']);
  stop(salle, b, ['Mireille', 'Mali', 'Metz', 'Merle', 'Melon', 'Médecin']);
  const tv = JSON.stringify(vueTv(salle));
  for (const interdit of ['Martin', 'Maroc', 'Mireille', 'Médecin', 'textes']) assert.equal(tv.includes(interdit), false, `TV : ${interdit}`);
  assert.equal(JSON.stringify(vueJoueur(salle, a)).includes('Mireille'), false);
  assert.equal(JSON.stringify(vueJoueur(salle, b)).includes('Martin'), false);
});

test('secret : pendant la validation, seul l\'hôte reçoit les réponses des autres', () => {
  const { salle, joueurs: [hote, b, c] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  ecrire(salle, b, ['Marie', '', '', '', '', '']);
  ecrire(salle, c, ['Mathis', '', '', '', '', '']);
  finirEcriture(salle);
  assert.equal(JSON.stringify(vueJoueur(salle, b)).includes('Mathis'), false);
  assert.equal(JSON.stringify(vueJoueur(salle, c)).includes('Marie'), false);
  const vueHote = JSON.stringify(vueJoueur(salle, hote));
  assert.ok(vueHote.includes('Marie') && vueHote.includes('Mathis'));
});

// --- Vues ---

test('vues du téléphone : écriture, STOP, fini, arrivée en cours de manche', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['Léa', 'Tom', 'Zoé'] });
  const { categories } = salle.etatMode.questions[0];
  const manche = { numero: 1, total: 5, lettre: 'M', categories };
  assert.deepEqual(vueJoueur(salle, b), { ecran: 'ecriture', ...manche, textes: VIDE, stop: null, tempsRestantMs: null });
  ecrire(salle, b, ['Marie', '', '', '', '', '']);
  t.mock.timers.tick(4000);
  stop(salle, a);
  assert.deepEqual(vueJoueur(salle, b), {
    ecran: 'ecriture', ...manche, textes: ['Marie', '', '', '', '', ''], stop: 'Léa', tempsRestantMs: DUREE_APRES_STOP_MS,
  });
  assert.deepEqual(vueJoueur(salle, a), { ecran: 'fini', ...manche, textes: PLEIN, nbFinis: 1, nbAttendus: 3 });
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.deepEqual(vueJoueur(salle, retard), { ecran: 'attente_question' });
});

test('vues du téléphone : validation des joueurs et de l\'hôte, bilan', () => {
  const { salle, joueurs: [hote, b, c] } = sallePrete({ joueurs: ['Léa', 'Tom', 'Zoé'] });
  const { categories } = salle.etatMode.questions[0];
  const manche = { numero: 1, total: 5, lettre: 'M', categories };
  ecrire(salle, b, ['Marie', 'Pérou', '', '', '', '']);
  finirEcriture(salle);
  allerA(salle, hote, 1);
  const validation = { ...manche, categorie: categories[1], indexCategorie: 1 };
  assert.deepEqual(vueJoueur(salle, b), {
    ecran: 'validation', ...validation, maReponse: { texte: 'Pérou', acceptee: false }, pointsProvisoires: 1,
  });
  assert.deepEqual(vueJoueur(salle, c), { ecran: 'validation', ...validation, maReponse: null, pointsProvisoires: 0 });
  assert.deepEqual(vueJoueur(salle, hote), {
    ecran: 'validation_hote', ...validation, maReponse: null, pointsProvisoires: 0,
    lignes: [
      { id: hote.id, pseudo: 'Léa', texte: '', acceptee: false, horsLettre: false },
      { id: b.id, pseudo: 'Tom', texte: 'Pérou', acceptee: false, horsLettre: true },
      { id: c.id, pseudo: 'Zoé', texte: '', acceptee: false, horsLettre: false },
    ],
  });
  allerA(salle, hote, 5);
  suivant(salle);
  assert.deepEqual(vueJoueur(salle, b), {
    ecran: 'bilan', ...manche, textes: ['Marie', 'Pérou', '', '', '', ''],
    acceptees: [true, false, false, false, false, false], points: 1, rang: 1,
  });
  assert.deepEqual(vueJoueur(salle, c), { ecran: 'bilan', ...manche, textes: VIDE, acceptees: Array(6).fill(false), points: 0, rang: 2 });
});

test('vue de l\'hôte : les réponses à valider, même arrivé en cours de manche', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  ecrire(salle, b, ['Marie', '', '', '', '', '']);
  const { joueur: nouveau } = ajouterJoueur(salle, 'Nouveau', 's9');
  finirEcriture(salle);
  salle.hoteId = nouveau.id; // l'hôte s'est déconnecté, le rôle est passé
  assert.equal(vueJoueur(salle, nouveau).ecran, 'validation_hote');
  assert.equal(basculer(salle, nouveau, b.id), true);
  assert.equal(vueJoueur(salle, a).ecran, 'validation');
});

test('vue TV : lettre, catégories et chrono, qui a fini et qui a crié STOP', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const ecriture = vueTv(salle);
  assert.deepEqual(Object.keys(ecriture).sort(), ['categories', 'lettre', 'numero', 'ontRepondu', 'phase', 'stop', 'tempsRestantMs', 'total']);
  assert.deepEqual([ecriture.lettre, ecriture.stop, ecriture.ontRepondu], ['M', null, []]);
  stop(salle, a);
  assert.deepEqual([vueTv(salle).stop, vueTv(salle).ontRepondu], [a.id, [a.id]]);
  finirEcriture(salle);
  assert.deepEqual(Object.keys(vueTv(salle)).sort(), ['categories', 'indexCategorie', 'lettre', 'lignes', 'numero', 'phase', 'sansReponse', 'total']);
});
