import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajouterJoueur, choisirMode, creerSalle, deconnecterJoueur, demarrerPartie, reglerMode, synchroniserMinuteur,
  terminerPartie,
} from '../salles.js';
import { vueJoueur, vueTv } from '../vues.js';
import { banqueBlindTest } from '../extraits.js';
import { modes } from './index.js';
import {
  CHANSONS_PAR_MIX, DELAI_CHARGEMENT_MIX_MS, DUREE_DESIGNATION_MIX_MS, DUREE_DESIGNATION_MS, DUREE_ECOUTE_MIX_MS,
  DUREE_ECOUTE_MS, avancer, categoriesDe, categoriesValides, chansonsDuChoix, designationValide, echeance,
  enregistrerReponse, pointsClassique, pointsDuMix, recevoirExtraits, reglagesParDefaut, repartirMaitres, suivant,
  tirerChansons, verifierFinAnticipee,
} from './blind-test.js';

const PSEUDOS = ['Paul', 'Léa', 'Sam', 'Tom', 'Zoé'];

// Une chanson reconnaissable, pour chercher ses champs dans les vues.
const CHANSON = {
  id: 'd42', deezer: 42, titre: 'Titre secret', artiste: 'Artiste secret', pochette: 'https://pochette/42.jpg', gain: -9, garder: true,
};

// Le maître de la manche appuie sur « Lancer la chanson », comme joueur:repondre dans index.js.
// En mix, la TV a d'abord chargé les 5 extraits (tranche 42).
function lancer(salle) {
  const { maitres, indexQuestion, format } = salle.etatMode;
  if (format === 'mix') toutCharger(salle);
  return enregistrerReponse(salle, maitres[indexQuestion], { lancer: true });
}

// La TV signale tous les extraits du mix en cours chargés, comme tv:extraits dans index.js.
function toutCharger(salle) {
  const { questions, indexQuestion } = salle.etatMode;
  const ids = questions[indexQuestion].map((chanson) => chanson.id);
  return recevoirExtraits(salle, { numero: indexQuestion + 1, prets: ids, echecs: [] });
}

// n joueurs, mode Blind test, partie lancée et première chanson en écoute.
// Une manche par joueur, et l'ordre des maîtres est fixé : joueurs[0], joueurs[1]…
function sallePrete(n = 4) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  assert.equal(choisirMode(salle, 'blind-test'), true);
  demarrerPartie(salle);
  salle.etatMode.maitres = joueurs.map((joueur) => joueur.id);
  salle.etatMode.questions[0] = CHANSON;
  assert.equal(lancer(salle), true);
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

test('classique : 10 chansons par défaut, chacun maître 2 fois à 5 joueurs, chansons toutes différentes', () => {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  choisirMode(salle, 'blind-test');
  demarrerPartie(salle);
  const { maitres, questions } = salle.etatMode;
  for (const joueur of joueurs) assert.equal(maitres.filter((maitre) => maitre === joueur.id).length, 2);
  assert.equal(questions.length, 10);
  assert.equal(new Set(questions.map((chanson) => chanson.id)).size, 10);
  assert.ok(questions.every((chanson) => chanson.garder));
  assert.equal(salle.etatMode.format, 'classique');
  assert.equal(etape(salle), 'relais', 'la partie commence par le relais du premier maître');
});

test('maîtres : les manches en plus vont aux premiers du classement global, jamais deux fois d\'affilée', () => {
  for (let essai = 0; essai < 300; essai++) {
    const maitres = repartirMaitres(['a', 'b', 'c'], 7);
    assert.deepEqual([...maitres].sort(), ['a', 'a', 'a', 'b', 'b', 'c', 'c']);
    assert.ok(maitres.every((maitre, i) => maitre !== maitres[i - 1]), maitres.join());
  }
  assert.deepEqual(repartirMaitres(['a', 'b', 'c'], 1), ['a']);
});

test('classique : le nombre de chansons de l\'hôte, les plus hauts au classement global maîtres en plus', () => {
  const salle = creerSalle('tv');
  const [paul, lea, sam] = ['Paul', 'Léa', 'Sam'].map((pseudo) => ajouterJoueur(salle, pseudo, pseudo).joueur);
  lea.pointsGlobaux = 6;
  sam.pointsGlobaux = 3;
  choisirMode(salle, 'blind-test');
  assert.equal(reglerMode(salle, { ...reglagesParDefaut(), chansons: 5 }), true);
  demarrerPartie(salle);
  const { maitres, questions } = salle.etatMode;
  assert.equal(questions.length, 5);
  const fois = (joueur) => maitres.filter((maitre) => maitre === joueur.id).length;
  assert.deepEqual([fois(lea), fois(sam), fois(paul)], [2, 2, 1]);
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
  suivant(salle);
  assert.equal(salle.etatMode.indexQuestion, 2, 'la manche de Léa est sautée');
  assert.equal(etape(salle), 'relais');
  tom.connecte = false;
  lancer(salle);
  avancer(salle);
  avancer(salle);
  suivant(salle);
  assert.equal(etape(salle), 'podium');
});

// --- Relais entre deux maîtres ---

test('relais : seul le prochain maître lance la chanson, et la musique démarre', () => {
  const salle = creerSalle('tv');
  const joueurs = ['Paul', 'Léa', 'Sam'].map((pseudo) => ajouterJoueur(salle, pseudo, pseudo).joueur);
  choisirMode(salle, 'blind-test');
  demarrerPartie(salle);
  assert.equal(etape(salle), 'relais');
  assert.equal(salle.etatMode.indexQuestion, 0);
  assert.equal(modes['blind-test'].echeance(salle), null, 'pas de chrono');
  const maitre = joueurs.find((joueur) => joueur.id === salle.etatMode.maitres[0]);
  const autre = joueurs.find((joueur) => joueur !== maitre);
  assert.equal(enregistrerReponse(salle, autre.id, { lancer: true }), false, 'pas le maître');
  assert.equal(enregistrerReponse(salle, maitre.id, { titre: null, artiste: null }), false, 'pas encore de désignation');
  assert.equal(enregistrerReponse(salle, maitre.id, { lancer: 'oui' }), false);
  assert.equal(enregistrerReponse(salle, maitre.id, { lancer: true }), true);
  assert.equal(etape(salle), 'ecoute');
  assert.equal(enregistrerReponse(salle, maitre.id, { lancer: true }), false, 'déjà lancée');
});

test('relais : ce que voient le prochain maître, les autres joueurs et la TV', () => {
  const salle = creerSalle('tv');
  const joueurs = ['Paul', 'Léa', 'Sam'].map((pseudo) => ajouterJoueur(salle, pseudo, pseudo).joueur);
  choisirMode(salle, 'blind-test');
  demarrerPartie(salle);
  salle.etatMode.questions[0] = CHANSON;
  const maitre = joueurs.find((joueur) => joueur.id === salle.etatMode.maitres[0]);
  const autre = joueurs.find((joueur) => joueur !== maitre);
  const { ecran, numero, total, chanson } = vueJoueur(salle, maitre);
  assert.deepEqual({ ecran, numero, total, chanson }, { ecran: 'relais', numero: 1, total: 10, chanson: undefined });
  assert.equal(vueJoueur(salle, autre).ecran, 'ecouter');
  assert.equal(vueJoueur(salle, autre).phase, 'relais');
  assert.equal(vueJoueur(salle, autre).maitre, maitre.pseudo);
  const tv = vueTv(salle).etatMode;
  assert.equal(tv.phase, 'relais');
  assert.equal(tv.maitre, maitre.id);
  assert.deepEqual(tv.extraitsSuivants, [{ id: 'd42' }], 'la TV charge l\'extrait sans le jouer');
  for (const secret of ['Titre secret', 'Artiste secret', 'pochette/42']) {
    assert.ok(!JSON.stringify(tv).includes(secret), `TV : ${secret}`);
    assert.ok(!JSON.stringify(vueJoueur(salle, maitre)).includes(secret), `maître : ${secret}`);
  }
});

test('révélation : pas de chrono, le maître sortant ou l\'hôte passe la modération au prochain maître', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [paul, lea, sam] } = sallePrete(3);
  designer(salle, paul, { titre: lea.id, artiste: null });
  quandAvance(salle);
  t.mock.timers.tick(60000);
  assert.equal(etape(salle), 'revelation', 'la révélation attend un appui');
  assert.equal(vueJoueur(salle, paul).prochainMaitre, 'Léa');
  assert.equal(vueJoueur(salle, sam).prochainMaitre, 'Léa');
  assert.equal(enregistrerReponse(salle, lea.id, { passer: true }), false, 'seulement le maître sortant');
  assert.equal(enregistrerReponse(salle, paul.id, { passer: true }), true);
  assert.equal(etape(salle), 'relais');
  assert.equal(salle.etatMode.indexQuestion, 1);
  assert.equal(vueJoueur(salle, lea).ecran, 'relais');

  lancer(salle);
  designer(salle, lea, { titre: null, artiste: null });
  assert.equal(vueJoueur(salle, lea).prochainMaitre, 'Sam');
  assert.equal(suivant(salle), true, 'l\'hôte peut aussi passer la modération');
  lancer(salle);
  designer(salle, sam, { titre: null, artiste: null });
  assert.equal(vueJoueur(salle, sam).prochainMaitre, null, 'dernière chanson : podium ensuite');
  assert.equal(enregistrerReponse(salle, sam.id, { passer: true }), true);
  assert.equal(etape(salle), 'podium');
});

test('relais : le prochain maître se déconnecte, le relais passe au maître suivant', () => {
  const { salle, joueurs: [paul, lea, sam] } = sallePrete(3);
  designer(salle, paul, { titre: null, artiste: null });
  suivant(salle);
  assert.equal(salle.etatMode.maitres[salle.etatMode.indexQuestion], lea.id);
  deconnecterJoueur(salle, lea, () => {});
  verifierFinAnticipee(salle);
  assert.equal(etape(salle), 'relais');
  assert.equal(salle.etatMode.maitres[salle.etatMode.indexQuestion], sam.id);
  deconnecterJoueur(salle, sam, () => {});
  verifierFinAnticipee(salle);
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

test('chronos : 30 s d\'écoute, 15 s de désignation sans points, puis la révélation reste affichée', (t) => {
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
  t.mock.timers.tick(60000);
  assert.equal(etape(salle), 'revelation');
  assert.equal(salle.etatMode.indexQuestion, 0);
});

test('podium après la dernière manche ; « Suivant » seulement pendant la révélation', () => {
  const { salle, joueurs: [paul, lea] } = sallePrete(3);
  assert.equal(suivant(salle), false);
  designer(salle, paul, { titre: lea.id, artiste: lea.id });
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.indexQuestion, 1);
  assert.equal(suivant(salle), false, 'pas pendant le relais');
  for (let manche = 1; manche < 3; manche++) {
    lancer(salle);
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
  assert.ok(!contient(vueJoueur(salle, lea), '"d42"'));

  const vueMaitre = vueJoueur(salle, paul);
  assert.equal(vueMaitre.ecran, 'maitre_classique');
  assert.deepEqual(vueMaitre.chanson, { titre: 'Titre secret', artiste: 'Artiste secret', pochette: 'https://pochette/42.jpg' });
  assert.ok(!contient(vueMaitre, '"d42"'), 'le maître ne reçoit pas l\'id Deezer');
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

// --- Réglages de l'hôte ---

const MIX_PAR_DEFAUT = { ...reglagesParDefaut(), format: 'mix' };

test('réglages : classique de 10 chansons par défaut, 1 à 20 chansons, mix de 1 ou 2 tours et 90, 120 ou 180 s', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'blind-test');
  const toutes = categoriesDe(banqueBlindTest());
  assert.deepEqual(reglagesParDefaut(), {
    format: 'classique', chansons: 10, tours: 1, ecoute: 120, categories: toutes,
  });
  assert.equal(vueTv(salle).reglages.resume, 'Classique · 10 chansons');
  assert.equal(vueTv(salle).reglages.titre, 'Format');
  for (const invalide of [
    { format: 'rock' }, { format: 'mix' }, {}, null, 'mix', { ...MIX_PAR_DEFAUT, format: 'toString' },
    { ...MIX_PAR_DEFAUT, chansons: 0 }, { ...MIX_PAR_DEFAUT, chansons: 21 }, { ...MIX_PAR_DEFAUT, chansons: 2.5 },
    { ...MIX_PAR_DEFAUT, tours: 3 }, { ...MIX_PAR_DEFAUT, ecoute: 100 },
    { ...MIX_PAR_DEFAUT, categories: undefined }, { ...MIX_PAR_DEFAUT, categories: 'Années 80' },
    { ...MIX_PAR_DEFAUT, categories: ['Catégorie inconnue'] },
  ]) {
    assert.equal(reglerMode(salle, invalide), false, JSON.stringify(invalide));
  }
  assert.equal(reglerMode(salle, { ...reglagesParDefaut(), chansons: 1 }), true);
  assert.equal(vueTv(salle).reglages.resume, 'Classique · 1 chanson');
  assert.equal(reglerMode(salle, { ...MIX_PAR_DEFAUT, tours: 2, ecoute: 90 }), true);
  assert.equal(vueTv(salle).reglages.resume, 'Mix · 2 tours · 90 s');
  assert.deepEqual(vueTv(salle).reglages.options.formats.map((f) => f.id), ['classique', 'mix']);
  assert.deepEqual(vueTv(salle).reglages.valeurs, {
    format: 'mix', chansons: 10, tours: 2, ecoute: 90, categories: toutes,
  });
});

test('réglages : mix de 2 tours, chacun maître 2 fois ; écoute de 90 s', () => {
  const salle = creerSalle('tv');
  const joueurs = ['A', 'B', 'C'].map((pseudo) => ajouterJoueur(salle, pseudo, pseudo).joueur);
  choisirMode(salle, 'blind-test');
  reglerMode(salle, { ...MIX_PAR_DEFAUT, tours: 2, ecoute: 90 });
  demarrerPartie(salle);
  const { maitres } = salle.etatMode;
  assert.equal(maitres.length, 6);
  for (const joueur of joueurs) assert.equal(maitres.filter((maitre) => maitre === joueur.id).length, 2);
  lancer(salle);
  assert.equal(salle.etatMode.ecouteRestanteMs, 90000);
  assert.equal(vueTv(salle).etatMode.dureeEcouteMs, 90000);
});

test('réglage : refusé hors de la salle d\'attente, et gardé d\'une partie à l\'autre', () => {
  const salle = creerSalle('tv');
  for (const pseudo of ['A', 'B', 'C']) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'blind-test');
  reglerMode(salle, MIX_PAR_DEFAUT);
  demarrerPartie(salle);
  assert.equal(salle.etatMode.format, 'mix');
  assert.equal(reglerMode(salle, reglagesParDefaut()), false);
  terminerPartie(salle);
  demarrerPartie(salle);
  assert.equal(salle.etatMode.format, 'mix');
});

test('le quiz garde son résumé, avec le titre « Questions »', () => {
  const salle = creerSalle('tv');
  ajouterJoueur(salle, 'A', 'A');
  assert.equal(vueTv(salle).reglages.titre, 'Questions');
  assert.equal(vueTv(salle).reglages.resume, 'Tous les thèmes · Tous niveaux · 10 questions · 20 s');
});

// --- Format mix ---

// Cinq chansons reconnaissables : « Titre 0 » … « Titre 4 ».
const MIX = Array.from({ length: CHANSONS_PAR_MIX }, (_, i) => ({
  id: `d${100 + i}`, deezer: 100 + i, titre: `Titre ${i}`, artiste: `Artiste ${i}`, pochette: `https://pochette/${i}.jpg`, gain: -10, garder: true,
}));

function mixPret(n = 4) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  choisirMode(salle, 'blind-test');
  assert.equal(reglerMode(salle, MIX_PAR_DEFAUT), true);
  demarrerPartie(salle);
  salle.etatMode.maitres = joueurs.map((joueur) => joueur.id);
  salle.etatMode.questions[0] = MIX;
  assert.equal(lancer(salle), true);
  return { salle, joueurs };
}

// Le maître arrête une chanson puis désigne, comme joueur:repondre dans index.js.
function repondre(salle, joueur, contenu) {
  const accepte = enregistrerReponse(salle, joueur.id, contenu);
  if (accepte) verifierFinAnticipee(salle);
  return accepte;
}

function trouver(salle, maitre, index, gagnant, trouve) {
  assert.equal(repondre(salle, maitre, { arreter: index }), true, `arrêter ${index}`);
  assert.equal(repondre(salle, maitre, { joueur: gagnant.id, trouve }), true, `désigner ${index}`);
}

test('mix : 5 chansons différentes par manche, aucune répétée dans la partie, départs entre 0 et 10 s', () => {
  const salle = creerSalle('tv');
  for (const pseudo of PSEUDOS) ajouterJoueur(salle, pseudo, pseudo);
  choisirMode(salle, 'blind-test');
  reglerMode(salle, MIX_PAR_DEFAUT);
  demarrerPartie(salle);
  lancer(salle);
  const { questions, departs } = salle.etatMode;
  assert.equal(questions.length, 5);
  assert.ok(questions.every((mix) => mix.length === CHANSONS_PAR_MIX));
  assert.equal(new Set(questions.flat().map((chanson) => chanson.id)).size, 25);
  assert.equal(departs.length, CHANSONS_PAR_MIX);
  assert.ok(departs.every((depart) => Number.isInteger(depart) && depart >= 0 && depart <= 10));
});

test('mix : points 1000 les deux, 500 l\'un des deux, cumulés sur la manche', () => {
  const trouvees = {
    0: { joueur: 'lea', trouve: 'les-deux' }, 1: { joueur: 'lea', trouve: 'titre' }, 2: { joueur: 'sam', trouve: 'artiste' },
  };
  assert.equal(pointsDuMix(trouvees, 'lea'), 1500);
  assert.equal(pointsDuMix(trouvees, 'sam'), 500);
  assert.equal(pointsDuMix(trouvees, 'paul'), 0);
});

test('mix : arrêter, seulement le maître, pendant l\'écoute, une chanson pas encore trouvée', () => {
  const { salle, joueurs: [paul, lea] } = mixPret(3);
  assert.equal(repondre(salle, lea, { arreter: 0 }), false, 'pas le maître');
  for (const index of [-1, 5, 1.5, '0', null]) assert.equal(repondre(salle, paul, { arreter: index }), false, `index ${index}`);
  assert.equal(repondre(salle, paul, null), false);
  trouver(salle, paul, 0, lea, 'titre');
  assert.equal(repondre(salle, paul, { arreter: 0 }), false, 'déjà trouvée');
  assert.equal(repondre(salle, paul, { arreter: 1 }), true);
  assert.equal(etape(salle), 'designation');
  assert.equal(repondre(salle, paul, { arreter: 2 }), false, 'hors écoute');
});

test('mix : désigner donne les points tout de suite et retire la chanson ; annuler ne compte rien', () => {
  const { salle, joueurs: [paul, lea, sam] } = mixPret(3);
  repondre(salle, paul, { arreter: 2 });
  assert.equal(repondre(salle, paul, { joueur: paul.id, trouve: 'titre' }), false, 'le maître lui-même');
  assert.equal(repondre(salle, paul, { joueur: 'j_inconnu', trouve: 'titre' }), false);
  assert.equal(repondre(salle, paul, { joueur: lea.id, trouve: 'tout' }), false);
  assert.equal(repondre(salle, paul, { joueur: lea.id, trouve: 'toString' }), false);
  assert.equal(repondre(salle, lea, { joueur: lea.id, trouve: 'titre' }), false, 'pas le maître');
  assert.equal(repondre(salle, paul, { joueur: lea.id, trouve: 'les-deux' }), true);
  assert.equal(lea.score, 1000);
  assert.equal(etape(salle), 'ecoute');
  assert.deepEqual(salle.etatMode.trouvees, { 2: { joueur: lea.id, trouve: 'les-deux' } });

  repondre(salle, paul, { arreter: 3 });
  assert.equal(repondre(salle, paul, { annuler: true }), true);
  assert.equal(etape(salle), 'ecoute');
  assert.equal(salle.etatMode.trouvees[3], undefined);
  trouver(salle, paul, 3, sam, 'artiste');
  assert.equal(sam.score, 500);
});

test('mix : le décompte d\'écoute est figé pendant la désignation, qui s\'annule au bout de 20 s', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [paul] } = mixPret(3);
  quandAvance(salle);
  t.mock.timers.tick(30000);
  repondre(salle, paul, { arreter: 0 });
  quandAvance(salle);
  assert.equal(salle.etatMode.ecouteRestanteMs, DUREE_ECOUTE_MIX_MS - 30000);
  t.mock.timers.tick(DUREE_DESIGNATION_MIX_MS - 1);
  assert.equal(etape(salle), 'designation');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'ecoute', 'désignation annulée');
  assert.deepEqual(salle.etatMode.trouvees, {});
  assert.equal(vueTv(salle).etatMode.tempsRestantMs, DUREE_ECOUTE_MIX_MS - 30000);
  t.mock.timers.tick(DUREE_ECOUTE_MIX_MS - 30000 - 1);
  assert.equal(etape(salle), 'ecoute');
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'revelation', '120 s d\'écoute au total');
});

test('mix : les 5 chansons trouvées, révélation directe ; « Suivant » passe au mix suivant', () => {
  const { salle, joueurs: [paul, lea, sam] } = mixPret(3);
  for (let index = 0; index < CHANSONS_PAR_MIX; index++) trouver(salle, paul, index, index % 2 ? sam : lea, 'les-deux');
  assert.equal(etape(salle), 'revelation');
  assert.equal(lea.score, 3000);
  assert.equal(sam.score, 2000);
  const classement = vueTv(salle).etatMode.classement;
  assert.equal(classement.find((ligne) => ligne.id === lea.id).points, 3000);
  assert.equal(suivant(salle), true);
  assert.equal(salle.etatMode.indexQuestion, 1);
  assert.equal(etape(salle), 'relais');
  lancer(salle);
  assert.deepEqual(salle.etatMode.trouvees, {});
  assert.equal(salle.etatMode.ecouteRestanteMs, DUREE_ECOUTE_MIX_MS);
});

test('mix : l\'hôte termine en plein mix, les chansons déjà trouvées sont comptées', () => {
  const { salle, joueurs: [paul, lea] } = mixPret(3);
  trouver(salle, paul, 1, lea, 'titre');
  terminerPartie(salle);
  assert.equal(etape(salle), 'podium');
  assert.equal(lea.score, 500);
});

test('mix secret : une carte non trouvée n\'a que son extrait, les autres joueurs ne voient rien', () => {
  const { salle, joueurs: [paul, lea] } = mixPret(3);
  trouver(salle, paul, 1, lea, 'artiste');
  const tv = vueTv(salle).etatMode;
  assert.deepEqual(tv.cartes[0], { extrait: { id: 'd100', depart: salle.etatMode.departs[0], gain: -10 } });
  assert.deepEqual(tv.cartes[1], {
    titre: 'Titre 1', artiste: 'Artiste 1', pochette: 'https://pochette/1.jpg', joueur: lea.id, trouve: 'artiste', points: 500,
  });
  for (const index of [0, 2, 3, 4]) {
    assert.ok(!JSON.stringify(tv).includes(`Titre ${index}`), `TV : Titre ${index}`);
    assert.ok(!JSON.stringify(vueJoueur(salle, lea)).includes(`Titre ${index}`), `joueur : Titre ${index}`);
  }
  const maitre = vueJoueur(salle, paul);
  assert.equal(maitre.ecran, 'maitre_mix');
  assert.deepEqual(maitre.chansons.map((chanson) => chanson.titre), ['Titre 0', 'Titre 1', 'Titre 2', 'Titre 3', 'Titre 4']);
  assert.deepEqual(maitre.chansons[1], { titre: 'Titre 1', artiste: 'Artiste 1', trouvee: true, indisponible: false, joueur: 'Léa' });
  assert.ok(!JSON.stringify(maitre).includes('"d10'), 'le maître ne reçoit pas les ids Deezer');

  repondre(salle, paul, { arreter: 3 });
  const designation = vueJoueur(salle, paul);
  assert.equal(designation.ecran, 'maitre_designation');
  assert.equal(designation.chanson.titre, 'Titre 3');
  assert.deepEqual(designation.designables.map((joueur) => joueur.pseudo), ['Léa', 'Sam']);
  assert.equal(vueJoueur(salle, lea).ecran, 'ecouter');
  assert.equal(vueTv(salle).etatMode.chansonEnDesignation, 3);
});

test('mix révélation : toutes les cartes retournées, résultat de chacun', () => {
  const { salle, joueurs: [paul, lea, sam] } = mixPret(3);
  trouver(salle, paul, 0, lea, 'les-deux');
  avancer(salle);
  assert.equal(etape(salle), 'revelation');
  const tv = vueTv(salle).etatMode;
  assert.deepEqual(tv.cartes.map((carte) => carte.titre), ['Titre 0', 'Titre 1', 'Titre 2', 'Titre 3', 'Titre 4']);
  assert.equal(tv.cartes[2].joueur, null);
  assert.equal(tv.extraitsSuivants, undefined, 'les extraits du mix suivant se chargent au relais');
  const resultat = vueJoueur(salle, lea);
  assert.equal(resultat.ecran, 'resultat');
  assert.equal(resultat.points, 1000);
  assert.equal(resultat.chansons[0].trouvePar, 'Léa');
  assert.equal(resultat.chansons[0].trouve, 'les-deux');
  assert.equal(vueJoueur(salle, sam).points, 0);
  assert.equal(vueJoueur(salle, paul).estMaitre, true);
});

// --- Mix : chargement des extraits avant le lancement (tranche 42) ---

// Mix au relais de la première manche, avant « Lancer le mix ».
function mixAuRelais(n = 3) {
  const salle = creerSalle('tv');
  const joueurs = PSEUDOS.slice(0, n).map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  choisirMode(salle, 'blind-test');
  reglerMode(salle, MIX_PAR_DEFAUT);
  demarrerPartie(salle);
  salle.etatMode.maitres = joueurs.map((joueur) => joueur.id);
  salle.etatMode.questions[0] = [...MIX];
  return { salle, joueurs };
}

const idsDuMix = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion].map((chanson) => chanson.id);

test('mix relais : la TV reçoit les 5 extraits avec leur départ, le maître attend leur chargement', () => {
  const { salle, joueurs: [paul] } = mixAuRelais();
  const tv = vueTv(salle).etatMode;
  assert.deepEqual(tv.extraits.map((extrait) => extrait.id), ['d100', 'd101', 'd102', 'd103', 'd104']);
  assert.deepEqual(tv.extraits.map((extrait) => extrait.depart), salle.etatMode.departs);
  assert.equal(tv.extraits[0].gain, -10);
  assert.deepEqual(tv.chargement, { faits: 0, total: 5, peutLancer: false });
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), false, 'rien de chargé');

  assert.equal(recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd102'], echecs: [] }), true);
  assert.deepEqual(vueJoueur(salle, paul).chargement, { faits: 3, total: 5, peutLancer: false });
  assert.equal(recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd102'], echecs: [] }), false, 'rien de neuf');
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), false, '3/5');

  assert.equal(recevoirExtraits(salle, { numero: 1, prets: idsDuMix(salle), echecs: [] }), true);
  assert.equal(vueJoueur(salle, paul).chargement.peutLancer, true);
  assert.equal(echeance(salle), null, 'plus de délai à attendre');
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), true);
  assert.equal(etape(salle), 'ecoute');
});

test('mix relais : un extrait en échec est remplacé par une chanson hors de la partie, 2 fois au plus', () => {
  const { salle, joueurs: [paul] } = mixAuRelais();
  const dansLaPartie = new Set(salle.etatMode.questions.flat().map((chanson) => chanson.id));
  recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd103', 'd104'], echecs: ['d102'] });
  const premiere = salle.etatMode.questions[0][2];
  assert.notEqual(premiere.id, 'd102');
  assert.ok(!dansLaPartie.has(premiere.id), 'remplaçante hors de la partie');
  assert.ok(salle.questionsVues.includes(premiere.id));
  assert.equal(vueTv(salle).etatMode.extraits[2].id, premiere.id);

  recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd103', 'd104'], echecs: [premiere.id] });
  const seconde = salle.etatMode.questions[0][2];
  assert.ok(![premiere.id, 'd102'].includes(seconde.id));

  recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd103', 'd104'], echecs: [seconde.id] });
  assert.deepEqual(salle.etatMode.chargement.indisponibles, [2]);
  assert.equal(vueTv(salle).etatMode.extraits[2], null);
  assert.deepEqual(vueTv(salle).etatMode.chargement, { faits: 5, total: 5, peutLancer: true });
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), true);
});

test('mix indisponible : rien ne joue à sa place, impossible à arrêter, la manche finit sans elle', () => {
  const { salle, joueurs: [paul, lea] } = mixAuRelais();
  salle.etatMode.chargement.remplacements[4] = 2;
  recevoirExtraits(salle, { numero: 1, prets: ['d100', 'd101', 'd102', 'd103'], echecs: ['d104'] });
  enregistrerReponse(salle, paul.id, { lancer: true });
  assert.deepEqual(vueTv(salle).etatMode.cartes[4], { indisponible: true });
  assert.equal(vueJoueur(salle, paul).chansons[4].indisponible, true);
  assert.equal(repondre(salle, paul, { arreter: 4 }), false);
  for (let index = 0; index < 4; index++) trouver(salle, paul, index, lea, 'titre');
  assert.equal(etape(salle), 'revelation');
  assert.ok(!JSON.stringify(vueTv(salle).etatMode.cartes[4]).includes('Titre 4'));
});

test('mix relais : sans réponse de la TV, le maître peut lancer au bout de 10 s', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [paul] } = mixAuRelais();
  quandAvance(salle);
  assert.equal(echeance(salle), DELAI_CHARGEMENT_MIX_MS);
  t.mock.timers.tick(DELAI_CHARGEMENT_MIX_MS - 1);
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), false);
  t.mock.timers.tick(1);
  assert.equal(etape(salle), 'relais', 'le relais attend toujours le maître');
  assert.equal(vueJoueur(salle, paul).chargement.peutLancer, true);
  assert.equal(enregistrerReponse(salle, paul.id, { lancer: true }), true);
});

test('mix relais : signal de la TV ignoré pour une autre manche, hors relais, en classique ou malformé', () => {
  const { salle } = mixAuRelais();
  const ids = idsDuMix(salle);
  for (const donnees of [null, 42, {}, { numero: 2, prets: ids, echecs: [] }, { numero: 1, prets: 'd100', echecs: [] }]) {
    assert.equal(recevoirExtraits(salle, donnees), false, JSON.stringify(donnees));
  }
  toutCharger(salle);
  lancer(salle);
  assert.equal(recevoirExtraits(salle, { numero: 1, prets: [], echecs: ids }), false, 'pendant l\'écoute');
  assert.deepEqual(salle.etatMode.questions[0].map((chanson) => chanson.id), ids);

  const { salle: classique } = sallePrete();
  assert.equal(recevoirExtraits(classique, { numero: 1, prets: [], echecs: ['d42'] }), false);
});

// --- Catégories (tranche 42) ---

// Un petit catalogue rangé, catégories déduites des playlists comme dans banqueBlindTest :
// 3 chansons « 80 », 2 « Rap » (dont une aussi « 80 »), 1 sans catégorie.
const RANGEES = [
  { id: 'd1', categories: ['80'] }, { id: 'd2', categories: ['80'] }, { id: 'd3', categories: ['80', 'Rap'] },
  { id: 'd4', categories: ['Rap'] }, { id: 'd5', categories: [] },
];
const ids = (chansons) => chansons.map((chanson) => chanson.id);

test('catégories : celles du catalogue dans l\'ordre, au moins une choisie, toutes connues, sans doublon', () => {
  assert.deepEqual(categoriesDe(RANGEES), ['80', 'Rap']);
  assert.equal(categoriesValides(['Rap'], ['80', 'Rap']), true);
  assert.equal(categoriesValides(['80', 'Rap'], ['80', 'Rap']), true);
  for (const invalide of [[], ['Jazz'], ['80', '80'], '80', null, [80]]) {
    assert.equal(categoriesValides(invalide, ['80', 'Rap']), false, JSON.stringify(invalide));
  }
  assert.equal(categoriesValides([], []), true, 'catalogue pas encore rangé');
});

test('catégories : le choix de l\'hôte, une chanson de plusieurs catégories comprise ; toutes = tout le catalogue', () => {
  assert.deepEqual(ids(chansonsDuChoix(RANGEES, ['Rap'])), ['d3', 'd4']);
  assert.deepEqual(ids(chansonsDuChoix(RANGEES, ['80'])), ['d1', 'd2', 'd3']);
  assert.deepEqual(ids(chansonsDuChoix(RANGEES, ['80', 'Rap'])), ['d1', 'd2', 'd3', 'd4', 'd5'], 'les non rangées avec « toutes »');
  assert.deepEqual(ids(chansonsDuChoix([{ id: 'd9', categories: [] }], [])), ['d9'], 'catalogue pas encore rangé');
});

test('catégories : tirage dans le choix d\'abord, jamais entendues puis déjà entendues, puis les autres', () => {
  const tirees = tirerChansons(RANGEES, ['Rap'], ['d3'], 4);
  assert.deepEqual(ids(tirees.slice(0, 2)), ['d4', 'd3'], 'Rap : la jamais entendue, puis la déjà entendue');
  assert.equal(tirees.length, 4, 'complété avec les autres');
  assert.ok(tirees.slice(2).every((chanson) => ['d1', 'd2', 'd5'].includes(chanson.id)));
  assert.equal(tirerChansons(RANGEES, ['Rap'], [], 10).length, 5, 'jamais plus que le catalogue');
});
