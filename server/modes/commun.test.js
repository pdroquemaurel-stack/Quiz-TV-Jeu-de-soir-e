import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import { classement, tirerQuestions } from './commun.js';
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
