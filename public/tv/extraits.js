// Extraits Deezer du blind test, lus par la TV (docs/modes/blind-test.md, « Lecture sur la TV »).
// Le serveur redirige /extrait/<id> vers un lien frais de Deezer.

// Sonie (gain Deezer, en dB) visée pour chaque piste : plus le gain est haut, plus le morceau est fort.
// Une piste plus forte est baissée d'autant ; une piste plus douce reste au volume maximal.
const GAIN_CIBLE = -12;

function volumeDuGain(gain) {
  return Math.min(1, 10 ** ((GAIN_CIBLE - gain) / 20));
}

// Une piste qui boucle à partir de `depart` secondes (au-delà de la fin de l'extrait, on
// repart du début : après un rechargement de la TV). surErreur : l'extrait ne se charge pas.
function creerPiste(id, { depart, gain }, surErreur) {
  const piste = new Audio(`/extrait/${id}`);
  piste.loop = true;
  piste.volume = volumeDuGain(gain);
  piste.addEventListener('loadedmetadata', () => {
    piste.currentTime = Number.isFinite(piste.duration) ? depart % piste.duration : depart;
  }, { once: true });
  piste.addEventListener('error', surErreur, { once: true });
  return piste;
}

function arreterPiste(piste) {
  piste.pause();
  piste.removeAttribute('src');
  piste.load();
}

// ---------- Planche d'extraits (/tv?extraits) ----------

const DEPART_MAX_S = 10;
let pistesPlanche = [];

async function lancerEssai(nombre, liste) {
  toutArreterPlanche(liste);
  const chansons = (await (await fetch('/extraits/essai')).json()).slice(0, nombre);
  pistesPlanche = chansons.map((chanson) => {
    const depart = Math.round(Math.random() * DEPART_MAX_S);
    const ligne = document.createElement('li');
    ligne.textContent = `${chanson.artiste} — ${chanson.titre} · gain ${chanson.gain} dB · volume ${volumeDuGain(chanson.gain).toFixed(2)} · départ ${depart} s`;
    liste.append(ligne);
    const piste = creerPiste(chanson.id, { depart, gain: chanson.gain }, () => {
      ligne.textContent += ' · Indisponible';
    });
    piste.play().catch(() => { ligne.textContent += ' · lecture refusée'; });
    return { piste, ligne };
  });
}

function retirerUne() {
  const retiree = pistesPlanche.shift();
  if (!retiree) return;
  arreterPiste(retiree.piste);
  retiree.ligne.remove();
}

function toutArreterPlanche(liste) {
  for (const { piste } of pistesPlanche) arreterPiste(piste);
  pistesPlanche = [];
  liste.replaceChildren();
}

function boutonExtraits(libelle, action) {
  const bouton = document.createElement('button');
  bouton.textContent = libelle;
  bouton.addEventListener('click', action);
  return bouton;
}

function afficherPlancheExtraits() {
  const planche = document.createElement('div');
  planche.className = 'planche-sons';
  const liste = document.createElement('ol');
  planche.append(
    boutonExtraits('1 extrait', () => lancerEssai(1, liste)),
    boutonExtraits('Mix de 5', () => lancerEssai(5, liste)),
    boutonExtraits('Pause', () => pistesPlanche.forEach(({ piste }) => piste.pause())),
    boutonExtraits('Reprendre', () => pistesPlanche.forEach(({ piste }) => piste.play())),
    boutonExtraits('Retirer une chanson', retirerUne),
    boutonExtraits('Tout arrêter', () => toutArreterPlanche(liste)),
    liste,
  );
  document.getElementById('scene').append(planche);
}

if (new URLSearchParams(location.search).has('extraits')) afficherPlancheExtraits();
