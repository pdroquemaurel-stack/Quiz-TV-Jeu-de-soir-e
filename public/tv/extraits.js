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

// Mix (tranche 42) : une piste chargée et placée à son départ, sans la jouer. quandPrete :
// elle peut démarrer aussitôt ; quandEchec : elle ne se charge pas. Les 5 pistes du mix
// démarrent ainsi ensemble, au lieu de partir chacune dès que son extrait arrive.
function preparerPiste(id, { depart, gain }, quandPrete, quandEchec) {
  const piste = creerPiste(id, { depart, gain }, quandEchec);
  piste.preload = 'auto';
  piste.addEventListener('seeked', () => {
    if (piste.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) quandPrete();
    else piste.addEventListener('canplay', quandPrete, { once: true });
  }, { once: true });
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
  const debut = performance.now();
  pistesPlanche = chansons.map((chanson) => {
    const { depart, ligne } = ligneEssai(chanson, liste);
    const piste = creerPiste(chanson.id, { depart, gain: chanson.gain }, () => {
      ligne.textContent += ' · Indisponible';
    });
    noterDemarrage(piste, ligne, debut);
    piste.play().catch(() => { ligne.textContent += ' · lecture refusée'; });
    return { piste, ligne };
  });
}

// Comme en partie depuis la tranche 42 : les 5 pistes se chargent et se placent d'abord,
// puis démarrent ensemble. Un extrait qui ne se charge pas est signalé et laissé de côté.
async function lancerMixPrepare(liste) {
  toutArreterPlanche(liste);
  const chansons = await (await fetch('/extraits/essai')).json();
  const debut = performance.now();
  const resume = document.createElement('li');
  liste.append(resume);
  let restantes = chansons.length;
  const uneDeMoins = () => {
    restantes--;
    resume.textContent = `Chargement… ${chansons.length - restantes}/${chansons.length}`;
    if (restantes > 0) return;
    resume.textContent = `Tout est chargé en ${Math.round(performance.now() - debut)} ms : départ ensemble`;
    const departEnsemble = performance.now();
    for (const { piste, ligne, prete } of pistesPlanche) {
      if (!prete) continue;
      noterDemarrage(piste, ligne, departEnsemble);
      piste.play().catch(() => { ligne.textContent += ' · lecture refusée'; });
    }
  };
  pistesPlanche = chansons.map((chanson) => {
    const { depart, ligne } = ligneEssai(chanson, liste);
    const essai = { ligne, prete: false };
    essai.piste = preparerPiste(chanson.id, { depart, gain: chanson.gain }, () => {
      essai.prete = true;
      ligne.textContent += ` · prête en ${Math.round(performance.now() - debut)} ms`;
      uneDeMoins();
    }, () => {
      ligne.textContent += ' · Indisponible';
      uneDeMoins();
    });
    return essai;
  });
}

function ligneEssai(chanson, liste) {
  const depart = Math.round(Math.random() * DEPART_MAX_S);
  const ligne = document.createElement('li');
  ligne.textContent = `${chanson.artiste} — ${chanson.titre} · gain ${chanson.gain} dB · volume ${volumeDuGain(chanson.gain).toFixed(2)} · départ ${depart} s`;
  liste.append(ligne);
  return { depart, ligne };
}

// Le délai jusqu'au son, pour voir sur le stick si les pistes partent ensemble.
function noterDemarrage(piste, ligne, debut) {
  piste.addEventListener('playing', () => {
    ligne.textContent += ` · son à +${Math.round(performance.now() - debut)} ms`;
  }, { once: true });
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
    boutonExtraits('Mix de 5 (chacune part seule)', () => lancerEssai(5, liste)),
    boutonExtraits('Mix préparé (comme en partie)', () => lancerMixPrepare(liste)),
    boutonExtraits('Pause', () => pistesPlanche.forEach(({ piste }) => piste.pause())),
    boutonExtraits('Reprendre', () => pistesPlanche.forEach(({ piste }) => piste.play())),
    boutonExtraits('Retirer une chanson', retirerUne),
    boutonExtraits('Tout arrêter', () => toutArreterPlanche(liste)),
    liste,
  );
  document.getElementById('scene').append(planche);
}

if (new URLSearchParams(location.search).has('extraits')) afficherPlancheExtraits();
