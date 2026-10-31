// Écrans de la Wiki course sur le téléphone. socket, marquerAppui, texteRang, envoyerSuivant,
// boutonReglage et envoyerReglages viennent de joueur.js, boutonsACocher de modes/quiz.js.
// Le téléphone charge lui-même l'article chez Wikipédia et le nettoie, mais n'avance jamais
// seul : il affiche une nouvelle page seulement quand le serveur l'a enregistrée.

const articleWc = document.getElementById('wc-article');
let intervalleChronoWc = null;
// Titre de l'article affiché (ou en cours de chargement), et dernière vue reçue.
let articleAfficheWc = null;
let vueCourseWc = null;

// Pages qui ne sont pas des articles : leurs liens restent du texte.
const ESPACES_NON_ARTICLES = /^(aide|fichier|image|média|media|catégorie|modèle|portail|projet|wikipédia|spécial|discussion|utilisateur|utilisatrice|référence|module|sujet|help|file|category|template|special|wikt|wiktionnaire|w|s|b|n|q|v|voy|commons|d|mw|meta|m|en|de|es|it):/i;
// Blocs jamais affichés : images, tableaux, notes, boîtes de navigation.
const BLOCS_IGNORES = 'header, figure, table, sup, style, script, link, meta, img, audio, video, .mw-ref, .noprint, .reference, .references, .mw-references-wrap, .pcs-collapse-table-container, .thumb, .infobox, .navbox, .hatnote, .bandeau-container, .metadata, .mw-empty-elt';
const BLOCS_GARDES = ['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'DL'];
const NIVEAUX_TITRES = { H2: 2, H3: 3, H4: 4 };
// Sections retirées du plan : presque jamais de liens vers d'autres articles.
const SECTIONS_RETIREES = /^(notes?( et références)?|références|bibliographie|liens externes|liens|sources)$/i;

document.getElementById('bouton-retour-wc').addEventListener('click', (evenement) => {
  marquerAppui(evenement.currentTarget);
  socket.emit('joueur:repondre', { retour: true });
});
// Un toucher sur la cible du bandeau montre (ou cache) sa première phrase.
const boutonCibleWc = document.getElementById('wc-cible-bandeau');
const extraitCibleWc = document.getElementById('wc-extrait-cible');
boutonCibleWc.addEventListener('click', () => {
  extraitCibleWc.hidden = !extraitCibleWc.hidden || !extraitCibleWc.textContent;
  boutonCibleWc.setAttribute('aria-expanded', String(!extraitCibleWc.hidden));
});
document.getElementById('bouton-recharger-wc').addEventListener('click', () => {
  articleAfficheWc = null;
  if (vueCourseWc) afficherCourseWc(vueCourseWc);
});
// « Terminer la course » de l'hôte : le « Suivant » du mode pendant la course.
for (const id of ['bouton-suivant-wc', 'bouton-terminer-course-wc', 'bouton-terminer-arrive-wc']) {
  document.getElementById(id).addEventListener('click', envoyerSuivant);
}

// Un toucher sur un lien : le serveur vérifie qu'il est bien sur la page, puis l'enregistre.
articleWc.addEventListener('click', (evenement) => {
  const lien = evenement.target.closest('[data-titre]');
  if (!lien || !vueCourseWc || vueCourseWc.revelation || vueCourseWc.enVerification) return;
  vibrer(30);
  lien.classList.add('touche');
  if (vueCourseWc.format === 'libre') articleWc.classList.add('en-attente');
  socket.emit('joueur:repondre', { aller: lien.dataset.titre });
});

// tempsRestantMs null : course libre sans limite de temps, pas de chrono.
function lancerChronoWc(element, tempsRestantMs) {
  clearInterval(intervalleChronoWc);
  element.hidden = tempsRestantMs === null;
  if (element.hidden) return;
  const fin = Date.now() + tempsRestantMs;
  const afficher = () => {
    const secondes = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    element.textContent = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
  };
  clearInterval(intervalleChronoWc);
  afficher();
  intervalleChronoWc = setInterval(afficher, 250);
}

// « ./Tour_Eiffel#Histoire » → « Tour Eiffel ». null si ce n'est pas un lien vers un article.
function titreDuLien(lien) {
  const adresse = lien.getAttribute('href') ?? '';
  if (!adresse.startsWith('./') || lien.classList.contains('new')) return null;
  let titre;
  try {
    titre = decodeURIComponent(adresse.slice(2).split('#')[0].split('?')[0]).replace(/_/g, ' ').trim();
  } catch {
    return null;
  }
  if (!titre || ESPACES_NON_ARTICLES.test(titre)) return null;
  return titre;
}

// Le contenu d'un bloc, reconstruit nœud par nœud : du texte, des liens, du gras et de l'italique.
// Rien de Wikipédia n'entre tel quel dans la page (ni innerHTML, ni attribut, ni style).
function copierEnLigne(source, cible) {
  for (const noeud of source.childNodes) {
    if (noeud.nodeType === Node.TEXT_NODE) {
      cible.append(noeud.textContent);
      continue;
    }
    if (noeud.nodeType !== Node.ELEMENT_NODE || noeud.matches(BLOCS_IGNORES)) continue;
    if (noeud.tagName === 'A') {
      const titre = titreDuLien(noeud);
      if (!titre) {
        cible.append(noeud.textContent);
        continue;
      }
      const lien = document.createElement('span');
      lien.className = 'wc-lien';
      lien.dataset.titre = titre;
      lien.textContent = noeud.textContent;
      cible.append(lien);
      continue;
    }
    if (['B', 'STRONG', 'I', 'EM'].includes(noeud.tagName)) {
      const style = document.createElement(['B', 'STRONG'].includes(noeud.tagName) ? 'b' : 'i');
      copierEnLigne(noeud, style);
      cible.append(style);
      continue;
    }
    copierEnLigne(noeud, cible);
  }
}

function copierBloc(source) {
  if (source.tagName === 'UL' || source.tagName === 'OL' || source.tagName === 'DL') {
    const liste = document.createElement('ul');
    for (const element of source.children) {
      if (element.matches(BLOCS_IGNORES)) continue;
      const puce = document.createElement('li');
      copierEnLigne(element, puce);
      if (puce.textContent.trim()) liste.append(puce);
    }
    return liste.children.length ? liste : null;
  }
  const bloc = document.createElement('p');
  copierEnLigne(source, bloc);
  return bloc.textContent.trim() ? bloc : null;
}

// Les blocs gardés de l'article, dans l'ordre, sans descendre dans ceux qu'on ignore :
// { niveau: 2 à 4, titre } pour un titre de section, { bloc } pour le contenu.
function blocsDe(racine, resultat = []) {
  for (const element of racine.children) {
    if (element.matches(BLOCS_IGNORES)) continue;
    if (NIVEAUX_TITRES[element.tagName]) {
      const titre = element.textContent.trim();
      if (titre) resultat.push({ niveau: NIVEAUX_TITRES[element.tagName], titre });
    } else if (BLOCS_GARDES.includes(element.tagName)) {
      const bloc = copierBloc(element);
      if (bloc) resultat.push({ bloc });
    } else blocsDe(element, resultat);
  }
  return resultat;
}

function texteNombreLiens(nombre) {
  return nombre > 1 ? `${nombre} liens` : `${nombre} lien`;
}

// Une section repliée : son titre et son nombre de liens, le contenu s'ouvre au toucher.
function nouvelleSection(niveau, titre) {
  const section = document.createElement('details');
  section.className = `wc-section niveau-${niveau}`;
  const entete = document.createElement('summary');
  entete.append(titre, ' ');
  const contenu = document.createElement('div');
  contenu.className = 'wc-contenu';
  section.append(entete, contenu);
  return { niveau, section, contenu };
}

// L'introduction en clair, puis le plan de l'article : chaque section repliée, ses
// sous-sections dedans. Les sections sans lien (notes, bibliographie…) disparaissent.
function construirePlan(blocs) {
  const intro = document.createElement('div');
  const pile = [{ niveau: 1, contenu: intro }];
  const sections = [];
  for (const { niveau, titre, bloc } of blocs) {
    if (bloc) {
      pile.at(-1).contenu.append(bloc);
      continue;
    }
    while (pile.at(-1).niveau >= niveau) pile.pop();
    const nouvelle = nouvelleSection(niveau, titre);
    pile.at(-1).contenu.append(nouvelle.section);
    pile.push(nouvelle);
    sections.push({ ...nouvelle, titre });
  }
  for (const { section, contenu, titre } of sections) {
    const nombre = contenu.querySelectorAll('[data-titre]').length;
    if (nombre === 0 || SECTIONS_RETIREES.test(titre)) section.remove();
    else section.querySelector('summary').append(texteWc('wc-nombre-liens', texteNombreLiens(nombre), 'span'));
  }
  return [...intro.childNodes];
}

async function chargerArticle(titre) {
  articleAfficheWc = titre;
  articleWc.classList.remove('en-attente');
  document.getElementById('wc-titre-article').textContent = titre;
  document.getElementById('wc-erreur-article').hidden = true;
  articleWc.replaceChildren(texteWc('discret', 'Chargement de l\'article…'));
  window.scrollTo(0, 0);
  try {
    const adresse = `https://fr.wikipedia.org/api/rest_v1/page/mobile-html/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
    const reponse = await fetch(adresse);
    if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
    const page = new DOMParser().parseFromString(await reponse.text(), 'text/html');
    if (articleAfficheWc !== titre) return;
    articleWc.replaceChildren(...construirePlan(blocsDe(page.body)));
    if (vueCourseWc) marquerChoixWc(vueCourseWc);
  } catch {
    if (articleAfficheWc !== titre) return;
    articleWc.replaceChildren();
    document.getElementById('wc-erreur-article').hidden = false;
  }
}

function texteWc(classe, contenu, balise = 'p') {
  const element = document.createElement(balise);
  element.className = classe;
  element.textContent = contenu;
  return element;
}

// Manches : le lien choisi reste surligné, et le bandeau le rappelle.
function marquerChoixWc(vue) {
  for (const lien of articleWc.querySelectorAll('.choisi, .touche')) lien.classList.remove('choisi', 'touche');
  if (!vue.choix?.titre) return;
  for (const lien of articleWc.querySelectorAll('[data-titre]')) {
    if (lien.dataset.titre !== vue.choix.titre) continue;
    lien.classList.add('choisi');
    // La section du lien choisi reste ouverte, avec celles qui la contiennent.
    for (let section = lien.closest('details'); section; section = section.parentElement.closest('details')) {
      section.open = true;
    }
  }
}

const MESSAGES_REFUS = {
  absent: 'Ce lien ne mène pas à un article. Essaie un autre.',
  indisponible: 'Wikipédia ne répond pas, réessaie.',
};

function texteEtatWc(vue) {
  if (vue.refus) return MESSAGES_REFUS[vue.refus] ?? '';
  if (vue.revelation) return 'Tout le monde avance…';
  if (vue.enVerification) return 'Vérification du lien…';
  if (vue.format === 'manches') {
    if (vue.choix?.retour) return 'Ton choix : retour en arrière';
    if (vue.choix) return `Ton choix : ${vue.choix.titre}`;
    return 'Touche le lien qui te rapproche';
  }
  return `${vue.nbArrives}/${vue.nbCoureurs} arrivé${vue.nbArrives > 1 ? 's' : ''}`;
}

function afficherCourseWc(vue) {
  vueCourseWc = vue;
  boutonCibleWc.textContent = `🎯 ${vue.cible.titre}${vue.cible.extrait ? ' ⓘ' : ''}`;
  extraitCibleWc.textContent = vue.cible.extrait;
  if (!vue.cible.extrait) extraitCibleWc.hidden = true;
  document.getElementById('wc-clics').textContent = `${vue.clics} clic${vue.clics > 1 ? 's' : ''}`;
  document.getElementById('wc-manche').textContent = vue.format === 'manches' ? `Manche ${vue.manche}/${vue.mancheMax}` : '';
  lancerChronoWc(document.getElementById('wc-chrono'), vue.tempsRestantMs);
  const etat = document.getElementById('wc-etat');
  etat.textContent = texteEtatWc(vue);
  etat.classList.toggle('refus', Boolean(vue.refus));
  const retour = document.getElementById('bouton-retour-wc');
  retour.disabled = !vue.peutRetour || vue.revelation || vue.enVerification;
  retour.classList.toggle('choisi', Boolean(vue.choix?.retour));
  document.getElementById('bouton-terminer-course-wc').hidden = !vue.estHote;
  if (vue.page !== articleAfficheWc) chargerArticle(vue.page);
  else {
    articleWc.classList.toggle('en-attente', vue.enVerification && vue.format === 'libre');
    marquerChoixWc(vue);
  }
}

function afficherAnnonceWc(vue) {
  clearInterval(intervalleChronoWc);
  extraitCibleWc.hidden = true;
  articleAfficheWc = null;
  vueCourseWc = null;
  document.getElementById('wc-numero-annonce').textContent = `Course ${vue.numero}/${vue.total}`;
  document.getElementById('wc-depart-annonce').textContent = vue.depart ?? 'Au hasard…';
  document.getElementById('wc-cible-annonce').textContent = vue.cible.titre;
  document.getElementById('wc-extrait-annonce').textContent = vue.cible.extrait;
  document.getElementById('wc-format-annonce').textContent = vue.format === 'libre'
    ? 'Course libre : clique à ton rythme, le premier arrivé gagne.'
    : 'En manches : un seul lien par manche, révélés en même temps.';
}

function afficherArriveWc(vue) {
  vueCourseWc = null;
  articleAfficheWc = null;
  const quand = vue.rangArrivee ? texteRang(vue.rangArrivee) : `manche ${vue.arriveeManche}`;
  document.getElementById('wc-resultat-arrive').textContent = `Arrivé ! ${quand}, en ${vue.clics} clic${vue.clics > 1 ? 's' : ''}`;
  document.getElementById('wc-attente-arrive').textContent = `${vue.nbArrives}/${vue.nbCoureurs} arrivé${vue.nbArrives > 1 ? 's' : ''}. Regarde la TV !`;
  lancerChronoWc(document.getElementById('wc-chrono-arrive'), vue.tempsRestantMs);
  document.getElementById('bouton-terminer-arrive-wc').hidden = !vue.estHote;
}

function afficherBilanWc(vue) {
  clearInterval(intervalleChronoWc);
  vueCourseWc = null;
  articleAfficheWc = null;
  const resultat = document.getElementById('wc-resultat');
  if (!vue.participe) resultat.textContent = 'Tu rejoins la prochaine course.';
  else resultat.textContent = vue.arrive ? `Arrivé à « ${vue.cible.titre} » ! +${vue.points}` : `Pas arrivé à « ${vue.cible.titre} ».`;
  resultat.classList.toggle('juste', vue.arrive);
  document.getElementById('wc-parcours').textContent = vue.pages.length
    ? `${vue.pages.join(' → ')} (${vue.clics} clic${vue.clics > 1 ? 's' : ''})`
    : '';
  document.getElementById('score-wc').textContent = vue.score;
  document.getElementById('rang-wc').textContent = texteRang(vue.rang);
  document.getElementById('bouton-suivant-wc').hidden = !vue.estHote;
}

// Format, départ et niveaux ; le nombre de courses et le temps sont les options communes.
function remplirReglagesWc(reglages) {
  const { valeurs, options } = reglages;
  document.getElementById('wc-choix-format').replaceChildren(...options.formats.map(({ id, libelle }) => (
    boutonReglage(libelle, id === valeurs.format, id === valeurs.format ? null : () => envoyerReglages({ format: id }))
  )));
  document.getElementById('wc-choix-depart').replaceChildren(
    boutonReglage('Commun', !valeurs.departHasard, valeurs.departHasard ? () => envoyerReglages({ departHasard: false }) : null),
    boutonReglage('Au hasard', valeurs.departHasard, valeurs.departHasard ? null : () => envoyerReglages({ departHasard: true })),
  );
  document.getElementById('wc-choix-niveaux').replaceChildren(
    ...boutonsACocher(options.niveaux, valeurs.niveaux, 'niveaux'),
  );
}

modesJoueur['wiki-course'] = {
  remplirReglages: remplirReglagesWc,
  annonce: afficherAnnonceWc,
  course: afficherCourseWc,
  arrive: afficherArriveWc,
  bilan: afficherBilanWc,
};
