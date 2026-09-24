const socket = io();

socket.on('connect', () => {
  socket.emit('tv:creer');
});

const affichages = {
  lobby: afficherLobby,
  question: afficherQuestion,
  revelation: afficherRevelation,
  podium: afficherPodium,
};

let intervalleChrono = null;

socket.on('salle:etat', (salle) => {
  clearInterval(intervalleChrono);
  afficherEcran(salle.etat);
  affichages[salle.etat](salle);
});

function afficherEcran(nom) {
  for (const ecran of document.querySelectorAll('main')) {
    ecran.hidden = ecran.dataset.ecran !== nom;
  }
}

function afficherLobby(salle) {
  document.getElementById('code').textContent = salle.code;
  document.getElementById('url').textContent = salle.urlJoueur.replace(/^https?:\/\//, '');
  const qr = document.getElementById('qr');
  const srcQr = `/qr/${salle.code}.svg`;
  if (qr.getAttribute('src') !== srcQr) qr.src = srcQr;

  const liste = document.getElementById('liste-joueurs');
  liste.replaceChildren(...salle.joueurs.map((joueur) => ligneJoueur(joueur, salle.hoteId)));
}

function ligneJoueur(joueur, hoteId) {
  const ligne = document.createElement('li');
  ligne.append(pastille(joueur.couleur), ' ', joueur.pseudo);
  if (joueur.id === hoteId) ligne.append(' 👑');
  return ligne;
}

function pastille(couleur) {
  const element = document.createElement('span');
  element.className = 'pastille';
  element.style.background = couleur;
  return element;
}

function afficherQuestion(salle) {
  const { numero, total, question, ontRepondu, tempsRestantMs } = salle.etatMode;
  document.getElementById('numero-question').textContent = `${numero}/${total}`;
  lancerChrono(tempsRestantMs);
  document.getElementById('texte-question').textContent = question.texte;
  document.getElementById('reponses-question').replaceChildren(
    ...question.reponses.map((texte, index) => caseReponse(texte, index)),
  );

  const joueursAyantRepondu = salle.joueurs.filter((joueur) => ontRepondu.includes(joueur.id));
  document.getElementById('ont-repondu').replaceChildren(
    ...joueursAyantRepondu.map((joueur) => {
      const element = document.createElement('li');
      element.append(pastille(joueur.couleur), ' ', joueur.pseudo);
      return element;
    }),
  );
}

// Simple affichage : c'est le serveur qui décide de la fin de la manche.
function lancerChrono(tempsRestantMs) {
  const fin = Date.now() + tempsRestantMs;
  const element = document.getElementById('chrono');
  const afficher = () => {
    element.textContent = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
  };
  afficher();
  intervalleChrono = setInterval(afficher, 250);
}

function caseReponse(texte, index) {
  const element = document.createElement('li');
  element.className = `choix-${index}`;
  element.append(' ', texte);
  return element;
}

function afficherRevelation(salle) {
  const { numero, total, question, bonneReponse, nombreParChoix, classement } = salle.etatMode;
  document.getElementById('numero-revelation').textContent = `${numero}/${total}`;
  document.getElementById('texte-revelation').textContent = question.texte;
  document.getElementById('reponses-revelation').replaceChildren(
    ...question.reponses.map((texte, index) => {
      const element = caseReponse(texte, index);
      element.classList.add(index === bonneReponse ? 'bonne' : 'mauvaise');
      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = nombreParChoix[index];
      element.append(nombre);
      return element;
    }),
  );
  document.getElementById('classement-revelation').replaceChildren(
    ...classement.map((ligne) => {
      const gain = ligne.points > 0 ? `+${ligne.points}` : '✗';
      return ligneClassement(ligne, gain);
    }),
  );
}

// Tous les joueurs de rang 3 ou mieux : parfois plus de 3 avec les ex æquo.
function afficherPodium(salle) {
  const { classement } = salle.etatMode;
  document.getElementById('podium').replaceChildren(
    ...classement.filter((ligne) => ligne.rang <= 3).map((ligne) => ligneClassement(ligne, '')),
  );
  document.getElementById('classement-podium').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, '')),
  );
}

function ligneClassement(ligne, gain) {
  const element = document.createElement('li');
  const points = document.createElement('span');
  points.className = 'gain';
  points.textContent = gain;
  element.append(
    `${ligne.rang}. `, pastille(ligne.couleur), ' ', ligne.pseudo, ' — ', ligne.score, ' ', points,
  );
  return element;
}
