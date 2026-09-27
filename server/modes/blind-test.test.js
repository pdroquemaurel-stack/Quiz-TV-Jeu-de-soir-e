import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, deconnecterJoueur, demarrerPartie, synchroniserMinuteur, terminerPartie,
} from '../salles.js';
import { vueJoueur, vueTv } from '../vues.js';
import { banqueBlindTest } from '../extraits.js';
import { modes } from './index.js';
import {
  DUREE_DESIGNATION_MS, DUREE_ECOUTE_MS, DUREE_REVELATION_MS, avancer, designationValide, enregistrerReponse,
  pointsClassique, suivant, verifierFinAnticipee,
} from './blind-test.js';

const PSEUDOS = ['Paul', 'Léa', 'Sam', 'Tom', 'Zoé'];

// Une chanson reconnaissable, pour chercher ses champs dans les vues.
const CHANSON = {
  id: 'd42', deezer: 42, titre: 'Titre secret', artiste: 'Artiste secret', pochette: 'https://pochette/42.jpg', gain: -9, garder: true,
};

// n joueurs, mode Blind test, partie lancée. L'ordre des maîtres est fixé : joueurs[0], joueurs[1]…
function sallePrete(n = 4) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'blind-test'), true);
  demarrerPartie(salle);
  salle.etatMode.maitres = joueurs.map((joueur) => joueur.id);
  salle.etatMode.questions[0] = CHANSON;
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

// Le maître valide sa désignation, comme joueur:repondre dans index.js.
function designer(salle, maitre, contenu) {
  const accepte = enregistrerReponse(salle, maitre.id, contenu);
  if (accepte) verifierFinAnticipee(salle);
  return accepte;
}

// --- Registre et lancement ---

test('Blind test est dans le registre, à partir de 3 joueurs', () => {
  assert.equal(modes['blind-test'].nom, 'Blind test');
  assert.equal(modes['blind-test'].joueursMin, 3);
});

test('choix du mode : refusé à 2 joueurs, accepté à 3', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B']) ajouterJoueur(salle, pseudo, pseudo);
  assert.equal(choisirMode(salle, 'blind-test'), false);
  ajouterJoueur(salle, 'C', 'C');
  assert.equal(choisirMode(salle, 'blind-test'), true);
});

test('autant de manches que de joueurs, chacun maître une fois, chansons toutes différentes', () => {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  choisirMode(salle, 'blind-test');
  demarrerPartie(salle);
  const { maitres, questions } = salle.etatMode;
  assert.deepEqual([...maitres].sort(), joueurs.map((joueur) => joueur.id).sort());
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map((chanson) => chanson.id)).size, 5);
  assert.ok(questions.every((chanson) => chanson.garder));
  assert.equal(salle.etatMode.format, 'classique');
  assert.equal(etape(salle), 'ecoute');
});

test('tirage : pas de répétition sur 3 parties', () => {
  const salle = creerSalle('tv');
  for (const pseudo of PSEUDOS) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'blind-test');
  const vues = new Set();
  for (let partie = 0; partie < 3; partie++) {
    demarrerPartie(salle);
    for (const chanson of salle.etatMode.questions) {
      assert.ok(!vues.has(chanson.id), `${chanson.id} déjà jouée`);
      vues.add(chanson.id);
    }
    terminerPartie(salle);
  }
  assert.ok(banqueBlindTest().length >= vues.size);
});

test('position de départ entre 0 et 10 s', () => {
  for (let essai = 0; essai < 20; essai++) {
    const { salle } = sallePrete(3);
    assert.ok(Number.isInteger(salle.etatMode.depart) && salle.etatMode.depart >= 0 && salle.etatMode.depart <= 10);
  }
});

// --- Maître absent ---

test('la manche d\'un maître déconnecté est sautée, et sans maître restant : podium', () => {
  const { salle, joueurs: [, lea, , tom] } = sallePrete(4);
  lea.connecte = false;
  avancer(salle);
  avancer(salle);
  avancer(salle);
  assert.equal(salle.etatMode.indexQuestion, 2, 'la manche de Léa est sautée');
  assert.equal(etape(salle), 'ecoute');
  tom.connecte = false;
  avancer(salle);
  avancer(salle);
  avancer(salle);
  assert.equal(etape(salle), 'podium');
});

// --- Désignation ---

test('désignation : seul le maître, une seule fois, avec des joueurs désignables', () => {
  const { salle, joueurs: [paul, lea, sam] } = sallePrete(4);
  assert.equal(enregistrerReponse(salle, lea.id, { titre: sam.id, artiste: null }), false, 'pas le maître');
  assert.equal(enregistrerReponse(salle, paul.id, { titre: paul.id, artiste: null }), false, 'le maître lui-même');
  assert.equal(enregistrerReponse(salle, paul.id, { titre: 'j_inconnu', artiste: null }), false, 'id inconnu');
  assert.equal(enregistrerReponse(salle, paul.id, { titre: lea.id }), false, 'clé manquante');
  assert.equal(enregistrerReponse(salle, paul.id, null), false);
  assert.equal(enregistrerReponse(salle, paul.id, 'lea'), false);
  assert.equal(enregistrerReponse(salle, paul.id, [lea.id, sam.id]), false);
  assert.equal(designer(salle, paul, { titre: lea.id, artiste: sam.id }), true);
  assert.equal(enregistrerReponse(salle, paul.id, { titre: sam.id, artiste: sam.id }), false, 'déjà validée');
});

test('désignation : un joueur arrivé en cours de manche n\'est pas désignable', () => {
  const { salle, joueurs: [paul] } = sallePrete(3);
  const retardataire = ajouterJoueur(salle, 'Zoé', 'sz').joueur;
  assert.equal(designationValide(salle, { titre: retardataire.id, artiste: null }), false);
  assert.equal(vueJoueur(salle, retardataire).ecran, 'attente_question');
  assert.ok(!vueJoueur(salle, paul).designables.some((joueur) => joueur.id === retardataire.id));
});

test('désignation en écoute : révélation directe', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  assert.equal(designer(salle, paul, { titre: lea.id, artiste: null }), true);
  assert.equal(etape(salle), 'revelation');
});

test('désignation pendant la phase de désignation, ignorée en révélation', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  avancer(salle);
  assert.equal(etape(salle), 'designation');
  assert.equal(designer(salle, paul, { titre: null, artiste: lea.id }), true);
  assert.equal(etape(salle), 'revelation');

  const autre = sallePrete(3);
  avancer(autre.salle);
  avancer(autre.salle);
  assert.equal(etape(autre.salle), 'revelation');
  assert.equal(enregistrerReponse(autre.salle, autre.joueurs[0].id, { titre: null, artiste: null }), false);
});

// --- Points ---

test('points : 500 le titre, 500 l\'artiste, 1000 le doublé, 0 pour personne et pour le maître', () => {
  assert.equal(pointsClassique({ titre: 'lea', artiste: 'sam' }, 'lea'), 500);
  assert.equal(pointsClassique({ titre: 'lea', artiste: 'sam' }, 'sam'), 500);
  assert.equal(pointsClassique({ titre: 'lea', artiste: 'lea' }, 'lea'), 1000);
  assert.equal(pointsClassique({ titre: null, artiste: null }, 'lea'), 0);
  assert.equal(pointsClassique({ titre: 'lea', artiste: 'sam' }, 'paul'), 0);
  assert.equal(pointsClassique(null, 'lea'), 0);
});

test('points ajoutés à la révélation, deux joueurs différents à 500 chacun', () => {
  const { salle, joueurs: [paul, lea, sam] } = sallePrete(3);
  designer(salle, paul, { titre: lea.id, artiste: sam.id });
  assert.deepEqual([paul.score, lea.score, sam.score], [0, 500, 500]);
  const classement = vueTv(salle).etatMode.classement;
  assert.equal(classement.find((ligne) => ligne.id === lea.id).points, 500);
});

test('l\'hôte termine pendant l\'écoute : la chanson n\'est pas comptée', () => {
  const { salle, joueurs } = sallePrete(3);
  terminerPartie(salle);
  assert.equal(etape(salle), 'podium');
  assert.ok(joueurs.every((joueur) => joueur.score === 0));
});

// --- Chronos et enchaînement ---

test('chronos : 30 s d\'écoute, 15 s de désignation sans points, 12 s de révélation', (t) => {
  simulerTemps(t);
  const { salle, joueurs } = sallePrete(3);
  quandAvance(salle);
  t.mock.timers.tick(DUREE_ECOUTE_MS - 1);
  assert.equal(etape(salle), 'ecoute');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'designation');
  t.mock.timers.tick(DUREE_DESIGNATION_MS);
  assert.equal(etape(salle), 'revelation');
  assert.ok(joueurs.every((joueur) => joueur.score === 0));
  t.mock.timers.tick(DUREE_REVELATION_MS);
  assert.equal(etape(salle), 'ecoute');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('podium après la dernière manche ; « Suivant » seulement pendant la révélation', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  assert.equal(suivant(salle), false);
  designer(salle, paul, { titre: lea.id, artiste: lea.id });
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.indexQuestion, 1);
  for (let manche = 1; manche < 3; manche++) {
    avancer(salle);
    avancer(salle);
    suivant(salle);
  }
  assert.equal(etape(salle), 'podium');
  assert.equal(lea.score, 1000);
});

test('un joueur déconnecté pendant la manche ne bloque rien, et le maître revenu retrouve son écran', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  deconnecterJoueur(salle, paul, () => {});
  assert.equal(etape(salle), 'ecoute');
  paul.connecte = true;
  assert.equal(vueJoueur(salle, paul).ecran, 'maitre_classique');
  assert.equal(designer(salle, paul, { titre: lea.id, artiste: null }), true);
});

// --- Secret ---

const contient = (vue, texte) => JSON.stringify(vue).includes(texte);

test('secret : en écoute, ni la TV ni les autres joueurs ne voient la chanson', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  const tv = vueTv(salle).etatMode;
  for (const secret of ['Titre secret', 'Artiste secret', 'pochette/42']) {
    assert.ok(!contient(tv, secret), `TV : ${secret}`);
    assert.ok(!contient(vueJoueur(salle, lea), secret), `joueur : ${secret}`);
  }
  assert.deepEqual(tv.extrait, { id: 'd42', depart: salle.etatMode.depart, gain: -9 });
  assert.ok(!contient(vueJoueur(salle, lea), 'd42'));

  const vueMaitre = vueJoueur(salle, paul);
  assert.equal(vueMaitre.ecran, 'maitre_classique');
  assert.deepEqual(vueMaitre.chanson, { titre: 'Titre secret', artiste: 'Artiste secret', pochette: 'https://pochette/42.jpg' });
  assert.ok(!contient(vueMaitre, 'd42'), 'le maître ne reçoit pas l\'id Deezer');
  assert.ok(!contient(vueMaitre, '"deezer"'));
  assert.deepEqual(vueMaitre.designables.map((joueur) => joueur.pseudo), ['Léa', 'Sam']);
});

test('secret : en désignation, toujours rien ; à la révélation, tout le monde voit la chanson', () => {
  const { salle, joueurs: [paul, lea, sam] } = sallePrete(3);
  avancer(salle);
  assert.ok(!contient(vueTv(salle).etatMode, 'Titre secret'));
  assert.equal(vueTv(salle).etatMode.extrait, undefined, 'la musique est coupée');
  assert.ok(!contient(vueJoueur(salle, lea), 'Titre secret'));
  designer(salle, paul, { titre: lea.id, artiste: null });

  const tv = vueTv(salle).etatMode;
  assert.deepEqual(tv.chanson, { titre: 'Titre secret', artiste: 'Artiste secret', pochette: 'https://pochette/42.jpg' });
  assert.equal(tv.titre, lea.id);
  assert.equal(tv.artiste, null);
  assert.equal(tv.extraitSuivant.id, salle.etatMode.questions[1].id);
  const resultat = vueJoueur(salle, sam);
  assert.equal(resultat.ecran, 'resultat');
  assert.equal(resultat.trouveTitre, 'Léa');
  assert.equal(resultat.trouveArtiste, null);
  assert.equal(resultat.points, 0);
  assert.equal(vueJoueur(salle, lea).points, 500);
  assert.equal(vueJoueur(salle, lea).aTrouveTitre, true);
  assert.equal(vueJoueur(salle, lea).aTrouveArtiste, false);
  assert.equal(vueJoueur(salle, paul).estMaitre, true);
});
