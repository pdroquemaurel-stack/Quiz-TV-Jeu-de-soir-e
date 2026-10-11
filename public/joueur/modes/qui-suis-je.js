// Écrans de Qui suis-je ? sur le téléphone. socket, marquerAppui, texteRang et envoyerSuivant
// viennent de joueur.js, boutonsACocher de modes/quiz.js. Le téléphone ne fait qu'envoyer des appuis :
// le personnage, le chrono et les points sont tenus par le serveur.

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

// Simple affichage : c'est le serveur qui clôt le tour.
function lancerChronoQsj(idElement, tempsRestantMs) {
  const element = document.getElementById(idElement);
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    element.textContent = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
  };
  clearInterval(intervalleChronoQsj);
  afficher();
  intervalleChronoQsj = setInterval(afficher, 250);
}

function texteTrouvesQsj(nombre) {
  return nombre > 1 ? `${nombre} trouvés` : `${nombre} trouvé`;
}

function afficherPreparationActifQsj(vue) {
  document.getElementById('qsj-tour-actif').textContent = `Tour ${vue.numero}/${vue.total}`;
}

function afficherPreparationQsj(vue) {
  document.getElementById('qsj-tour-preparation').textContent = `Tour ${vue.numero}/${vue.total}`;
  document.getElementById('qsj-consigne-preparation').textContent = `${vue.actif} va tourner le dos à la TV…`;
}

// Pendant une validation, les boutons sont inactifs : un seul « Trouvé ! » à la fois.
function afficherActifQsj(vue) {
  lancerChronoQsj('qsj-chrono-actif', vue.tempsRestantMs);
  document.getElementById('qsj-trouves-actif').textContent = texteTrouvesQsj(vue.nbTrouves);
  let attente = 'Pose tes questions à voix haute. Oui ou non, c\'est tout.';
  if (vue.enValidation) attente = `${vue.valideur ?? 'Personne'} vérifie… Continue de parler si tu doutes.`;
  document.getElementById('qsj-attente-actif').textContent = attente;
  for (const id of ['bouton-trouve-qsj', 'bouton-passer-qsj']) {
    document.getElementById(id).disabled = vue.enValidation || vue.tempsEcoule;
  }
}

function afficherRepondreQsj(vue) {
  document.getElementById('qsj-qui-devine').textContent = `${vue.actif} devine (${texteTrouvesQsj(vue.nbTrouves)}) :`;
  document.getElementById('qsj-nom-repondre').textContent = vue.personnage.nom;
  document.getElementById('qsj-categorie-repondre').textContent = vue.personnage.categorie;
  lancerChronoQsj('qsj-chrono-repondre', vue.tempsRestantMs);
  const aValider = vue.estValideur && vue.enValidation;
  document.getElementById('qsj-validation').hidden = !aValider;
  let consigne = 'Réponds par oui ou non !';
  if (aValider) consigne = `${vue.actif} pense avoir trouvé. C'est bien ${vue.personnage.nom} ?`;
  else if (vue.enValidation) consigne = `${vue.actif} pense avoir trouvé… ${vue.valideur} vérifie.`;
  document.getElementById('qsj-consigne-repondre').textContent = consigne;
}

function afficherBilanQsj(vue) {
  clearInterval(intervalleChronoQsj);
  const nombre = vue.trouves.length;
  const resultat = document.getElementById('qsj-resultat');
  if (vue.estActif) resultat.textContent = nombre ? `${texteTrouvesQsj(nombre)} ! +${vue.points}` : 'Aucun trouvé. La prochaine fois.';
  else resultat.textContent = `${vue.actif} : ${texteTrouvesQsj(nombre)}`;
  resultat.classList.toggle('juste', vue.estActif && nombre > 0);
  document.getElementById('qsj-liste-trouves').textContent = nombre ? `Trouvés : ${vue.trouves.join(', ')}` : '';
  document.getElementById('qsj-liste-passes').textContent = vue.passes.length ? `Passés : ${vue.passes.join(', ')}` : '';
  document.getElementById('score-qsj').textContent = vue.score;
  document.getElementById('rang-qsj').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-qsj').hidden = !vue.estHote;
}

// Les niveaux ; le nombre de tours et le chrono sont les options communes, remplies par joueur.js.
function remplirReglagesQsj(reglages) {
  document.getElementById('qsj-choix-niveaux').replaceChildren(
    ...boutonsACocher(reglages.options.niveaux, reglages.valeurs.niveaux, 'niveaux'),
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
