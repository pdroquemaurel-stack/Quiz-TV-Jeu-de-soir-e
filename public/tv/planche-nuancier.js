// Planche des logos du Nuancier (/tv?nuancier) : chaque logo du catalogue, zone masquée
// puis zone à la couleur cible, pour vérifier les fichiers sur le PC et sur le stick.

function carteDeLogo(logo) {
  const carte = document.createElement('article');
  carte.className = 'carte-logo';
  carte.innerHTML = `
    <h2></h2>
    <p class="question-logo"></p>
    <div class="paire-logos">
      <figure><div class="cadre-logo"></div><figcaption>Masqué</figcaption></figure>
      <figure><div class="cadre-logo"></div><figcaption>Cible <span class="pastille-cible"></span> <span class="hex-cible"></span></figcaption></figure>
    </div>
    <p class="alerte-logo"></p>`;
  carte.querySelector('h2').textContent = `${logo.nom} · ${logo.id}`;
  carte.querySelector('.question-logo').textContent = logo.question;
  carte.querySelector('.pastille-cible').style.background = logo.cible;
  carte.querySelector('.hex-cible').textContent = logo.cible;
  const [masque, colore] = carte.querySelectorAll('.cadre-logo');
  remplirCarte(carte, logo, masque, colore);
  return carte;
}

async function remplirCarte(carte, logo, masque, colore) {
  const alerte = carte.querySelector('.alerte-logo');
  const svgMasque = await afficherLogo(masque, logo);
  const svgColore = await afficherLogo(colore, logo);
  if (!svgMasque || !svgColore) {
    alerte.textContent = `Logo introuvable : /logos/nuancier/${logo.fichier}`;
    return;
  }
  masquerZones(svgMasque, logo.zones);
  colorerZones(svgColore, logo.zones, logo.cible);
  const absentes = logo.zones.filter((id) => !formesDeLaZone(svgMasque, [id]).length);
  if (absentes.length) alerte.textContent = `Zone(s) introuvable(s) dans le SVG : ${absentes.join(', ')}`;
}

async function afficherPlancheNuancier() {
  const planche = document.createElement('div');
  planche.className = 'planche-nuancier';
  document.getElementById('scene').append(planche);
  const catalogue = await (await fetch('/nuancier/planche')).json();
  planche.append(...catalogue.map(carteDeLogo));
}

if (new URLSearchParams(location.search).has('nuancier')) afficherPlancheNuancier();
