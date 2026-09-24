import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, reconnecterJoueur, synchroniserMinuteur,
  terminerPartie, vueJoueur, vueTv,
} from '../salles.js';
import { modes, modesAVenir } from './index.js';
import {
  NOMBRE_MANCHES, avancer, composition, distribuerRoles, echeance, enregistrerReponse, motTrouve,
  normaliser, suivant, tirerOrdreParole, vainqueur, verifierFinAnticipee,
} from './undercover.js';
import { NOMBRE_QUESTIONS as NOMBRE_QUESTIONS_QUIZ } from './quiz.js';

const PSEUDOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// n joueurs, mode Undercover, partie lancée.
function sallePrete(n = 4) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'undercover'), true);
  demarrerPartie(salle);
  return { salle, joueurs };
}

// Rôles fixés par le test (le tirage est au hasard) : 'u' undercover, 'm' Mister White, '.' civil.
function imposerRoles(salle, joueurs, schema) {
  const noms = { u: 'undercover', m: 'mister_white', '.': 'civil' };
  salle.etatMode.roles = Object.fromEntries(joueurs.map((joueur, i) => [joueur.id, noms[schema[i]]]));
}

// Un tour complet : l'hôte lance le vote, tous les votants désignent `cible`.
function eliminer(salle, cible) {
  if (salle.etatMode.phase === 'description') suivant(salle);
  for (const votant of salle.etatMode.attendus) {
    const vote = votant === cible.id ? autreQue(salle, cible.id) : cible.id;
    enregistrerReponse(salle, votant, vote);
  }
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'elimination');
}

function autreQue(salle, joueurId) {
  return salle.etatMode.attendus.find((id) => id !== joueurId);
}

const etape = (salle) => (salle.etat === 'partie' ? salle.etatMode.phase : salle.etat);

function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
}

function quandAvance(salle) {
  synchroniserMinuteur(salle, quandAvance);
}

// Toutes les clés d'un objet, sous-objets compris, pour chercher un secret.
function contient(objet, valeur) {
  return JSON.stringify(objet).includes(JSON.stringify(valeur));
}

// --- Registre et choix du mode ---

test('Undercover est dans le registre et n\'est plus à venir', () => {
  assert.equal(modes.undercover.joueursMin, 4);
  assert.ok(!modesAVenir.some((mode) => mode.id === 'undercover'));
});

test('choix du mode : refusé à 3 joueurs, accepté à 4', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'undercover'), false);
  ajouterJoueur(salle, 'D', 'D');
  assert.equal(choisirMode(salle, 'undercover'), true);
});

// --- Composition et distribution ---

test('composition : 4 → 1 undercover, 5-6 → + Mister White, 7-10 → 2 undercovers', () => {
  assert.deepEqual(composition(4), { undercovers: 1, misterWhite: 0 });
  assert.deepEqual(composition(5), { undercovers: 1, misterWhite: 1 });
  assert.deepEqual(composition(6), { undercovers: 1, misterWhite: 1 });
  for (const n of [7, 8, 9, 10]) assert.deepEqual(composition(n), { undercovers: 2, misterWhite: 1 });
  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    const roles = Object.values(distribuerRoles(PSEUDOS.slice(0, n)));
    const { undercovers, misterWhite } = composition(n);
    assert.equal(roles.filter((r) => r === 'undercover').length, undercovers);
    assert.equal(roles.filter((r) => r === 'mister_white').length, misterWhite);
    assert.equal(roles.filter((r) => r === 'civil').length, n - undercovers - misterWhite);
  }
});

test('distribution : même mot pour les civils, l\'autre pour les undercovers, aucun pour Mister White', () => {
  const { salle, joueurs } = sallePrete(7);
  const { roles, motCivils, motUndercover, paires } = salle.etatMode;
  assert.deepEqual(
    [motCivils.mot, motUndercover.mot].sort(),
    paires[0].mots.map((entree) => entree.mot).sort(),
  );
  for (const joueur of joueurs) {
    const { mot, misterWhite } = vueJoueur(salle, joueur);
    const attendu = { civil: motCivils.mot, undercover: motUndercover.mot, mister_white: null }[roles[joueur.id]];
    assert.equal(mot, attendu);
    assert.equal(misterWhite, roles[joueur.id] === 'mister_white');
  }
});

test('distribution : un joueur déconnecté au début de la manche n\'a pas de rôle', () => {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, 5).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  choisirMode(salle, 'undercover');
  joueurs[4].connecte = false;
  demarrerPartie(salle);
  assert.equal(salle.etatMode.roles[joueurs[4].id], undefined);
  assert.equal(Object.keys(salle.etatMode.roles).length, 4);
  assert.equal(vueJoueur(salle, joueurs[4]).ecran, 'attente_manche');
});

test('ordre de parole : Mister White n\'est jamais le premier', () => {
  const ids = PSEUDOS.slice(0, 6);
  const roles = { A: 'mister_white', B: 'undercover', C: 'civil', D: 'civil', E: 'civil', F: 'civil' };
  const premiers = new Set();
  for (let i = 0; i < 300; i++) {
    const ordre = tirerOrdreParole(ids, roles);
    assert.notEqual(ordre[0], 'A');
    assert.deepEqual([...ordre].sort(), ids);
    premiers.add(ordre[0]);
  }
  assert.equal(premiers.size, 5);
});

// --- Victoire et devinette (règles pures) ---

test('vainqueur : civils sans infiltré restant, infiltrés à un seul civil, sinon personne', () => {
  const roles = { a: 'undercover', b: 'mister_white', c: 'civil', d: 'civil', e: 'civil' };
  assert.equal(vainqueur(roles, []), null);
  assert.equal(vainqueur(roles, ['a']), null);
  assert.equal(vainqueur(roles, ['a', 'b']), 'civils');
  assert.equal(vainqueur(roles, ['c']), null);
  assert.equal(vainqueur(roles, ['c', 'd']), 'infiltres');
});

test('devinette : casse, accents et variantes acceptés, mot de l\'undercover refusé', () => {
  const plage = { mot: 'Plage', variantes: ['Plages'] };
  for (const proposition of ['Plage', 'PLAGE', ' plâge ', 'plages']) assert.ok(motTrouve(proposition, plage), proposition);
  assert.ok(!motTrouve('Piscine', plage));
  assert.ok(!motTrouve('Pla', plage));
  assert.equal(normaliser('Écharpe'), 'echarpe');
});

// --- Déroulé d'une manche ---

test('civils gagnants : 1000 pour chaque civil, éliminés compris, en fin de manche seulement', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  imposerRoles(salle, [a, b, c, d], 'u...');
  eliminer(salle, b);
  suivant(salle);
  assert.equal(etape(salle), 'description');
  assert.equal(salle.etatMode.tour, 2);
  eliminer(salle, a);
  assert.deepEqual([a.score, b.score, c.score, d.score], [0, 0, 0, 0]);
  suivant(salle);
  assert.equal(etape(salle), 'fin_manche');
  assert.equal(salle.etatMode.gagnant, 'civils');
  assert.deepEqual([a.score, b.score, c.score, d.score], [0, 1000, 1000, 1000]);
  assert.equal(salle.etatMode.victoires.civils, 1);
});

test('infiltrés gagnants : 2000 pour l\'undercover quand il ne reste qu\'un civil', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  imposerRoles(salle, [a, b, c, d], 'u...');
  eliminer(salle, b);
  suivant(salle);
  eliminer(salle, c);
  suivant(salle);
  assert.equal(salle.etatMode.gagnant, 'infiltres');
  assert.deepEqual([a.score, b.score, c.score, d.score], [2000, 0, 0, 0]);
});

test('Mister White éliminé qui trouve le mot : il gagne seul la manche', () => {
  const { salle, joueurs } = sallePrete(5);
  const [a, , , , e] = joueurs;
  imposerRoles(salle, joueurs, 'u...m');
  eliminer(salle, e);
  suivant(salle);
  assert.equal(etape(salle), 'devinette');
  assert.equal(enregistrerReponse(salle, a.id, salle.etatMode.motCivils.mot), false);
  const proposition = ` ${salle.etatMode.motCivils.mot.toUpperCase()} `;
  assert.equal(enregistrerReponse(salle, e.id, proposition), true);
  assert.equal(enregistrerReponse(salle, e.id, 'autre'), false);
  assert.equal(salle.etatMode.devinette.trouve, true);
  suivant(salle);
  assert.equal(salle.etatMode.gagnant, 'mister_white');
  assert.deepEqual(joueurs.map((j) => j.score), [0, 0, 0, 0, 2000]);
  assert.equal(salle.etatMode.victoires.misterWhite, 1);
});

test('Mister White qui donne le mot de l\'undercover : raté, la manche continue', () => {
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  eliminer(salle, joueurs[4]);
  suivant(salle);
  enregistrerReponse(salle, joueurs[4].id, salle.etatMode.motUndercover.mot);
  assert.equal(salle.etatMode.devinette.trouve, false);
  suivant(salle);
  assert.equal(etape(salle), 'description');
  assert.equal(salle.etatMode.tour, 2);
});

test('vote : égalité → départage entre ex æquo ; nouvelle égalité → personne éliminé', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  suivant(salle);
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  enregistrerReponse(salle, c.id, a.id);
  enregistrerReponse(salle, d.id, b.id);
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.dernierVote.elimine, null);
  assert.deepEqual([...salle.etatMode.dernierVote.departageAVenir].sort(), [a.id, b.id].sort());

  suivant(salle);
  assert.equal(etape(salle), 'vote');
  assert.equal(enregistrerReponse(salle, c.id, d.id), false, 'hors départage');
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  enregistrerReponse(salle, c.id, a.id);
  enregistrerReponse(salle, d.id, b.id);
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.dernierVote.elimine, null);
  assert.equal(salle.etatMode.dernierVote.departageAVenir, null);
  suivant(salle);
  assert.equal(etape(salle), 'description');
  assert.deepEqual(salle.etatMode.elimines, []);
});

test('vote : aucun vote → personne éliminé, nouveau tour', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete(4);
  suivant(salle);
  t.mock.timers.tick(20000);
  avancer(salle);
  assert.equal(salle.etatMode.dernierVote.elimine, null);
  assert.equal(salle.etatMode.dernierVote.departageAVenir, null);
  suivant(salle);
  assert.equal(etape(salle), 'description');
});

test('joueur:repondre : votes invalides refusés, vote pour un joueur déconnecté accepté', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  imposerRoles(salle, [a, b, c, d], 'u...');
  assert.equal(enregistrerReponse(salle, a.id, b.id), false, 'hors phase vote');
  eliminer(salle, d);
  suivant(salle);
  suivant(salle);
  assert.equal(enregistrerReponse(salle, a.id, a.id), false, 'soi-même');
  assert.equal(enregistrerReponse(salle, a.id, d.id), false, 'éliminé');
  assert.equal(enregistrerReponse(salle, a.id, 'j_inconnu'), false, 'inconnu');
  assert.equal(enregistrerReponse(salle, a.id, { id: b.id }), false, 'pas une chaîne');
  assert.equal(enregistrerReponse(salle, d.id, a.id), false, 'votant éliminé');
  b.connecte = false;
  assert.equal(enregistrerReponse(salle, a.id, b.id), true, 'candidat déconnecté');
  assert.equal(enregistrerReponse(salle, a.id, c.id), false, 'deuxième vote');
});

test('joueur:repondre : un joueur absent au début du vote n\'est pas attendu', () => {
  const { salle, joueurs: [a, b, , d] } = sallePrete(4);
  d.connecte = false;
  suivant(salle);
  d.connecte = true;
  assert.equal(enregistrerReponse(salle, d.id, a.id), false);
  assert.equal(vueJoueur(salle, d).ecran, 'mot');
  assert.equal(enregistrerReponse(salle, a.id, b.id), true);
});

test('hote:suivant : passe au vote, ignoré pendant le vote et pendant que Mister White cherche', () => {
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  assert.equal(suivant(salle), true);
  assert.equal(etape(salle), 'vote');
  assert.equal(suivant(salle), false);
  assert.equal(etape(salle), 'vote');
  eliminer(salle, joueurs[4]);
  suivant(salle);
  assert.equal(suivant(salle), false);
  assert.equal(etape(salle), 'devinette');
});

test('fin anticipée : tous ont voté, ou le dernier attendu se déconnecte', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  suivant(salle);
  enregistrerReponse(salle, a.id, b.id);
  enregistrerReponse(salle, b.id, a.id);
  enregistrerReponse(salle, c.id, b.id);
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'vote');
  d.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'elimination');
  assert.deepEqual(salle.etatMode.elimines, [b.id]);
});

// --- Chronos ---

test('chronos : pas de chrono en description, 20 s de vote, 8 s d\'élimination', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  imposerRoles(salle, [a, b, c, d], 'u...');
  quandAvance(salle);
  assert.equal(echeance(salle), null);
  t.mock.timers.tick(600000);
  assert.equal(etape(salle), 'description');

  suivant(salle);
  quandAvance(salle);
  enregistrerReponse(salle, b.id, a.id);
  t.mock.timers.tick(19999);
  assert.equal(etape(salle), 'vote');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'elimination');
  assert.deepEqual(salle.etatMode.elimines, [a.id]);
  t.mock.timers.tick(8000);
  assert.equal(etape(salle), 'fin_manche');
});

test('chronos : devinette ratée à 30 s, suite 5 s après', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  eliminer(salle, joueurs[4]);
  suivant(salle);
  quandAvance(salle);
  t.mock.timers.tick(30000);
  assert.equal(salle.etatMode.devinette.recuA, 30000);
  assert.equal(salle.etatMode.devinette.trouve, false);
  assert.equal(etape(salle), 'devinette');
  t.mock.timers.tick(5000);
  assert.equal(etape(salle), 'description');
});

test('chronos : manche suivante 15 s après la fin de manche, podium après la 3e', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete(4);
  quandAvance(salle);
  for (let manche = 1; manche <= NOMBRE_MANCHES; manche++) {
    assert.equal(salle.etatMode.indexManche, manche - 1);
    const undercover = joueurs.find((j) => salle.etatMode.roles[j.id] === 'undercover');
    eliminer(salle, undercover);
    suivant(salle);
    quandAvance(salle);
    assert.equal(etape(salle), 'fin_manche');
    t.mock.timers.tick(15000);
  }
  assert.equal(salle.etat, 'podium');
  assert.deepEqual(vueTv(salle).etatMode.victoires, { civils: 3, infiltres: 0, misterWhite: 0 });
});

test('l\'hôte termine en cours de manche : la manche n\'est pas comptée', () => {
  const { salle, joueurs: [a, b, c, d] } = sallePrete(4);
  imposerRoles(salle, [a, b, c, d], 'u...');
  eliminer(salle, a);
  assert.equal(terminerPartie(salle), true);
  assert.deepEqual([a, b, c, d].map((j) => j.score), [0, 0, 0, 0]);
  assert.deepEqual(vueTv(salle).etatMode.victoires, { civils: 0, infiltres: 0, misterWhite: 0 });
});

// --- Secrets ---

test('secret : la TV ne reçoit ni mot ni rôle caché avant la fin de manche', () => {
  const { salle, joueurs } = sallePrete(7);
  const { motCivils, motUndercover, roles } = salle.etatMode;
  const verifier = () => {
    const vue = vueTv(salle);
    assert.ok(!contient(vue, motCivils.mot) && !contient(vue, motUndercover.mot), etape(salle));
    assert.ok(!contient(vue, 'variantes'));
    for (const joueur of joueurs) {
      const cache = !salle.etatMode.elimines.includes(joueur.id);
      if (cache) assert.ok(!contient(vue.etatMode, { id: joueur.id, role: roles[joueur.id] }));
    }
    assert.equal(vue.etatMode.roles, undefined);
    return vue;
  };
  verifier();
  suivant(salle);
  enregistrerReponse(salle, joueurs[0].id, joueurs[1].id);
  const pendantVote = verifier();
  assert.equal(pendantVote.etatMode.votes, undefined);
  assert.equal(pendantVote.etatMode.resultats, undefined);
  const civil = joueurs.find((j) => roles[j.id] === 'civil');
  eliminer(salle, civil);
  const elimination = verifier();
  assert.deepEqual(elimination.etatMode.elimine, { id: civil.id, role: 'civil' });
  assert.ok(Array.isArray(elimination.etatMode.votes));
});

test('secret : un téléphone ne reçoit que son mot, sans rôle ni variantes', () => {
  const { salle, joueurs } = sallePrete(7);
  const { motCivils, motUndercover, roles } = salle.etatMode;
  for (const joueur of joueurs) {
    const vue = vueJoueur(salle, joueur);
    const autreMot = roles[joueur.id] === 'undercover' ? motCivils.mot : motUndercover.mot;
    assert.ok(!contient(vue, autreMot), joueur.pseudo);
    assert.ok(!contient(vue, 'variantes'));
    assert.equal(vue.role, undefined);
    assert.equal(vue.roles, undefined);
  }
});

test('secret : un civil et un undercover reçoivent exactement les mêmes champs', () => {
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  const [undercover, civil] = [joueurs[0], joueurs[1]];
  const cles = (vue) => Object.keys(vue).sort();
  assert.deepEqual(cles(vueJoueur(salle, undercover)), cles(vueJoueur(salle, civil)));
  suivant(salle);
  assert.deepEqual(cles(vueJoueur(salle, undercover)), cles(vueJoueur(salle, civil)));
  enregistrerReponse(salle, undercover.id, joueurs[2].id);
  enregistrerReponse(salle, civil.id, joueurs[2].id);
  assert.deepEqual(cles(vueJoueur(salle, undercover)), cles(vueJoueur(salle, civil)));
});

test('secret : un joueur éliminé ne voit que son propre rôle', () => {
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  eliminer(salle, joueurs[1]);
  const vue = vueJoueur(salle, joueurs[1]);
  assert.equal(vue.ecran, 'elimine');
  assert.equal(vue.role, 'civil');
  assert.equal(vue.roles, undefined);
  assert.ok(!contient(vue, 'mister_white'));
});

test('secret : pendant la devinette, personne ne reçoit le mot attendu', () => {
  const { salle, joueurs } = sallePrete(5);
  imposerRoles(salle, joueurs, 'u...m');
  eliminer(salle, joueurs[4]);
  suivant(salle);
  const { motCivils } = salle.etatMode;
  assert.ok(!contient(vueTv(salle), motCivils.mot));
  assert.equal(vueJoueur(salle, joueurs[4]).ecran, 'deviner');
  assert.ok(!contient(vueJoueur(salle, joueurs[4]), motCivils.mot));
});

// --- Reconnexion et contenu ---

test('reconnexion : un joueur qui revient retrouve le même mot', () => {
  const { salle, joueurs } = sallePrete(4);
  const avant = vueJoueur(salle, joueurs[2]).mot;
  joueurs[2].connecte = false;
  reconnecterJoueur(salle, joueurs[2].id, 'nouveau-socket');
  assert.equal(vueJoueur(salle, joueurs[2]).mot, avant);
});

test('questionsVues : pas de paire répétée sur 3 parties, les id u… cohabitent avec q…', () => {
  const { salle } = sallePrete(4);
  for (let partie = 2; partie <= 3; partie++) {
    salle.etat = 'podium';
    demarrerPartie(salle);
  }
  const paires = salle.questionsVues.filter((id) => id.startsWith('u'));
  assert.equal(paires.length, 3 * NOMBRE_MANCHES);
  assert.equal(new Set(paires).size, paires.length);
  salle.etat = 'podium';
  choisirMode(salle, 'quiz');
  demarrerPartie(salle);
  assert.equal(salle.questionsVues.length, 3 * NOMBRE_MANCHES + NOMBRE_QUESTIONS_QUIZ);
});
