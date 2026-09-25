// Écrans d'Undercover sur le téléphone. socket et texteRang viennent de joueur.js.
// Les scripts des modes partagent la même portée : les noms propres au mode finissent par « Uc ».

const ROLES_UC = { civil: 'civil', undercover: 'undercover', mister_white: 'Mister White' };
const TEXTE_MISTER_WHITE = "Tu es Mister White : tu n'as pas de mot. Écoute les autres et bluffe !";

// Dernier état reçu : le bouton « Voir mon mot » réaffiche sans attendre le serveur.
let derniereVueUc = null;
// Le mot est masqué par défaut, et à nouveau à chaque nouvelle manche.
let motVisibleUc = false;
let mancheAfficheeUc = null;

// ---------- Blocs présents dans plusieurs écrans ----------

// Le libellé du bouton est le même pour tous, Mister White compris : un voisin ne doit rien deviner.
function afficherBlocsMotUc(vue) {
  if (vue.manche !== mancheAfficheeUc) {
    mancheAfficheeUc = vue.manche;
    motVisibleUc = false;
  }
  for (const bloc of document.querySelectorAll('.bloc-mot')) {
    const mot = bloc.querySelector('.mot-secret');
    mot.textContent = vue.misterWhite ? TEXTE_MISTER_WHITE : vue.mot;
    mot.classList.toggle('mister-white', Boolean(vue.misterWhite));
    mot.hidden = !motVisibleUc;
    bloc.querySelector('.voir-mot').textContent = motVisibleUc ? 'Cacher' : 'Voir mon mot';
  }
}

document.addEventListener('click', (evenement) => {
  if (!evenement.target.closest('.voir-mot') || !derniereVueUc) return;
  motVisibleUc = !motVisibleUc;
  afficherBlocsMotUc(derniereVueUc);
});

// L'hôte garde son bouton sur tous les écrans du mode, même éliminé.
const LIBELLES_HOTE_UC = { passer_au_vote: 'Passer au vote', suivant: 'Suivant' };

function afficherBoutonsHoteUc(vue) {
  for (const bouton of document.querySelectorAll('.bouton-hote-uc')) {
    bouton.hidden = !vue.actionHote;
    bouton.textContent = LIBELLES_HOTE_UC[vue.actionHote] ?? '';
  }
}

document.addEventListener('click', (evenement) => {
  if (evenement.target.closest('.bouton-hote-uc')) envoyerSuivant();
});

function afficherCommunUc(vue) {
  derniereVueUc = vue;
  for (const element of document.querySelectorAll('.uc-manche')) {
    element.textContent = `Manche ${vue.manche}/${vue.totalManches} · Tour ${vue.tour}`;
  }
  if ('mot' in vue) afficherBlocsMotUc(vue);
  afficherBoutonsHoteUc(vue);
  if (vue.ecran !== 'deviner') clearInterval(intervalleDevinetteUc);
}

// ---------- Vote ----------

const listeCandidatsUc = document.getElementById('uc-candidats');

listeCandidatsUc.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-candidat');
  if (bouton) socket.emit('joueur:repondre', bouton.dataset.id);
});

function boutonCandidatUc(candidat) {
  const bouton = document.createElement('button');
  bouton.className = 'bouton-candidat';
  bouton.classList.toggle('deconnecte', !candidat.connecte);
  bouton.dataset.id = candidat.id;
  const rond = document.createElement('span');
  rond.className = 'pastille';
  rond.style.setProperty('--couleur', `var(--joueur-${candidat.couleur})`);
  const pseudo = document.createElement('span');
  pseudo.className = 'pseudo-candidat';
  pseudo.textContent = candidat.pseudo;
  bouton.append(rond, pseudo);
  return bouton;
}

// On ne recrée la grille que si elle change, pour ne pas perdre un appui en cours.
let grilleAfficheeUc = '';

function afficherVoterUc(vue) {
  afficherCommunUc(vue);
  document.getElementById('uc-consigne-vote').textContent = vue.departage ? 'Départage : qui éliminer ?' : 'Qui éliminer ?';
  const grille = JSON.stringify([vue.manche, vue.tour, vue.departage, vue.candidats]);
  if (grille === grilleAfficheeUc) return;
  grilleAfficheeUc = grille;
  listeCandidatsUc.replaceChildren(...vue.candidats.map(boutonCandidatUc));
}

function afficherVoteEnvoyeUc(vue) {
  afficherCommunUc(vue);
  document.getElementById('uc-pastille-vote').style.setProperty('--couleur', `var(--joueur-${vue.choisi.couleur})`);
  document.getElementById('uc-pseudo-vote').textContent = vue.choisi.pseudo;
}

// ---------- Élimination ----------

const REVELATIONS_UC = {
  civil: "C'était un civil",
  undercover: "C'était un undercover !",
  mister_white: "C'était Mister White !",
};

function afficherEliminationUc(vue) {
  afficherCommunUc(vue);
  const verdict = document.getElementById('uc-verdict');
  const detail = document.getElementById('uc-detail');
  const { elimine, departage, devinette } = vue;
  if (devinette && !devinette.resultatConnu) {
    verdict.textContent = `${devinette.misterWhite} cherche le mot des civils…`;
    detail.textContent = 'Regarde la TV';
  } else if (devinette) {
    verdict.textContent = devinette.proposition
      ? `${devinette.misterWhite} propose « ${devinette.proposition} »`
      : `${devinette.misterWhite} n'a rien proposé`;
    detail.textContent = devinette.trouve ? 'Trouvé : Mister White gagne !' : 'Raté !';
  } else if (elimine) {
    verdict.textContent = `${elimine.pseudo} est éliminé`;
    detail.textContent = REVELATIONS_UC[elimine.role];
  } else if (departage) {
    verdict.textContent = 'Égalité !';
    detail.textContent = `Départage entre ${departage.join(' et ')}`;
  } else {
    verdict.textContent = 'Personne n\'est éliminé';
    detail.textContent = '';
  }
}

function afficherElimineUc(vue) {
  afficherCommunUc(vue);
  document.getElementById('uc-role-elimine').textContent = `Tu étais ${ROLES_UC[vue.role]}`;
  document.getElementById('uc-mot-elimine').textContent = vue.misterWhite ? 'Tu n\'avais pas de mot' : `Ton mot : ${vue.mot}`;
}

// ---------- Devinette de Mister White ----------

const champMotUc = document.getElementById('uc-champ-mot');
const boutonValiderMotUc = document.getElementById('uc-valider-mot');
let intervalleDevinetteUc = null;

champMotUc.addEventListener('input', () => {
  boutonValiderMotUc.disabled = champMotUc.value.trim() === '';
});

function envoyerMotUc() {
  const proposition = champMotUc.value.trim();
  if (proposition === '') return;
  champMotUc.blur();
  socket.emit('joueur:repondre', proposition);
}

boutonValiderMotUc.addEventListener('click', envoyerMotUc);
champMotUc.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter') envoyerMotUc();
});

// Simple affichage : c'est le serveur qui clôt la devinette.
function lancerChronoDevinetteUc(tempsRestantMs) {
  const element = document.getElementById('uc-chrono-devinette');
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    element.textContent = `${Math.max(0, Math.ceil((fin - Date.now()) / 1000))} s`;
  };
  clearInterval(intervalleDevinetteUc);
  afficher();
  intervalleDevinetteUc = setInterval(afficher, 250);
}

function afficherDevinerUc(vue) {
  afficherCommunUc(vue);
  const { devinette } = vue;
  const resultat = document.getElementById('uc-resultat-devinette');
  champMotUc.hidden = devinette.resultatConnu;
  boutonValiderMotUc.hidden = devinette.resultatConnu;
  resultat.hidden = !devinette.resultatConnu;
  document.getElementById('uc-chrono-devinette').hidden = devinette.resultatConnu;
  if (!devinette.resultatConnu) {
    lancerChronoDevinetteUc(vue.tempsRestantMs);
    boutonValiderMotUc.disabled = champMotUc.value.trim() === '';
    return;
  }
  clearInterval(intervalleDevinetteUc);
  champMotUc.value = '';
  resultat.textContent = devinette.trouve ? 'Trouvé !' : 'Raté';
  resultat.classList.toggle('juste', devinette.trouve);
}

// ---------- Fin de manche ----------

function afficherFinMancheUc(vue) {
  afficherCommunUc(vue);
  const resultat = document.getElementById('uc-resultat-manche');
  resultat.textContent = vue.points > 0 ? `Ton camp gagne, +${vue.points}` : 'Ton camp perd';
  resultat.classList.toggle('juste', vue.points > 0);
  const exclamation = vue.role === 'civil' ? '' : ' !';
  document.getElementById('uc-role-fin').textContent = `Tu étais ${ROLES_UC[vue.role]}${exclamation}`;
  document.getElementById('uc-mots-fin').textContent =
    `Civils : ${vue.motCivils} — Undercover : ${vue.motUndercover}`;
  document.getElementById('uc-score').textContent = vue.score;
  document.getElementById('uc-rang').textContent = texteRang(vue.rang);
}

modesJoueur.undercover = {
  mot: afficherCommunUc,
  voter: afficherVoterUc,
  vote_envoye: afficherVoteEnvoyeUc,
  elimine: afficherElimineUc,
  elimination: afficherEliminationUc,
  deviner: afficherDevinerUc,
  fin_manche: afficherFinMancheUc,
  attente_manche: afficherCommunUc,
};
