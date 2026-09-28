import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJoueur, creerSalle } from '../salles.js';
import {
  DUREE_RECHERCHE_MS, DUREE_REVELATION_MS, LONGUEUR_MIN_MEILLEUR, SAC, avancer, calculerResultats,
  demarrerPartie, dictionnaire, echeance, enregistrerReponse, formableAvec, normaliserSaisie,
  plusLongPossible, preparerDictionnaire, raisonRefus, reglagesParDefaut, reveler, suivant, tirerLettres,
  tirerManche, validerReglages, verifierFinAnticipee, vueJoueur, vueReglages, vueTv,
} from './mot-le-plus-long.js';

// Le mode n'est pas encore dans le registre (temps 2) : on appelle ses fonctions directement.
function sallePrete({ joueurs = ['A', 'B'], manches } = {}) {
  const salle = creerSalle('tv');
  const liste = joueurs.map((pseudo, i) => ajouterJoueur(salle, pseudo, `s${i}`).joueur);
  salle.mode = 'mot-le-plus-long';
  if (manches) salle.reglagesMode['mot-le-plus-long'] = { ...reglagesParDefaut(), longueur: manches };
  salle.etat = 'partie';
  demarrerPartie(salle);
  return { salle, joueurs: liste };
}

// Temps simulé : Date.now() part de 0 et n'avance qu'avec t.mock.timers.tick().
function simulerTemps(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
}

const tirageCourant = (salle) => salle.etatMode.questions[salle.etatMode.indexQuestion];

// Deux lettres du tirage qui ne forment pas un mot du dictionnaire.
function motInvalide(lettres) {
  for (const x of lettres) {
    for (const y of lettres) {
      const mot = x + y;
      if (formableAvec(mot, lettres) && !dictionnaire.ensemble.has(mot)) return mot;
    }
  }
  throw new Error('aucun mot invalide trouvé');
}

// Un mot valide du tirage, plus court que le meilleur.
function motPlusCourt({ lettres, meilleur }) {
  return dictionnaire.parLongueur.find((mot) => mot.length < meilleur.length && formableAvec(mot, lettres));
}

const PETIT_DICO = preparerDictionnaire(['ETE', 'LES', 'SEL', 'ELLE', 'TESLA', 'SALUTE', 'SALE']);
const LETTRES = ['S', 'A', 'L', 'U', 'T', 'E', 'X', 'E', 'K'];

// --- Règles pures ---

test('lettres : chaque lettre du tirage sert une fois', () => {
  assert.equal(formableAvec('SALUTE', LETTRES), true);
  assert.equal(formableAvec('ETE', LETTRES), true, 'deux E tirés');
  assert.equal(formableAvec('ELLE', LETTRES), false, 'un seul L tiré');
  assert.equal(formableAvec('BAL', LETTRES), false, 'pas de B');
});

test('plus long possible : le plus long, le premier dans l\'ordre alphabétique à égalité', () => {
  assert.equal(plusLongPossible(LETTRES, PETIT_DICO), 'SALUTE');
  assert.equal(plusLongPossible(['S', 'E', 'L', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'], PETIT_DICO), 'LES');
  assert.equal(plusLongPossible(['L', 'L', 'E', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'], PETIT_DICO), null, 'ELLE demande deux E');
});

test('saisie : majuscules sans accents, rien d\'autre que des lettres', () => {
  assert.equal(normaliserSaisie('été'), 'ETE');
  assert.equal(normaliserSaisie('Œuf'), 'OEUF');
  assert.equal(normaliserSaisie(''), '');
  for (const texte of ['A1', 'A-B', 'A B', 42, null, undefined, ['A']]) {
    assert.equal(normaliserSaisie(texte), null, JSON.stringify(texte));
  }
});

test('validité : lettres absentes, puis dictionnaire', () => {
  assert.equal(raisonRefus('SALUTE', LETTRES, PETIT_DICO), null);
  assert.equal(raisonRefus('ELLE', LETTRES, PETIT_DICO), 'lettres');
  assert.equal(raisonRefus('TALUS', LETTRES, PETIT_DICO), 'dictionnaire');
});

test('points : le plus long seul marque sa longueur, ex æquo compris', () => {
  const reponses = {
    a: { mot: 'TESLA', recuA: 1 }, // 5 lettres, valide
    b: { mot: 'SALE', recuA: 2 }, // plus court : 0
    c: { mot: 'TALUSE', recuA: 3 }, // plus long mais invalide : 0
    d: { mot: 'LES', recuA: 4 },
  };
  const lignes = calculerResultats(reponses, LETTRES, PETIT_DICO);
  assert.deepEqual(lignes.map((l) => [l.id, l.points]), [['a', 5], ['b', 0], ['d', 0], ['c', 0]]);
  assert.deepEqual(lignes[3], { id: 'c', mot: 'TALUSE', longueur: 6, valide: false, raison: 'dictionnaire', points: 0 });

  const exAequo = calculerResultats({ a: { mot: 'LES', recuA: 1 }, b: { mot: 'SEL', recuA: 2 } }, LETTRES, PETIT_DICO);
  assert.deepEqual(exAequo.map((l) => l.points), [3, 3]);

  const aucunValide = calculerResultats({ a: { mot: 'TALUS', recuA: 1 } }, LETTRES, PETIT_DICO);
  assert.equal(aucunValide[0].points, 0);
});

// --- Tirage ---

test('tirage : 9 lettres du sac, au moins 2 voyelles et 2 consonnes', () => {
  for (let i = 0; i < 1000; i++) {
    const lettres = tirerLettres();
    assert.equal(lettres.length, 9);
    const voyelles = lettres.filter((l) => 'AEIOUY'.includes(l)).length;
    assert.ok(voyelles >= 2 && voyelles <= 7, lettres.join(''));
    for (const [lettre, nombre] of Object.entries(SAC)) {
      assert.ok(lettres.filter((l) => l === lettre).length <= nombre, `${lettre} : ${lettres.join('')}`);
    }
  }
});

test('tirage : toujours un mot d\'au moins 6 lettres, formable et dans le dictionnaire', () => {
  for (let i = 0; i < 50; i++) {
    const { lettres, meilleur } = tirerManche(dictionnaire);
    assert.ok(meilleur.length >= LONGUEUR_MIN_MEILLEUR, `${lettres.join('')} → ${meilleur}`);
    assert.equal(raisonRefus(meilleur, lettres, dictionnaire), null);
    assert.equal(plusLongPossible(lettres, dictionnaire), meilleur);
  }
});

// --- Réglages ---

test('réglages : 5, 6 ou 7 manches, 30, 45 ou 60 s, 6 manches de 45 s par défaut', () => {
  assert.deepEqual(reglagesParDefaut(), { longueur: 6, temps: 45 });
  for (const longueur of [5, 6, 7]) {
    for (const temps of [30, 45, 60]) assert.deepEqual(validerReglages({ longueur, temps }), { longueur, temps });
  }
  for (const donnees of [{ longueur: 4, temps: 45 }, { longueur: 6, temps: 20 }, { longueur: '6', temps: 45 }, {}, null]) {
    assert.equal(validerReglages(donnees), null, JSON.stringify(donnees));
  }
  const salle = creerSalle('tv');
  salle.reglagesMode['mot-le-plus-long'] = { longueur: 7, temps: 60 };
  assert.equal(vueReglages(salle).resume, '7 manches · 60 s');
});

test('partie : 6 manches par défaut, 7 si l\'hôte l\'a choisi', () => {
  assert.equal(sallePrete().salle.etatMode.questions.length, 6);
  assert.equal(sallePrete({ manches: 7 }).salle.etatMode.questions.length, 7);
});

// --- Mots des joueurs ---

test('mot validé : accepté une seule fois, ramené en majuscules', () => {
  const { salle, joueurs: [a] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  const { meilleur } = tirageCourant(salle);
  assert.equal(enregistrerReponse(salle, a.id, { mot: meilleur.toLowerCase(), valide: true }), true);
  assert.equal(enregistrerReponse(salle, a.id, { mot: meilleur, valide: true }), false);
  assert.equal(enregistrerReponse(salle, a.id, { mot: '', valide: false }), false);
  assert.equal(salle.etatMode.reponses[a.id].mot, meilleur);
});

test('brouillon : gardé, remplacé par le suivant, sans rien à diffuser', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { lettres } = tirageCourant(salle);
  assert.equal(enregistrerReponse(salle, a.id, { mot: lettres[0], valide: false }), false);
  assert.equal(enregistrerReponse(salle, a.id, { mot: lettres[0] + lettres[1] }), false);
  assert.equal(salle.etatMode.brouillons[a.id], lettres[0] + lettres[1]);
  assert.equal(enregistrerReponse(salle, a.id, { mot: '' }), false);
  assert.equal(salle.etatMode.brouillons[a.id], '');
  assert.equal(salle.etatMode.reponses[a.id], undefined);
});

test('mot : saisies trafiquées refusées sans message', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { lettres } = tirageCourant(salle);
  const absente = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !lettres.includes(l));
  const invalides = [
    null, 'MOT', 42, {}, { mot: 42, valide: true }, { mot: `${lettres[0]}1`, valide: true },
    { mot: lettres.join('') + lettres[0], valide: false }, { mot: absente + lettres[0], valide: true },
    { mot: lettres[0], valide: true },
  ];
  for (const donnees of invalides) assert.equal(enregistrerReponse(salle, a.id, donnees), false, JSON.stringify(donnees));
  assert.deepEqual(salle.etatMode.brouillons, {});
  assert.deepEqual(salle.etatMode.reponses, {});
});

test('mot : refusé d\'un joueur non attendu ou hors recherche', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { meilleur } = tirageCourant(salle);
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.equal(enregistrerReponse(salle, retard.id, { mot: meilleur, valide: true }), false);
  assert.equal(enregistrerReponse(salle, retard.id, { mot: meilleur }), false);
  assert.deepEqual(salle.etatMode.brouillons, {});
  reveler(salle);
  assert.equal(enregistrerReponse(salle, a.id, { mot: meilleur, valide: true }), false);
});

// --- Enchaînement ---

test('fin anticipée : tous les attendus ont validé', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  const { meilleur } = tirageCourant(salle);
  enregistrerReponse(salle, a.id, { mot: meilleur, valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'recherche');
  enregistrerReponse(salle, b.id, { mot: meilleur, valide: true });
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin anticipée : le dernier attendu se déconnecte', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  enregistrerReponse(salle, a.id, { mot: tirageCourant(salle).meilleur, valide: true });
  b.connecte = false;
  verifierFinAnticipee(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
});

test('fin du chrono : les brouillons sont validés, brouillon vide = pas de mot', (t) => {
  simulerTemps(t);
  const { salle, joueurs: [a, b, c, d] } = sallePrete({ joueurs: ['A', 'B', 'C', 'D'] });
  const tirage = tirageCourant(salle);
  enregistrerReponse(salle, a.id, { mot: tirage.meilleur, valide: false });
  enregistrerReponse(salle, b.id, { mot: tirage.meilleur, valide: true });
  enregistrerReponse(salle, c.id, { mot: '', valide: false });
  assert.equal(echeance(salle), DUREE_RECHERCHE_MS);
  t.mock.timers.tick(DUREE_RECHERCHE_MS);
  avancer(salle);
  assert.equal(salle.etatMode.phase, 'revelation');
  const n = tirage.meilleur.length;
  assert.deepEqual([a.score, b.score, c.score, d.score], [n, n, 0, 0]);
  assert.deepEqual(vueTv(salle).sansReponse, [c.id, d.id]);
});

test('points : un mot plus court ou invalide ne marque rien', () => {
  const { salle, joueurs: [a, b, c] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  const tirage = tirageCourant(salle);
  enregistrerReponse(salle, a.id, { mot: tirage.meilleur, valide: true });
  enregistrerReponse(salle, b.id, { mot: motPlusCourt(tirage), valide: true });
  enregistrerReponse(salle, c.id, { mot: motInvalide(tirage.lettres), valide: true });
  reveler(salle);
  assert.deepEqual([a.score, b.score, c.score], [tirage.meilleur.length, 0, 0]);
  const ligneC = vueTv(salle).resultats.find((l) => l.id === c.id);
  assert.deepEqual([ligneC.valide, ligneC.raison], [false, 'dictionnaire']);
});

test('révélation : 15 s puis manche suivante, podium après la dernière', (t) => {
  simulerTemps(t);
  const { salle } = sallePrete({ manches: 5 });
  for (let manche = 1; manche <= 5; manche++) {
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
  assert.equal(salle.etatMode.phase, 'recherche');
  assert.equal(salle.etatMode.indexQuestion, 1);
});

test('points ajoutés à la révélation seulement', () => {
  const { salle, joueurs: [a] } = sallePrete();
  enregistrerReponse(salle, a.id, { mot: tirageCourant(salle).meilleur, valide: true });
  assert.equal(a.score, 0);
  assert.equal(vueTv(salle).classement, undefined);
  reveler(salle);
  assert.equal(a.score, tirageCourant(salle).meilleur.length);
});

// --- Le secret ---

test('secret : pendant la recherche, ni le meilleur mot ni le mot des autres', () => {
  const { salle, joueurs: [a, b] } = sallePrete();
  const tirage = tirageCourant(salle);
  const motDeB = motPlusCourt(tirage);
  enregistrerReponse(salle, a.id, { mot: tirage.meilleur, valide: true });
  enregistrerReponse(salle, b.id, { mot: motDeB, valide: false });
  const tv = JSON.stringify(vueTv(salle));
  assert.equal(tv.includes(tirage.meilleur), false, 'ni le meilleur ni le mot de A sur la TV');
  assert.equal(tv.includes(`"${motDeB}"`), false, 'pas de brouillon sur la TV');
  assert.equal(JSON.stringify(vueJoueur(salle, b)).includes(tirage.meilleur), false, 'ni le meilleur ni le mot de A');
  assert.equal(JSON.stringify(vueJoueur(salle, a)).includes(`"${motDeB}"`), false, 'pas le brouillon de B');
});

test('vues du téléphone : recherche, mot validé, résultat, arrivée en cours de manche', () => {
  const { salle, joueurs: [a, b] } = sallePrete({ joueurs: ['A', 'B', 'C'] });
  const { lettres, meilleur } = tirageCourant(salle);
  assert.deepEqual(vueJoueur(salle, a), { ecran: 'recherche', numero: 1, total: 6, lettres, mot: '' });
  enregistrerReponse(salle, a.id, { mot: lettres[0] });
  assert.equal(vueJoueur(salle, a).mot, lettres[0]);
  enregistrerReponse(salle, a.id, { mot: meilleur, valide: true });
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'mot_valide', numero: 1, total: 6, lettres, mot: meilleur, nbValides: 1, nbAttendus: 3,
  });
  const { joueur: retard } = ajouterJoueur(salle, 'Retard', 's9');
  assert.deepEqual(vueJoueur(salle, retard), { ecran: 'attente_question' });
  reveler(salle);
  assert.deepEqual(vueJoueur(salle, a), {
    ecran: 'resultat', numero: 1, total: 6, lettres, mot: meilleur, valide: true, raison: null,
    points: meilleur.length, meilleur, rang: 1,
  });
  const sansMot = vueJoueur(salle, b);
  assert.deepEqual([sansMot.mot, sansMot.valide, sansMot.points], [null, false, 0]);
});

test('vue TV : lettres et chrono, puis résultats, meilleur mot et classement', () => {
  const { salle, joueurs: [a] } = sallePrete();
  const { lettres, meilleur } = tirageCourant(salle);
  const recherche = vueTv(salle);
  assert.deepEqual(Object.keys(recherche).sort(), ['lettres', 'numero', 'ontRepondu', 'phase', 'tempsRestantMs', 'total']);
  assert.deepEqual(recherche.lettres, lettres);
  enregistrerReponse(salle, a.id, { mot: meilleur, valide: true });
  assert.deepEqual(vueTv(salle).ontRepondu, [a.id]);
  reveler(salle);
  const tv = vueTv(salle);
  assert.equal(tv.meilleur, meilleur);
  assert.deepEqual(tv.resultats.map((l) => l.id), [a.id]);
  assert.equal(tv.classement[0].points, meilleur.length);
});
