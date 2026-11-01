// Écrans du chapeau sur le téléphone. socket, marquerAppui, marquerEnvoi, texteRang, envoyerSuivant,
// boutonReglage et envoyerReglages viennent de joueur.js. La saisie est contrôlée ici pour aider
// le joueur ; le serveur la valide à nouveau.

const champsCh = [...document.querySelectorAll('.ch-champ')];
const boutonValiderCh = document.getElementById('ch-valider');
let intervalleChronoCh = null;
// Vrai quand le joueur rouvre ses mots pour les changer : la saisie reste affichée.
let modificationCh = false;
// Saisie affichée : on ne vide pas les champs à chaque état reçu (un autre joueur a fini…).
let saisieOuverteCh = false;

function motsSaisisCh() {
  return champsCh.map((champ) => champ.value.trim());
}

function mettreAJourValiderCh() {
  boutonValiderCh.disabled = motsSaisisCh().some((mot) => mot === '');
}

champsCh.forEach((champ, index) => {
  champ.addEventListener('input', mettreAJourValiderCh);
  champ.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Enter') return;
    if (index < champsCh.length - 1) champsCh[index + 1].focus();
    else if (!boutonValiderCh.disabled) boutonValiderCh.click();
  });
});

boutonValiderCh.addEventListener('click', () => {
  for (const champ of champsCh) champ.blur();
  marquerEnvoi(boutonValiderCh);
  modificationCh = false;
  socket.emit('joueur:repondre', { mots: motsSaisisCh() });
});

document.getElementById('ch-piocher').addEventListener('click', (evenement) => {
  marquerAppui(evenement.currentTarget);
  modificationCh = false;
  socket.emit('joueur:repondre', { piocher: true });
});

document.getElementById('ch-modifier').addEventListener('click', () => {
  modificationCh = true;
  saisieOuverteCh = false;
  if (vueSaisieCh) afficherSaisieCh(vueSaisieCh);
});

for (const [id, contenu] of [['ch-partir', { partir: true }], ['ch-trouve', { trouve: true }], ['ch-passer', { passer: true }]]) {
  const bouton = document.getElementById(id);
  bouton.addEventListener('click', () => {
    marquerAppui(bouton);
    socket.emit('joueur:repondre', contenu);
  });
}

document.getElementById('ch-suivant').addEventListener('click', envoyerSuivant);

// Simple affichage : c'est le serveur qui clôt le tour.
function lancerChronoCh(idElement, tempsRestantMs) {
  const element = document.getElementById(idElement);
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    element.textContent = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
  };
  clearInterval(intervalleChronoCh);
  afficher();
  intervalleChronoCh = setInterval(afficher, 250);
}

function numeroMancheCh(vue) {
  return `Manche ${vue.manche}/${vue.mancheMax} · ${vue.consigne.titre}`;
}

function texteTrouvesCh(vue) {
  const restants = vue.motsRestants === undefined ? '' : ` · ${vue.motsRestants} dans le chapeau`;
  return `${vue.nbTrouvesDuTour} trouvé${vue.nbTrouvesDuTour > 1 ? 's' : ''}${restants}`;
}

let vueSaisieCh = null;

function afficherSaisieCh(vue) {
  vueSaisieCh = vue;
  lancerChronoCh('ch-chrono-saisie', vue.tempsRestantMs);
  const envoye = vue.mesMots.length > 0 && !modificationCh;
  document.getElementById('ch-formulaire').hidden = envoye;
  document.getElementById('ch-envoyes').hidden = !envoye;
  if (envoye) {
    saisieOuverteCh = false;
    document.getElementById('ch-mes-mots').replaceChildren(...vue.mesMots.map((mot) => {
      const element = document.createElement('li');
      element.textContent = mot;
      return element;
    }));
    document.getElementById('ch-nb-finis').textContent = `${vue.nbFinis}/${vue.nbJoueurs} ont fini`;
    return;
  }
  if (saisieOuverteCh) return;
  saisieOuverteCh = true;
  champsCh.forEach((champ, index) => { champ.value = vue.mesMots[index] ?? ''; });
  mettreAJourValiderCh();
  champsCh[0].focus();
}

function afficherAnnonceCh(vue) {
  clearInterval(intervalleChronoCh);
  modificationCh = false;
  saisieOuverteCh = false;
  document.getElementById('ch-numero-annonce').textContent = `Manche ${vue.manche}/${vue.mancheMax}`;
  document.getElementById('ch-titre-annonce').textContent = vue.consigne.titre;
  document.getElementById('ch-regle-annonce').textContent = vue.consigne.regle;
  document.getElementById('ch-equipe-annonce').textContent = `Tu joues avec les ${vue.monEquipe}.`;
}

function afficherPreparationActifCh(vue) {
  clearInterval(intervalleChronoCh);
  document.getElementById('ch-numero-preparation-actif').textContent = numeroMancheCh(vue);
  document.getElementById('ch-regle-preparation-actif').textContent = `Fais deviner les ${vue.monEquipe}. ${vue.consigne.regle}`;
}

function afficherPreparationCh(vue) {
  clearInterval(intervalleChronoCh);
  document.getElementById('ch-numero-preparation').textContent = numeroMancheCh(vue);
  document.getElementById('ch-consigne-preparation').textContent = vue.memeEquipe
    ? `${vue.actif} va te faire deviner. Prépare-toi !`
    : `${vue.actif} fait deviner les ${vue.equipeActive}. Toi, tu surveilles.`;
  document.getElementById('ch-regle-preparation').textContent = vue.consigne.regle;
}

function afficherFaireDevinerCh(vue) {
  lancerChronoCh('ch-chrono-actif', vue.tempsRestantMs);
  document.getElementById('ch-regle-actif').textContent = vue.consigne.regle;
  document.getElementById('ch-mot-actif').textContent = vue.mot;
  document.getElementById('ch-compte-actif').textContent = texteTrouvesCh(vue);
}

function afficherDevinerCh(vue) {
  lancerChronoCh('ch-chrono-deviner', vue.tempsRestantMs);
  document.getElementById('ch-consigne-deviner').textContent = `${vue.actif} te fait deviner. ${vue.consigne.regle}`;
  document.getElementById('ch-compte-deviner').textContent = texteTrouvesCh(vue);
}

function afficherSurveillerCh(vue) {
  lancerChronoCh('ch-chrono-surveiller', vue.tempsRestantMs);
  document.getElementById('ch-consigne-surveiller').textContent = `${vue.actif} fait deviner aux ${vue.equipeActive} :`;
  document.getElementById('ch-mot-surveiller').textContent = vue.mot;
  document.getElementById('ch-regle-surveiller').textContent = `Surveille : ${vue.consigne.regle.toLowerCase()}`;
  document.getElementById('ch-compte-surveiller').textContent = texteTrouvesCh(vue);
}

function afficherBilanCh(vue) {
  clearInterval(intervalleChronoCh);
  const nombre = vue.trouvesDuTour.length;
  const resultat = document.getElementById('ch-resultat');
  let titre = `${vue.actif} : ${nombre} trouvé${nombre > 1 ? 's' : ''}`;
  if (vue.finManche) titre = vue.derniereManche ? 'Le chapeau est vide ! Fin de la partie' : `Le chapeau est vide ! Fin de la manche ${vue.manche}`;
  resultat.textContent = titre;
  resultat.classList.toggle('juste', vue.points > 0 || vue.finManche);
  document.getElementById('ch-mots-trouves').textContent = nombre ? `Trouvés : ${vue.trouvesDuTour.join(', ')}` : '';
  document.getElementById('ch-scores').textContent = vue.equipes.map((equipe) => `${equipe.nom} ${equipe.score}`).join(' · ');
  document.getElementById('score-ch').textContent = vue.score;
  document.getElementById('rang-ch').textContent = texteRang(vue.rang);
  document.getElementById('ch-suivant').hidden = !vue.estHote;
}

// D'où viennent les mots, et la durée d'un tour.
function remplirReglagesCh(reglages) {
  const { valeurs, options } = reglages;
  document.getElementById('ch-choix-origines').replaceChildren(...options.origines.map(({ id, libelle }) => (
    boutonReglage(libelle, id === valeurs.mots, id === valeurs.mots ? null : () => envoyerReglages({ mots: id }))
  )));
  document.getElementById('ch-choix-temps').replaceChildren(...options.tempsTour.map(({ id, libelle }) => (
    boutonReglage(libelle, id === valeurs.temps, id === valeurs.temps ? null : () => envoyerReglages({ temps: id }))
  )));
}

modesJoueur.chapeau = {
  remplirReglages: remplirReglagesCh,
  saisie: afficherSaisieCh,
  annonce: afficherAnnonceCh,
  preparation_actif: afficherPreparationActifCh,
  preparation: afficherPreparationCh,
  faire_deviner: afficherFaireDevinerCh,
  deviner: afficherDevinerCh,
  surveiller: afficherSurveillerCh,
  bilan: afficherBilanCh,
};
