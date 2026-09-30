import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  DUREE_REVELATION_MS, avancer, calculerResultats, couleurTsl, deltaE, demarrerPartie, echeance,
  enregistrerReponse, labDe, reglagesParDefaut, ressemblance, saturationDe, suivant, tslDe, validerReglages,
  verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './nuancier.js';

// On appelle les fonctions du mode directement, sans passer par les événements.
function sallePrete({ joueurs = ['A', 'B'] } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'nuancier';
  salle.etat = 'partie';
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

const logoCourant = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion];

// La couleur des curseurs la plus proche de la cible du logo en cours.
function couleurExacte(salle) {
  const { teinte, luminosite } = tslDe(logoCourant(salle).cible);
  return { teinte: Math.round(teinte) % 360, luminosite: Math.round(luminosite) };
}

// --- Couleurs ---

test('couleurs : TSL de valeurs connues', () => {
  assert.deepEqual(tslDe('#FF0000'), { teinte: 0, saturation: 100, luminosite: 50 });
  assert.equal(tslDe('#808080').saturation, 0);
  const ikea = tslDe('#0058A3');
  assert.equal(Math.round(ikea.teinte), 208);
  assert.equal(Math.round(ikea.luminosite), 32);
  assert.equal(saturationDe('#0058A3'), 100);
});

test('couleurs : TSL → RGB comme hsl() du CSS', () => {
  assert.equal(couleurTsl(0, 100, 50), '#FF0000');
  assert.equal(couleurTsl(120, 100, 25), '#008000');
  assert.equal(couleurTsl(240, 100, 50), '#0000FF');
  assert.equal(couleurTsl(0, 0, 100), '#FFFFFF');
  assert.equal(couleurTsl(200, 0, 0), '#000000');
});

test('couleurs : Lab de valeurs connues (D65)', () => {
  const proche = (a, b) => Math.abs(a - b) < 0.05;
  const blanc = labDe('#FFFFFF');
  assert.ok(proche(blanc.l, 100) && proche(blanc.a, 0) && proche(blanc.b, 0), JSON.stringify(blanc));
  const rouge = labDe('#FF0000');
  assert.ok(proche(rouge.l, 53.24) && proche(rouge.a, 80.09) && proche(rouge.b, 67.2), JSON.stringify(rouge));
  assert.equal(labDe('#000000').l, 0);
});

test('ressemblance : 100 % pour la cible, 0 au-delà de ΔE 66,7, points = ressemblance × 10', () => {
  assert.equal(deltaE('#0058A3', '#0058A3'), 0);
  assert.equal(ressemblance('#0058A3', '#0058A3'), 100);
  assert.equal(ressemblance('#FFFFFF', '#000000'), 0);
  // Noir et blanc : ΔE = 100.
  assert.ok(Math.abs(deltaE('#FFFFFF', '#000000') - 100) < 0.01);
  const [ligne] = calculerResultats({ a: { teinte: 0, luminosite: 50 } }, { cible: '#FF0000' });
  assert.deepEqual(ligne, { id: 'a', couleur: '#FF0000', ressemblance: 100, points: 1000 });
});

test('ressemblance : les curseurs au plus près de la cible donnent au moins 98 %', () => {
  for (const cible of ['#0058A3', '#FFC72C', '#FF7900', '#E2001A', '#00A650']) {
    const { teinte, luminosite, saturation } = tslDe(cible);
    const couleur = couleurTsl(Math.round(teinte) % 360, Math.round(saturation * 10) / 10, Math.round(luminosite));
    assert.ok(ressemblance(couleur, cible) >= 98, `${cible} → ${couleur}`);
  }
});

test('résultats : triés du plus ressemblant au moins ressemblant', () => {
  const lignes = calculerResultats(
    { loin: { teinte: 180, luminosite: 50 }, pres: { teinte: 0, luminosite: 50 } },
    { cible: '#FF0000' },
  );
  assert.deepEqual(lignes.map((l) => l.id), ['pres', 'loin']);
  assert.ok(lignes[1].ressemblance < lignes[0].ressemblance);
});

// --- Réglages ---

test('réglages : 5, 7 ou 10 manches, 15, 20 ou 30 s, 7 manches de 20 s par défaut', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 7, temps: 20 });
  assert.deepEqual(validerReglages({ longueur: 10, temps: 15 }), { longueur: 10, temps: 15 });
  assert.equal(validerReglages({ longueur: 6, temps: 20 }), null);
  assert.equal(validerReglages({ longueur: 7, temps: 25 }), null);
  const salle = creerSalle('tv');
  assert.equal(vueReglages(salle).resume, '7 manches · 20 s');
});

// --- Partie ---

test('partie : logos distincts, départ des curseurs dans les bornes, chrono de 20 s', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  const ids = salle.etatMode.questions.map((logo) => logo.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 1 && ids.length <= 7);
  const { teinte, luminosite } = salle.etatMode.depart;
  assert.ok(Number.isInteger(teinte) && teinte >= 0 && teinte <= 359);
  assert.equal(luminosite, 50);
  assert.equal(salle.etatMode.phase, 'choix');
  assert.equal(echeance(salle), 20000);
});

test('réponse : couleurs invalides refusées', () => {
  const { salle, joueurs: [a] } = sallePrete();
  for (const donnees of [
    { teinte: 360, luminosite: 50, valide: true }, { teinte: -1, luminosite: 50, valide: true },
    { teinte: 10.5, luminosite: 50, valide: true }, { teinte: '10', luminosite: 50, valide: true },
    { teinte: 10, luminosite: 4, valide: true }, { teinte: 10, luminosite: 96, valide: true },
    { teinte: 10 }, null, 'rouge',
  ]) {
    assert.equal(enregistrerReponse(salle, a.id, donnees), false, JSON.stringify(donnees));
  }
  assert.deepEqual(salle.etatMode.reponses, {});
  assert.deepEqual(salle.etatMode.brouillons, {});
});

test('réponse : le brouillon n\'est pas diffusé, la validation l\'est, une seule validation', () => {
  const { salle, joueurs: [a] } = sallePrete();
  assert.equal(enregistrerReponse(salle, a.id, { teinte: 10, luminosite: 40, valide: false }), false);
  assert.deepEqual(salle.etatMode.brouillons[a.id], { teinte: 10, luminosite: 40 });
  assert.equal(enregistrerReponse(salle, a.id, { teinte: 12, luminosite: 41, valide: true }), true);
  assert.equal(salle.etatMode.brouillons[a.id], undefined);
  assert.equal(enregistrerReponse(salle, a.id, { teinte: 200, luminosite: 50, valide: true }), false);
  assert.equal(salle.etatMode.reponses[a.id].teinte, 12);
});

test('réponse : un joueur non attendu ne joue pas la manche', () => {
  const { salle } = sallePrete();
  const tardif = ajouterJoueur(salle, 'Tard', 's9').joueur;
  assert.equal(enregistrerReponse(salle, tardif.id, { teinte: 10, luminosite: 40, valide: true }), false);
  assert.deepEqual(vueJoueur(salle, tardif), { ecran: 'attente_question' });
});

test('fin anticipée : quand tous ont validé, puis points ajoutés au score', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { ...couleurExacte(salle), valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'choix');
  enregistrerReponse(salle, b.id, { teinte: 0, luminosite: 5, valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.ok(a.score >= 980);
  assert.ok(b.score < a.score);
});

test('fin anticipée : après la déconnexion du dernier attendu', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { teinte: 10, luminosite: 40, valide: true });
  b.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin du chrono : le brouillon est validé, sans brouillon pas de réponse', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { ...couleurExacte(salle), valide: false });
  t.mock.timers.tick(20000);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  assert.ok(salle.etatMode.reponses[a.id]);
  assert.ok(a.score >= 980);
  const tv = vueTv(salle);
  assert.deepEqual(tv.sansReponse, [b.id]);
  assert.equal(b.score, 0);
  assert.equal(vueJoueur(salle, b).ressemblance, null);
});

test('révélation : 15 s ou « Suivant », puis manche suivante et podium après la dernière', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete();
  const total = salle.etatMode.questions.length;
  assert.equal(suivant(salle), false, 'pas de « Suivant » pendant le choix');
  for (let manche = 1; manche <= total; manche++) {
    assert.equal(salle.etatMode.indexQuestion, manche - 1);
    t.mock.timers.tick(20000);
    avancer(salle);
    assert.equal(echeance(salle), Date.now() + DUREE_REVELATION_MS);
    if (manche === 1) assert.equal(suivant(salle), true);
    else {
      t.mock.timers.tick(DUREE_REVELATION_MS);
      avancer(salle);
    }
  }
  assert.equal(salle.etat, 'podium');
});

// --- Secret ---

test('secret : ni la cible ni les couleurs des autres avant la révélation', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { teinte: 111, luminosite: 22, valide: true });
  enregistrerReponse(salle, b.id, { teinte: 333, luminosite: 77, valide: false });
  const cible = logoCourant(salle).cible;

  const tv = JSON.stringify(vueTv(salle));
  assert.ok(!tv.includes(cible) && !tv.includes('cible'), tv);
  assert.ok(!tv.includes('111') && !tv.includes('333'), tv);
  assert.deepEqual(vueTv(salle).ontRepondu, [a.id]);

  for (const joueur of [a, b]) {
    const vue = JSON.stringify(vueJoueur(salle, joueur));
    assert.ok(!vue.includes(cible) && !vue.includes('cible'), vue);
  }
  assert.ok(!JSON.stringify(vueJoueur(salle, a)).includes('333'));
  assert.ok(!JSON.stringify(vueJoueur(salle, b)).includes('111'));
});

test('vues du téléphone : brouillon retrouvé, couleur validée, résultat sans couleur', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  const depart = vueJoueur(salle, a);
  assert.equal(depart.ecran, 'nuancier');
  assert.deepEqual(depart.curseurs, salle.etatMode.depart);
  // « couleur » est déjà la couleur du joueur dans joueur:etat (vues.js) : le mode ne doit pas l'écraser.
  assert.ok(!('couleur' in depart));
  assert.equal(depart.saturation, saturationDe(logoCourant(salle).cible));
  assert.deepEqual(Object.keys(depart.logo), ['nom', 'fichier', 'question', 'zones']);

  enregistrerReponse(salle, a.id, { teinte: 30, luminosite: 60, valide: false });
  assert.deepEqual(vueJoueur(salle, a).curseurs, { teinte: 30, luminosite: 60 });
  enregistrerReponse(salle, a.id, { teinte: 31, luminosite: 61, valide: true });
  const validee = vueJoueur(salle, a);
  assert.equal(validee.ecran, 'couleur_validee');
  assert.deepEqual(validee.curseurs, { teinte: 31, luminosite: 61 });
  assert.equal(validee.nbValides, 1);
  assert.equal(validee.nbAttendus, 2);

  enregistrerReponse(salle, b.id, { teinte: 31, luminosite: 61, valide: true });
  verifierFinAnticipee(salle);
  const resultat = vueJoueur(salle, a);
  assert.equal(resultat.ecran, 'resultat');
  assert.equal(resultat.points, resultat.ressemblance * 10);
  assert.equal(resultat.rang, 1, 'mêmes couleurs : ex æquo');
  assert.equal(vueJoueur(salle, b).rang, 1);
  assert.ok(!('couleur' in resultat));

  const tv = vueTv(salle);
  assert.equal(tv.cible, logoCourant(salle).cible);
  assert.equal(tv.resultats.length, 2);
  assert.ok(/^#[0-9A-F]{6}$/.test(tv.resultats[0].couleur));
});

test('questionsVues : les logos tirés sont notés, le préfixe n- les distingue', () => {
  const { salle } = sallePrete();
  assert.ok(salle.questionsVues.length >= 1);
  assert.ok(salle.questionsVues.every((id) => id.startsWith('n-')));
});
