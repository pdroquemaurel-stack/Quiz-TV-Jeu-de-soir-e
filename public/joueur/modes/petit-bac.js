// Écrans du Petit bac sur le téléphone. socket, texteRang, marquerEnvoi, envoyerSuivant,
// boutonReglage et envoyerReglages viennent de joueur.js.
// Les cases partent au serveur à chaque changement : ce qui est écrit compte, même sans STOP.
// Le téléphone vérifie la lettre pour l'affichage seulement : le serveur décide.

const LONGUEUR_MAX_PB = 30;

const elementCasesPb = document.getElementById('pb-cases');
const boutonStopPb = document.getElementById('pb-stop');

let champsPb = [];
let lettrePb = '';
let stopPb = null;
// Manche affichée : les cases ne sont reprises du serveur qu'au changement de manche (ou
// au rechargement de la page), jamais pendant que le joueur tape.
let mancheAfficheePb = null;
// Compte à rebours après un STOP : heure de fin (horloge du téléphone, pour l'affichage).
let finStopPb = null;
let minuteurStopPb = null;

// Même règle que le serveur : accents ignorés, article en tête toléré (« Le Havre » pour H).
const ARTICLE_EN_TETE_PB = /^(?:(?:le|la|les|un|une|des|du) |[ld]['’] ?)/;

function commenceParLettrePb(texte, lettre) {
  const forme = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  const initiale = lettre.toLowerCase();
  return forme.startsWith(initiale) || forme.replace(ARTICLE_EN_TETE_PB, '').startsWith(initiale);
}

function textesPb() {
  return champsPb.map((champ) => champ.value);
}

function creerCasesPb(categories, textes) {
  champsPb = categories.map((categorie, i) => {
    const champ = document.createElement('input');
    champ.className = 'pb-champ';
    champ.value = textes[i];
    champ.maxLength = LONGUEUR_MAX_PB;
    champ.setAttribute('autocomplete', 'off');
    champ.setAttribute('autocorrect', 'off');
    champ.setAttribute('autocapitalize', 'sentences');
    champ.spellcheck = false;
    champ.enterKeyHint = i < categories.length - 1 ? 'next' : 'done';
    champ.setAttribute('aria-label', categorie);
    champ.addEventListener('input', () => {
      socket.emit('joueur:repondre', { action: 'ecrire', textes: textesPb() });
      dessinerEtatPb();
    });
    // Entrée passe à la case suivante, et referme le clavier sur la dernière.
    champ.addEventListener('keydown', (evenement) => {
      if (evenement.key !== 'Enter') return;
      evenement.preventDefault();
      if (i < categories.length - 1) champsPb[i + 1].focus();
      else champ.blur();
    });
    return champ;
  });
  elementCasesPb.replaceChildren(...categories.map((categorie, i) => {
    const bloc = document.createElement('label');
    bloc.className = 'pb-case';
    const nom = document.createElement('span');
    nom.className = 'pb-categorie';
    nom.textContent = categorie;
    const aide = document.createElement('span');
    aide.className = 'pb-aide';
    bloc.append(nom, champsPb[i], aide);
    return bloc;
  }));
}

// Cases hors lettre entourées, STOP actif si les 6 commencent par la lettre (ou après un STOP).
function dessinerEtatPb() {
  let toutesBonnes = true;
  champsPb.forEach((champ, i) => {
    const bonne = commenceParLettrePb(champ.value, lettrePb);
    const horsLettre = champ.value.trim() !== '' && !bonne;
    if (!bonne) toutesBonnes = false;
    champ.classList.toggle('hors-lettre', horsLettre);
    elementCasesPb.children[i].querySelector('.pb-aide').textContent = horsLettre ? `Doit commencer par ${lettrePb}` : '';
  });
  boutonStopPb.disabled = !stopPb && !toutesBonnes;
}

function arreterCompteAReboursPb() {
  clearInterval(minuteurStopPb);
  minuteurStopPb = null;
  finStopPb = null;
}

function dessinerInfoPb(manche) {
  const info = document.getElementById('pb-info');
  if (!stopPb) {
    info.textContent = manche;
    return;
  }
  const secondes = Math.max(0, Math.ceil((finStopPb - Date.now()) / 1000));
  info.textContent = `STOP de ${stopPb} ! ${secondes} s`;
}

boutonStopPb.addEventListener('click', () => {
  marquerEnvoi(boutonStopPb);
  socket.emit('joueur:repondre', { action: 'stop', textes: textesPb() });
});

function afficherEcriturePb(vue) {
  const manche = `Manche ${vue.numero}/${vue.total}`;
  const cle = `${vue.numero} ${vue.lettre} ${vue.categories.join(',')}`;
  if (cle !== mancheAfficheePb) {
    mancheAfficheePb = cle;
    lettrePb = vue.lettre;
    creerCasesPb(vue.categories, vue.textes);
  }
  document.getElementById('pb-lettre').textContent = vue.lettre;
  stopPb = vue.stop;
  document.getElementById('pb-bandeau').classList.toggle('apres-stop', Boolean(stopPb));
  boutonStopPb.textContent = stopPb ? 'J\'ai fini' : 'STOP';
  boutonStopPb.classList.remove('envoi-en-cours');
  if (stopPb && vue.tempsRestantMs !== null) {
    finStopPb = Date.now() + vue.tempsRestantMs;
    clearInterval(minuteurStopPb);
    minuteurStopPb = setInterval(() => dessinerInfoPb(manche), 250);
  }
  dessinerInfoPb(manche);
  dessinerEtatPb();
}

// « Pays : Maroc », une ligne par catégorie. marques : ✓/✗ de chaque case, ou rien.
function remplirListePb(element, categories, textes, marques) {
  element.replaceChildren(...categories.map((categorie, i) => {
    const ligne = document.createElement('li');
    const nom = document.createElement('span');
    nom.className = 'discret';
    nom.textContent = `${categorie} : `;
    const texte = document.createElement('strong');
    texte.textContent = textes[i] || '—';
    ligne.append(nom, texte);
    if (marques && textes[i]) {
      ligne.classList.add(marques[i] ? 'acceptee' : 'refusee');
      ligne.append(marques[i] ? ' ✓' : ' ✗');
    }
    return ligne;
  }));
}

function afficherFiniPb(vue) {
  document.getElementById('pb-titre-fini').textContent = vue.textes.every((texte) => texte) ? 'STOP !' : 'Terminé';
  remplirListePb(document.getElementById('pb-liste-fini'), vue.categories, vue.textes);
  document.getElementById('pb-attente').textContent =
    `En attente des autres joueurs… (${vue.nbFinis}/${vue.nbAttendus})`;
}

function texteDebatPb(vue) {
  return `${vue.categorie} (${vue.indexCategorie + 1}/${vue.categories.length}) · lettre ${vue.lettre}`;
}

function afficherValidationPb(vue) {
  document.getElementById('pb-debat').textContent = `Débat : ${texteDebatPb(vue)} · Regarde la TV`;
  const carte = document.getElementById('pb-ma-reponse');
  carte.classList.toggle('juste', Boolean(vue.maReponse?.acceptee));
  carte.classList.toggle('sans-reponse', !vue.maReponse);
  carte.textContent = vue.maReponse ? `${vue.maReponse.texte} ${vue.maReponse.acceptee ? '✓' : '✗'}` : 'Pas de réponse';
  const points = vue.pointsProvisoires;
  document.getElementById('pb-provisoires').textContent =
    `Tes points de la manche : ${points} pour l'instant`;
}

function ligneHotePb(ligne, vue) {
  const bouton = document.createElement('button');
  bouton.className = 'pb-ligne';
  const pseudo = document.createElement('span');
  pseudo.className = 'pb-pseudo';
  pseudo.textContent = ligne.pseudo;
  const texte = document.createElement('span');
  texte.className = 'pb-texte';
  texte.textContent = ligne.texte || '—';
  if (ligne.horsLettre) {
    const aide = document.createElement('small');
    aide.textContent = `pas un ${vue.lettre}`;
    texte.append(aide);
  }
  const marque = document.createElement('span');
  marque.className = 'pb-marque';
  bouton.append(pseudo, texte, marque);
  if (!ligne.texte) {
    bouton.classList.add('vide');
    bouton.disabled = true;
    return bouton;
  }
  bouton.classList.add(ligne.acceptee ? 'acceptee' : 'refusee');
  marque.textContent = ligne.acceptee ? '✓' : '✗';
  bouton.addEventListener('click', () => {
    marquerEnvoi(bouton);
    socket.emit('joueur:repondre', { action: 'basculer', categorie: vue.indexCategorie, joueurId: ligne.id });
  });
  return bouton;
}

// L'index voulu, pas « la suivante » : un double appui ne saute pas de catégorie.
let indexCategoriePb = 0;
const boutonPrecedentePb = document.getElementById('pb-precedente');
const boutonSuivantePb = document.getElementById('pb-suivante');
const DERNIERE_CATEGORIE_PB = 5;

boutonPrecedentePb.addEventListener('click', () => {
  marquerEnvoi(boutonPrecedentePb);
  socket.emit('joueur:repondre', { action: 'categorie', index: indexCategoriePb - 1 });
});
boutonSuivantePb.addEventListener('click', () => {
  marquerEnvoi(boutonSuivantePb);
  if (indexCategoriePb === DERNIERE_CATEGORIE_PB) envoyerSuivant();
  else socket.emit('joueur:repondre', { action: 'categorie', index: indexCategoriePb + 1 });
});

function afficherValidationHotePb(vue) {
  indexCategoriePb = vue.indexCategorie;
  document.getElementById('pb-debat-hote').textContent = texteDebatPb(vue);
  document.getElementById('pb-lignes').replaceChildren(...vue.lignes.map((ligne) => ligneHotePb(ligne, vue)));
  for (const bouton of [boutonPrecedentePb, boutonSuivantePb]) {
    bouton.disabled = false;
    bouton.classList.remove('envoi-en-cours');
  }
  boutonPrecedentePb.hidden = vue.indexCategorie === 0;
  boutonSuivantePb.textContent = vue.indexCategorie === DERNIERE_CATEGORIE_PB ? 'Voir les scores' : 'Catégorie suivante →';
}

function afficherBilanPb(vue) {
  const points = document.getElementById('pb-points');
  points.textContent = vue.points > 0 ? `+${vue.points} point${vue.points > 1 ? 's' : ''}` : '0 point';
  points.classList.toggle('juste', vue.points > 0);
  remplirListePb(document.getElementById('pb-liste-bilan'), vue.categories, vue.textes, vue.acceptees);
  document.getElementById('score-pb').textContent = vue.score;
  document.getElementById('rang-pb').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-pb').hidden = !vue.estHote;
}
document.getElementById('bouton-suivant-pb').addEventListener('click', envoyerSuivant);

// Lettres rares : un réglage propre au Petit bac, en plus des options communes.
function remplirReglagesPetitBac({ valeurs }) {
  document.getElementById('pb-choix-rares').replaceChildren(...[false, true].map((avec) => boutonReglage(
    avec ? 'Avec' : 'Sans', avec === valeurs.lettresRares,
    avec === valeurs.lettresRares ? null : () => envoyerReglages({ lettresRares: avec }),
  )));
}

// Tout autre écran clôt l'écriture : la prochaine repart des cases du serveur.
socket.on('joueur:etat', (vue) => {
  if (vue.ecran === 'ecriture') return;
  mancheAfficheePb = null;
  arreterCompteAReboursPb();
});

modesJoueur['petit-bac'] = {
  remplirReglages: remplirReglagesPetitBac,
  ecriture: afficherEcriturePb,
  fini: afficherFiniPb,
  validation: afficherValidationPb,
  validation_hote: afficherValidationHotePb,
  bilan: afficherBilanPb,
};
