// Écrans du quiz sur la TV. Les outils communs (pastille, chrono…) viennent de tv.js.

function afficherQuestionQuiz(salle, nouvelleEtape) {
  const { numero, total, question, ontRepondu, tempsRestantMs } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('numero-question').textContent = `Question ${numero}/${total}`;
    document.getElementById('texte-question').textContent = question.texte;
    document.getElementById('reponses-question').replaceChildren(
      ...question.reponses.map((texte, index) => caseReponse(texte, index)),
    );
    viderBarreTemps(document.getElementById('barre-temps'), tempsRestantMs);
    document.getElementById('ont-repondu').replaceChildren();
  }
  lancerChrono(document.getElementById('chrono'), tempsRestantMs);

  const joueursAyantRepondu = salle.joueurs.filter((joueur) => ontRepondu.includes(joueur.id));
  remplirEtiquettes(
    document.getElementById('ont-repondu'),
    joueursAyantRepondu.map((joueur) => etiquetteJoueur(joueur, false)),
  );
}

function caseReponse(texte, index) {
  const element = document.createElement('li');
  element.className = `choix-${index} fond-choix-${index}`;
  const libelle = document.createElement('span');
  libelle.className = 'texte';
  libelle.textContent = texte;
  element.append(forme(''), libelle);
  return element;
}

function afficherRevelationQuiz(salle, nouvelleEtape) {
  const { numero, total, question, bonneReponse, nombreParChoix, classement } = salle.etatMode;
  if (nouvelleEtape) {
    document.getElementById('numero-revelation').textContent = `Question ${numero}/${total}`;
    document.getElementById('texte-revelation').textContent = question.texte;
    document.getElementById('reponses-revelation').replaceChildren(
      ...question.reponses.map((texte, index) => {
        const element = caseReponse(texte, index);
        const estBonne = index === bonneReponse;
        element.classList.add(estBonne ? 'bonne' : 'mauvaise');
        if (estBonne) element.append(forme('coche'));
        const nombre = document.createElement('span');
        nombre.className = 'nombre';
        nombre.textContent = nombreParChoix[index];
        element.append(nombre);
        return element;
      }),
    );
  }
  document.getElementById('classement-revelation').replaceChildren(
    ...classement.map((ligne) => ligneClassement(ligne, true)),
  );
}

modesTv.quiz = {
  question: afficherQuestionQuiz,
  revelation: afficherRevelationQuiz,
};
