import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cibleDansLeSvg, verifierNuancier } from './verifier-nuancier.js';

// Un logo neutralisé par l'outil de préparation : zone en gris, cible absente du fichier.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="fond" fill="#123456"/><path id="zone-1" style="fill: rgb(158, 158, 158);"/></svg>';

function logo(modifications = {}) {
  return {
    id: 'n-ikea', nom: 'IKEA', fichier: 'ikea.svg', question: "Quel est le bleu d'IKEA ?",
    cible: '#0058A3', zones: ['zone-1'], ...modifications,
  };
}

const svgs = (texte = SVG) => new Map([['ikea.svg', texte]]);

// Une seule erreur attendue, contenant `extrait`.
function erreurAttendue(liste, disque, extrait) {
  const erreurs = verifierNuancier(liste, disque);
  assert.equal(erreurs.length, 1, `une erreur attendue, reçu : ${erreurs.join(' | ')}`);
  assert.ok(erreurs[0].includes(extrait), `« ${extrait} » attendu dans : ${erreurs[0]}`);
}

test('nuancier : un catalogue valide ne donne aucune erreur', () => {
  assert.deepEqual(verifierNuancier([logo()], svgs()), []);
});

test('nuancier : le fichier doit être une liste', () => {
  assert.equal(verifierNuancier({}, new Map()).length, 1);
});

test('nuancier : id mal formé ou en double', () => {
  erreurAttendue([logo({ id: 'ikea' })], svgs(), 'id doit être');
  erreurAttendue([logo({ id: 'n-IKEA' })], svgs(), 'id doit être');
  erreurAttendue([logo(), logo()], svgs(), 'id en double');
});

test('nuancier : champ en trop, nom vide, question sans point d\'interrogation', () => {
  erreurAttendue([logo({ hint: 'x' })], svgs(), 'champ(s) en trop : hint');
  erreurAttendue([logo({ nom: ' ' })], svgs(), 'nom vide');
  erreurAttendue([logo({ question: "Le bleu d'IKEA" })], svgs(), 'finir par « ? »');
});

test('nuancier : cible mal formée ou inatteignable', () => {
  erreurAttendue([logo({ cible: '0058A3' })], svgs(), '#RRGGBB');
  erreurAttendue([logo({ cible: '#0058A' })], svgs(), '#RRGGBB');
  erreurAttendue([logo({ cible: '#000000' })], svgs(), 'inatteignable');
  erreurAttendue([logo({ cible: '#FFFFFF' })], svgs(), 'inatteignable');
});

test('nuancier : zones vides ou absentes du SVG', () => {
  erreurAttendue([logo({ zones: [] })], svgs(), 'liste non vide');
  erreurAttendue([logo({ zones: ['zone-2'] })], svgs(), 'zone « zone-2 » absente');
  // « zone-1 » ne doit pas être trouvé dans « zone-10 ».
  erreurAttendue([logo()], svgs(SVG.replace('zone-1', 'zone-10')), 'zone « zone-1 » absente');
});

test('nuancier : fichier mal nommé, absent, ou logo sans entrée', () => {
  erreurAttendue([logo({ fichier: 'IKEA.svg' })], new Map(), 'minuscules');
  erreurAttendue([logo()], new Map(), 'logo absent : public/logos/nuancier/ikea.svg');
  const disque = new Map([...svgs(), ['orange.svg', SVG]]);
  erreurAttendue([logo()], disque, 'orange.svg : aucune entrée');
});

test('nuancier : la cible encore écrite dans le SVG est signalée', () => {
  erreurAttendue([logo()], svgs(SVG.replace('#123456', '#0058a3')), 'encore écrite dans le SVG');
  assert.ok(cibleDansLeSvg('<style>.a{fill:#FFF}</style>', '#FFFFFF'), 'forme courte');
  assert.ok(!cibleDansLeSvg('<rect fill="#0058a4"/>', '#0058A3'));
});
