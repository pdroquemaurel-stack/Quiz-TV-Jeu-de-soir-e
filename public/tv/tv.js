const socket = io();
const listeMessages = document.getElementById('messages');

socket.on('test:message', (texte) => {
  const ligne = document.createElement('li');
  ligne.textContent = texte;
  listeMessages.appendChild(ligne);
});
