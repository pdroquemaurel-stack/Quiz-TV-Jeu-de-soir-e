// Écrans du Blind test sur le téléphone. socket, boutonCandidat et texteRang viennent de joueur.js.
// Le maître coche qui a trouvé le titre et l'artiste ; rien ne part avant « Valider ».

const choixTitreBlindTest = document.getElementById('bt-choix-titre');
const choixArtisteBlindTest = document.getElementById('bt-choix-artiste');
const boutonValiderBlindTest = document.getElementById('bt-valider');

// Sélection du maître : undefined tant que rien n'est coché, null pour « Personne ».
// Remise à zéro seulement quand la chanson change, pas quand un joueur se déconnecte.
let selectionBlindTest = { titre: undefined, artiste: undefined };
let chansonSelectionBlindTest = null;
// Boutons affichés : on ne les recrée que si les joueurs désignables changent.
let grilleBlindTest = '';

function remplirChoixBlindTest(liste, designables, cle) {
  const personne = boutonCandidat({ id: '', pseudo: 'Personne', connecte: true });
  personne.querySelector('.pastille').remove();
  personne.classList.add('bt-personne');
  liste.replaceChildren(...designables.map((joueur) => boutonCandidat({ ...joueur, connecte: true })), personne);
  liste.dataset.cle = cle;
}

function marquerSelectionBlindTest() {
  for (const liste of [choixTitreBlindTest, choixArtisteBlindTest]) {
    const choisi = selectionBlindTest[liste.dataset.cle];
    for (const bouton of liste.children) {
      bouton.classList.toggle('choisi', choisi !== undefined && bouton.dataset.id === (choisi ?? ''));
    }
  }
  boutonValiderBlindTest.disabled = Object.values(selectionBlindTest).includes(undefined);
}

// Un seul écouteur par liste : les boutons sont recréés quand les joueurs changent.
for (const liste of [choixTitreBlindTest, choixArtisteBlindTest]) {
  liste.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('.bouton-candidat');
    if (!bouton) return;
    vibrer(30);
    selectionBlindTest[liste.dataset.cle] = bouton.dataset.id || null;
    marquerSelectionBlindTest();
  });
}

boutonValiderBlindTest.addEventListener('click', () => {
  if (Object.values(selectionBlindTest).includes(undefined)) return;
  marquerEnvoi(boutonValiderBlindTest);
  socket.emit('joueur:repondre', { ...selectionBlindTest });
});

document.getElementById('bt-suivant').addEventListener('click', envoyerSuivant);

function afficherMaitreClassique(vue) {
  const chanson = `${vue.numero}/${vue.total}`;
  if (chanson !== chansonSelectionBlindTest) {
    chansonSelectionBlindTest = chanson;
    selectionBlindTest = { titre: undefined, artiste: undefined };
    grilleBlindTest = '';
    boutonValiderBlindTest.classList.remove('envoi-en-cours');
  }
  document.getElementById('bt-numero-maitre').textContent = vue.phase === 'designation'
    ? `Chanson ${vue.numero}/${vue.total} · Temps écoulé : valide vite !`
    : `Chanson ${vue.numero}/${vue.total}`;
  document.getElementById('bt-pochette-maitre').src = vue.chanson.pochette;
  document.getElementById('bt-titre-maitre').textContent = vue.chanson.titre;
  document.getElementById('bt-artiste-maitre').textContent = vue.chanson.artiste;

  const grille = JSON.stringify(vue.designables);
  if (grille !== grilleBlindTest) {
    grilleBlindTest = grille;
    remplirChoixBlindTest(choixTitreBlindTest, vue.designables, 'titre');
    remplirChoixBlindTest(choixArtisteBlindTest, vue.designables, 'artiste');
  }
  marquerSelectionBlindTest();
}

function afficherEcouterBlindTest(vue) {
  document.getElementById('bt-numero-ecouter').textContent = `Chanson ${vue.numero}/${vue.total}`;
  document.getElementById('bt-consigne-ecouter').textContent = vue.phase === 'designation'
    ? 'Le maître du jeu désigne les gagnants…'
    : 'Écoute la TV et crie ta réponse !';
  document.getElementById('bt-maitre-ecouter').textContent = vue.maitre;
}

function afficherResultatBlindTest(vue) {
  chansonSelectionBlindTest = null;
  const resultat = document.getElementById('bt-resultat');
  resultat.textContent = texteResultatBlindTest(vue);
  resultat.classList.toggle('juste', vue.points > 0);
  document.getElementById('bt-chanson-resultat').textContent = `${vue.chanson.artiste} — ${vue.chanson.titre}`;
  document.getElementById('bt-qui-resultat').textContent =
    `Titre : ${vue.trouveTitre ?? 'personne'} · Artiste : ${vue.trouveArtiste ?? 'personne'}`;
  document.getElementById('bt-score').textContent = vue.score;
  document.getElementById('bt-rang').textContent = texteRang(vue.rang);
  document.getElementById('bt-suivant').hidden = !vue.estHote;
}

function texteResultatBlindTest(vue) {
  if (vue.estMaitre) return 'Tu étais le maître du jeu';
  if (vue.aTrouveTitre && vue.aTrouveArtiste) return '+1000 : titre et artiste !';
  if (vue.aTrouveTitre) return '+500 : le titre';
  if (vue.aTrouveArtiste) return '+500 : l\'artiste';
  return 'Pas de point cette fois';
}

modesJoueur['blind-test'] = {
  ecouter: afficherEcouterBlindTest,
  maitre_classique: afficherMaitreClassique,
  resultat: afficherResultatBlindTest,
};
