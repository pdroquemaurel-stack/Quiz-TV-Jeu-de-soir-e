const socket = io();
const formulaire = document.getElementById('formulaire');
const champTexte = document.getElementById('texte');

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  const texte = champTexte.value.trim();
  if (texte === '') return;
  socket.emit('test:message', texte);
  champTexte.value = '';
});
