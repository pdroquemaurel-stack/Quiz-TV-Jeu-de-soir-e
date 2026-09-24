// Écrans de l'Estimation sur le téléphone. socket et texteRang viennent de joueur.js.
// La saisie est contrôlée ici pour aider le joueur ; le serveur la valide à nouveau.

const NOMBRE_MAX = 999999999999;
const formatNombre = new Intl.NumberFormat('fr-FR');

const champNombre = document.getElementById('champ-nombre');
const apercuNombre = document.getElementById('apercu-nombre');
const boutonValiderNombre = document.getElementById('bouton-valider-nombre');

// Question dont le champ est affiché : on ne le vide qu'au changement de question,
// pas à chaque mise à jour (arrivée d'un joueur…).
let numeroSaisi = null;
let uniteSaisie = '';

function avecUniteTel(nombre, unite) {
  return unite ? `${formatNombre.format(nombre)} ${unite}` : formatNombre.format(nombre);
}

// Renvoie { nombre }, { erreur } ou {} si le champ est vide.
function lireNombre() {
  const brut = champNombre.value.replace(/\s/g, '');
  if (brut === '') return {};
  if (/[,.]/.test(brut)) return { erreur: 'Un nombre entier, sans virgule' };
  if (brut.includes('-')) return { erreur: 'Pas de nombre négatif' };
  if (!/^\d+$/.test(brut)) return { erreur: 'Des chiffres seulement' };
  const nombre = Number(brut);
  if (nombre > NOMBRE_MAX) return { erreur: 'Nombre trop grand' };
  return { nombre };
}

function mettreAJourSaisie() {
  const { nombre, erreur } = lireNombre();
  apercuNombre.classList.toggle('erreur', Boolean(erreur));
  if (erreur) apercuNombre.textContent = erreur;
  else if (nombre !== undefined) apercuNombre.textContent = `= ${avecUniteTel(nombre, uniteSaisie)}`;
  else apercuNombre.textContent = '';
  boutonValiderNombre.disabled = nombre === undefined;
}

function envoyerNombre() {
  const { nombre } = lireNombre();
  if (nombre === undefined) return;
  champNombre.blur();
  socket.emit('joueur:repondre', nombre);
}

champNombre.addEventListener('input', mettreAJourSaisie);
champNombre.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter') envoyerNombre();
});
boutonValiderNombre.addEventListener('click', envoyerNombre);

document.getElementById('bouton-suivant-estimation').addEventListener('click', () => {
  socket.emit('hote:suivant');
});

function afficherRepondreEstimation(vue) {
  if (vue.numero === numeroSaisi) return;
  numeroSaisi = vue.numero;
  uniteSaisie = vue.unite;
  document.getElementById('unite-saisie').textContent = vue.unite;
  champNombre.value = '';
  mettreAJourSaisie();
  champNombre.focus();
}

function afficherReponseEnvoyeeEstimation(vue) {
  document.getElementById('nombre-envoye').textContent = avecUniteTel(vue.nombre, vue.unite);
}

function afficherResultatEstimation(vue) {
  const resultat = document.getElementById('resultat-estimation');
  const detail = document.getElementById('detail-estimation');
  if (vue.nombre === null) {
    resultat.textContent = 'Pas de réponse';
    detail.textContent = '';
  } else {
    const place = vue.rangEcart === 1 ? 'Le plus proche' : `${vue.rangEcart}e plus proche`;
    resultat.textContent = vue.points > 0 ? `${place}, +${vue.points}` : 'Trop loin';
    detail.textContent =
      `Ta réponse : ${avecUniteTel(vue.nombre, vue.unite)}, écart ${formatNombre.format(vue.ecart)}`;
  }
  resultat.classList.toggle('juste', vue.points > 0);
  document.getElementById('score-estimation').textContent = vue.score;
  document.getElementById('rang-estimation').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-estimation').hidden = !vue.estHote;
}

modesJoueur.estimation = {
  repondre: afficherRepondreEstimation,
  reponse_envoyee: afficherReponseEnvoyeeEstimation,
  resultat: afficherResultatEstimation,
};
