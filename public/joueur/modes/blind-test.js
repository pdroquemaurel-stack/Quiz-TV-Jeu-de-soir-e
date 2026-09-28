// Écrans du Blind test sur le téléphone. socket, boutonCandidat, boutonReglage et texteRang
// viennent de joueur.js. Seul le maître agit : rien ne part avant « Valider » (ou un appui
// sur une chanson du mix, qui l'arrête).

// ---------- Classique : le maître coche qui a trouvé le titre et l'artiste ----------

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

// À la révélation, le maître sortant passe la modération (joueur:repondre) ; l'hôte le peut
// aussi, avec son « Suivant » habituel.
let passeParLeMaitre = false;

document.getElementById('bt-suivant').addEventListener('click', (evenement) => {
  marquerEnvoi(evenement.currentTarget);
  if (passeParLeMaitre) socket.emit('joueur:repondre', { passer: true });
  else envoyerSuivant();
});

function afficherMaitreClassique(vue) {
  const chanson = `${vue.numero}/${vue.total}`;
  if (chanson !== chansonSelectionBlindTest) {
    chansonSelectionBlindTest = chanson;
    selectionBlindTest = { titre: undefined, artiste: undefined };
    grilleBlindTest = '';
    boutonValiderBlindTest.classList.remove('envoi-en-cours');
  }
  document.getElementById('bt-numero-maitre').textContent = vue.phase === 'designation'
    ? `${libelleMancheBlindTest(vue)} · Temps écoulé : valide vite !`
    : libelleMancheBlindTest(vue);
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

const CONSIGNES_ECOUTER = {
  relais: 'La musique va démarrer…',
  ecoute: 'Écoute la TV et crie ta réponse. Fort, mais juste.',
  designation: 'Le maître du jeu désigne les gagnants… Espérons qu\'il écoutait.',
};

function afficherEcouterBlindTest(vue) {
  document.getElementById('bt-numero-ecouter').textContent = libelleMancheBlindTest(vue);
  document.getElementById('bt-consigne-ecouter').textContent = CONSIGNES_ECOUTER[vue.phase];
  document.getElementById('bt-maitre-ecouter').textContent = vue.maitre;
}

// ---------- Relais : le prochain maître lance la chanson ----------

const boutonLancerBlindTest = document.getElementById('bt-lancer');

boutonLancerBlindTest.addEventListener('click', () => {
  marquerEnvoi(boutonLancerBlindTest);
  socket.emit('joueur:repondre', { lancer: true });
});

function afficherRelaisBlindTest(vue) {
  document.getElementById('bt-numero-relais').textContent = libelleMancheBlindTest(vue);
  boutonLancerBlindTest.textContent = vue.format === 'mix' ? 'Lancer le mix' : 'Lancer la chanson';
}

function libelleMancheBlindTest(vue) {
  return `${vue.format === 'mix' ? 'Mix' : 'Chanson'} ${vue.numero}/${vue.total}`;
}

// ---------- Mix : le maître arrête une chanson, puis désigne ----------

const chansonsMix = document.getElementById('bt-chansons-mix');
const choixGagnantMix = document.getElementById('bt-choix-gagnant');
const choixQuoiMix = document.getElementById('bt-choix-quoi');
const boutonValiderMix = document.getElementById('bt-valider-mix');
const boutonAnnulerMix = document.getElementById('bt-annuler');
const QUOI_MIX = [['titre', 'Titre'], ['artiste', 'Artiste'], ['les-deux', 'Les deux']];

// Les boutons sont recréés quand une chanson est trouvée : un seul écouteur pour tous.
chansonsMix.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-proposition');
  if (!bouton || bouton.disabled) return;
  marquerAppui(bouton);
  socket.emit('joueur:repondre', { arreter: Number(bouton.dataset.index) });
});

// Un bouton par chanson ; une chanson trouvée est grisée, avec le nom du gagnant.
let chansonsMixAffichees = '';

function afficherMaitreMix(vue) {
  document.getElementById('bt-numero-mix').textContent = libelleMancheBlindTest(vue);
  const signature = JSON.stringify([vue.numero, vue.chansons]);
  if (signature === chansonsMixAffichees) return;
  chansonsMixAffichees = signature;
  chansonsMix.replaceChildren(...vue.chansons.map((chanson, index) => {
    const bouton = document.createElement('button');
    bouton.className = 'bouton-proposition';
    bouton.dataset.index = index;
    bouton.disabled = chanson.trouvee;
    const libelle = document.createElement('span');
    libelle.className = 'libelle-proposition';
    libelle.textContent = chanson.trouvee
      ? `✓ ${chanson.titre} — ${chanson.joueur}`
      : `${chanson.titre} — ${chanson.artiste}`;
    bouton.append(libelle);
    return bouton;
  }));
}

// Choix du maître pendant une désignation : qui, et quoi. Remis à zéro à chaque chanson arrêtée.
let designationMix = { joueur: null, trouve: null };
let chansonDesigneeMix = null;
let gagnantsMixAffiches = '';

function marquerDesignationMix() {
  for (const bouton of choixGagnantMix.children) {
    bouton.classList.toggle('choisi', bouton.dataset.id === designationMix.joueur);
  }
  for (const bouton of choixQuoiMix.children) {
    bouton.classList.toggle('choisi', bouton.dataset.trouve === designationMix.trouve);
  }
  boutonValiderMix.disabled = !designationMix.joueur || !designationMix.trouve;
}

choixGagnantMix.addEventListener('click', (evenement) => {
  const bouton = evenement.target.closest('.bouton-candidat');
  if (!bouton) return;
  vibrer(30);
  designationMix.joueur = bouton.dataset.id;
  marquerDesignationMix();
});

choixQuoiMix.replaceChildren(...QUOI_MIX.map(([trouve, libelle]) => {
  const bouton = boutonReglage(libelle, false, () => {
    vibrer(30);
    designationMix.trouve = trouve;
    marquerDesignationMix();
  });
  bouton.dataset.trouve = trouve;
  return bouton;
}));

boutonValiderMix.addEventListener('click', () => {
  if (!designationMix.joueur || !designationMix.trouve) return;
  marquerEnvoi(boutonValiderMix);
  socket.emit('joueur:repondre', { ...designationMix });
});

boutonAnnulerMix.addEventListener('click', () => {
  marquerEnvoi(boutonAnnulerMix);
  socket.emit('joueur:repondre', { annuler: true });
});

function afficherMaitreDesignation(vue) {
  chansonsMixAffichees = '';
  const chanson = `${vue.numero}/${vue.chanson.titre}`;
  if (chanson !== chansonDesigneeMix) {
    chansonDesigneeMix = chanson;
    designationMix = { joueur: null, trouve: null };
    gagnantsMixAffiches = '';
    boutonValiderMix.classList.remove('envoi-en-cours');
    boutonAnnulerMix.classList.remove('envoi-en-cours');
    boutonAnnulerMix.disabled = false;
  }
  document.getElementById('bt-titre-designation').textContent = vue.chanson.titre;
  document.getElementById('bt-artiste-designation').textContent = vue.chanson.artiste;
  const grille = JSON.stringify(vue.designables);
  if (grille !== gagnantsMixAffiches) {
    gagnantsMixAffiches = grille;
    choixGagnantMix.replaceChildren(...vue.designables.map((joueur) => boutonCandidat({ ...joueur, connecte: true })));
  }
  marquerDesignationMix();
}

// ---------- Résultat ----------

function afficherResultatBlindTest(vue) {
  chansonSelectionBlindTest = null;
  chansonDesigneeMix = null;
  chansonsMixAffichees = '';
  const mix = vue.format === 'mix';
  const resultat = document.getElementById('bt-resultat');
  resultat.textContent = mix ? texteResultatMix(vue) : texteResultatClassique(vue);
  resultat.classList.toggle('juste', vue.points > 0);
  const liste = document.getElementById('bt-liste-resultat');
  const chanson = document.getElementById('bt-chanson-resultat');
  const qui = document.getElementById('bt-qui-resultat');
  liste.hidden = !mix;
  chanson.hidden = mix;
  qui.hidden = mix;
  if (mix) {
    liste.replaceChildren(...vue.chansons.map((uneChanson) => {
      const ligne = document.createElement('li');
      ligne.textContent = `${uneChanson.titre} — ${uneChanson.artiste} : ${uneChanson.trouvePar ?? 'personne'}`;
      return ligne;
    }));
  } else {
    chanson.textContent = `${vue.chanson.artiste} — ${vue.chanson.titre}`;
    qui.textContent = `Titre : ${vue.trouveTitre ?? 'personne'} · Artiste : ${vue.trouveArtiste ?? 'personne'}`;
  }
  document.getElementById('bt-score').textContent = vue.score;
  document.getElementById('bt-rang').textContent = texteRang(vue.rang);
  passeParLeMaitre = vue.estMaitre;
  const boutonPasser = document.getElementById('bt-suivant');
  boutonPasser.hidden = !vue.estMaitre && !vue.estHote;
  boutonPasser.textContent = vue.prochainMaitre
    ? `Passer la modération à ${vue.prochainMaitre}`
    : 'Voir le podium';
}

function texteResultatClassique(vue) {
  if (vue.estMaitre) return 'Tu étais le maître du jeu. Pas de points, mais le pouvoir.';
  if (vue.aTrouveTitre && vue.aTrouveArtiste) return '+1000 : titre et artiste !';
  if (vue.aTrouveTitre) return '+500 : le titre';
  if (vue.aTrouveArtiste) return '+500 : l\'artiste';
  return 'Pas de point. Tu as bien chanté, au moins.';
}

function texteResultatMix(vue) {
  if (vue.estMaitre) return 'Tu étais le maître du jeu. Pas de points, mais le pouvoir.';
  return vue.points > 0 ? `+${vue.points} dans ce mix` : 'Pas de point. Tu as bien chanté, au moins.';
}

// ---------- Réglages de l'hôte : format, nombre de chansons ou options du mix ----------

const EXPLICATIONS_FORMAT = {
  classique: 'Une chanson à la fois, 30 s pour trouver le titre et l\'artiste.',
  mix: '5 chansons en même temps : retrouvez-les toutes !',
};

const curseurChansons = document.getElementById('bt-curseur-chansons');
const nombreChansons = document.getElementById('bt-nombre-chansons');

// Le nombre suit le doigt ; il n'est envoyé qu'au lâcher du curseur.
curseurChansons.addEventListener('input', () => {
  nombreChansons.textContent = curseurChansons.value;
});
curseurChansons.addEventListener('change', () => {
  envoyerReglages({ chansons: Number(curseurChansons.value) });
});

function remplirReglagesBlindTest({ format, chansons, tours, ecoute, options }) {
  document.getElementById('choix-formats').replaceChildren(...options.formats.map(({ id, libelle }) => {
    const envoyer = id === format ? null : () => envoyerReglages({ format: id });
    return boutonReglage(libelle, id === format, envoyer);
  }));
  document.getElementById('explication-format').textContent = EXPLICATIONS_FORMAT[format];

  document.getElementById('bt-reglage-chansons').hidden = format !== 'classique';
  curseurChansons.min = options.chansons.min;
  curseurChansons.max = options.chansons.max;
  // Un état reçu pendant que l'hôte fait glisser le curseur ne le fait pas sauter.
  if (document.activeElement !== curseurChansons) {
    curseurChansons.value = chansons;
    nombreChansons.textContent = chansons;
  }

  document.getElementById('bt-reglages-mix').hidden = format !== 'mix';
  document.getElementById('bt-choix-tours').replaceChildren(...options.tours.map((nombre) => boutonReglage(
    nombre > 1 ? `${nombre} fois` : 'Une fois', nombre === tours, () => envoyerReglages({ tours: nombre }),
  )));
  document.getElementById('bt-choix-ecoute').replaceChildren(...options.ecoutes.map((secondes) => boutonReglage(
    `${secondes} s`, secondes === ecoute, () => envoyerReglages({ ecoute: secondes }),
  )));
}

modesJoueur['blind-test'] = {
  remplirReglages: remplirReglagesBlindTest,
  relais: afficherRelaisBlindTest,
  ecouter: afficherEcouterBlindTest,
  maitre_classique: afficherMaitreClassique,
  maitre_mix: afficherMaitreMix,
  maitre_designation: afficherMaitreDesignation,
  resultat: afficherResultatBlindTest,
};
