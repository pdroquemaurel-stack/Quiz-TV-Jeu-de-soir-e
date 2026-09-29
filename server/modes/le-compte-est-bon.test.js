import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  CIBLE_MAX, CIBLE_MIN, DUREE_RECHERCHE_MS, DUREE_REVELATION_MS, JEU_DE_PLAQUES, avancer, calculerResultats,
  demarrerPartie, echeance, enregistrerReponse, reglagesParDefaut, rejouerCalcul, resoudre, reveler, suivant,
  tirerManche, validerReglages, verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './le-compte-est-bon.js';

// Le mode n'est pas encore dans le registre (temps 2) : on appelle ses fonctions directement.
function sallePrete({ joueurs = ['A', 'B'], manches } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'le-compte-est-bon';
  if (manches) salle.reglagesMode['le-compte-est-bon'] = { ...reglagesParDefaut(), longueur: manches };
  salle.etat = 'partie';
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

const tirageCourant = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion];

// Les étapes telles que le téléphone les envoie, sans leur résultat.
const envoi = (etapes) => etapes.map(({ a, op, b }) => ({ a, op, b }));

// Le tirage de la manche en cours est remplacé par un tirage connu.
const TIRAGE = { plaques: [100, 25, 7, 7, 3, 1], cible: 742, solution: null };
function avecTirageConnu(salle) {
  salle.etatMode.questions[salle.etatMode.indexQuestion] = { ...TIRAGE, solution: resoudre(TIRAGE.plaques, TIRAGE.cible) };
}
// 100 × 7 = 700, 700 + 25 = 725 (à 17 de 742).
const CALCUL_725 = [{ a: 100, op: '*', b: 7 }, { a: 700, op: '+', b: 25 }];
// 100 × 7 = 700, 7 × 3 = 21, 700 + 21 = 721, 721 + 25 = 746 (à 4).
const CALCUL_746 = [{ a: 100, op: '*', b: 7 }, { a: 7, op: '*', b: 3 }, { a: 700, op: '+', b: 21 }, { a: 721, op: '+', b: 25 }];
// 7 × 3 = 21, 25 + 21 = 46 : un premier pas vers 746, loin.
const CALCUL_46 = [{ a: 7, op: '*', b: 3 }, { a: 25, op: '+', b: 21 }];
const proposer = (salle, joueur, etapes) => enregistrerReponse(salle, joueur.id, { action: 'proposer', etapes });
const exacte = (salle) => envoi(tirageCourant(salle).solution);

// --- Rejouer un calcul ---

test('rejouer : résultats recalculés par le serveur', () => {
  assert.deepEqual(rejouerCalcul(CALCUL_725, TIRAGE.plaques), [
    { a: 100, op: '*', b: 7, resultat: 700 },
    { a: 700, op: '+', b: 25, resultat: 725 },
  ]);
  assert.deepEqual(rejouerCalcul([{ a: 25, op: '/', b: 1 }, { a: 25, op: '-', b: 7 }], TIRAGE.plaques).at(-1).resultat, 18);
  assert.deepEqual(rejouerCalcul([], TIRAGE.plaques), []);
});

test('rejouer : une plaque tirée deux fois sert deux fois, pas trois', () => {
  assert.ok(rejouerCalcul([{ a: 7, op: '+', b: 7 }], TIRAGE.plaques));
  assert.equal(rejouerCalcul([{ a: 7, op: '+', b: 7 }, { a: 14, op: '+', b: 7 }], TIRAGE.plaques), null);
  assert.equal(rejouerCalcul([{ a: 25, op: '+', b: 25 }], TIRAGE.plaques), null);
});

test('rejouer : calculs interdits ou trafiqués refusés', () => {
  const invalides = [
    [{ a: 50, op: '+', b: 1 }], // plaque absente
    [{ a: 100, op: '+', b: 25 }, { a: 125, op: '+', b: 1 }, { a: 125, op: '+', b: 3 }], // résultat réutilisé
    [{ a: 3, op: '-', b: 7 }], // négatif
    [{ a: 7, op: '-', b: 7 }], // nul
    [{ a: 7, op: '/', b: 3 }], // à virgule
    [{ a: 7, op: '%', b: 3 }], // opération inconnue
    [{ a: '7', op: '+', b: 3 }], // pas un nombre
    [{ a: 7.5, op: '+', b: 3 }],
    [null],
    'CALCUL',
    null,
  ];
  for (const etapes of invalides) assert.equal(rejouerCalcul(etapes, TIRAGE.plaques), null, JSON.stringify(etapes));
  // 6 étapes : il n'y a jamais assez de nombres, mais la longueur est refusée d'abord.
  const six = Array(6).fill({ a: 1, op: '*', b: 1 });
  assert.equal(rejouerCalcul(six, [1, 1, 1, 1, 1, 1, 1]), null);
});

// --- Solution de l'ordinateur ---

test('solution : exacte, rejouable, la plus courte', () => {
  assert.deepEqual(resoudre([100, 25, 7, 7, 3, 1], 125), [{ a: 100, op: '+', b: 25, resultat: 125 }]);
  const solution = resoudre(TIRAGE.plaques, TIRAGE.cible);
  const rejouee = rejouerCalcul(envoi(solution), TIRAGE.plaques);
  assert.deepEqual(rejouee, solution);
  assert.equal(solution.at(-1).resultat, TIRAGE.cible);
  assert.equal(resoudre([100, 25, 7, 7, 3, 1], 700).length, 1);
});

test('solution : aucune sur un tirage impossible', () => {
  assert.equal(resoudre([1, 1, 2, 2, 3, 3], 999), null);
});

test('solution : moins de 300 ms par tirage, même sans solution', () => {
  for (const [plaques, cible] of [[[1, 1, 2, 2, 3, 3], 999], [[100, 75, 50, 25, 10, 9], 997]]) {
    const debut = performance.now();
    resoudre(plaques, cible);
    assert.ok(performance.now() - debut < 300, `${plaques} → ${cible} : ${performance.now() - debut} ms`);
  }
  const debut = performance.now();
  for (let i = 0; i < 10; i++) tirerManche();
  assert.ok(performance.now() - debut < 3000, `10 tirages : ${performance.now() - debut} ms`);
});

// --- Tirage ---

test('tirage : 6 plaques du jeu, cible de 101 à 999, toujours une solution exacte', () => {
  for (let i = 0; i < 200; i++) {
    const { plaques, cible, solution } = tirerManche();
    assert.equal(plaques.length, 6);
    for (const plaque of plaques) {
      const dansLeJeu = JEU_DE_PLAQUES.filter((p) => p === plaque).length;
      assert.ok(dansLeJeu > 0 && plaques.filter((p) => p === plaque).length <= dansLeJeu, plaques.join(' '));
    }
    assert.ok(Number.isInteger(cible) && cible >= CIBLE_MIN && cible <= CIBLE_MAX, String(cible));
    assert.equal(rejouerCalcul(envoi(solution), plaques).at(-1).resultat, cible, `${plaques} → ${cible}`);
  }
});

// --- Points ---

test('points : écart au-dessus comme au-dessous, 5 aux plus proches sans compte exact', () => {
  const p = (resultat, recuA) => ({ etapes: [], resultat, recuA });
  const lignes = calculerResultats({ a: [p(740, 1)], b: [p(744, 2)], c: [p(700, 3)], d: [] }, 742);
  assert.deepEqual(lignes.map((l) => [l.id, l.ecart, l.points]), [['a', 2, 5], ['b', 2, 5], ['c', 42, 0]]);
  assert.deepEqual(Object.keys(lignes[0]).sort(), ['ecart', 'etapes', 'id', 'points', 'resultat']);
  const loin = calculerResultats({ a: [p(101, 1)] }, 999);
  assert.equal(loin[0].points, 5, 'le plus proche marque, même très loin');
});

test('points : compte exact 10 à tous ceux qui l\'ont, rien aux autres', () => {
  const p = (resultat, recuA) => ({ etapes: [], resultat, recuA });
  const lignes = calculerResultats({ a: [p(741, 1)], b: [p(742, 3)], c: [p(742, 2)] }, 742);
  assert.deepEqual(lignes.map((l) => [l.id, l.points]), [['c', 10], ['b', 10], ['a', 0]]);
});

test('points : la meilleure des propositions est gardée, la première à égalité', () => {
  const lignes = calculerResultats({
    a: [
      { etapes: ['premier'], resultat: 700, recuA: 1 },
      { etapes: ['meilleur'], resultat: 740, recuA: 2 },
      { etapes: ['même écart'], resultat: 744, recuA: 3 },
    ],
  }, 742);
  assert.deepEqual([lignes[0].resultat, lignes[0].etapes], [740, ['meilleur']]);
});

// --- Réglages ---

test('réglages : 3, 5 ou 7 manches, 45, 60 ou 90 s, 5 manches de 60 s par défaut', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 5, temps: 60 });
  for (const longueur of [3, 5, 7]) {
    for (const temps of [45, 60, 90]) assert.deepEqual(validerReglages({ longueur, temps }), { longueur, temps });
  }
  for (const donnees of [{ longueur: 6, temps: 60 }, { longueur: 5, temps: 30 }, { longueur: '5', temps: 60 }, {}, null]) {
    assert.equal(validerReglages(donnees), null, JSON.stringify(donnees));
  }
  const salle = creerSalle('tv');
  salle.reglagesMode['le-compte-est-bon'] = { longueur: 3, temps: 90 };
  assert.equal(vueReglages(salle).resume, '3 manches · 90 s');
});

test('partie : 5 manches par défaut, 7 si l\'hôte l\'a choisi', () => {
  assert.equal(sallePrete().salle.etatMode.questions.length, 5);
  assert.equal(sallePrete({ manches: 7 }).salle.etatMode.questions.length, 7);
});

// --- Calculs des joueurs ---

test('proposer : jusqu\'à 3 propositions, fini à la troisième', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avecTirageConnu(salle);
  assert.equal(proposer(salle, a, CALCUL_46), true);
  assert.equal(proposer(salle, a, CALCUL_725), true);
  assert.equal(salle.etatMode.reponses[a.id], undefined);
  assert.equal(proposer(salle, a, CALCUL_725), true, 'même résultat : une proposition de plus');
  assert.ok(salle.etatMode.reponses[a.id]);
  assert.equal(proposer(salle, a, CALCUL_746), false);
  assert.deepEqual(salle.etatMode.propositions[a.id].map((p) => p.resultat), [46, 725, 725]);
});

test('proposer : fini dès le compte exact', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(proposer(salle, a, exacte(salle)), true);
  assert.ok(salle.etatMode.reponses[a.id]);
});

test('« J\'ai fini » : seulement après une proposition', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avecTirageConnu(salle);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'fini' }), false);
  proposer(salle, a, CALCUL_725);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'fini' }), true);
  assert.ok(salle.etatMode.reponses[a.id]);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'fini' }), false);
});

test('brouillon : gardé avec ses résultats, remplacé par le suivant, sans rien à diffuser', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avecTirageConnu(salle);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'brouillon', etapes: CALCUL_46 }), false);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'brouillon', etapes: CALCUL_725 }), false);
  assert.equal(salle.etatMode.brouillons[a.id].at(-1).resultat, 725);
  assert.equal(enregistrerReponse(salle, a.id, { action: 'brouillon', etapes: [] }), false);
  assert.deepEqual(salle.etatMode.brouillons[a.id], []);
  assert.deepEqual(salle.etatMode.propositions, {});
});

test('calcul : envois trafiqués refusés sans message', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avecTirageConnu(salle);
  const invalides = [
    null, 'CALCUL', 42, {}, { action: 'proposer' }, { action: 'proposer', etapes: 'CALCUL' },
    { action: 'proposer', etapes: [] }, { action: 'deviner', etapes: CALCUL_725 }, { etapes: CALCUL_725 },
    { action: 'proposer', etapes: [{ a: 3, op: '-', b: 7 }] }, { action: 'brouillon', etapes: [{ a: 50, op: '+', b: 1 }] },
  ];
  for (const donnees of invalides) assert.equal(enregistrerReponse(salle, a.id, donnees), false, JSON.stringify(donnees));
  assert.deepEqual(salle.etatMode.brouillons, {});
  assert.deepEqual(salle.etatMode.propositions, {});
});

test('calcul : refusé d\'un joueur non attendu ou hors recherche', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avecTirageConnu(salle);
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.equal(proposer(salle, retard, CALCUL_725), false);
  assert.equal(enregistrerReponse(salle, retard.id, { action: 'brouillon', etapes: CALCUL_725 }), false);
  assert.deepEqual(salle.etatMode.brouillons, {});
  reveler(salle);
  assert.equal(proposer(salle, a, CALCUL_725), false);
});

// --- Enchaînement ---

test('fin anticipée : tous les attendus ont fini', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  proposer(salle, a, exacte(salle));
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'recherche');
  proposer(salle, b, exacte(salle));
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin anticipée : le dernier attendu se déconnecte', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  proposer(salle, a, exacte(salle));
  b.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin du chrono : les brouillons deviennent des propositions, sauf vides ou déjà proposés', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b, c, d, e] } = sallePrete({ joueurs: ['A', 'B', 'C', 'D', 'E'] });
  avecTirageConnu(salle);
  enregistrerReponse(salle, a.id, { action: 'brouillon', etapes: CALCUL_746 }); // à 4 : le plus proche
  proposer(salle, b, CALCUL_725);
  enregistrerReponse(salle, b.id, { action: 'brouillon', etapes: CALCUL_725 }); // déjà proposé
  enregistrerReponse(salle, c.id, { action: 'brouillon', etapes: [] });
  proposer(salle, d, CALCUL_46);
  enregistrerReponse(salle, d.id, { action: 'fini' });
  enregistrerReponse(salle, d.id, { action: 'brouillon', etapes: CALCUL_746 }); // refusé : D a fini
  assert.equal(echeance(salle), DUREE_RECHERCHE_MS);
  t.mock.timers.tick(DUREE_RECHERCHE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.equal(salle.etatMode.propositions[b.id].length, 1);
  assert.deepEqual([a.score, b.score, c.score, d.score, e.score], [5, 0, 0, 0, 0]);
  assert.deepEqual(vueTv(salle).sansReponse, [c.id, e.id]);
});

test('points : le compte exact prend tout', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  avecTirageConnu(salle);
  proposer(salle, a, exacte(salle));
  proposer(salle, b, CALCUL_746);
  proposer(salle, c, exacte(salle));
  reveler(salle);
  assert.deepEqual([a.score, b.score, c.score], [10, 0, 10]);
});

test('révélation : 20 s puis manche suivante, podium après la dernière', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ manches: 3 });
  for (let manche = 1; manche <= 3; manche++) {
    assert.equal(salle.etatMode.indexQuestion, manche - 1);
    avancer(salle);
    assert.equal(salle.etatMode.phase, 'revelation');
    assert.equal(echeance(salle), Date.now() + DUREE_REVELATION_MS);
    t.mock.timers.tick(DUREE_REVELATION_MS);
    avancer(salle);
  }
  assert.equal(salle.etat, 'podium');
});

test('« Suivant » : seulement pendant la révélation', () => {
  const { salle } = sallePrete();
  assert.equal(suivant(salle), false);
  reveler(salle);
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.phase, 'recherche');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('points ajoutés à la révélation seulement', () => {
  const { salle, joueurs: [a] } = sallePrete();
  proposer(salle, a, exacte(salle));
  assert.equal(a.score, 0);
  assert.equal(vueTv(salle).classement, undefined);
  reveler(salle);
  assert.equal(a.score, 10);
});

// --- Le secret ---

test('secret : pendant la recherche, ni la solution ni les calculs des autres', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  avecTirageConnu(salle);
  proposer(salle, a, CALCUL_746);
  enregistrerReponse(salle, b.id, { action: 'brouillon', etapes: CALCUL_725 });
  // Un nombre dans le JSON, pas un morceau d'id de joueur (j_a725…).
  const contientNombre = (vue, nombre) => new RegExp(`[:,\\[]${nombre}\\b`).test(JSON.stringify(vue));
  const tv = JSON.stringify(vueTv(salle));
  for (const interdit of ['solution', 'etapes', 'resultat']) assert.equal(tv.includes(interdit), false, `TV : ${interdit}`);
  assert.equal(contientNombre(vueTv(salle), 746) || contientNombre(vueTv(salle), 725), false, 'TV : aucun calcul');
  const vueA = vueJoueur(salle, a);
  const vueB = vueJoueur(salle, b);
  assert.equal('solution' in vueA || 'solution' in vueB, false);
  assert.equal(contientNombre(vueA, 725), false, 'pas le brouillon de B chez A');
  assert.equal(contientNombre(vueB, 746), false, 'pas la proposition de A chez B');
});

test('vues du téléphone : recherche, fini, résultat, arrivée en cours de manche', () => {
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  avecTirageConnu(salle);
  const { plaques, cible, solution } = tirageCourant(salle);
  const manche = { numero: 1, total: 5, plaques, cible };
  assert.deepEqual(vueJoueur(salle, a), { ecran: 'recherche', ...manche, etapes: [], propositions: [] });
  enregistrerReponse(salle, a.id, { action: 'brouillon', etapes: CALCUL_725 });
  proposer(salle, a, CALCUL_746);
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'recherche', ...manche, etapes: rejouerCalcul(CALCUL_725, plaques), propositions: [{ resultat: 746, ecart: 4 }],
  });
  enregistrerReponse(salle, a.id, { action: 'fini' });
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'fini', ...manche, propositions: [{ resultat: 746, ecart: 4 }], nbFinis: 1, nbAttendus: 3,
  });
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.deepEqual(vueJoueur(salle, retard), { ecran: 'attente_question' });
  reveler(salle);
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'resultat', ...manche, resultat: 746, ecart: 4, etapes: rejouerCalcul(CALCUL_746, plaques),
    points: 5, solution, rang: 1,
  });
  const sansProposition = vueJoueur(salle, b);
  assert.deepEqual([sansProposition.resultat, sansProposition.ecart, sansProposition.points], [null, null, 0]);
});

test('vue TV : plaques, cible et chrono, puis résultats, solution et classement', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { plaques, cible, solution } = tirageCourant(salle);
  const recherche = vueTv(salle);
  assert.deepEqual(Object.keys(recherche).sort(), ['cible', 'numero', 'ontRepondu', 'phase', 'plaques', 'tempsRestantMs', 'total']);
  assert.deepEqual([recherche.plaques, recherche.cible], [plaques, cible]);
  proposer(salle, a, exacte(salle));
  assert.deepEqual(vueTv(salle).ontRepondu, [a.id]);
  reveler(salle);
  const tv = vueTv(salle);
  assert.deepEqual(tv.solution, solution);
  assert.deepEqual(tv.resultats.map((l) => [l.id, l.ecart, l.points]), [[a.id, 0, 10]]);
  assert.equal(tv.classement[0].points, 10);
});
