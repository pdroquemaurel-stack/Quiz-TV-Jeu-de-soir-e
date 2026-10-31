# Tranche 35 — Wiki course

Mini-spec de la tranche 35, troisième des 8 nouveaux jeux (tranches 33 à 40, prioritaires). Validée par Paul le 31/10/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md`.

Tous les joueurs partent de la même page Wikipédia et doivent atteindre une page cible en ne cliquant que sur les liens internes des articles. La TV affiche la cible et où en est chacun ; chaque téléphone affiche l'article sur lequel se trouve son joueur.

Deux formats, au choix de l'hôte :

- **Course libre** : chacun clique à son rythme, le premier arrivé gagne.
- **Manches** : à chaque manche, chacun choisit un seul lien en 10, 15 ou 20 s ; tous les déplacements sont révélés en même temps sur la TV. 15 manches au plus.


## Règles

- **2 à 10 joueurs**.
- **Courses** : une partie compte **3 courses** (1, 3 ou 5, option de l'hôte), chacune avec un nouveau couple départ → cible.
- **Annonce** (8 s, l'hôte peut passer plus tôt) : la TV présente le départ et la cible (titre, photo et première phrase de l'article cible). Les téléphones affichent « Départ : Puddlage → Cible : Pizza ».
- **Course** : chaque téléphone affiche l'article courant de son joueur. Seuls les liens vers d'autres articles sont cliquables : pas les notes, les liens rouges, les pages d'aide, les fichiers ni les liens externes.
  - Un clic sur un lien compte **1 clic**. Le bouton **« Retour »** revient à la page précédente du parcours et compte aussi 1 clic.
  - Le serveur vérifie que le lien figure bien sur l'article courant (voir « Wikipédia »), puis enregistre le déplacement.
  - **Arrivée** : quand la page atteinte est la cible (redirections suivies : « Pizzas » mène à « Pizza »). Le joueur arrivé voit « Arrivé ! » et suit la course des autres.
- **Course libre** (**5 min**, ou 3 ou 8 min, ou **sans limite de temps**, option de l'hôte) : chacun avance quand il veut. La course s'arrête quand tous les joueurs connectés sont arrivés, à la fin du chrono (s'il y en a un), ou sur « Terminer la course » de l'hôte. Sans limite, ni la TV ni les téléphones n'affichent de chrono.
- **Manches** (**15 s** par manche, ou 10 ou 20 s, option de l'hôte) : chacun touche un lien ; tant que la manche dure, il peut changer d'avis. À la fin de la manche, tous les déplacements s'appliquent d'un coup, la TV les montre 3 s, puis la manche suivante commence. Un joueur qui n'a rien choisi reste sur place. La course s'arrête quand tous les joueurs connectés sont arrivés, après la manche 15, ou sur « Terminer la course ».
- **Bilan** (20 s, l'hôte peut passer plus tôt avec « Suivant ») : le parcours complet de chaque joueur (Puddlage → Fer → Italie → Pizza), ses clics, ses points, puis le classement. Ensuite l'annonce de la course suivante, ou le podium.

### Points

| Situation | Points |
|---|---|
| Course libre, arrivé r-ième | **1 000 − 150 × (r − 1)**, 250 au moins (1 000, 850, 700, 550, 400, 250, 250…) |
| Manches, arrivé à la manche k | **1 000 − 50 × (k − 1)** (1 000 à la manche 1, 300 à la manche 15) ; arrivés à la même manche : mêmes points |
| Pas arrivé | 0 |

- Le rang d'arrivée en course libre se lit à l'heure du serveur. Égalité à la milliseconde : même rang.
- Classement avec ex æquo comme partout (1, 1, 3).
- Les points sont ajoutés au bilan : si l'hôte termine pendant une course, elle n'est pas comptée.


## Phases et chronos

`etatMode.phase` vaut `annonce`, `course`, `revelation` (format manches) ou `bilan`.

| Phase | Durée | Fin |
|---|---|---|
| `annonce` | 8 s | Fin du chrono ou « Suivant » de l'hôte → `course` |
| `course` (libre) | 5 min (180, 300 ou 480 s, ou aucune : `temps` vaut 0 et l'échéance `null`) | Tous les joueurs connectés arrivés, fin du chrono ou « Terminer la course » → `bilan` |
| `course` (manches) | 15 s (10, 15 ou 20 s) par manche | Fin de la manche, ou tous les joueurs connectés non arrivés ont choisi → `revelation` |
| `revelation` (manches) | 3 s | Manche suivante (`course`), ou `bilan` si tous sont arrivés, après la manche 15 ou sur « Terminer la course » |
| `bilan` | 20 s | Fin du chrono ou « Suivant » : `annonce` de la course suivante, ou podium |

Une course libre dure au plus 5 min 30 ; une course en manches à 15 s, au plus 4 min 30. Une partie de 3 courses dure une quinzaine de minutes.


## Wikipédia

- **Les pages viennent de Wikipédia en français**, API publique, sans clé. Chaque requête du serveur porte un `User-Agent` qui nomme Quiz TV, comme le demandent les règles de Wikimedia.
- **La cible** : le serveur lit son résumé (`/api/rest_v1/page/summary/<titre>` : titre, première phrase, miniature) à l'annonce, pour la TV et les téléphones.
- **L'article affiché sur le téléphone** : le **téléphone** le charge lui-même (`/api/rest_v1/page/mobile-html/<titre>`, que Wikipédia autorise depuis une autre page) et le nettoie avant de l'afficher :
  - il ne garde que les titres de section, les paragraphes, les listes et les liens. Pas d'images, pas de tableaux (infobox comprise), pas de notes ;
  - il range l'article **en plan** (retours de Paul du 31/10/2026) : l'introduction en clair, puis chaque section repliée, avec son titre et son nombre de liens (« ▸ Histoire 34 liens »). Un toucher ouvre la section, où ses sous-sections sont repliées à leur tour. Les sections sans lien, et « Notes et références », « Bibliographie », « Liens externes », disparaissent du plan. À chaque nouvelle page, tout est replié ;
  - tout est reconstruit élément par élément (`DOMParser`, `textContent`, `createElement`), jamais avec `innerHTML` : aucun script ni style de Wikipédia n'entre dans la page ;
  - un lien n'est cliquable que s'il pointe vers un article (`./Titre`, sans `:` dans le titre ni `#` seul) et n'est pas un lien rouge.
  Ainsi, ni Render ni le serveur ne relaient les pages (600 à 800 Ko chacune, environ 150 Ko compressées).
- **La vérification d'un clic** : le serveur demande à Wikipédia si l'article courant a un lien vers le titre cliqué (`action=query&prop=links&plnamespace=0&pltitles=<titre>` : une petite réponse, même pour un article de 3 000 liens) et l'**accepte seulement si c'est le cas**. Il résout ensuite les redirections (`action=query&redirects`) pour enregistrer le vrai titre de la page atteinte. Les réponses sont gardées en mémoire (`server/wikipedia.js`) : un même clic ne se redemande pas.
- **Pas d'iframe**, et le téléphone n'avance jamais seul : il affiche une nouvelle page seulement quand le serveur l'a enregistrée dans son état.
- **Départ au hasard** (option de l'hôte, décochée par défaut) : au lieu du départ du couple, le serveur demande un article au hasard (`/api/rest_v1/page/random/summary`), en écartant les pages d'homonymie et celles de moins de 20 liens.


## `etatMode` sur le serveur

```json
{
  "phase": "course",
  "format": "manches",
  "courses": ["...couples tirés au lancement..."],
  "indexCourse": 0,
  "cible": { "titre": "Pizza", "extrait": "La pizza est…", "image": "https://…" },
  "depart": "Puddlage",
  "manche": 4,
  "debutPhaseA": 1758641190000,
  "parcours": {
    "j_4d2e9f": { "pages": ["Puddlage", "Fer", "Italie"], "clics": 2, "choix": "Pizza", "arriveeA": null, "arriveeManche": null }
  }
}
```

- `courses` : couples départ → cible tirés au lancement, sans répétition, parmi les niveaux cochés (`tirerQuestions` de `commun.js` : d'abord les jamais vus).
- `parcours[id].pages` : toutes les pages visitées, dans l'ordre, retours compris (un retour ajoute la page précédente à la liste). La dernière est la page courante.
- `choix` : en manches, le lien choisi pendant la manche en cours (`null` sinon), appliqué à la fin de la manche.
- `arriveeA` (course libre, heure du serveur) ou `arriveeManche` (manches) : `null` tant que le joueur n'est pas arrivé.
- Les points de la course : fonction pure `pointsDeLaCourse(etatMode)`.


## Événements

Aucun nouvel événement : tout passe par `joueur:repondre`.

| Événement | Contenu à la Wiki course |
|---|---|
| `joueur:repondre` (lien) | En `course` : `{ aller: "Titre" }`. Course libre : vérifié puis appliqué tout de suite. Manches : vérifié puis gardé comme `choix` (remplace le précédent) |
| `joueur:repondre` (retour) | En `course` : `{ retour: true }`, refusé sur la page de départ. Course libre : appliqué. Manches : devient le `choix` |
| `hote:suivant` | Pendant l'annonce ou le bilan : passer à la suite. Pendant la course : « Terminer la course » → `bilan` |
| `hote:reglerMode` | En salle d'attente : `{ format: "libre" \| "manches", longueur: 1 \| 3 \| 5, temps: 180 \| 300 \| 480 (libre) ou 10 \| 15 \| 20 (manches), departHasard: true \| false, niveaux: [...] }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

Un clic refusé (lien absent de la page, joueur déjà arrivé, mauvaise phase) est ignoré ; le téléphone reçoit l'état inchangé et réaffiche la page courante.

Pendant la vérification d'un clic (deux requêtes à Wikipédia, environ 200 ms chacune), le serveur ne bloque rien : les autres clics sont traités. Un second clic du même joueur avant la fin de la vérification est ignoré. Le clic garde l'heure où il a été reçu : en course libre, c'est elle qui compte pour l'arrivée, pas celle de la réponse de Wikipédia.

Les demandes à Wikipédia partent de la fonction `synchroniser(salle, rappel)` du mode, que `server/index.js` appelle à chaque diffusion pendant la partie (comme le minuteur). Quand une réponse change l'état, le mode appelle `rappel(salle)` : `index.js` vérifie la fin anticipée (sauf en pause) et diffuse. Une réponse arrivée après la fin de la course est ignorée.


## Le secret

Rien à cacher : la cible est connue de tous. Seule précaution : en manches, **la TV et les autres téléphones ne voient pas les choix** avant la révélation (on ne copie pas le voisin). En course libre, la TV montre la page courante de chacun.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `annonce` | `phase`, `numero`, `total` (course 2/3), `format`, `depart`, `cible: { titre, extrait, image }` |
| `course` | `phase`, `numero`, `total`, `format`, `depart`, `cible`, `manche` (manches), `tempsRestantMs`, `joueurs: [{ id, page, clics, arrive, rangArrivee, aChoisi }]` (`page` : la page courante ; `aChoisi` en manches seulement, jamais le choix lui-même) |
| `revelation` | Idem, plus `deplacements: [{ id, de, vers }]` de la manche |
| `bilan` | `phase`, `numero`, `total`, `cible`, `parcours: [{ id, pages, clics, arrive, points }]` (dans l'ordre d'arrivée, puis les non arrivés), `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Données |
|---|---|
| `annonce` | `numero`, `total`, `format`, `depart`, `cible: { titre, extrait }` |
| `course` | `cible: { titre, extrait }`, `page` (sa page courante), `clics`, `peutRetour`, `format`, `manche`, `choix` (manches, son propre choix), `tempsRestantMs`, `nbArrives` |
| `arrive` | `clics`, `rangArrivee` ou `arriveeManche`, `nbArrives`, `tempsRestantMs` |
| `bilan` | `pages` (son parcours), `clics`, `points`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de partie : comme au quiz |


## Écrans

### TV (1920×1080)

- **Annonce** : « Course 2/3 », « Départ : Puddlage », une grande flèche, et la carte de la cible : sa miniature, son titre en très grand, sa première phrase. Le format en sous-titre (« Course libre, 5 min » ou « Manches de 15 s »).
- **Course** : en haut, la cible (miniature et titre) et le chrono avec sa barre (en manches : « Manche 4/15 » et le chrono de la manche). Au centre, une ligne par joueur : sa pastille, sa page courante en grand (« Italie »), ses clics. Arrivé : la ligne passe en vert avec « 1er ! ». En manches, une coche à côté des joueurs qui ont choisi.
- **Révélation** (manches) : chaque ligne montre « Fer → Italie » un instant (déplacement simple, opacité).
- **Bilan** : les parcours, un par ligne, en chaînes de titres (« Puddlage → Fer → Italie → Pizza », coupée avec « … » au milieu si elle est trop longue), avec clics et points ; puis le classement.
- **Pas d'iframe ni d'article sur la TV** : seulement les titres et la miniature de la cible.

### Téléphone (portrait)

- **Annonce** : « Départ : Puddlage », « Cible : Pizza » en grand, la première phrase de la cible.
- **Course** : un bandeau fixe en haut : « 🎯 Pizza ⓘ », le chrono, « 3 clics », le bouton « Retour ». Un toucher sur la cible montre ou cache sa première phrase (« La pizza est une recette de cuisine italienne… »), pour savoir vers où aller. Pour l'hôte, « Terminer la course » en bas de l'article (et sur l'écran « Arrivé ! »). En dessous, l'article courant (son titre, puis le texte nettoyé), que l'on fait défiler. Les liens cliquables sont soulignés et assez espacés pour le doigt.
  - Course libre : un toucher sur un lien affiche « Chargement… » sur le bandeau et grise l'article jusqu'à ce que le serveur ait enregistré la page.
  - Manches : un toucher surligne le lien choisi ; le bandeau affiche « Ton choix : Italie » ; toucher un autre lien change le choix. À la révélation, la nouvelle page s'affiche.
  - Article qui ne se charge pas : « Page indisponible, réessayer » ; le joueur peut toujours faire « Retour ».
- **Arrivé** : « Arrivé ! 1er en 6 clics », le nombre d'arrivés, le chrono restant.
- **Bilan** : son parcours, ses points, score et rang ; « Suivant » pour l'hôte.


## Sons

| Moment | Détection | Son |
|---|---|---|
| Annonce | `nouvelleEtape` en phase `annonce` | `etape` |
| Début de course, début de manche | `nouvelleEtape` en phase `course` | `lancement` |
| Un joueur arrive | Un `arrive` passe à vrai | `victoire` |
| Révélation | `nouvelleEtape` en phase `revelation` | `etape` |
| Bilan | `nouvelleEtape` en phase `bilan` | `etape` |
| Tic-tac, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js`. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.


## Cas limites

| Situation | Comportement |
|---|---|
| Wikipédia ne répond pas à la vérification d'un clic (5 s) | Clic refusé ; le téléphone affiche « Wikipédia ne répond pas, réessaie ». |
| Le résumé de la cible ne se charge pas à l'annonce | La TV affiche le titre seul. |
| Départ au hasard introuvable (3 essais) | On prend le départ du couple. |
| Joueur déconnecté pendant la course | Sa position est gardée ; s'il revient, il retrouve sa page. En course libre, la course n'attend pas les joueurs déconnectés pour s'arrêter. En manches, il ne choisit rien et reste sur place. |
| Arrivée en cours de partie | 0 point, `attente_question` jusqu'à la course suivante, où il part avec les autres. |
| Le joueur clique sur un lien vers la page où il est déjà | Refusé (aucun clic compté). |
| Lien vers une page d'homonymie | Accepté : c'est un article comme un autre. |
| La page de départ redirige | Le serveur enregistre le titre après redirection. |
| Moins de 2 joueurs connectés en cours de partie | La partie continue. « Rejouer » est désactivé tant que le compte n'y est pas. |
| L'hôte termine pendant une course | Podium avec les scores actuels, la course en cours n'est pas comptée. |
| Plus assez de couples inédits | On réautorise les plus anciens, comme au quiz. |
| Un joueur ouvre Wikipédia à côté pour chercher | Impossible à empêcher : règle d'honneur, rappelée dans la règle courte. |


## Contenu

### Catalogue `data/wiki-course.json`

```json
{ "id": "wc-puddlage-pizza", "depart": "Puddlage", "cible": "Pizza", "niveau": 1 }
```

- `id` : `wc-` suivi de minuscules, chiffres et tirets, unique.
- `depart`, `cible` : titres exacts d'articles de Wikipédia en français, sans redirection ni homonymie.
- `niveau` : 1 (Facile : cible très connue et très liée, comme « France », « Chat », « Pizza ») ou 2 (Difficile : cible plus précise, comme « Tour de France 1989 », « Ornithorynque »).
- Les départs sont des articles surprenants mais pas absurdes (« Puddlage », « Moustache », « Raclette »), toujours à plus de 20 liens.
- Environ **40 couples**, la moitié de chaque niveau, rédigés par Claude et relus par Paul. Un même départ ou une même cible peut servir dans plusieurs couples.

### Script `scripts/verifier-wiki-course.js`

- `id` au format `wc-…`, unique ; seuls les champs ci-dessus ;
- `depart` et `cible` : chaînes non vides, sans espace au bord, différentes ;
- `niveau` : 1 ou 2 ; pas deux couples identiques ;
- au moins 10 couples par niveau ;
- avec `--wikipedia` (comme `--deezer` du Blind test) : vérifie en ligne que chaque titre existe, n'est ni une redirection ni une homonymie, et que chaque départ a au moins 20 liens ;
- affichage : le nombre de couples par niveau.


## Tests automatiques

Les appels à Wikipédia passent par une fonction que les tests remplacent par un faux Wikipédia (quelques pages et leurs liens) : aucun test ne va sur Internet.

- Le registre contient `wiki-course` avec tout le contrat ; refusé à 1 joueur, accepté à 2.
- `hote:reglerMode` : format, longueur 1, 3, 5, temps selon le format, `departHasard`, niveaux (pas de liste vide) ; autres valeurs refusées.
- Clic : accepté si le lien est sur la page courante, refusé sinon ; redirection résolue ; clic vers la page courante refusé ; second clic pendant une vérification ignoré ; Wikipédia en panne → refusé.
- Retour : revient à la page précédente et compte 1 clic ; refusé sur la page de départ.
- Course libre : arrivée enregistrée à l'heure du serveur ; tous arrivés → `bilan` ; fin du chrono → `bilan` ; `hote:suivant` pendant la course → `bilan`, refusé d'un autre joueur.
- Manches : le choix remplace le précédent ; rien d'appliqué avant la fin de la manche ; tous ont choisi → `revelation` ; sans choix, le joueur reste sur place ; arrêt après la manche 15.
- Points : rangs de la course libre (1 000, 850… 250 au moins) ; manches (1 000 − 50 × (k − 1), mêmes points à la même manche) ; 0 si pas arrivé ; ajoutés au bilan seulement.
- Secret : en manches, `vueTv` et la vue des autres joueurs ne contiennent jamais le `choix` d'un joueur avant la révélation.
- Tirage : couples distincts, parmi les niveaux cochés.
- `verifier-wiki-course.js` : id en double ou mal formé, champ en trop, départ égal à la cible, niveau hors 1–2, couple en double ; le vrai catalogue passe.


## Modifications à reporter

- `server/modes/wiki-course.js` et ses tests ; `server/wikipedia.js` (résumé, liens d'une page, redirections, article au hasard, cache) ; `server/modes/index.js` : le mode entre dans le registre ; `server/index.js` : l'appel de `synchroniser` à chaque diffusion.
- `public/tv/index.html`, `public/tv/modes/wiki-course.js` et `.css` ; `public/joueur/index.html`, `public/joueur/modes/wiki-course.js` (chargement et nettoyage de l'article), styles dans `joueur.css`.
- `data/wiki-course.json`, `scripts/verifier-wiki-course.js` et ses tests.
- `docs/sons.md` : les lignes du mode. `docs/spec.md` : « Modes de jeu supplémentaires », tableau des options, tranche 35, et l'exception « article Wikipédia chargé par le téléphone » dans les contraintes. `CLAUDE.md` : structure et commandes. `admin.html` : la fiche du mode (liste `JEUX`).


## Test de la tranche (à faire toi-même)

Sur Render (les téléphones ne joignent pas le serveur local depuis le PC d'entreprise), TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev` :

1. **Choix.** À 1 joueur, « Wiki course » est grisé ; à 2, il s'active. Options : format, 1, 3 ou 5 courses, le temps (qui change selon le format), départ au hasard, niveaux.
2. **Annonce.** Lancer en course libre. La TV montre le départ et la carte de la cible ; les téléphones aussi.
3. **Course libre.** Chaque téléphone affiche l'article de départ, lisible, sans images ni tableaux. Toucher un lien : la nouvelle page s'affiche, « 1 clic », et la TV montre la nouvelle page du joueur. « Retour » ramène en arrière et compte un clic. Une note ou un lien rouge ne réagit pas.
4. **Arrivée.** Atteindre la cible : « Arrivé ! » sur le téléphone, la ligne verte et le son de victoire sur la TV. Quand tous sont arrivés, le bilan s'affiche.
5. **Bilan.** Les parcours complets, clics et points (1 000, 850…), puis le classement.
6. **Manches.** Rejouer en manches de 10 s. Toucher un lien le surligne ; en toucher un autre change le choix ; la TV ne montre qu'une coche. À la fin de la manche, la TV montre les déplacements de tous et les téléphones la nouvelle page. Un joueur qui ne choisit rien reste sur place.
7. **Terminer la course.** Pendant une course, « Terminer la course » de l'hôte mène au bilan.
8. **Départ au hasard.** Avec l'option cochée, le départ est un article inattendu, différent à chaque course.
9. **Déconnexion.** Couper un joueur 15 s pendant la course : il retrouve sa page à son retour.
10. **Fin.** Après la dernière course (ou « Terminer »), podium, médailles et points globaux comme d'habitude.


## Choix validés

Repris de la demande du 06/10/2026 :

1. **Liens internes seulement**, départ commun ou au hasard en option.
2. **Deux formats** : course libre ou manches de 10, 15 ou 20 s, 15 manches au plus.
3. **API publique de Wikipédia FR**, pages affichées dans l'app sans iframe, clics relayés par le serveur, parcours complets à la fin.

Proposés par la mini-spec et validés par Paul le 31/10/2026 :

4. **Le téléphone charge et nettoie l'article lui-même** ; le serveur ne relaie que les clics et les vérifie avec la liste des liens de la page. Ça évite de faire passer 600 Ko par page par Render, et le serveur reste seul juge.
5. **Article sans images ni tableaux** (infobox comprise) : plus léger et plus lisible ; on perd les liens de l'infobox.
6. **« Retour » autorisé**, et il compte un clic.
7. **Points par rang d'arrivée** (course libre) ou par manche d'arrivée (manches) ; le nombre de clics ne compte pas dans les points, il s'affiche seulement.
8. **3 courses par partie** (1, 3 ou 5), **5 min** par course libre (3, 5 ou 8), **15 s** par manche (10, 15 ou 20).
9. **La TV montre la page courante de chacun** en course libre ; en manches, seulement qui a choisi, jusqu'à la révélation.
10. **Couples départ → cible rédigés à la main**, environ 40, deux niveaux ; départ au hasard décoché par défaut.
11. **2 joueurs minimum**.
12. **Le joueur arrivé en cours de partie** attend la course suivante.

Retours de Paul du 31/10/2026, le jeu étant trop dur :

13. **L'article replié en plan**, sections ouvertes à la demande.
14. **Revoir la cible** d'un toucher dans le bandeau : sa première phrase (`cible.extrait` dans la vue du téléphone).
15. **Course libre sans limite de temps**, en plus de 3, 5 et 8 min.
