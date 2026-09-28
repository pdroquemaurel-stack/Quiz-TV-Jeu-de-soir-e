import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  DUREE_DEVINETTE_MS, DUREE_REVELATION_MS, REPARTITIONS, avancer, banqueGeoquiz, calculerPoints,
  calculerResultats, demarrerPartie, distanceKm, echeance, enregistrerReponse, lieuxJouables,
  normaliserLongitude, reglagesParDefaut, reveler, suivant, tirerLieux, validerReglages,
  verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './geoquiz.js';

// Le mode n'est pas encore dans le registre (temps 2) : on appelle ses fonctions directement.
function sallePrete({ joueurs = ['A', 'B'], manches } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'geoquiz';
  if (manches) salle.reglagesMode.geoquiz = { manches };
  salle.etat = 'partie';
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

const lieuCourant = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion];
const PARIS = { lat: 48.8566, lng: 2.3522 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };

// --- Distance et points ---

test('distance : Paris → New York ≈ 5 837 km, même point → 0, antipodes ≈ 20 015 km', () => {
  assert.ok(Math.abs(distanceKm(PARIS, NEW_YORK) - 5837) < 1);
  assert.equal(distanceKm(PARIS, PARIS), 0);
  assert.ok(Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }) - 20015) < 1);
});

test('points : le barème de la mini-spec', () => {
  const bareme = { 0: 5000, 100: 4756, 500: 3894, 1000: 3033, 2000: 1839, 5000: 410, 10000: 34, 20000: 0 };
  for (const [km, points] of Object.entries(bareme)) assert.equal(calculerPoints(Number(km)), points, `${km} km`);
});

test('longitude ramenée entre −180 et 180', () => {
  assert.equal(normaliserLongitude(190), -170);
  assert.equal(normaliserLongitude(-190), 170);
  assert.equal(normaliserLongitude(540), -180);
  assert.equal(normaliserLongitude(2.35), 2.35);
});

test('résultats : triés du plus proche au plus loin, km arrondi au dixième', () => {
  const lignes = calculerResultats({ a: { ...NEW_YORK }, b: { ...PARIS } }, PARIS);
  assert.deepEqual(lignes.map((l) => l.id), ['b', 'a']);
  assert.equal(lignes[0].km, 0);
  assert.equal(lignes[0].points, 5000);
  assert.equal(lignes[1].km, Math.round(distanceKm(PARIS, NEW_YORK) * 10) / 10);
});

// --- Réglages ---

test('réglages : 3, 5 ou 10 manches, 5 par défaut', () => {
  assert.deepEqual(reglagesParDefaut(), { manches: 5 });
  for (const manches of [3, 5, 10]) assert.deepEqual(validerReglages({ manches }), { manches });
  for (const donnees of [{ manches: 4 }, { manches: '5' }, { manches: 5.5 }, {}, null, { manches: 'toString' }]) {
    assert.equal(validerReglages(donnees), null, JSON.stringify(donnees));
  }
  const salle = creerSalle('tv');
  assert.equal(vueReglages(salle).manches, 5);
  salle.reglagesMode.geoquiz = { manches: 10 };
  assert.deepEqual(vueReglages(salle).options.manches, [3, 5, 10]);
  assert.equal(vueReglages(salle).resume, '10 manches');
});

// --- Tirage ---

function banqueTest(parDifficulte) {
  const banque = [];
  for (const [difficulte, nombre] of Object.entries(parDifficulte)) {
    for (let i = 0; i < nombre; i++) banque.push({ id: `l${difficulte}${i}`, difficulte: Number(difficulte) });
  }
  return banque;
}

test('tirage : répartition par difficulté, du plus facile au plus difficile', () => {
  const banque = banqueTest({ 1: 20, 2: 20, 3: 20 });
  for (const [manches, repartition] of Object.entries(REPARTITIONS)) {
    const lieux = tirerLieux(banque, [], Number(manches));
    assert.equal(lieux.length, Number(manches));
    assert.equal(new Set(lieux).size, lieux.length, 'aucun doublon');
    const difficultes = lieux.map((l) => l.difficulte);
    assert.deepEqual(difficultes, [...difficultes].sort(), 'ordre croissant');
    for (const [difficulte, nombre] of Object.entries(repartition)) {
      assert.equal(difficultes.filter((d) => d === Number(difficulte)).length, nombre);
    }
  }
});

test('tirage : il manque des difficiles, on complète avec des moyens', () => {
  const lieux = tirerLieux(banqueTest({ 1: 10, 2: 10 }), [], 5);
  assert.deepEqual(lieux.map((l) => l.difficulte), [1, 1, 2, 2, 2]);
});

test('tirage : les lieux jamais vus d\'abord', () => {
  const banque = banqueTest({ 1: 3, 2: 3, 3: 3 });
  const vus = ['l10', 'l20', 'l30'];
  const lieux = tirerLieux(banque, vus, 3);
  assert.ok(lieux.every((l) => !vus.includes(l.id)));
});

test('tirage : les exclus ne sont jamais tirés', () => {
  const pack = banqueTest({ 1: 2, 2: 2, 3: 2 });
  assert.deepEqual(lieuxJouables(pack, ['l10', 'l31']).map((l) => l.id), ['l11', 'l20', 'l21', 'l30']);
});

test('tirage : 3 parties de 5 manches sans répétition', () => {
  const { salle } = sallePrete();
  const ids = salle.etatMode.questions.map((l) => l.id);
  demarrerPartie(salle);
  ids.push(...salle.etatMode.questions.map((l) => l.id));
  demarrerPartie(salle);
  ids.push(...salle.etatMode.questions.map((l) => l.id));
  assert.equal(new Set(ids).size, 15);
});

test('partie : 5 manches par défaut, 10 si l\'hôte l\'a choisi', () => {
  assert.equal(sallePrete().salle.etatMode.questions.length, 5);
  assert.equal(sallePrete({ manches: 10 }).salle.etatMode.questions.length, 10);
  assert.ok(banqueGeoquiz.length >= 30);
});

// --- Pins ---

test('pin validé : accepté une seule fois', () => {
  const { salle, joueurs: [a] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  assert.equal(enregistrerReponse(salle, a.id, { ...PARIS, valide: true }), true);
  assert.equal(enregistrerReponse(salle, a.id, { ...NEW_YORK, valide: true }), false);
  assert.equal(enregistrerReponse(salle, a.id, { ...NEW_YORK, valide: false }), false);
  assert.equal(salle.etatMode.reponses[a.id].lat, PARIS.lat);
});

test('pin brouillon : gardé, remplacé par le suivant, sans rien à diffuser', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, { ...PARIS, valide: false }), false);
  assert.equal(enregistrerReponse(salle, a.id, { ...NEW_YORK }), false);
  assert.deepEqual(salle.etatMode.pins[a.id], NEW_YORK);
  assert.equal(salle.etatMode.reponses[a.id], undefined);
});

test('pin : coordonnées invalides refusées, longitude ramenée', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const invalides = [
    null, 'Paris', 42, {}, { lat: 95, lng: 0, valide: true }, { lat: '48', lng: 2, valide: true },
    { lat: Number.NaN, lng: 2, valide: true }, { lat: 48, lng: Infinity, valide: true },
  ];
  for (const donnees of invalides) assert.equal(enregistrerReponse(salle, a.id, donnees), false, JSON.stringify(donnees));
  assert.deepEqual(salle.etatMode.pins, {});
  assert.equal(enregistrerReponse(salle, a.id, { lat: 10, lng: 190, valide: true }), true);
  assert.equal(salle.etatMode.reponses[a.id].lng, -170);
});

test('pin : refusé d\'un joueur non attendu ou hors devinette', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.equal(enregistrerReponse(salle, retard.id, { ...PARIS, valide: true }), false);
  assert.equal(enregistrerReponse(salle, retard.id, { ...PARIS }), false);
  assert.deepEqual(salle.etatMode.pins, {});
  reveler(salle);
  assert.equal(enregistrerReponse(salle, a.id, { ...PARIS, valide: true }), false);
});

// --- Enchaînement ---

test('fin anticipée : tous les attendus ont validé', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { ...PARIS, valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'devinette');
  enregistrerReponse(salle, b.id, { ...PARIS, valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin anticipée : le dernier attendu se déconnecte', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { ...PARIS, valide: true });
  b.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin du chrono : les brouillons sont validés, sans pin 0 point', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b, c] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  const lieu = lieuCourant(salle);
  enregistrerReponse(salle, a.id, { lat: lieu.lat, lng: lieu.lng, valide: false });
  enregistrerReponse(salle, b.id, { lat: lieu.lat, lng: lieu.lng, valide: true });
  assert.equal(echeance(salle), DUREE_DEVINETTE_MS);
  t.mock.timers.tick(DUREE_DEVINETTE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.deepEqual([a.score, b.score, c.score], [5000, 5000, 0]);
  assert.deepEqual(vueTv(salle).sansReponse, [c.id]);
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
  assert.equal(salle.etatMode.phase, 'devinette');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('points ajoutés à la révélation seulement', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const lieu = lieuCourant(salle);
  enregistrerReponse(salle, a.id, { lat: lieu.lat, lng: lieu.lng, valide: true });
  assert.equal(a.score, 0);
  assert.equal(vueTv(salle).classement, undefined);
  reveler(salle);
  assert.equal(a.score, 5000);
});

// --- Le secret ---

function contientLeLieu(vue, lieu) {
  const texte = JSON.stringify(vue);
  return texte.includes(JSON.stringify(lieu.nom)) || texte.includes(String(lieu.lat)) || texte.includes('"lieu"');
}

test('secret : pendant la devinette, ni la TV ni les téléphones ne reçoivent le lieu', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  const lieu = lieuCourant(salle);
  enregistrerReponse(salle, a.id, { lat: 12.5, lng: 34.5, valide: true });
  enregistrerReponse(salle, b.id, { lat: 56.5, lng: 78.5, valide: false });
  const tv = vueTv(salle);
  assert.equal(contientLeLieu(tv, lieu), false);
  assert.deepEqual(Object.keys(tv.photo).sort(), ['auteur', 'image', 'licence']);
  assert.equal(JSON.stringify(tv).includes('12.5'), false, 'pas de pin sur la TV');
  for (const joueur of [a, b]) {
    const vue = vueJoueur(salle, joueur);
    assert.equal(contientLeLieu(vue, lieu), false);
    assert.equal(JSON.stringify(vue).includes(lieu.image), false, 'pas de photo sur le téléphone');
  }
  assert.equal(JSON.stringify(vueJoueur(salle, b)).includes('12.5'), false, 'pas le pin des autres');
  assert.equal(JSON.stringify(vueJoueur(salle, a)).includes('56.5'), false, 'pas le pin des autres');
});

test('vues du téléphone : devinette, pin validé, résultat, arrivée en cours de manche', () => {
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  assert.deepEqual(vueJoueur(salle, a), { ecran: 'devinette', numero: 1, total: 5, cleCarte: '', pin: null });
  enregistrerReponse(salle, a.id, { lat: 1, lng: 2 });
  assert.deepEqual(vueJoueur(salle, a).pin, { lat: 1, lng: 2 });
  enregistrerReponse(salle, a.id, { lat: 1, lng: 2, valide: true });
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'pin_valide', numero: 1, total: 5, cleCarte: '', pin: { lat: 1, lng: 2 }, nbValides: 1, nbAttendus: 3,
  });
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.deepEqual(vueJoueur(salle, retard), { ecran: 'attente_question' });
  reveler(salle);
  const resultat = vueJoueur(salle, a);
  assert.equal(resultat.ecran, 'resultat');
  assert.deepEqual(Object.keys(resultat.lieu).sort(), ['lat', 'lng', 'nom', 'pays']);
  assert.equal(typeof resultat.km, 'number');
  assert.equal(resultat.rang, 1);
  const sansPin = vueJoueur(salle, b);
  assert.deepEqual([sansPin.pin, sansPin.km, sansPin.points], [null, null, 0]);
});

test('vue TV de la révélation : lieu, résultats, photo suivante', () => {
  const { salle, joueurs: [a] } = sallePrete({ manches: 3 });
  enregistrerReponse(salle, a.id, { ...PARIS, valide: true });
  reveler(salle);
  const tv = vueTv(salle);
  assert.equal(tv.lieu.nom, lieuCourant(salle).nom);
  assert.deepEqual(tv.resultats.map((l) => l.id), [a.id]);
  assert.equal(tv.photoSuivante.image, salle.etatMode.questions[1].image);
  assert.equal(tv.classement[0].points, tv.resultats[0].points);
  suivant(salle);
  reveler(salle);
  suivant(salle);
  reveler(salle);
  assert.equal(vueTv(salle).photoSuivante, undefined, 'pas de photo après la dernière manche');
});

// --- Registre et réglages de l'hôte (temps 3) ---

test('GéoQuiz est dans le registre, à partir de 2 joueurs', async () => {
  const { modes } = await import('./index.js');
  assert.equal(modes.geoquiz.nom, 'GéoQuiz');
  assert.equal(modes.geoquiz.joueursMin, 2);
});

test('réglages : l\'hôte choisit 10 manches en salle d\'attente, la partie en a 10', async () => {
  const { choisirMode, demarrerPartie: lancer, reglerMode } = await import('../salles.js');
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'geoquiz'), true);
  assert.equal(reglerMode(salle, { manches: 7 }), false);
  assert.equal(reglerMode(salle, { manches: 10 }), true);
  lancer(salle);
  assert.equal(salle.etatMode.questions.length, 10);
  assert.equal(reglerMode(salle, { manches: 3 }), false, 'pas pendant la partie');
});

test('clé CARTO : lue dans CLE_CARTO, transmise au téléphone et à la TV de la révélation', (t) => {
  t.after(() => { delete process.env.CLE_CARTO; });
  process.env.CLE_CARTO = 'cle-de-test';
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(vueJoueur(salle, a).cleCarte, 'cle-de-test');
  assert.equal(vueTv(salle).cleCarte, undefined, 'la TV montre la photo, pas de carte');
  reveler(salle);
  assert.equal(vueTv(salle).cleCarte, 'cle-de-test');
  assert.equal(vueJoueur(salle, a).cleCarte, 'cle-de-test');
});
