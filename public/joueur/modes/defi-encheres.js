// Écrans du Défi des enchères sur le téléphone. socket, vibrer, marquerAppui, texteRang
// et envoyerSuivant viennent de joueur.js. Le téléphone ne fait qu'envoyer des appuis :
// l'enchère, le compteur et les points sont tenus par le serveur.

const boutonEncherir = document.getElementById('bouton-encherir');
// L'enchère visée par le bouton : le serveur refuse un « +1 » sur une enchère déjà dépassée.
let enchereVisee = null;

boutonEncherir.addEventListener('click', () => {
  marquerAppui(boutonEncherir);
  socket.emit('joueur:repondre', { encherir: enchereVisee });
});

// L'arbitre appuie vite et souvent : pas de blocage en attendant le serveur, juste une vibration.
for (const [id, pas] of [['bouton-compter-plus', 1], ['bouton-compter-moins', -1]]) {
  document.getElementById(id).addEventListener('click', () => {
    vibrer(20);
    socket.emit('joueur:repondre', { compter: pas });
  });
}

document.getElementById('bouton-suivant-de').addEventListener('click', envoyerSuivant);

function afficherEncheresDefi(vue) {
  document.getElementById('de-manche').textContent = `Manche ${vue.numero}/${vue.total}`;
  document.getElementById('de-texte-defi-joueur').textContent = vue.defi.texte;
  document.getElementById('de-enchere-joueur').textContent = vue.enchere;
  document.getElementById('de-auteur-joueur').textContent = vue.estAuteur
    ? 'Tu as la main ! Prie pour que personne ne surenchérisse.'
    : `par ${vue.auteur}`;
  enchereVisee = vue.enchere + 1;
  const plafond = enchereVisee > vue.enchereMax;
  boutonEncherir.textContent = vue.estAuteur || plafond ? 'Tu as la main' : `+1 → ${enchereVisee}`;
  if (plafond && !vue.estAuteur) boutonEncherir.textContent = 'Enchère maximale';
  boutonEncherir.disabled = vue.estAuteur || plafond;
}

// « 7 / 12 » : bonnes réponses comptées par l'arbitre, sur l'enchère à atteindre.
function texteCompteurDefi(vue) {
  return `${vue.compteur} / ${vue.enchere}`;
}

function texteArbitreDefi(vue) {
  return vue.arbitre ? `Arbitre : ${vue.arbitre}` : 'Pas d\'arbitre disponible';
}

function afficherReleveDefi(vue) {
  document.getElementById('de-consigne-releve').textContent = vue.phase === 'annonce'
    ? `Prépare-toi : ${vue.enchere} ${vue.defi.sujet}…`
    : `À toi ! Cite ${vue.enchere} ${vue.defi.sujet} à voix haute`;
  document.getElementById('de-compteur-releve').textContent = vue.phase === 'defi' ? texteCompteurDefi(vue) : '';
  document.getElementById('de-arbitre-releve').textContent = texteArbitreDefi(vue);
}

// Pendant l'annonce, les flèches sont visibles mais inactives : le défi n'a pas commencé.
function afficherArbitreDefi(vue) {
  document.getElementById('de-consigne-arbitre').textContent =
    `Tu es l'arbitre : compte les bonnes réponses de ${vue.releveur}. Sois juste. Ou presque.`;
  document.getElementById('de-compteur-arbitre').textContent = texteCompteurDefi(vue);
  document.getElementById('de-attente-arbitre').textContent = vue.phase === 'annonce'
    ? 'Le chrono démarre dans un instant…'
    : `${vue.defi.sujet} : doublons et réponses douteuses, c'est toi qui juges.`;
  for (const id of ['bouton-compter-plus', 'bouton-compter-moins']) {
    document.getElementById(id).disabled = vue.phase !== 'defi';
  }
}

function afficherEcouterDefi(vue) {
  document.getElementById('de-consigne-ecouter').textContent =
    `${vue.releveur} doit citer ${vue.enchere} ${vue.defi.sujet}. Écoute et vérifie !`;
  document.getElementById('de-compteur-ecouter').textContent = vue.phase === 'defi' ? texteCompteurDefi(vue) : '';
  document.getElementById('de-arbitre-ecouter').textContent = texteArbitreDefi(vue);
}

function afficherResultatDefi(vue) {
  const resultat = document.getElementById('de-resultat');
  let texte;
  if (vue.role === 'arbitre') texte = 'Tu étais l\'arbitre. Pas de point, mais le pouvoir.';
  else if (vue.role === 'releveur') texte = vue.releve ? `Défi relevé ! +${vue.points}` : 'Raté… Les autres te remercient.';
  else texte = vue.releve ? `${vue.releveur} a tenu parole. Pas de point.` : `${vue.releveur} a calé : +1 pour toi`;
  resultat.textContent = texte;
  resultat.classList.toggle('juste', vue.points > 0);
  document.getElementById('de-detail-resultat').textContent = `${vue.compteur} sur ${vue.enchere}`;
  document.getElementById('score-de').textContent = vue.score;
  document.getElementById('rang-de').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-de').hidden = !vue.estHote;
}

// Les options de l'hôte (nombre de manches) sont les options communes, remplies par joueur.js.
modesJoueur['defi-encheres'] = {
  encheres: afficherEncheresDefi,
  releve: afficherReleveDefi,
  arbitre: afficherArbitreDefi,
  ecouter_defi: afficherEcouterDefi,
  resultat: afficherResultatDefi,
};
