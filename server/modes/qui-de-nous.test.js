import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, passerApresPodium, synchroniserMinuteur,
  terminerPartie, vueJoueur, vueTv,
} from '../salles.js';
import { modes, modesAVenir } from './index.js';
import {
  NOMBRE_QUESTIONS, banqueQuiDeNous, compterVotes, enregistrerReponse, montrerResultats,
  passerALaSuite, suivant, trouverElus, verifierFinAnticipee,
} from './qui-de-nous.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_ESTIMATION } from './estimation.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_QUIZ } from './quiz.js';

// Quatre joueurs, mode Qui de nous ?, partie lancée.
function sallePrete() {
  const salle = creerSalle('tv');
  const joueurs = ['A', 'B', 'C', 'D'].map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'qui-de-nous'), true);
  demarrerPartie(salle);
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

// Votes fictifs : { votant: candidat } → le format de etatMode.reponses.
const votes = (choix) => Object.fromEntries(
  Object.entries(choix).map(([votant, vote]) => [votant, { vote, recuA: 0 }]),
);

// --- Registre et choix du mode ---

test('Qui de nous ? est dans le registre et n\'est plus à venir', () => {
  assert.equal(modes['qui-de-nous'].joueursMin, 4);
  assert.ok(!modesAVenir.some((mode) => mode.id === 'qui-de-nous'));
});

test('choix du mode : refusé à 3 joueurs, accepté à 4', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'qui-de-nous'), false);
  ajouterJoueur(salle, 'D', 'D');
  assert.equal(choisirMode(salle, 'qui-de-nous'), true);
});

// --- Élus et points ---

test('élus : un élu net', () => {
  const resultats = compterVotes(votes({ a: 'b', c: 'b', d: 'a' }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(resultats, [
    { id: 'b', votes: 2 }, { id: 'a', votes: 1 }, { id: 'c', votes: 0 }, { id: 'd', votes: 0 },
  ]);
  assert.deepEqual(trouverElus(resultats), ['b']);
});

test('élus : les ex æquo en tête sont tous élus, aucun élu sans vote', () => {
  const resultats = compterVotes(votes({ a: 'b', b: 'a', c: 'a', d: 'b' }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(trouverElus(resultats), ['a', 'b']);
  assert.deepEqual(trouverElus(compterVotes({}, ['a', 'b'])), []);
});

test('points : 1000 pour avoir voté comme le groupe, 0 sinon ou sans vote', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, c.id, b.id);
  enregistrerReponse(salle, b.id, d.id);
  montrerResultats(salle);
  assert.deepEqual([a.score, b.score, c.score, d.score], [1000, 0, 1000, 0]);
});

test('points : égalité en tête, tous les votants des élus marquent', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  enregistrerReponse(salle, c.id, a.id);
  enregistrerReponse(salle, d.id, b.id);
  montrerResultats(salle);
  assert.deepEqual([a.score, b.score, c.score, d.score], [1000, 1000, 1000, 1000]);
});

test('points : aucun vote, personne ne marque', () => {
  const { salle, joueurs } = sallePrete();
  montrerResultats(salle);
  assert.ok(joueurs.every((joueur) => joueur.score === 0));
  assert.deepEqual(vueTv(salle).etatMode.elus, []);
});

// --- Votes ---

test('un vote valide est accepté une seule fois', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, b.id), true);
  assert.equal(enregistrerReponse(salle, a.id, c.id), false);
  assert.equal(salle.etatMode.reponses[a.id].vote, b.id);
});

test('un vote invalide est refusé', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  for (const vote of [a.id, 'j_inconnu', tardif.id, 3, null, undefined, [a.id]]) {
    assert.equal(enregistrerReponse(salle, a.id, vote), false, String(vote));
  }
});

test('un vote hors de la phase vote ou d\'un joueur non attendu est refusé', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(enregistrerReponse(salle, tardif.id, a.id), false);
  montrerResultats(salle);
  assert.equal(enregistrerReponse(salle, a.id, b.id), false);
});

test('un candidat déconnecté reste votable', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  b.connecte = false;
  assert.equal(enregistrerReponse(salle, a.id, b.id), true);
});

test('seul candidat : on peut voter pour soi', () => {
  const salle = creerSalle('tv');
  const { joueur: seul } = ajouterJoueur(salle, 'Seul', 's1');
  choisirMode(salle, 'quiz');
  salle.mode = 'qui-de-nous';
  demarrerPartie(salle);
  assert.deepEqual(vueJoueur(salle, seul).candidats.map((c) => c.id), [seul.id]);
  assert.equal(enregistrerReponse(salle, seul.id, seul.id), true);
});

// --- Déroulé ---

test('une partie compte 10 questions tirées de la banque Qui de nous ?', () => {
  const { salle } = sallePrete();
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
  assert.ok(salle.etatMode.questions.every((q) => q.id.startsWith('n')));
  assert.ok(banqueQuiDeNous.length >= NOMBRE_QUESTIONS);
});

test('fin anticipée : dès que tous ont voté, et après la déconnexion du dernier attendu', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');

  d.connecte = false;
  enregistrerReponse(salle, c.id, a.id);
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'resultats');
});

test('« Suivant » seulement pendant les résultats, puis podium après la 10e', () => {
  const { salle } = sallePrete();
  assert.equal(suivant(salle), false);
  for (let i = 0; i < NOMBRE_QUESTIONS; i++) {
    montrerResultats(salle);
    assert.equal(suivant(salle), true);
  }
  assert.equal(salle.etat, 'podium');
});

test('minuteur : résultats à 20 s, question suivante 12 s après', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(19999);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'resultats');
  t.mock.timers.tick(11999);
  assert.equal(etape(salle), 'resultats');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'vote');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('terminer pendant un vote : ni points ni votes reçus comptés', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, c.id, b.id);
  terminerPartie(salle);
  assert.equal(salle.etat, 'podium');
  assert.equal(a.score, 0);
  assert.deepEqual(vueTv(salle).etatMode.plusDesignes, []);
});

test('votesRecus : cumulés aux résultats, le plus désigné au podium', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, c.id, b.id);
  montrerResultats(salle);
  passerALaSuite(salle);
  enregistrerReponse(salle, b.id, d.id);
  enregistrerReponse(salle, a.id, b.id);
  montrerResultats(salle);
  terminerPartie(salle);
  assert.deepEqual(salle.etatMode.votesRecus, { [a.id]: 0, [b.id]: 3, [c.id]: 0, [d.id]: 1 });
  assert.deepEqual(vueTv(salle).etatMode.plusDesignes, [{ id: b.id, votes: 3 }]);
});

test('questionsVues : les id n… cohabitent avec q… et e…, sans répétition', () => {
  const { salle } = sallePrete();
  for (let i = 1; i < 3; i++) {
    terminerPartie(salle);
    demarrerPartie(salle);
  }
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'estimation');
  demarrerPartie(salle);
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'quiz');
  demarrerPartie(salle);
  const total = 3 * NOMBRE_QUESTIONS + NOMBRE_QUESTIONS_ESTIMATION + NOMBRE_QUESTIONS_QUIZ;
  assert.equal(salle.questionsVues.length, total);
  assert.equal(new Set(salle.questionsVues).size, total);
  assert.equal(salle.questionsVues.filter((id) => id.startsWith('n')).length, 3 * NOMBRE_QUESTIONS);
});

test('tableau : changer de mode après une autre partie ne casse pas la vue de la TV', () => {
  const { salle } = sallePrete();
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'quiz');
  demarrerPartie(salle);
  terminerPartie(salle);
  passerApresPodium(salle);
  choisirMode(salle, 'qui-de-nous');
  assert.deepEqual(vueTv(salle).etatMode, {});
});

// --- Ce que voient la TV et les téléphones ---

test('pendant le vote, la TV ne reçoit aucun décompte', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(
    Object.keys(vue).sort(),
    ['numero', 'ontVote', 'phase', 'question', 'tempsRestantMs', 'total'],
  );
  assert.deepEqual(vue.ontVote, [a.id]);
  assert.deepEqual(Object.keys(vue.question), ['texte']);
});

test('aux résultats, la TV reçoit les votes par candidat, jamais qui a voté pour qui', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, c.id, b.id);
  enregistrerReponse(salle, b.id, d.id);
  montrerResultats(salle);
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(vue.resultats.map((l) => [l.id, l.votes]), [[b.id, 2], [d.id, 1], [a.id, 0], [c.id, 0]]);
  assert.deepEqual(vue.elus, [b.id]);
  assert.equal(vue.nombreVotes, 3);
  assert.deepEqual(Object.keys(vue.resultats[0]), ['id', 'votes']);
  assert.ok(!JSON.stringify(vue).includes('"vote"'));
  assert.ok(!JSON.stringify(vueTv(salle)).includes('"vote"'));
});

test('un téléphone ne reçoit jamais le vote d\'un autre joueur', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, d.id);
  const vueB = vueJoueur(salle, b);
  assert.equal(vueB.ecran, 'voter');
  assert.deepEqual(vueB.candidats.map((cand) => cand.id), [a.id, c.id, d.id]);
  assert.deepEqual(
    Object.keys(vueB).filter((cle) => !['mode', 'id', 'pseudo', 'couleur', 'score', 'estHote', 'peutTerminer', 'etape'].includes(cle)),
    ['ecran', 'numero', 'candidats'],
  );
  assert.deepEqual(Object.keys(vueB.candidats[0]), ['id', 'pseudo', 'couleur', 'connecte']);

  const vueA = vueJoueur(salle, a);
  assert.deepEqual([vueA.ecran, vueA.choisi.pseudo], ['vote_envoye', 'D']);

  enregistrerReponse(salle, b.id, c.id);
  montrerResultats(salle);
  const resultatB = vueJoueur(salle, b);
  assert.equal(resultatB.vote, 'C');
  assert.ok(!JSON.stringify(resultatB).includes(d.id));
  assert.ok(!JSON.stringify(vueJoueur(salle, c)).includes('"vote":"D"'));
});

test('l\'écran de résultat du téléphone', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete();
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, c.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  montrerResultats(salle);

  const vueA = vueJoueur(salle, a);
  assert.deepEqual(
    [vueA.ecran, vueA.vote, vueA.elus, vueA.commeLeGroupe, vueA.points, vueA.votesRecus, vueA.rang],
    ['resultat', 'B', ['B'], true, 1000, 1, 1],
  );
  const vueD = vueJoueur(salle, d);
  assert.deepEqual([vueD.vote, vueD.commeLeGroupe, vueD.points, vueD.votesRecus], [null, false, 0, 0]);
});

test('arrivée en cours de manche : ni votant ni candidat, puis joue à la suivante', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  assert.ok(!vueJoueur(salle, a).candidats.some((c) => c.id === tardif.id));
  montrerResultats(salle);
  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'voter');
  assert.ok(vueJoueur(salle, a).candidats.some((c) => c.id === tardif.id));
});
