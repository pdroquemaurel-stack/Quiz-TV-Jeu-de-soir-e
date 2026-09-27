import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, passerApresPodium, synchroniserMinuteur,
  terminerPartie,
} from '../salles.js';
import { vueJoueur, vueTv } from '../vues.js';
import { modes } from './index.js';
import {
  BONUS_LEGENDAIRE, NOMBRE_GIF, POINTS_PAR_VOTE, avancer, banqueLegende, enregistrerReponse,
  formerPropositions, gagnants, resultatsDesPropositions, suivant, verifierFinAnticipee,
} from './legende.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_BLUFF } from './bluff.js';

const PSEUDOS = ['Paul', 'Léa', 'Sam', 'Tom', 'Zoé'];

const GIF = {
  id: 'g1', nom: 'Disappearing kid gif', fichier: 'gifs/1.mp4', garder: true,
};

// n joueurs, mode La légende, partie lancée sur un GIF connu.
function sallePrete(n = 5) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'legende'), true);
  demarrerPartie(salle);
  salle.etatMode.questions[0] = GIF;
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

// Titres fictifs : { joueur: texte } → le format de etatMode.titres, arrivés dans l'ordre.
const titres = (textes) => Object.fromEntries(
  Object.entries(textes).map(([joueurId, texte], i) => [joueurId, { texte, recuA: i }]),
);

const sansMelange = (liste) => liste;

// Chaque joueur écrit le titre donné (null : pas de titre), puis passage au vote.
function ecrire(salle, joueurs, textes) {
  joueurs.forEach((joueur, i) => {
    if (textes[i] !== null) assert.equal(enregistrerReponse(salle, joueur.id, textes[i]), true, textes[i]);
  });
  avancer(salle);
}

function indexDe(salle, texte) {
  const index = salle.etatMode.propositions.findIndex((proposition) => proposition.texte === texte);
  assert.notEqual(index, -1, texte);
  return index;
}

function voter(salle, joueur, texte) {
  assert.equal(enregistrerReponse(salle, joueur.id, indexDe(salle, texte)), true, `${joueur.pseudo} → ${texte}`);
}

// Propositions fictives pour les règles pures : [[texte, auteurs]].
const propositions = (liste) => liste.map(([texte, auteurs]) => ({ texte, auteurs }));
const votes = (choix) => Object.fromEntries(Object.entries(choix).map(([votant, index]) => [votant, { choix: index }]));

// --- Registre et choix du mode ---

test('La légende est dans le registre, à partir de 3 joueurs', () => {
  assert.equal(modes.legende.nom, 'La légende');
  assert.equal(modes.legende.joueursMin, 3);
});

test('choix du mode : refusé à 2 joueurs, accepté à 3', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'legende'), false);
  ajouterJoueur(salle, 'C', 'C');
  assert.equal(choisirMode(salle, 'legende'), true);
});

// --- Règles pures ---

test('propositions : titres de même clé fusionnés, texte du premier arrivé, deux auteurs', () => {
  const liste = formerPropositions(titres({
    a: 'Moi quand le prof dit en binôme', b: 'Lundi matin', c: 'moi quand le prof dit en binome !',
  }), sansMelange);
  assert.deepEqual(liste, [
    { texte: 'Moi quand le prof dit en binôme', auteurs: ['a', 'c'] },
    { texte: 'Lundi matin', auteurs: ['b'] },
  ]);
});

test('propositions : le mélange ne place pas toujours le même titre au même endroit', () => {
  const positions = new Set();
  for (let i = 0; i < 50; i++) {
    const liste = formerPropositions(titres({ a: 'Un', b: 'Deux', c: 'Trois' }));
    positions.add(liste.findIndex((p) => p.texte === 'Un'));
  }
  assert.equal(positions.size, 3);
});

test('points : 500 par vote reçu, sans bonus quand un votant qui pouvait le choisir a voté ailleurs', () => {
  // Exemple de la mini-spec : Léa, Sam, Tom → Paul ; Paul → Zoé ; Zoé → Léa.
  const liste = propositions([['P', ['paul']], ['L', ['lea']], ['S', ['sam']], ['T', ['tom']], ['Z', ['zoe']]]);
  const resultats = resultatsDesPropositions(liste, votes({
    lea: 0, sam: 0, tom: 0, paul: 4, zoe: 1,
  }));
  assert.deepEqual(resultats.map((r) => r.points), [1500, 500, 0, 0, 500]);
  assert.ok(resultats.every((r) => !r.legendaire));
});

test('points : « Légendaire » quand tous ceux qui pouvaient le choisir l\'ont choisi', () => {
  const liste = propositions([['P', ['paul']], ['L', ['lea']], ['S', ['sam']], ['T', ['tom']], ['Z', ['zoe']]]);
  const tous = resultatsDesPropositions(liste, votes({
    lea: 0, sam: 0, tom: 0, zoe: 0, paul: 4,
  }));
  assert.deepEqual(
    [tous[0].points, tous[0].legendaire, tous[4].points],
    [4 * POINTS_PAR_VOTE + BONUS_LEGENDAIRE, true, 500],
  );
  // Zoé ne vote pas : l'unanimité tient toujours.
  const sansZoe = resultatsDesPropositions(liste, votes({ lea: 0, sam: 0, tom: 0, paul: 4 }));
  assert.deepEqual([sansZoe[0].points, sansZoe[0].legendaire], [2500, true]);
});

test('points : pas de bonus avec un seul vote, ni avec un seul titre', () => {
  const deux = propositions([['A', ['a']], ['B', ['b']]]);
  const unVote = resultatsDesPropositions(deux, votes({ b: 0 }));
  assert.deepEqual([unVote[0].points, unVote[0].legendaire], [500, false]);
  const seul = propositions([['A', ['a']]]);
  const unTitre = resultatsDesPropositions(seul, votes({ b: 0, c: 0 }));
  assert.deepEqual([unTitre[0].points, unTitre[0].legendaire], [1000, false]);
});

test('points : pas de vote, 0 ; gagnants : le plus de votes, au moins 1', () => {
  const liste = propositions([['A', ['a']], ['B', ['b']], ['C', ['c']]]);
  const aucun = resultatsDesPropositions(liste, {});
  assert.deepEqual(aucun.map((r) => r.points), [0, 0, 0]);
  assert.deepEqual(gagnants(aucun), []);
  assert.deepEqual(gagnants(resultatsDesPropositions(liste, votes({ a: 1, b: 2, c: 1 }))), [1]);
  assert.deepEqual(gagnants(resultatsDesPropositions(liste, votes({ a: 1, b: 0 }))), [0, 1]);
});

// --- Saisie et vote ---

test('un titre est définitif, bords retirés, ponctuation finale gardée', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, '  lundi matin...  '), true);
  assert.equal(enregistrerReponse(salle, a.id, 'Autre'), false);
  assert.equal(salle.etatMode.reponses[a.id].texte, 'lundi matin...');
});

test('un titre invalide est refusé, 120 caractères acceptés, espaces réduits', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  for (const invalide of [42, null, ['x'], '', '   ', '!!!', 'x'.repeat(121)]) {
    assert.equal(enregistrerReponse(salle, a.id, invalide), false, String(invalide));
  }
  assert.equal(enregistrerReponse(salle, b.id, ` ${'x'.repeat(120)} `), true);
  assert.equal(enregistrerReponse(salle, c.id, '  Lundi\n  matin   ! '), true);
  assert.equal(salle.etatMode.reponses[c.id].texte, 'Lundi matin !');
});

test('un titre d\'un joueur non attendu ou hors saisie est refusé', () => {
  const { salle, joueurs } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(enregistrerReponse(salle, tardif.id, 'Lundi'), false);
  ecrire(salle, joueurs, ['A', 'B', null, null, null]);
  assert.equal(etape(salle), 'vote');
  assert.equal(enregistrerReponse(salle, joueurs[2].id, 'Trop tard'), false);
  avancer(salle);
  assert.equal(enregistrerReponse(salle, joueurs[2].id, 0), false);
});

test('vote : index invalide, son titre, titre fusionné co-écrit, deuxième vote, non attendu refusés', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  ecrire(salle, [a, b, c, d], ['Lundi', 'lundi !', 'Mardi', null]);
  for (const invalide of [-1, 2, 0.5, '0', null]) {
    assert.equal(enregistrerReponse(salle, d.id, invalide), false, String(invalide));
  }
  assert.equal(enregistrerReponse(salle, a.id, indexDe(salle, 'Lundi')), false);
  assert.equal(enregistrerReponse(salle, b.id, indexDe(salle, 'Lundi')), false);
  assert.equal(enregistrerReponse(salle, c.id, indexDe(salle, 'Mardi')), false);
  voter(salle, a, 'Mardi');
  assert.equal(enregistrerReponse(salle, a.id, indexDe(salle, 'Mardi')), false);
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(enregistrerReponse(salle, tardif.id, 0), false);
  // Un joueur sans titre vote quand même.
  voter(salle, d, 'Lundi');
});

test('révélation : scores mis à jour, titre fusionné qui rapporte votes et bonus à ses deux auteurs', () => {
  const { salle, joueurs: [a, b, c, d, e] } = sallePrete();
  ecrire(salle, [a, b, c, d, e], ['Lundi', 'LUNDI', 'Mardi', null, null]);
  voter(salle, c, 'Lundi');
  voter(salle, d, 'Lundi');
  voter(salle, e, 'Lundi');
  voter(salle, a, 'Mardi');
  avancer(salle);
  const attendu = 3 * POINTS_PAR_VOTE + BONUS_LEGENDAIRE;
  assert.deepEqual([a, b, c, d, e].map((j) => j.score), [attendu, attendu, 500, 0, 0]);
});

// --- Enchaînement ---

test('une partie compte 8 GIF gardés, tirés du catalogue', () => {
  const { salle } = sallePrete();
  demarrerPartie(salle);
  assert.equal(salle.etatMode.questions.length, NOMBRE_GIF);
  assert.ok(salle.etatMode.questions.every((gif) => gif.id.startsWith('g') && gif.garder));
  assert.ok(banqueLegende().every((gif) => gif.garder));
  assert.ok(banqueLegende().length >= NOMBRE_GIF);
});

test('fin anticipée de la saisie puis du vote, et après la déconnexion du dernier attendu', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete(3);
  enregistrerReponse(salle, a.id, 'Un');
  enregistrerReponse(salle, b.id, 'Deux');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'saisie');
  c.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');

  voter(salle, a, 'Deux');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');
  voter(salle, b, 'Un');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'revelation');
  const vue = vueTv(salle).etatMode;
  assert.deepEqual([vue.sansTitre, vue.sansVote], [[c.id], [c.id]]);
});

test('0 ou 1 titre (après fusion) : révélation directe, sans points', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(vueTv(salle).etatMode.pasAssezDeTitres, true);
  assert.deepEqual(vueTv(salle).etatMode.sansVote, []);

  suivant(salle);
  enregistrerReponse(salle, a.id, 'Lundi');
  enregistrerReponse(salle, b.id, 'lundi');
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(vueTv(salle).etatMode.propositions.length, 1);
  assert.deepEqual([a.score, b.score], [0, 0]);
  assert.equal(vueJoueur(salle, a).pasAssezDeTitres, true);
});

test('« Suivant » seulement pendant la révélation, puis podium après le 8e GIF', () => {
  const { salle } = sallePrete();
  assert.equal(suivant(salle), false);
  for (let i = 0; i < NOMBRE_GIF; i++) {
    avancer(salle);
    assert.equal(etape(salle), 'revelation');
    assert.equal(suivant(salle), true);
  }
  assert.equal(salle.etat, 'podium');
});

test('minuteur : vote à 45 s, révélation 40 s après, GIF suivant 20 s après', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Un');
  enregistrerReponse(salle, b.id, 'Deux');
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(44999);
  assert.equal(etape(salle), 'saisie');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(39999);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(19999);
  assert.equal(etape(salle), 'revelation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'saisie');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('terminer pendant un vote : le GIF en cours n\'est pas compté', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  ecrire(salle, [a, b, c], ['Un', 'Deux', null]);
  voter(salle, c, 'Un');
  voter(salle, b, 'Un');
  terminerPartie(salle);
  assert.equal(salle.etat, 'podium');
  assert.equal(a.score, 0);
  assert.ok(vueTv(salle).etatMode.classement.every((ligne) => ligne.points === 0));
});

test('questionsVues : les id g… cohabitent avec les autres, sans répétition', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < 3; i++) {
    terminerPartie(salle);
    demarrerPartie(salle);
  }
  terminerPartie(salle);
  passerApresPodium(salle);
  ajouterJoueur(salle, 'Max', 's8');
  choisirMode(salle, 'bluff');
  demarrerPartie(salle);
  const total = 3 * NOMBRE_GIF + NOMBRE_QUESTIONS_BLUFF;
  assert.equal(salle.questionsVues.length, total);
  assert.equal(new Set(salle.questionsVues).size, total);
  assert.equal(salle.questionsVues.filter((id) => id.startsWith('g')).length, 3 * NOMBRE_GIF);
});

// --- Le secret ---

test('pendant la saisie, la TV voit le GIF et qui a écrit, jamais les titres', () => {
  const { salle, joueurs: [a] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Framboise');
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(
    Object.keys(vue).sort(),
    ['gif', 'numero', 'ontRepondu', 'phase', 'tempsRestantMs', 'total'],
  );
  assert.deepEqual(vue.gif, { fichier: 'gifs/1.mp4', nom: 'Disappearing kid gif' });
  assert.deepEqual(vue.ontRepondu, [a.id]);
  assert.ok(!JSON.stringify(vueTv(salle)).includes('Framboise'));
});

test('un téléphone ne voit que son propre titre, et jamais le GIF', () => {
  const { salle, joueurs } = sallePrete();
  const [a, b] = joueurs;
  enregistrerReponse(salle, a.id, 'Framboise');
  const vueB = vueJoueur(salle, b);
  assert.deepEqual([vueB.ecran, vueB.numero, vueB.total], ['ecrire', 1, NOMBRE_GIF]);
  assert.ok(!JSON.stringify(vueB).includes('Framboise'));
  assert.deepEqual([vueJoueur(salle, a).ecran, vueJoueur(salle, a).texte], ['titre_envoye', 'Framboise']);

  const phases = () => joueurs.map((j) => JSON.stringify(vueJoueur(salle, j)));
  const toutes = [...phases()];
  ecrire(salle, joueurs, [null, 'Un', 'Deux', null, null]);
  toutes.push(...phases());
  avancer(salle);
  toutes.push(...phases());
  for (const vue of toutes) {
    for (const secret of ['gifs/', 'Disappearing', 'fichier', 'gifSuivant']) assert.ok(!vue.includes(secret), secret);
  }
});

test('pendant le vote, les propositions n\'ont que leur texte, sans auteur ni vote', () => {
  const { salle, joueurs } = sallePrete();
  const [a, b, c] = joueurs;
  ecrire(salle, joueurs, ['Un', 'un !', 'Deux', null, null]);
  voter(salle, c, 'Un');
  const vueTvVote = vueTv(salle).etatMode;
  assert.deepEqual(vueTvVote.propositions.map((p) => Object.keys(p)), [['texte'], ['texte']]);
  assert.equal(vueTvVote.gifSuivant, undefined);
  for (const joueur of joueurs) {
    const vue = vueJoueur(salle, joueur);
    if (joueur === c) continue;
    assert.equal(vue.ecran, 'voter');
    assert.deepEqual(vue.propositions.map((p) => p.texte), vueTvVote.propositions.map((p) => p.texte));
    for (const p of vue.propositions) assert.deepEqual(Object.keys(p).sort(), ['laTienne', 'texte']);
  }
  const miennes = (joueur) => vueJoueur(salle, joueur).propositions.filter((p) => p.laTienne).map((p) => p.texte);
  assert.deepEqual([miennes(a), miennes(b), miennes(joueurs[3])], [['Un'], ['Un'], []]);
  const tout = JSON.stringify([vueTv(salle), ...joueurs.map((j) => vueJoueur(salle, j))]);
  for (const secret of ['auteurs', 'votants', 'choix']) assert.ok(!tout.includes(secret), secret);
  const textes = JSON.stringify([vueTvVote.propositions, ...joueurs.map((j) => vueJoueur(salle, j).propositions)]);
  for (const joueur of joueurs) assert.ok(!textes.includes(joueur.id), joueur.pseudo);
});

test('à la révélation, la TV reçoit auteurs, votants, points, gagnants et le GIF suivant', () => {
  const { salle, joueurs: [a, b, c, d, e] } = sallePrete();
  ecrire(salle, [a, b, c, d, e], ['Un', 'Deux', 'Trois', null, null]);
  voter(salle, c, 'Un');
  voter(salle, d, 'Un');
  voter(salle, e, 'Deux');
  avancer(salle);
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(vue.propositions.find((p) => p.texte === 'Un'), {
    texte: 'Un', auteurs: [a.id], votants: [c.id, d.id], points: 1000, gagnant: true,
  });
  assert.deepEqual(vue.propositions.find((p) => p.texte === 'Trois').gagnant, false);
  assert.deepEqual([vue.legendaire, vue.pasAssezDeTitres], [false, false]);
  assert.deepEqual(vue.sansTitre, [d.id, e.id]);
  assert.deepEqual(vue.sansVote, [a.id, b.id]);
  assert.deepEqual(vue.gifSuivant, { fichier: salle.etatMode.questions[1].fichier });
  assert.deepEqual(vue.classement.map((l) => [l.pseudo, l.points]).slice(0, 2), [['Paul', 1000], ['Léa', 500]]);
});

test('le 8e GIF n\'a pas de GIF suivant', () => {
  const { salle } = sallePrete();
  for (let i = 0; i < NOMBRE_GIF - 1; i++) {
    avancer(salle);
    suivant(salle);
  }
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  assert.equal(vueTv(salle).etatMode.gifSuivant, undefined);
});

test('l\'écran de résultat du téléphone', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  ecrire(salle, [a, b, c, d], ['Un', 'Deux', null, null]);
  voter(salle, b, 'Un');
  voter(salle, c, 'Un');
  voter(salle, d, 'Un');
  avancer(salle);
  const vueA = vueJoueur(salle, a);
  assert.deepEqual(
    [vueA.ecran, vueA.aVote, vueA.sonTitre, vueA.votesRecus, vueA.legendaire, vueA.gagnant, vueA.points, vueA.rang],
    ['resultat', false, 'Un', 3, true, true, 2500, 1],
  );
  const vueC = vueJoueur(salle, c);
  assert.deepEqual([vueC.aVote, vueC.sonTitre, vueC.votesRecus, vueC.gagnant, vueC.points], [true, null, 0, false, 0]);
  const vueB = vueJoueur(salle, b);
  assert.deepEqual([vueB.sonTitre, vueB.votesRecus, vueB.points, vueB.rang], ['Deux', 0, 0, 2]);
});

test('arrivée en cours de GIF : attend le suivant', () => {
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
  ecrire(salle, joueurs, ['Un', 'Deux', null, null, null]);
  voter(salle, joueurs[2], 'Deux');
  const vue = vueJoueur(salle, joueurs[2]);
  assert.deepEqual([vue.ecran, vue.numero, vue.texte], ['vote_envoye', 1, 'Deux']);
});
