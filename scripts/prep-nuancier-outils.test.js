import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Script classique pour la page : on l'exécute dans un contexte à part pour lire ses fonctions.
// URL existe dans le navigateur, pas dans un contexte vm vide.
const outils = { URL };
vm.runInNewContext(readFileSync(new URL('./prep-nuancier-outils.js', import.meta.url), 'utf8'), outils);
const {
  ajouterAuCatalogue, couleurProbable, idPropre, marqueDepuisFichier, nomDeCouleur, nomDeFichierCommons, procheDe, questionPour,
  texteDuCatalogue, urlApiCommons, urlSourceCommons,
} = outils;

test('Commons : nom du fichier depuis les différentes formes d\'adresse', () => {
  const attendu = 'Logo_Lacoste_2026.svg';
  assert.equal(nomDeFichierCommons('https://commons.wikimedia.org/wiki/File:Logo_Lacoste_2026.svg'), attendu);
  assert.equal(nomDeFichierCommons('  https://commons.wikimedia.org/wiki/Fichier:Logo_Lacoste_2026.svg  '), attendu);
  assert.equal(nomDeFichierCommons('https://commons.wikimedia.org/w/index.php?title=File:Logo_Lacoste_2026.svg&uselang=fr'), attendu);
  assert.equal(nomDeFichierCommons('https://commons.m.wikimedia.org/wiki/File:Logo%20Lacoste%202026.svg'), attendu);
  assert.equal(nomDeFichierCommons('https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_Lacoste_2026.svg'), attendu);
  assert.equal(
    nomDeFichierCommons('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Logo_Lacoste_2026.svg/120px-Logo_Lacoste_2026.svg.png'),
    attendu,
  );
  assert.equal(nomDeFichierCommons('https://commons.wikimedia.org/wiki/File:Cr%C3%A9dit_Agricole.svg'), 'Crédit_Agricole.svg');
});

test('Commons : adresses refusées', () => {
  for (const url of [
    'pas une adresse', 'https://commons.wikimedia.org/wiki/File:Photo.jpg', 'https://example.com/wiki/File:Logo.svg',
    'https://commons.wikimedia.org/wiki/File:%E0%A4%A.svg', '',
  ]) {
    assert.equal(nomDeFichierCommons(url), null, url);
  }
});

test('Commons : adresses de la page source et de l\'API', () => {
  assert.equal(urlSourceCommons('Logo_Lacoste_2026.svg'), 'https://commons.wikimedia.org/wiki/File:Logo_Lacoste_2026.svg');
  const api = new URL(urlApiCommons('Crédit_Agricole.svg'));
  assert.equal(api.hostname, 'commons.wikimedia.org');
  assert.equal(api.searchParams.get('origin'), '*');
  assert.equal(api.searchParams.get('titles'), 'File:Crédit_Agricole.svg');
});

test('marque tirée du nom du fichier', () => {
  assert.equal(marqueDepuisFichier('Logo_Lacoste_2026.svg'), 'Lacoste');
  assert.equal(marqueDepuisFichier('IKEA_logo.svg'), 'IKEA');
  assert.equal(marqueDepuisFichier('Coca-Cola_logo.svg'), 'Coca-Cola');
  assert.equal(marqueDepuisFichier('Carrefour_logo_(1966).svg'), 'Carrefour');
  assert.equal(marqueDepuisFichier('Crédit_Agricole.svg'), 'Crédit Agricole');
});

test('nom de la couleur', () => {
  const noms = {
    '#E2001A': 'rouge', '#FF7900': 'orange', '#FFC72C': 'jaune', '#00A650': 'vert', '#00A3AD': 'turquoise',
    '#0058A3': 'bleu', '#6A1B9A': 'violet', '#E6007E': 'rose', '#5C3A1E': 'marron',
  };
  for (const [hex, nom] of Object.entries(noms)) assert.equal(nomDeCouleur(hex), nom, hex);
  assert.equal(nomDeCouleur('#808080'), null);
  // Presque noir : saturation TSL de 12 %, mais aucune couleur visible.
  assert.equal(nomDeCouleur('#181713'), null);
});

test('id de forme propre : pas les id d\'Illustrator', () => {
  for (const id of ['path12', 'zone-1', 'Calque_1', 'monoprix']) assert.equal(idPropre(id), true, id);
  for (const id of ['<Path>', '<Compound Path>', '', '1abc', 'a b']) assert.equal(idPropre(id), false, id);
});

test('couleurs proches : à 12 près sur chaque canal', () => {
  assert.equal(procheDe('#0058AB', '#0058A3'), true);
  assert.equal(procheDe('#0058A3', '#0058A3'), true);
  assert.equal(procheDe('#0058A3', '#0058B0'), false);
  assert.equal(procheDe('#FFDA1A', '#0058A3'), false);
});

test('question : jamais le nom de la couleur, élision devant une voyelle', () => {
  assert.equal(questionPour('Lacoste'), 'Quelle est la couleur de Lacoste ?');
  assert.equal(questionPour('IKEA'), "Quelle est la couleur d'IKEA ?");
  assert.equal(questionPour('Orange'), "Quelle est la couleur d'Orange ?");
  assert.equal(questionPour('Émeraude'), "Quelle est la couleur d'Émeraude ?");
});

test('couleur probable : la plus étendue des couleurs jouables', () => {
  assert.equal(couleurProbable([
    { hex: '#FFFFFF', aire: 900 }, { hex: '#000000', aire: 800 }, { hex: '#0058A3', aire: 300 }, { hex: '#FFDA1A', aire: 100 },
  ]), '#0058A3');
  assert.equal(couleurProbable([{ hex: '#FFFFFF', aire: 900 }, { hex: '#777777', aire: 10 }]), null);
  // Le quasi-noir du logo Lacoste ne l'emporte pas sur le vert, même plus étendu.
  assert.equal(couleurProbable([{ hex: '#181713', aire: 900 }, { hex: '#06532A', aire: 200 }]), '#06532A');
  assert.equal(couleurProbable([]), null);
});

test('catalogue : ajout à la fin, id ou fichier déjà présents ignorés', () => {
  const ikea = { id: 'n-ikea', fichier: 'ikea.svg' };
  const { catalogue, ajoutees, ignorees } = ajouterAuCatalogue([ikea], [
    { id: 'n-lacoste', fichier: 'lacoste.svg' },
    { id: 'n-ikea', fichier: 'ikea-2.svg' },
    { id: 'n-ikea-2', fichier: 'ikea.svg' },
    { id: 'n-lacoste', fichier: 'lacoste.svg' },
  ]);
  // Tableaux créés dans le contexte vm : comparés par leur copie JSON.
  const copie = (valeur) => JSON.parse(JSON.stringify(valeur));
  assert.deepEqual(copie(catalogue.map((e) => e.id)), ['n-ikea', 'n-lacoste']);
  assert.deepEqual(copie(ajoutees.map((e) => e.id)), ['n-lacoste']);
  assert.deepEqual(copie(ignorees.map((i) => i.raison)), [
    'id déjà dans le catalogue', 'fichier déjà utilisé', 'id déjà dans le catalogue',
  ]);
});

test('catalogue : une entrée par ligne, relu à l\'identique', () => {
  const liste = [{ id: 'n-a', zones: ['x'] }, { id: 'n-b', zones: ['y'] }];
  const texte = texteDuCatalogue(liste);
  assert.equal(texte, '[\n  {"id":"n-a","zones":["x"]},\n  {"id":"n-b","zones":["y"]}\n]\n');
  assert.deepEqual(JSON.parse(texte), liste);
});
