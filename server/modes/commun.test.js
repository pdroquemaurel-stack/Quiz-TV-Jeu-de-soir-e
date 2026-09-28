import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, demarrerPartie, fermerSalle, reglerMode,
} from '../salles.js';
import {
  classement, cleReponse, creerOptions, echeanceDePhase, fusionnerParCle, normaliser, questionCourante, questionSuivanteOuPodium,
  tempsRestantMs, tirerQuestions,
} from './commun.js';
import { modes, modesAVenir } from './index.js';

// --- Registre des modes ---

const CONTRAT = [
  'demarrerPartie', 'enregistrerReponse', 'verifierFinAnticipee', 'suivant',
  'echeance', 'avancer', 'vueTv', 'vueJoueur',
];

test('chaque mode du registre respecte le contrat', () => {
  for (const [cle, mode] of Object.entries(modes)) {
    assert.equal(mode.id, cle);
    assert.equal(typeof mode.nom, 'string', `${cle}.nom`);
    assert.equal(typeof mode.regleCourte, 'string', `${cle}.regleCourte`);
    assert.ok(Number.isInteger(mode.joueursMin) && mode.joueursMin >= 1, `${cle}.joueursMin`);
    for (const nom of CONTRAT) assert.equal(typeof mode[nom], 'function', `${cle}.${nom}`);
  }
});

test('les modes à venir sont décrits, sans doublon ni conflit avec le registre', () => {
  const ids = modesAVenir.map((mode) => mode.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const mode of modesAVenir) {
    assert.ok(!Object.hasOwn(modes, mode.id), mode.id);
    assert.ok(mode.nom && mode.regleCourte, mode.id);
    assert.ok(Number.isInteger(mode.joueursMin), mode.id);
  }
});

// --- Options de l'hôte : longueur de la partie et temps pour répondre ---

test('options : le choix du milieu par défaut, seules les valeurs proposées acceptées', () => {
  const options = creerOptions('essai', { longueurs: [1, 3, 5], unite: ['manche', 'manches'], temps: [15, 20, 30] });
  assert.deepEqual(options.reglagesParDefaut(), { longueur: 3, temps: 20 });
  assert.deepEqual(options.validerReglages({ longueur: 1, temps: 30, autre: 'ignoré' }), { longueur: 1, temps: 30 });
  for (const donnees of [null, {}, { longueur: 2, temps: 20 }, { longueur: 3, temps: '20' }, { longueur: 3 }]) {
    assert.equal(options.validerReglages(donnees), null, JSON.stringify(donnees));
  }
  const salle = { reglagesMode: {} };
  assert.equal(options.vueReglages(salle).resume, '3 manches · 20 s');
  salle.reglagesMode.essai = { longueur: 1, temps: 15 };
  const vue = options.vueReglages(salle);
  assert.equal(vue.resume, '1 manche · 15 s');
  assert.deepEqual(vue.valeurs, { longueur: 1, temps: 15 });
  assert.deepEqual(vue.options.longueurs.map((choix) => choix.libelle), ['1 manche', '3 manches', '5 manches']);
  assert.deepEqual(vue.options.temps.map((choix) => choix.id), [15, 20, 30]);
});

// [mode, longueur choisie, temps choisi (s), phase où l'on répond]
const OPTIONS_CHOISIES = [
  ['quiz', 15, 30, 'question'], ['estimation', 12, 45, 'question'], ['qui-de-nous', 5, 10, 'vote'],
  ['meme-reponse', 15, 45, 'saisie'], ['bluff', 5, 60, 'saisie'], ['legende', 12, 30, 'saisie'],
  ['geoquiz', 3, 90, 'devinette'], ['undercover', 5, 30, 'vote'],
];

test('options : chaque mode joue la longueur et le temps choisis par l\'hôte', () => {
  for (const [id, longueur, temps, phase] of OPTIONS_CHOISIES) {
    const salle = creerSalle('tv');
    for (const pseudo of ['A', 'B', 'C', 'D', 'E']) ajouterJoueur(salle, pseudo, pseudo);
    assert.equal(choisirMode(salle, id), true, id);
    assert.equal(reglerMode(salle, { ...modes[id].reglagesParDefaut(), longueur, temps }), true, id);
    demarrerPartie(salle);
    const { questions, paires } = salle.etatMode;
    assert.equal((questions ?? paires).length, longueur, id);
    salle.etatMode.phase = phase;
    assert.equal(modes[id].echeance(salle) - salle.etatMode.debutPhaseA, temps * 1000, id);
    fermerSalle(salle);
  }
});

// --- Classement ---

const aucunPoint = () => 0;

test('classement : une égalité donne le même rang et saute le suivant (1, 1, 3)', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  const { joueur: d } = ajouterJoueur(salle, 'D', 's4');
  a.score = 1500;
  b.score = 1800;
  c.score = 1800;
  d.score = 900;

  const lignes = classement(salle, aucunPoint);
  assert.deepEqual(lignes.map((l) => l.pseudo), ['B', 'C', 'A', 'D']);
  assert.deepEqual(lignes.map((l) => l.rang), [1, 1, 3, 4]);
});

test('classement : tout le monde à 0 est premier ex æquo', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 's1');
  ajouterJoueur(salle, 'B', 's2');
  assert.deepEqual(classement(salle, aucunPoint).map((l) => l.rang), [1, 1]);
});

test('classement : rangAvant, le rang avant les points de la manche, avec ex æquo', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  const { joueur: b } = ajouterJoueur(salle, 'B', 's2');
  const { joueur: c } = ajouterJoueur(salle, 'C', 's3');
  // Avant la manche : A 2000, B 1000, C 1000. C gagne 1500 et passe en tête.
  a.score = 2000;
  b.score = 1000;
  c.score = 2500;
  const points = { [a.id]: 0, [b.id]: 0, [c.id]: 1500 };

  const lignes = classement(salle, (_, id) => points[id]);
  assert.deepEqual(lignes.map((l) => [l.pseudo, l.rangAvant, l.rang]), [
    ['C', 2, 1], ['A', 1, 2], ['B', 2, 3],
  ]);
});

test('classement : rangAvant est null tant que personne n\'avait de points', () => {
  const salle = creerSalle('tv');
  const { joueur: a } = ajouterJoueur(salle, 'A', 's1');
  ajouterJoueur(salle, 'B', 's2');
  a.score = 900;
  const lignes = classement(salle, (_, id) => (id === a.id ? 900 : 0));
  assert.deepEqual(lignes.map((l) => l.rangAvant), [null, null]);
});

// --- Tirage des questions ---

function banqueFictive(nombre) {
  return Array.from({ length: nombre }, (_, i) => ({ id: `q${String(i + 1).padStart(4, '0')}` }));
}

const idsDe = (questions) => questions.map((question) => question.id);

test('tirage : le nombre demandé, sans doublon', () => {
  const tirees = tirerQuestions(banqueFictive(12), [], 10);
  assert.equal(tirees.length, 10);
  assert.equal(new Set(idsDe(tirees)).size, 10);
});

test('tirage : inédites d\'abord, puis les déjà vues les plus anciennes', () => {
  const banque = banqueFictive(12);
  // Vues dans cet ordre : q0005 est la plus ancienne. Inédites : q0011 et q0012.
  const vues = ['q0005', 'q0001', 'q0002', 'q0003', 'q0004', 'q0006', 'q0007', 'q0008', 'q0009', 'q0010'];
  const ids = idsDe(tirerQuestions(banque, vues, 10));
  assert.deepEqual(ids.slice(0, 2).sort(), ['q0011', 'q0012']);
  assert.deepEqual(ids.slice(2), vues.slice(0, 8));
});

// --- Saisies libres ---

test('normaliser : casse, accents et espaces ignorés', () => {
  for (const texte of ['PISCINE', 'piscine', 'Piscíne', '  piscine  ']) assert.equal(normaliser(texte), 'piscine', texte);
  assert.equal(normaliser('Écharpe'), 'echarpe');
  assert.equal(normaliser('pomme   de  terre'), 'pomme de terre');
});

// --- Clé des réponses libres ---

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

// --- Enchaînement des questions ---

// Une salle en partie, sur la question d'index donné parmi 3.
function salleEnPartie(indexQuestion, phase = 'question') {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'Paul', 's1');
  salle.etat = 'partie';
  salle.etatMode = { questions: ['q1', 'q2', 'q3'], indexQuestion, phase, debutPhaseA: 1000 };
  return salle;
}

test('questionCourante : la question de l\'index en cours', () => {
  assert.equal(questionCourante(salleEnPartie(1)), 'q2');
});

test('questionSuivanteOuPodium : démarre la suivante, puis le podium après la dernière', () => {
  const demarrees = [];
  const demarrer = (salle, index) => demarrees.push(index);
  const salle = salleEnPartie(1);
  questionSuivanteOuPodium(salle, demarrer);
  assert.deepEqual(demarrees, [2]);
  assert.equal(salle.etat, 'partie');

  const derniere = salleEnPartie(2);
  questionSuivanteOuPodium(derniere, demarrer);
  assert.deepEqual(demarrees, [2]);
  assert.equal(derniere.etat, 'podium');
});

test('echeanceDePhase : début de la phase + sa durée, null hors partie ou pour une phase sans durée', () => {
  const durees = { question: 20000, revelation: 8000 };
  assert.equal(echeanceDePhase(salleEnPartie(0, 'question'), durees), 21000);
  assert.equal(echeanceDePhase(salleEnPartie(0, 'revelation'), durees), 9000);
  assert.equal(echeanceDePhase(salleEnPartie(0, 'description'), durees), null);
  const horsPartie = salleEnPartie(0);
  horsPartie.etat = 'podium';
  assert.equal(echeanceDePhase(horsPartie, durees), null);
});

test('tempsRestantMs : jamais négatif', () => {
  const salle = salleEnPartie(0);
  assert.equal(tempsRestantMs(salle, () => Date.now() + 5000) <= 5000, true);
  assert.equal(tempsRestantMs(salle, () => Date.now() + 5000) > 4000, true);
  assert.equal(tempsRestantMs(salle, () => Date.now() - 5000), 0);
});

// --- Fusion des textes libres (Le bluff, La légende) ---

test('fusionnerParCle : même clé, une seule entrée avec le texte du premier arrivé et tous ses auteurs', () => {
  const textes = {
    b: { texte: 'les Chiens', recuA: 20 },
    a: { texte: 'Chien', recuA: 10 },
    c: { texte: 'Chat', recuA: 15 },
  };
  assert.deepEqual(fusionnerParCle(textes), [
    { texte: 'Chien', auteurs: ['a', 'b'] },
    { texte: 'Chat', auteurs: ['c'] },
  ]);
  assert.deepEqual(fusionnerParCle({}), []);
});
