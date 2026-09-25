import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, passerApresPodium, synchroniserMinuteur,
  terminerPartie, vueJoueur, vueTv,
} from '../salles.js';
import { modes, modesAVenir } from './index.js';
import {
  NOMBRE_QUESTIONS, banqueMemeReponse, cleReponse, enregistrerReponse, formerGroupes,
  montrerResultats, passerALaSuite, pointsDuGroupe, suivant, verifierFinAnticipee,
} from './meme-reponse.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_ESTIMATION } from './estimation.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_QUIZ } from './quiz.js';

const PSEUDOS = ['A', 'B', 'C', 'D', 'E', 'F'];

const FRUITS_ROUGES = {
  id: 'm9999',
  texte: 'Cite un fruit rouge',
  reponses: [
    { reponse: 'Fraise', variantes: [] },
    { reponse: 'Cerise', variantes: [] },
    { reponse: 'Coca-Cola', variantes: ['Coca', 'Coke'] },
    { reponse: 'Tomate', variantes: [] },
  ],
};

// n joueurs, mode Même réponse, partie lancée sur une question connue.
function sallePrete(n = 3) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'meme-reponse'), true);
  demarrerPartie(salle);
  salle.etatMode.questions[0] = FRUITS_ROUGES;
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

// Réponses fictives : { joueur: texte } → le format de etatMode.reponses.
const reponses = (textes) => Object.fromEntries(
  Object.entries(textes).map(([joueurId, texte]) => [joueurId, { texte, recuA: 0 }]),
);

// Chaque joueur répond le texte donné, dans l'ordre, puis résultats.
function repondreTous(salle, joueurs, textes) {
  joueurs.forEach((joueur, i) => assert.equal(enregistrerReponse(salle, joueur.id, textes[i]), true, textes[i]));
  montrerResultats(salle);
}

// --- Registre et choix du mode ---

test('Même réponse est dans le registre et n\'est plus à venir', () => {
  assert.equal(modes['meme-reponse'].joueursMin, 3);
  assert.ok(!modesAVenir.some((mode) => mode.id === 'meme-reponse'));
});

test('choix du mode : refusé à 2 joueurs, accepté à 3', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'meme-reponse'), false);
  ajouterJoueur(salle, 'C', 'C');
  assert.equal(choisirMode(salle, 'meme-reponse'), true);
});

// --- Clé ---

test('clé : casse, accents, espaces, ponctuation et tirets ignorés', () => {
  for (const texte of ['FRAISE', 'fraise', ' fraise ', 'Fraise !', 'fräise']) assert.equal(cleReponse(texte), 'fraise', texte);
  assert.equal(cleReponse('Pâté'), 'pate');
  assert.equal(cleReponse('Coca-Cola'), cleReponse('coca   cola'));
  assert.equal(cleReponse('Qui est-ce ?'), 'qui est ce');
});

test('clé : article en tête retiré', () => {
  assert.equal(cleReponse('Les fraises'), 'fraise');
  assert.equal(cleReponse('l\'ananas'), cleReponse('ananas'));
  assert.equal(cleReponse('de la purée'), 'puree');
  assert.equal(cleReponse('une pomme'), 'pomme');
  assert.equal(cleReponse('Un'), 'un');
});

test('clé : pluriel simple retiré, mots de 3 lettres gardés', () => {
  assert.equal(cleReponse('Fraises'), 'fraise');
  assert.equal(cleReponse('Choux'), 'chou');
  assert.equal(cleReponse('haricots verts'), cleReponse('haricot vert'));
  assert.equal(cleReponse('bus'), 'bus');
});

test('clé : pas de tolérance aux fautes, clé vide sans lettre ni chiffre', () => {
  assert.notEqual(cleReponse('canard'), cleReponse('canari'));
  assert.equal(cleReponse('!!!'), '');
  assert.equal(cleReponse('Œuf'), 'oeuf');
});

// --- Groupes et points ---

test('groupes : formes d\'une réponse connue réunies sous son libellé', () => {
  const groupes = formerGroupes(reponses({ a: 'Coke', b: 'coca', c: 'COCA-COLA', d: 'fraises' }), FRUITS_ROUGES);
  assert.deepEqual(groupes.map((g) => [g.libelle, g.joueurs]), [['Coca-Cola', ['a', 'b', 'c']], ['Fraise', ['d']]]);
});

test('groupes : réponses inconnues de même clé réunies, avec le texte du premier', () => {
  const groupes = formerGroupes(reponses({ a: 'Grenade', b: 'Cerise', c: 'les grenades !' }), FRUITS_ROUGES);
  assert.deepEqual(groupes.map((g) => [g.libelle, g.joueurs]), [['Grenade', ['a', 'c']], ['Cerise', ['b']]]);
});

test('groupes : tri par taille puis par ordre d\'arrivée', () => {
  const groupes = formerGroupes(reponses({ a: 'Tomate', b: 'Cerise', c: 'Fraise', d: 'Cerise', e: 'Fraise' }), FRUITS_ROUGES);
  assert.deepEqual(groupes.map((g) => g.libelle), ['Cerise', 'Fraise', 'Tomate']);
});

test('points : 100 par joueur du groupe, +300 au plus grand, 0 seul', () => {
  assert.equal(pointsDuGroupe(1, false), 0);
  assert.equal(pointsDuGroupe(2, false), 200);
  assert.equal(pointsDuGroupe(3, true), 600);
});

test('points : 3-2-1 à 6 joueurs', () => {
  const { salle, joueurs } = sallePrete(6);
  repondreTous(salle, joueurs, ['Fraise', 'Cerise', 'fraises', 'cerise', 'Tomate', 'la fraise']);
  assert.deepEqual(joueurs.map((j) => j.score), [600, 200, 600, 200, 0, 600]);
});

test('points : deux groupes ex æquo en tête ont tous les deux le bonus', () => {
  const { salle, joueurs } = sallePrete(6);
  repondreTous(salle, joueurs, ['Fraise', 'Cerise', 'Fraise', 'Cerise', 'Tomate', 'Coca']);
  assert.deepEqual(joueurs.map((j) => j.score), [500, 500, 500, 500, 0, 0]);
});

test('points : unanimité', () => {
  const { salle, joueurs } = sallePrete(6);
  repondreTous(salle, joueurs, Array(6).fill('Fraise'));
  assert.ok(joueurs.every((j) => j.score === 900));
  assert.equal(vueTv(salle).etatMode.unanimite, true);
});

test('points : paire à 3 joueurs, le joueur seul ne marque rien', () => {
  const { salle, joueurs } = sallePrete(3);
  repondreTous(salle, joueurs, ['Fraise', 'Fraise', 'Cerise']);
  assert.deepEqual(joueurs.map((j) => j.score), [500, 500, 0]);
  assert.equal(vueTv(salle).etatMode.unanimite, false);
});

test('points : pas de réponse, une seule réponse, tout le monde seul → 0', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete(3);
  enregistrerReponse(salle, a.id, 'Fraise');
  montrerResultats(salle);
  assert.deepEqual([a.score, b.score, c.score], [0, 0, 0]);
  assert.equal(vueTv(salle).etatMode.groupes[0].enTete, false);
  assert.equal(vueTv(salle).etatMode.unanimite, false);

  passerALaSuite(salle);
  salle.etatMode.questions[1] = FRUITS_ROUGES;
  repondreTous(salle, [a, b, c], ['Fraise', 'Cerise', 'Tomate']);
  assert.deepEqual([a.score, b.score, c.score], [0, 0, 0]);
});

test('points : aucune réponse, personne ne marque', () => {
  const { salle, joueurs } = sallePrete(3);
  montrerResultats(salle);
  assert.ok(joueurs.every((j) => j.score === 0));
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(vue.groupes, []);
  assert.deepEqual(vue.sansReponse, joueurs.map((j) => j.id));
});

// --- Réponses ---

test('une réponse valide est acceptée une seule fois, bords retirés', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, '  Fraise  '), true);
  assert.equal(enregistrerReponse(salle, a.id, 'Cerise'), false);
  assert.equal(salle.etatMode.reponses[a.id].texte, 'Fraise');
});

test('une réponse invalide est refusée, 30 caractères acceptés', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  for (const texte of ['', '   ', 'x'.repeat(31), '?!…', 3, null, undefined, ['Fraise']]) {
    assert.equal(enregistrerReponse(salle, a.id, texte), false, String(texte));
  }
  assert.equal(enregistrerReponse(salle, b.id, ` ${'x'.repeat(30)} `), true);
});

test('une réponse hors saisie ou d\'un joueur non attendu est refusée', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(enregistrerReponse(salle, tardif.id, 'Fraise'), false);
  montrerResultats(salle);
  assert.equal(enregistrerReponse(salle, a.id, 'Fraise'), false);
});

// --- Déroulé ---

test('une partie compte 10 questions tirées de la banque Même réponse', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'meme-reponse');
  demarrerPartie(salle);
  assert.equal(salle.etatMode.questions.length, NOMBRE_QUESTIONS);
  assert.ok(salle.etatMode.questions.every((q) => q.id.startsWith('m')));
  assert.ok(banqueMemeReponse().length >= NOMBRE_QUESTIONS);
});

test('fin anticipée : dès que tous ont répondu, et après la déconnexion du dernier attendu', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Fraise');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'saisie');

  c.connecte = false;
  enregistrerReponse(salle, b.id, 'Fraise');
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'resultats');
  assert.deepEqual(vueTv(salle).etatMode.sansReponse, [c.id]);
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

test('minuteur : résultats à 30 s, question suivante 12 s après', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  synchroniserMinuteur(salle, quandAvance);

  t.mock.timers.tick(29999);
  assert.equal(etape(salle), 'saisie');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'resultats');
  t.mock.timers.tick(11999);
  assert.equal(etape(salle), 'resultats');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'saisie');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('terminer pendant une saisie : la question en cours n\'est pas comptée', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Fraise');
  enregistrerReponse(salle, b.id, 'Fraise');
  terminerPartie(salle);
  assert.equal(salle.etat, 'podium');
  assert.equal(a.score, 0);
  assert.deepEqual(vueTv(salle).etatMode.classement.map((l) => l.points), [0, 0, 0]);
});

test('questionsVues : les id m… cohabitent avec q… et e…, sans répétition', () => {
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
  assert.equal(salle.questionsVues.filter((id) => id.startsWith('m')).length, 3 * NOMBRE_QUESTIONS);
});

// --- Ce que voient la TV et les téléphones ---

test('pendant la saisie, la TV ne reçoit aucun texte de réponse', () => {
  const { salle, joueurs: [a] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Framboise');
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(
    Object.keys(vue).sort(),
    ['numero', 'ontRepondu', 'phase', 'question', 'tempsRestantMs', 'total'],
  );
  assert.deepEqual(vue.ontRepondu, [a.id]);
  assert.deepEqual(Object.keys(vue.question), ['texte']);
  assert.ok(!JSON.stringify(vueTv(salle)).includes('Framboise'));
});

test('la TV et les téléphones ne reçoivent jamais les réponses connues', () => {
  const { salle, joueurs } = sallePrete();
  const secrets = ['Coke', 'Tomate', 'variantes', 'reponses'];
  const verifier = () => {
    const vues = [vueTv(salle), ...joueurs.map((j) => vueJoueur(salle, j))];
    for (const vue of vues) {
      for (const secret of secrets) assert.ok(!JSON.stringify(vue).includes(secret), secret);
    }
  };
  verifier();
  repondreTous(salle, joueurs, ['Fraise', 'Fraise', 'Cerise']);
  verifier();
});

test('aux résultats, la TV reçoit les groupes, les absents et le classement', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  enregistrerReponse(salle, a.id, 'coca');
  enregistrerReponse(salle, b.id, 'Coke');
  montrerResultats(salle);
  const vue = vueTv(salle).etatMode;
  assert.deepEqual(vue.groupes, [
    { libelle: 'Coca-Cola', joueurs: [a.id, b.id], taille: 2, enTete: true, points: 500 },
  ]);
  assert.deepEqual(vue.sansReponse, [c.id]);
  assert.equal(vue.unanimite, true);
  assert.deepEqual(vue.classement.map((l) => l.points), [500, 500, 0]);
});

test('un téléphone ne reçoit jamais la réponse d\'un autre joueur pendant la saisie', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Framboise');
  const vueB = vueJoueur(salle, b);
  assert.deepEqual([vueB.ecran, vueB.numero, vueB.question], ['repondre', 1, { texte: 'Cite un fruit rouge' }]);
  assert.ok(!JSON.stringify(vueB).includes('Framboise'));
  const vueA = vueJoueur(salle, a);
  assert.deepEqual([vueA.ecran, vueA.texte], ['reponse_envoyee', 'Framboise']);
});

test('l\'écran de résultat du téléphone', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete();
  enregistrerReponse(salle, a.id, 'Fraises');
  enregistrerReponse(salle, b.id, 'fraise');
  montrerResultats(salle);

  const vueA = vueJoueur(salle, a);
  assert.deepEqual(
    [vueA.ecran, vueA.texte, vueA.libelle, vueA.taille, vueA.enTete, vueA.points, vueA.rang],
    ['resultat', 'Fraises', 'Fraise', 2, true, 500, 1],
  );
  const vueC = vueJoueur(salle, c);
  assert.deepEqual([vueC.texte, vueC.libelle, vueC.taille, vueC.points, vueC.rang], [null, null, 0, 0, 3]);
});

test('arrivée en cours de question : attend la suivante', () => {
  const { salle } = sallePrete();
  const { joueur: tardif } = ajouterJoueur(salle, 'Tardif', 's9');
  assert.equal(vueJoueur(salle, tardif).ecran, 'attente_question');
  montrerResultats(salle);
  passerALaSuite(salle);
  assert.equal(vueJoueur(salle, tardif).ecran, 'repondre');
});
