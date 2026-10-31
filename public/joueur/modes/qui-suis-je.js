// Écrans de Qui suis-je ? sur le téléphone. socket, marquerAppui, texteRang, envoyerSuivant,
// boutonReglage et envoyerReglages viennent de joueur.js, boutonsACocher de modes/quiz.js.
// Le téléphone ne fait qu'envoyer des appuis : le personnage, le chrono et les points sont
// tenus par le serveur.

let intervalleChronoQsj = null;

for (const [id, contenu] of [
  ['bouton-partir-qsj', { partir: true }],
  ['bouton-trouve-qsj', { trouve: true }],
  ['bouton-passer-qsj', { passer: true }],
  ['bouton-valider-qsj', { valider: true }],
  ['bouton-refuser-qsj', { valider: false }],
]) {
  const bouton = document.getElementById(id);
  bouton.addEventListener('click', () => {
    marquerAppui(bouton);
    socket.emit('joueur:repondre', contenu);
  });
}

document.getElementById('bouton-suivant-qsj').addEventListener('click', envoyerSuivant);

const photoRepondreQsj = document.getElementById('qsj-photo-repondre');
photoRepondreQsj.addEventListener('error', () => { photoRepondreQsj.parentElement.hidden = true; });

function texteMinutesQsj(millisecondes) {
  const secondes = Math.max(0, Math.ceil(millisecondes / 1000));
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

// Simple affichage : c'est le serveur qui clôt le tour. Contre la montre, le chrono
// monte (le temps déjà compté) au lieu de descendre.
function lancerChronoQsj(idElement, vue) {
  const element = document.getElementById(idElement);
  const recuA = Date.now();
  const fin = recuA + vue.tempsRestantMs;
  const afficher = () => {
    if (vue.format === 'chrono') element.textContent = `⏱ ${texteMinutesQsj(vue.tempsEcouleMs + Math.min(Date.now(), fin) - recuA)}`;
    else element.textContent = texteMinutesQsj(fin - Date.now());
  };
  clearInterval(intervalleChronoQsj);
  afficher();
  intervalleChronoQsj = setInterval(afficher, 250);
}

// « 3 trouvés », ou « 1/2 trouvé » contre la montre.
function texteTrouvesQsj(nombre, vue) {
  const compte = vue?.format === 'chrono' ? `${nombre}/${vue.objectif}` : nombre;
  return nombre > 1 ? `${compte} trouvés` : `${compte} trouvé`;
}

function afficherPreparationActifQsj(vue) {
  document.getElementById('qsj-tour-actif').textContent = `Tour ${vue.numero}/${vue.total}`;
  document.getElementById('qsj-consigne-actif').textContent = vue.affichage === 'telephones'
    ? 'Le personnage s\'affiche sur les téléphones des autres. Ne regarde pas leurs écrans !'
    : 'Tourne le dos à la TV. Ne triche pas, on te voit.';
}

function afficherPreparationQsj(vue) {
  document.getElementById('qsj-tour-preparation').textContent = `Tour ${vue.numero}/${vue.total}`;
  document.getElementById('qsj-consigne-preparation').textContent = vue.affichage === 'telephones'
    ? `${vue.actif} va deviner… Cache bien ton écran !`
    : `${vue.actif} va tourner le dos à la TV…`;
  document.getElementById('qsj-aide-preparation').textContent = vue.affichage === 'telephones'
    ? 'Toi, tu réponds par oui ou non. Le personnage s\'affichera ici, pas sur la TV.'
    : 'Toi, tu réponds par oui ou non. Le personnage s\'affichera ici et sur la TV.';
}

// Pendant une validation, les boutons sont inactifs : un seul « Trouvé ! » à la fois.
function afficherActifQsj(vue) {
  lancerChronoQsj('qsj-chrono-actif', vue);
  document.getElementById('qsj-trouves-actif').textContent = texteTrouvesQsj(vue.nbTrouves, vue);
  let attente = vue.format === 'chrono'
    ? `Trouve-en ${vue.objectif} le plus vite possible. Oui ou non, c'est tout.`
    : 'Pose tes questions à voix haute. Oui ou non, c\'est tout.';
  if (vue.enValidation) attente = `${vue.valideur ?? 'Personne'} vérifie… Continue de parler si tu doutes.`;
  document.getElementById('qsj-attente-actif').textContent = attente;
  for (const id of ['bouton-trouve-qsj', 'bouton-passer-qsj']) {
    document.getElementById(id).disabled = vue.enValidation || vue.tempsEcoule;
  }
}

function afficherPhotoRepondreQsj(personnage) {
  const cadre = document.getElementById('qsj-cadre-photo-repondre');
  cadre.hidden = !personnage.image;
  if (!personnage.image) return;
  if (photoRepondreQsj.getAttribute('src') !== personnage.image) photoRepondreQsj.src = personnage.image;
  document.getElementById('qsj-credit-repondre').textContent = `${personnage.auteur}, ${personnage.licence}`;
}

function afficherRepondreQsj(vue) {
  document.getElementById('qsj-qui-devine').textContent = `${vue.actif} devine (${texteTrouvesQsj(vue.nbTrouves, vue)}) :`;
  afficherPhotoRepondreQsj(vue.personnage);
  document.getElementById('qsj-nom-repondre').textContent = vue.personnage.nom;
  document.getElementById('qsj-categorie-repondre').textContent = vue.personnage.categorie;
  lancerChronoQsj('qsj-chrono-repondre', vue);
  const aValider = vue.estValideur && vue.enValidation;
  document.getElementById('qsj-validation').hidden = !aValider;
  let consigne = 'Réponds par oui ou non !';
  if (aValider) consigne = `${vue.actif} pense avoir trouvé. C'est bien ${vue.personnage.nom} ?`;
  else if (vue.enValidation) consigne = `${vue.actif} pense avoir trouvé… ${vue.valideur} vérifie.`;
  document.getElementById('qsj-consigne-repondre').textContent = consigne;
}

function texteResultatQsj(vue) {
  const nombre = vue.trouves.length;
  if (vue.format === 'chrono') {
    if (vue.tempsMisMs === null) return vue.estActif ? 'Pas fini à temps. La prochaine fois.' : `${vue.actif} n'a pas fini à temps.`;
    const temps = `${nombre > 1 ? `${nombre} trouvés` : 'Trouvé'} en ${texteMinutesQsj(vue.tempsMisMs)}`;
    return vue.estActif ? `${temps} ! +${vue.points}` : `${vue.actif} : ${temps}`;
  }
  if (vue.estActif) return nombre ? `${texteTrouvesQsj(nombre)} ! +${vue.points}` : 'Aucun trouvé. La prochaine fois.';
  return `${vue.actif} : ${texteTrouvesQsj(nombre)}`;
}

function afficherBilanQsj(vue) {
  clearInterval(intervalleChronoQsj);
  const nombre = vue.trouves.length;
  const resultat = document.getElementById('qsj-resultat');
  resultat.textContent = texteResultatQsj(vue);
  resultat.classList.toggle('juste', vue.estActif && vue.points > 0);
  document.getElementById('qsj-liste-trouves').textContent = nombre ? `Trouvés : ${vue.trouves.join(', ')}` : '';
  document.getElementById('qsj-liste-passes').textContent = vue.passes.length ? `Passés : ${vue.passes.join(', ')}` : '';
  document.getElementById('qsj-non-trouve').textContent = vue.nonTrouve ? `Pas trouvé : ${vue.nonTrouve}` : '';
  document.getElementById('score-qsj').textContent = vue.score;
  document.getElementById('rang-qsj').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-qsj').hidden = !vue.estHote;
}

const EXPLICATIONS_FORMAT_QSJ = {
  max: 'Le plus de personnages possible pendant le chrono : 300 points chacun.',
  chrono: 'Trouver 1, 2 ou 3 personnages le plus vite possible : moins de temps, plus de points.',
};

// Format, objectif, affichage et niveaux ; le nombre de tours et le chrono sont les options
// communes, remplies par joueur.js.
function remplirReglagesQsj(reglages) {
  const { valeurs, options } = reglages;
  const choixUnique = (idConteneur, liste, champ) => {
    document.getElementById(idConteneur).replaceChildren(...liste.map(({ id, libelle }) => (
      boutonReglage(libelle, id === valeurs[champ], id === valeurs[champ] ? null : () => envoyerReglages({ [champ]: id }))
    )));
  };
  choixUnique('qsj-choix-formats', options.formats, 'format');
  document.getElementById('qsj-explication-format').textContent = EXPLICATIONS_FORMAT_QSJ[valeurs.format];
  document.getElementById('qsj-reglage-objectif').hidden = valeurs.format !== 'chrono';
  choixUnique('qsj-choix-objectifs', options.objectifs, 'objectif');
  choixUnique('qsj-choix-affichages', options.affichages, 'affichage');
  document.getElementById('qsj-choix-niveaux').replaceChildren(
    ...boutonsACocher(options.niveaux, valeurs.niveaux, 'niveaux'),
  );
}

modesJoueur['qui-suis-je'] = {
  remplirReglages: remplirReglagesQsj,
  preparation_actif: afficherPreparationActifQsj,
  preparation: afficherPreparationQsj,
  actif: afficherActifQsj,
  repondre: afficherRepondreQsj,
  bilan: afficherBilanQsj,
};
