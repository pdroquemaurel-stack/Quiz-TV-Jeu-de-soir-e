import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, passerApresPodium, synchroniserMinuteur,
  terminerPartie, vueJoueur, vueTv,
} from '../salles.js';
import { modes, modesAVenir } from './index.js';
import {
  NOMBRE_QUESTIONS, avancer, banqueBluff, calculerPoints, enregistrerReponse, estLaVerite,
  formerPropositions, presenter, suivant, verifierFinAnticipee,
} from './bluff.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_MEME_REPONSE } from './meme-reponse.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_QUIZ } from './quiz.js';

const PSEUDOS = ['Paul', 'Léa', 'Sam', 'Tom', 'Zoé'];

const SUMO = {
  id: 'b9999',
  texte: 'Au sumo, les lutteurs lancent du ___ sur le ring',
  reponse: 'Sel',
  variantes: ['Gros sel'],
};

// n joueurs, mode Le bluff, partie lancée sur une question connue.
function sallePrete(n = 4) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'bluff'), true);
  demarrerPartie(salle);
  salle.etatMode.questions[0] = SUMO;
  return { salle, joueurs };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

function quandAvance(salle) {
  synchroniserMinuteur(salle, quandAvance);
}

const etape = (salle) => (salle.etat === 'partie' ? salle.etatMode.phase : salle.etat);

// Bluffs fictifs : { joueur: texte } → le format de etatMode.bluffs, arrivés dans l'ordre.
const bluffs = (textes) => Object.fromEntries(
  Object.entries(textes).map(([joueurId, texte], i) => [joueurId, { texte, recuA: i }]),
);

const sansMelange = (liste) => liste;

// Chaque joueur écrit le bluff donné, puis passage au vote.
function bluffer(salle, joueurs, textes) {
  joueurs.forEach((joueur, i) => {
    if (textes[i] !== null) assert.equal(enregistrerReponse(salle, joueur.id, textes[i]), true, textes[i]);
  });
  avancer(salle);
}

// Index de la proposition affichée avec ce texte.
function indexDe(salle, texte) {
  const index = salle.etatMode.propositions.findIndex((proposition) => proposition.texte === texte);
  assert.notEqual(index, -1, texte);
  return index;
}

function voter(salle, joueur, texte) {
  assert.equal(enregistrerReponse(salle, joueur.id, indexDe(salle, texte)), true, `${joueur.pseudo} → ${texte}`);
}

// --- Registre et choix du mode ---

test('Le bluff est dans le registre et plus aucun mode n\'est à venir', () => {
  assert.equal(modes.bluff.joueursMin, 4);
  assert.deepEqual(modesAVenir, []);
});

test('choix du mode : refusé à 3 joueurs, accepté à 4', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'bluff'), false);
  ajouterJoueur(salle, 'D', 'D');
  assert.equal(choisirMode(salle, 'bluff'), true);
});

// --- Règles pures ---

test('vraie réponse : sa clé ou celle d\'une variante', () => {
  for (const texte of ['Sel', 'le SEL', 'sels', 'du sel', 'Gros-sel']) assert.equal(estLaVerite(texte, SUMO), true, texte);
  for (const texte of ['Riz', 'Sable', 'Selle']) assert.equal(estLaVerite(texte, SUMO), false, texte);
});

test('présentation : majuscule initiale, point final retiré', () => {
  assert.equal(presenter('riz'), 'Riz');
  assert.equal(presenter('du sable...'), 'Du sable');
  assert.equal(presenter('éclats de verre.'), 'Éclats de verre');
});

test('propositions : bluffs de même clé fusionnés, vraie réponse ajoutée une fois', () => {
  const propositions = formerPropositions(
    bluffs({ a: 'riz.', b: 'Sable', c: 'le RIZ' }),
    SUMO,
    sansMelange,
  );
  assert.deepEqual(propositions, [
    { texte: 'Riz', auteurs: ['a', 'c'], vraie: false },
    { texte: 'Sable', auteurs: ['b'], vraie: false },
    { texte: 'Sel', auteurs: [], vraie: true, ontEcritLaVerite: [] },
  ]);
});

test('propositions : un bluff qui est la vraie réponse est fondu dans celle-ci', () => {
  const propositions = formerPropositions(bluffs({ a: 'les sels', b: 'gros sel', c: 'Riz' }), SUMO, sansMelange);
  assert.deepEqual(propositions.map((p) => p.texte), ['Riz', 'Sel']);
  assert.deepEqual(propositions[1].ontEcritLaVerite, ['a', 'b']);
});

test('propositions : le texte gardé est celui du premier arrivé', () => {
  const [riz] = formerPropositions({ a: { texte: 'RIZ', recuA: 5 }, b: { texte: 'riz', recuA: 2 } }, SUMO, sansMelange);
  assert.deepEqual([riz.texte, riz.auteurs], ['Riz', ['b', 'a']]);
});

test('propositions : le mélange ne place pas toujours la vraie réponse au même endroit', () => {
  const places = new Set();
  for (let i = 0; i < 200; i++) {
    const propositions = formerPropositions(bluffs({ a: 'Riz', b: 'Sable', c: 'Sucre' }), SUMO);
    places.add(propositions.findIndex((p) => p.vraie));
  }
  assert.equal(places.size, 4);
});

test('points : l\'exemple de la mini-spec', () => {
  // Paul et Léa bluffent. Léa et Tom votent pour Paul, Sam pour Léa, Paul et Zoé trouvent.
  const propositions = [
    { texte: 'Riz', auteurs: ['paul'], vraie: false },
    { texte: 'Sable', auteurs: ['lea'], vraie: false },
    { texte: 'Sel', auteurs: [], vraie: true, ontEcritLaVerite: [] },
  ];
  const votes = {
    lea: { choix: 0 }, tom: { choix: 0 }, sam: { choix: 1 }, paul: { choix: 2 }, zoe: { choix: 2 },
  };
  assert.deepEqual(calculerPoints(propositions, votes), {
    paul: { aTrouve: true, pieges: 2, points: 2000 },
    lea: { aTrouve: false, pieges: 1, points: 500 },
    zoe: { aTrouve: true, pieges: 0, points: 1000 },
  });
});

test('points : un bluff fusionné rapporte à chacun de ses auteurs', () => {
  const propositions = [{ texte: 'Riz', auteurs: ['a', 'b'], vraie: false }, { texte: 'Sel', auteurs: [], vraie: true }];
  const resultats = calculerPoints(propositions, { c: { choix: 0 }, d: { choix: 0 } });
  assert.equal(resultats.a.points, 1000);
  assert.equal(resultats.b.points, 1000);
  assert.equal(resultats.c, undefined);
});

// --- Saisie ---

test('un bluff est définitif, bords retirés', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, '  Riz  '), true);
  assert.equal(enregistrerReponse(salle, a.id, 'Sable'), false);
  assert.equal(salle.etatMode.reponses[a.id].texte, 'Riz');
});

test('un bluff invalide est refusé, 30 caractères acceptés, la vraie réponse acceptée', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  for (const texte of ['', '   ', 'x'.repeat(31), '?!…', 3, null, undefined, ['Riz']]) {
    assert.equal(enregistrerReponse(salle, a.id, texte), false, String(texte));
  }
  assert.equal(enregistrerReponse(salle, b.id, ` ${'x'.repeat(30)} `), true);
  assert.equal(enregistrerReponse(salle, c.id, 'les SELS'), true);
});

test('un bluff d\'un joueur non attendu ou hors saisie est refusé', () => {
  const { salle, joueurs } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(enregistrerReponse(salle, tardif.id, 'Riz'), false);
  bluffer(salle, joueurs, ['Riz', null, null, null]);
  assert.equal(etape(salle), 'vote');
  assert.equal(enregistrerReponse(salle, joueurs[1].id, 'Sable'), false);
});

// --- Vote ---

test('vote : index invalide, sa propre proposition, deuxième vote, non attendu refusés', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  bluffer(salle, [a, b, c, d], ['Riz', 'riz', 'Sable', null]);
  for (const choix of [-1, 3, 1.5, '0', null, undefined]) {
    assert.equal(enregistrerReponse(salle, d.id, choix), false, String(choix));
  }
  // a et b sont co-auteurs de « Riz ».
  assert.equal(enregistrerReponse(salle, a.id, indexDe(salle, 'Riz')), false);
  assert.equal(enregistrerReponse(salle, b.id, indexDe(salle, 'Riz')), false);
  assert.equal(enregistrerReponse(salle, c.id, indexDe(salle, 'Sable')), false);
  assert.equal(enregistrerReponse(salle, tardif.id, indexDe(salle, 'Sel')), false);
  voter(salle, a, 'Sable');
  assert.equal(enregistrerReponse(salle, a.id, indexDe(salle, 'Sel')), false);
});

test('vote : celui dont le bluff est la vraie réponse peut voter pour elle', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  bluffer(salle, [a, b, c, d], ['sel', 'Riz', null, null]);
  voter(salle, a, 'Sel');
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(a.score, 1000);
  const vueA = vueJoueur(salle, a);
  assert.deepEqual([vueA.aTrouve, vueA.bluffVrai, vueA.pieges, vueA.points], [true, true, 0, 1000]);
});

test('révélation : points ajoutés aux scores, bluff fusionné compris', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  bluffer(salle, [a, b, c, d], ['Riz', 'RIZ', 'Sable', 'Sucre']);
  voter(salle, c, 'Riz');
  voter(salle, d, 'Riz');
  voter(salle, a, 'Sel');
  voter(salle, b, 'Sable');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'revelation');
  assert.deepEqual([a.score, b.score, c.score, d.score], [2000, 1000, 500, 0]);
});

// --- Déroulé ---

test('une partie compte 8 questions tirées de la banque du bluff', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C', 'D']) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'bluff');
  demarrerPartie(salle);
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
  assert.ok(salle.etatMode.questions.every((q) => q.id.startsWith('b')));
  assert.ok(banqueBluff().length >= NOMBRE_QUESTIONS);
});

test('fin anticipée de la saisie puis du vote, et après la déconnexion du dernier attendu', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  for (const [joueur, texte] of [[a, 'Riz'], [b, 'Sable'], [c, 'Sucre']]) {
    enregistrerReponse(salle, joueur.id, texte);
    verifierFinAnticipee(salle);
  }
  assert.equal(etape(salle), 'saisie');
  d.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');

  voter(salle, a, 'Sel');
  voter(salle, b, 'Sel');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');
  voter(salle, c, 'Sel');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'revelation');
  const vue = vueTv(salle).etatMode;
  assert.deepEqual([vue.sansBluff, vue.sansVote, vue.tousOntTrouve], [[d.id], [d.id], true]);
});

test('sans bluff, ou seulement des bluffs fondus dans la vérité : révélation directe', () => {
  const { salle, joueurs: [a] } = sallePrete();
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(vueTv(salle).etatMode.personneNaBluffe, true);
  assert.deepEqual(vueTv(salle).etatMode.sansVote, []);

  suivant(salle);
  salle.etatMode.questions[1] = SUMO;
  enregistrerReponse(salle, a.id, 'Gros sel');
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(a.score, 0);
  assert.equal(vueJoueur(salle, a).bluffVrai, true);
});

test('« Suivant » seulement pendant la révélation, puis podium après la 8e', () => {
  const { salle } = sallePrete();
  assert.equal(suivant(salle), false);
  for (let i = 0; i < NOMBRE_QUESTIONS; i++) {
    avancer(salle);
    assert.equal(etape(salle), 'revelation');
    assert.equal(suivant(salle), true);
  }
  assert.equal(salle.etat, 'podium');
});

test('minuteur : vote à 45 s, révélation 25 s après, question suivante 15 s après', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Riz');
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(44999);
  assert.equal(etape(salle), 'saisie');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(24999);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(14999);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'saisie');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('terminer pendant un vote : la question en cours n\'est pas comptée', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  bluffer(salle, [a, b, c, d], ['Riz', null, null, null]);
  voter(salle, b, 'Riz');
  voter(salle, c, 'Sel');
  terminerPartie(salle);
  assert.equal(salle.etat, 'podium');
  assert.deepEqual([a.score, c.score], [0, 0]);
  assert.deepEqual(vueTv(salle).etatMode.classement.map((l) => l.points), [0, 0, 0, 0]);
});

test('questionsVues : les id b… cohabitent avec les autres, sans répétition', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < 3; i++) {
    terminerPartie(salle);
    demarrerPartie(salle);
  }
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'meme-reponse');
  demarrerPartie(salle);
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'quiz');
  demarrerPartie(salle);
  const total = 3 * NOMBRE_QUESTIONS + NOMBRE_QUESTIONS_MEME_REPONSE + NOMBRE_QUESTIONS_QUIZ;
  assert.equal(salle.questionsVues.length, total);
  assert.equal(new Set(salle.questionsVues).size, total);
  assert.equal(salle.questionsVues.filter((id) => id.startsWith('b')).length, 3 * NOMBRE_QUESTIONS);
});

// --- Le secret ---

test('pendant la saisie, la TV ne reçoit ni bluff ni vraie réponse', () => {
  const { salle, joueurs: [a] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Framboise');
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(
    Object.keys(vue).sort(),
    ['numero', 'ontRepondu', 'phase', 'question', 'tempsRestantMs', 'total'],
  );
  assert.deepEqual(vue.ontRepondu, [a.id]);
  const texte = JSON.stringify(vueTv(salle));
  for (const secret of ['Framboise', '"Sel"', 'Gros sel']) assert.ok(!texte.includes(secret), secret);
});

test('pendant le vote, les propositions n\'ont que leur texte, sans auteur ni vérité', () => {
  const { salle, joueurs } = sallePrete();
  const [a, b] = joueurs;
  bluffer(salle, joueurs, ['Riz', 'sel', 'Sable', null]);
  const vueTvVote = vueTv(salle).etatMode;
  assert.deepEqual(vueTvVote.propositions.map((p) => Object.keys(p)), [['texte'], ['texte'], ['texte']]);
  for (const joueur of joueurs) {
    const vue = vueJoueur(salle, joueur);
    assert.equal(vue.ecran, 'voter');
    assert.deepEqual(vue.propositions.map((p) => p.texte), vueTvVote.propositions.map((p) => p.texte));
    for (const p of vue.propositions) assert.deepEqual(Object.keys(p).sort(), ['laTienne', 'texte']);
  }
  const mienne = (joueur) => vueJoueur(salle, joueur).propositions.filter((p) => p.laTienne).map((p) => p.texte);
  assert.deepEqual(mienne(a), ['Riz']);
  // Le bluff de b était la vraie réponse : il n'a pas de proposition à lui.
  assert.deepEqual(mienne(b), []);
  const tout = JSON.stringify([vueTv(salle), ...joueurs.map((j) => vueJoueur(salle, j))]);
  for (const secret of ['vraie', 'auteurs', 'ontEcritLaVerite', 'Gros sel', 'variantes']) {
    assert.ok(!tout.includes(secret), secret);
  }
  const propositions = JSON.stringify([
    vueTvVote.propositions, ...joueurs.map((j) => vueJoueur(salle, j).propositions),
  ]);
  for (const joueur of joueurs) assert.ok(!propositions.includes(joueur.id), joueur.pseudo);
});

test('les variantes ne sortent jamais, à aucune phase', () => {
  const { salle, joueurs } = sallePrete();
  const verifier = () => {
    const vues = [vueTv(salle), ...joueurs.map((j) => vueJoueur(salle, j))];
    for (const vue of vues) assert.ok(!JSON.stringify(vue).includes('Gros sel'));
  };
  verifier();
  bluffer(salle, joueurs, ['Riz', 'Sable', null, null]);
  verifier();
  avancer(salle);
  verifier();
});

test('un téléphone ne voit que son propre bluff pendant la saisie', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Framboise');
  const vueB = vueJoueur(salle, b);
  assert.deepEqual([vueB.ecran, vueB.numero, vueB.total, vueB.question], ['ecrire', 1, 8, { texte: SUMO.texte }]);
  assert.ok(!JSON.stringify(vueB).includes('Framboise'));
  const vueA = vueJoueur(salle, a);
  assert.deepEqual([vueA.ecran, vueA.texte], ['bluff_envoye', 'Framboise']);
});

test('à la révélation, la TV reçoit auteurs, votants, points et verdicts', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  bluffer(salle, [a, b, c, d], ['Riz', 'sel', null, null]);
  voter(salle, c, 'Riz');
  voter(salle, d, 'Riz');
  avancer(salle);
  const vue = vueTv(salle).etatMode;
  const riz = vue.propositions.find((p) => p.texte === 'Riz');
  const sel = vue.propositions.find((p) => p.vraie);
  assert.deepEqual(riz, {
    texte: 'Riz', vraie: false, auteurs: [a.id], votants: [c.id, d.id], points: 1000,
  });
  assert.deepEqual(sel, {
    texte: 'Sel', vraie: true, auteurs: [], votants: [], points: 0, ontEcritLaVerite: [b.id],
  });
  assert.deepEqual([vue.personneNaTrouve, vue.tousOntTrouve, vue.personneNaBluffe], [true, false, false]);
  assert.deepEqual(vue.sansBluff, [c.id, d.id]);
  assert.deepEqual(vue.sansVote, [a.id, b.id]);
  assert.deepEqual(vue.classement.map((l) => [l.pseudo, l.points]), [['Paul', 1000], ['Léa', 0], ['Sam', 0], ['Tom', 0]]);
});

test('l\'écran de résultat du téléphone', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  bluffer(salle, [a, b, c, d], ['Riz', null, null, null]);
  voter(salle, b, 'Riz');
  voter(salle, c, 'Sel');
  avancer(salle);
  const vueA = vueJoueur(salle, a);
  assert.deepEqual(
    [vueA.ecran, vueA.vraieReponse, vueA.aVote, vueA.aTrouve, vueA.sonBluff, vueA.bluffVrai, vueA.pieges, vueA.points, vueA.rang],
    ['resultat', 'Sel', false, false, 'Riz', false, 1, 500, 2],
  );
  const vueC = vueJoueur(salle, c);
  assert.deepEqual([vueC.aVote, vueC.aTrouve, vueC.sonBluff, vueC.points, vueC.rang], [true, true, null, 1000, 1]);
  const vueB = vueJoueur(salle, b);
  assert.deepEqual([vueB.aVote, vueB.aTrouve, vueB.points], [true, false, 0]);
});

test('arrivée en cours de question : attend la suivante', () => {
  const { salle } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  avancer(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  suivant(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'ecrire');
});

test('vote envoyé : le téléphone rappelle son choix', () => {
  const { salle, joueurs } = sallePrete();
  bluffer(salle, joueurs, ['Riz', null, null, null]);
  voter(salle, joueurs[1], 'Riz');
  const vue = vueJoueur(salle, joueurs[1]);
  assert.deepEqual([vue.ecran, vue.numero, vue.texte], ['vote_envoye', 1, 'Riz']);
});
