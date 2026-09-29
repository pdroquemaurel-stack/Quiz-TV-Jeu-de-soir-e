// Écrans du Compte est bon sur le téléphone. socket, texteRang, marquerEnvoi et
// envoyerSuivant viennent de joueur.js.
// Le calcul se construit en touchant une case, une opération, puis une seconde case.
// Le téléphone calcule les étapes et grise les coups interdits pour l'affichage
// seulement : le serveur rejoue chaque calcul reçu.

const SIGNES_COMPTE = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const elementCasesCompte = document.getElementById('lceb-cases');
const boutonsOperationCompte = document.querySelectorAll('#lceb-operations button');
const boutonProposerCompte = document.getElementById('lceb-proposer');
const boutonFiniCompte = document.getElementById('lceb-fini');

// Les plaques de la manche affichée, les étapes faites ({ a, op, b, resultat }), et
// l'étape commencée : le numéro de la première case, puis l'opération.
let plaquesCompte = [];
let etapesCompte = [];
let premiereCaseCompte = null;
let operationCompte = null;
let propositionsCompte = [];
// Manche affichée : le calcul n'est repris du serveur qu'au changement de manche (ou au
// rechargement de la page), pas à chaque mise à jour (un autre joueur finit…).
let mancheAfficheeCompte = null;

function calculerEtape(a, op, b) {
  if (op === '+') return a + b;
  if (op === '*') return a * b;
  if (op === '-') return a > b ? a - b : null;
  return a % b === 0 ? a / b : null;
}

function texteEtape({ a, op, b, resultat }) {
  return `${a} ${SIGNES_COMPTE[op]} ${b} = ${resultat}`;
}

// Les 6 cases, rejouées depuis les plaques : le résultat d'une étape prend la case de
// son premier nombre, la case du second se vide (null). Une étape faite ici retient ses
// cases (caseA, caseB) ; une étape reprise du serveur, après un rechargement, prend
// les premières cases qui portent ses nombres.
function casesDuCalcul() {
  const cases = plaquesCompte.map((valeur) => ({ valeur, resultat: false }));
  for (const { a, b, resultat, caseA, caseB } of etapesCompte) {
    const i = caseA ?? cases.findIndex((c) => c?.valeur === a);
    const j = caseB ?? cases.findIndex((c, k) => k !== i && c?.valeur === b);
    cases[i] = { valeur: resultat, resultat: true };
    cases[j] = null;
  }
  return cases;
}

// Les cases que l'on peut prendre en second, avec cette opération.
function secondesPossibles(cases, op) {
  const premiere = cases[premiereCaseCompte].valeur;
  return cases
    .map((c, k) => (c && k !== premiereCaseCompte && calculerEtape(premiere, op, c.valeur) !== null ? k : null))
    .filter((k) => k !== null);
}

function dessinerCases(cases) {
  const possibles = operationCompte ? secondesPossibles(cases, operationCompte) : null;
  elementCasesCompte.replaceChildren();
  cases.forEach((c, k) => {
    const bouton = document.createElement('button');
    bouton.className = 'lceb-case';
    if (!c) {
      bouton.classList.add('vide');
      bouton.disabled = true;
    } else {
      bouton.textContent = c.valeur;
      bouton.classList.toggle('resultat', c.resultat);
      bouton.classList.toggle('choisie', k === premiereCaseCompte);
      bouton.disabled = possibles !== null && k !== premiereCaseCompte && !possibles.includes(k);
      bouton.addEventListener('click', () => toucherCase(k));
    }
    elementCasesCompte.append(bouton);
  });
}

function dessinerOperations(cases) {
  for (const bouton of boutonsOperationCompte) {
    const op = bouton.dataset.op;
    bouton.disabled = premiereCaseCompte === null || secondesPossibles(cases, op).length === 0;
    bouton.classList.toggle('choisie', op === operationCompte);
  }
}

function dessinerCalcul(cases) {
  const lignes = etapesCompte.map(texteEtape);
  if (premiereCaseCompte !== null) {
    const debut = `${cases[premiereCaseCompte].valeur}`;
    lignes.push(operationCompte ? `${debut} ${SIGNES_COMPTE[operationCompte]} …` : `${debut} …`);
  }
  remplirLignes(document.getElementById('lceb-calcul'), lignes);
}

function remplirLignes(element, lignes) {
  element.replaceChildren(...lignes.map((texte) => {
    const ligne = document.createElement('li');
    ligne.textContent = texte;
    return ligne;
  }));
}

function texteProposition({ resultat, ecart }) {
  return ecart === 0 ? `${resultat} (compte exact)` : `${resultat} (à ${ecart})`;
}

function textePropositions(propositions) {
  return propositions.map((p, i) => `${i + 1}. ${texteProposition(p)}`).join(' · ');
}

function redessinerCompte() {
  const cases = casesDuCalcul();
  dessinerCalcul(cases);
  dessinerCases(cases);
  dessinerOperations(cases);
  const derniere = etapesCompte.at(-1)?.resultat;
  boutonProposerCompte.textContent = derniere === undefined ? '=' : `= ${derniere}`;
  boutonProposerCompte.disabled = derniere === undefined || derniere === propositionsCompte.at(-1)?.resultat;
  document.getElementById('lceb-propositions').textContent = textePropositions(propositionsCompte);
  boutonFiniCompte.hidden = propositionsCompte.length === 0;
}

// Chaque étape ajoutée ou retirée part au serveur comme brouillon : il la proposera
// à la fin du chrono.
function changerEtapes(nouvelles) {
  etapesCompte = nouvelles;
  premiereCaseCompte = null;
  operationCompte = null;
  redessinerCompte();
  socket.emit('joueur:repondre', { action: 'brouillon', etapes: etapesPourServeur() });
}

// Le serveur recalcule lui-même les résultats.
function etapesPourServeur() {
  return etapesCompte.map(({ a, op, b }) => ({ a, op, b }));
}

function toucherCase(k) {
  const cases = casesDuCalcul();
  if (premiereCaseCompte === k) {
    premiereCaseCompte = null;
    operationCompte = null;
  } else if (premiereCaseCompte === null || operationCompte === null) {
    premiereCaseCompte = k;
  } else {
    const a = cases[premiereCaseCompte].valeur;
    const b = cases[k].valeur;
    const resultat = calculerEtape(a, operationCompte, b);
    if (resultat === null) return;
    changerEtapes([...etapesCompte, { a, op: operationCompte, b, resultat, caseA: premiereCaseCompte, caseB: k }]);
    return;
  }
  redessinerCompte();
}

for (const bouton of boutonsOperationCompte) {
  bouton.addEventListener('click', () => {
    if (premiereCaseCompte === null) return;
    operationCompte = operationCompte === bouton.dataset.op ? null : bouton.dataset.op;
    redessinerCompte();
  });
}

// Défait le dernier geste : l'opération, la première case, ou la dernière étape.
document.getElementById('lceb-annuler').addEventListener('click', () => {
  if (operationCompte) operationCompte = null;
  else if (premiereCaseCompte !== null) premiereCaseCompte = null;
  else if (etapesCompte.length) return changerEtapes(etapesCompte.slice(0, -1));
  redessinerCompte();
});
document.getElementById('lceb-effacer').addEventListener('click', () => {
  if (etapesCompte.length) changerEtapes([]);
  else {
    premiereCaseCompte = null;
    operationCompte = null;
    redessinerCompte();
  }
});
boutonProposerCompte.addEventListener('click', () => {
  if (!etapesCompte.length) return;
  marquerEnvoi(boutonProposerCompte);
  socket.emit('joueur:repondre', { action: 'proposer', etapes: etapesPourServeur() });
});
boutonFiniCompte.addEventListener('click', () => {
  marquerEnvoi(boutonFiniCompte);
  socket.emit('joueur:repondre', { action: 'fini' });
});
document.getElementById('bouton-suivant-lceb').addEventListener('click', envoyerSuivant);

function afficherRechercheCompte(vue) {
  document.getElementById('lceb-manche').textContent = `Manche ${vue.numero}/${vue.total}`;
  document.getElementById('lceb-cible').textContent = vue.cible;
  const manche = `${vue.numero} ${vue.plaques.join(' ')} ${vue.cible}`;
  if (manche !== mancheAfficheeCompte) {
    mancheAfficheeCompte = manche;
    plaquesCompte = vue.plaques;
    etapesCompte = vue.etapes;
    premiereCaseCompte = null;
    operationCompte = null;
  }
  propositionsCompte = vue.propositions;
  redessinerCompte();
}

function afficherFiniCompte(vue) {
  const exact = vue.propositions.some((p) => p.ecart === 0);
  const titre = document.getElementById('lceb-titre-fini');
  titre.textContent = exact ? 'Le compte est bon !' : 'Tes propositions';
  titre.classList.toggle('juste', exact);
  document.getElementById('lceb-cible-fini').textContent = `Cible : ${vue.cible}`;
  remplirLignes(document.getElementById('lceb-liste-fini'), vue.propositions.map(texteProposition));
  document.getElementById('lceb-attente').textContent =
    `En attente des autres joueurs… (${vue.nbFinis}/${vue.nbAttendus})`;
}

function texteResultatCompte(vue) {
  if (vue.resultat === null) return 'Pas de proposition';
  if (vue.ecart === 0) return `${vue.resultat} : le compte est bon !`;
  return `${vue.resultat}, à ${vue.ecart}`;
}

function textePointsCompte(vue) {
  if (vue.resultat === null) return '0 point';
  if (vue.points > 0) return vue.ecart === 0 ? `+${vue.points}, le compte est bon !` : `+${vue.points}, le plus proche !`;
  return '0 point : quelqu\'un a fait mieux';
}

function afficherResultatCompte(vue) {
  document.getElementById('lceb-cible-resultat').textContent = `Cible : ${vue.cible}`;
  document.getElementById('lceb-mon-resultat').textContent = texteResultatCompte(vue);
  remplirLignes(document.getElementById('lceb-mon-calcul'), vue.etapes.map(texteEtape));
  const points = document.getElementById('lceb-points');
  points.textContent = textePointsCompte(vue);
  points.classList.toggle('juste', vue.points > 0);
  remplirLignes(document.getElementById('lceb-solution'), vue.solution.map(texteEtape));
  document.getElementById('score-lceb').textContent = vue.score;
  document.getElementById('rang-lceb').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-lceb').hidden = !vue.estHote;
}

// Tout autre écran clôt la manche : la prochaine recherche repart du calcul du serveur.
socket.on('joueur:etat', (vue) => {
  if (vue.ecran !== 'recherche') mancheAfficheeCompte = null;
});

// Les options de l'hôte (manches et temps) sont les options communes, remplies par joueur.js.
modesJoueur['le-compte-est-bon'] = {
  recherche: afficherRechercheCompte,
  fini: afficherFiniCompte,
  resultat: afficherResultatCompte,
};
