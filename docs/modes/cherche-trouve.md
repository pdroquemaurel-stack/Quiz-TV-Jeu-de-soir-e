# Tranche 38 — Cherche & trouve

Mini-spec de la tranche 38, cinquième des nouveaux jeux prioritaires. Écrite le 01/11/2026 ; Paul a demandé de tout faire d'un coup avec OpenSeadragon : les choix sont ceux de Claude (voir « Choix faits » à la fin), à revoir après son test. Elle complète `docs/spec.md`.

La demande parlait d'un jeu autonome existant à brancher. Il n'a été trouvé ni sur le PC ni dans les dépôts GitHub publics de Paul : le jeu est donc écrit de zéro, avec des **scènes générées par un script**.

Une grande scène fourmille de personnages, d'animaux et d'objets (la plage, le zoo, le stade). Chacun l'explore sur son téléphone, en zoomant et en glissant avec les doigts (OpenSeadragon), pour trouver le détail demandé : « le crabe qui porte une couronne ». Des leurres ressemblent au détail (un crabe avec un chapeau, une pieuvre avec une couronne). Le premier à toucher le bon endroit marque le plus.


## Règles

- **1 à 10 joueurs** (on peut jouer seul, comme au GéoQuiz).
- **Une scène par partie**, tirée au sort parmi celles du catalogue (les moins vues d'abord).
- **6 détails** à trouver (4, 6 ou 8, option de l'hôte), **un par manche**, tirés au sort parmi ceux de la scène.
- **Annonce** (8 s, l'hôte peut passer plus tôt) : le nom de la scène et la règle. Les téléphones chargent l'image pendant ce temps.
- **Recherche** (**60 s**, ou 45 ou 90, option de l'hôte) : la TV et les téléphones montrent le détail à trouver (les deux emojis et la phrase). Chacun explore la scène sur son téléphone et **touche** l'endroit où il pense voir le détail.
  - **Bon endroit** (à moins de 60 px du centre du détail, dans les coordonnées de l'image) : trouvé, le temps est noté par le serveur. Le joueur ne peut plus toucher pendant cette manche.
  - **Mauvais endroit** : un tap raté de plus. Un nouveau toucher n'est pris qu'une seconde après le précédent, pour qu'on ne puisse pas tapoter partout.
  - La recherche s'arrête quand tous les joueurs connectés ont trouvé, ou à la fin du chrono.
- **Révélation** (10 s, l'hôte peut passer plus tôt) : la TV zoome sur le détail dans la scène et l'entoure ; elle montre qui a trouvé et en combien de temps. Les téléphones zooment aussi sur le détail.
- Après le dernier détail : podium commun, médailles et points globaux.

### Points

| Situation | Points de la manche |
|---|---|
| Trouvé en `s` secondes, avec `r` taps ratés | `max(0, max(200, 1000 − 5 × s) − 100 × r)` |
| Pas trouvé | 0 |

- Trouvé tout de suite sans erreur : 1 000 ; en 30 s : 850 ; après 160 s ou plus : 200 (le plancher).
- Les secondes sont entières (arrondies en dessous), mesurées par le serveur depuis le début de la recherche.
- Classement avec ex æquo comme partout.


## Phases et chronos

`etatMode.phase` vaut `annonce`, `recherche` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `annonce` | 8 s | Fin du chrono ou « Suivant » → `recherche` du premier détail |
| `recherche` | 60 s (45, 60 ou 90) | Tous les joueurs connectés de la manche ont trouvé, ou fin du chrono → `revelation` |
| `revelation` | 10 s | Fin du chrono ou « Suivant » → `recherche` du détail suivant, ou podium |


## Les scènes

- Générées par `scripts/construire-cherche-trouve.js` (aucune image à télécharger ni à acheter) : un fond dessiné (la mer et le sable, les enclos et les allées, la pelouse et les tribunes) et environ 450 emojis posés sur une grille avec un peu de hasard. Le tirage est **fixé par une graine** : relancer le script redonne les mêmes scènes.
- Image SVG de 3 600 × 2 400 px dans `public/cherche-trouve/<scène>.svg`. Les emojis sont dessinés par la police du téléphone ou de la TV : ils changent un peu d'allure d'un appareil à l'autre, jamais de place.
- Chaque **détail** est un emoji de base portant un petit **accessoire** (🦀 + 👑). Il est **unique** dans la scène ; des **leurres** reprennent la même base avec un autre accessoire, ou le même accessoire sur une autre base.
- 10 détails par scène, 3 scènes : la plage, le zoo, le stade.

### Le secret

- Le serveur seul connaît la position des détails (`data/cherche-trouve.json`). Le téléphone envoie la position touchée ; le serveur répond trouvé ou raté. La position n'est envoyée qu'à la révélation.
- L'image SVG ne contient ni identifiant ni nom : rien ne distingue un détail d'un leurre, sinon son dessin. Un tricheur qui lirait le fichier SVG pourrait chercher la paire d'emojis ; c'est un jeu entre amis, on l'accepte.


## OpenSeadragon

- Bibliothèque de visionneuse d'images zoomables, **version 4.1.1**, chargée depuis cdnjs avec son empreinte (`integrity`), comme Leaflet pour le GéoQuiz. Si le CDN ne répond pas, seul ce mode est touché.
- Une seule image (`type: 'image'`), sans tuiles ni pyramide calculée sur le téléphone, sans les boutons de navigation (pas d'images à charger) : on zoome au pincement et au double toucher, on se déplace en glissant.
- Le toucher d'un joueur : un appui bref sans glisser (`canvas-click` avec `quick`). Le téléphone convertit la position en coordonnées de l'image et l'envoie ; il ne décide de rien.
- La TV utilise aussi OpenSeadragon, seulement à la révélation, pour zoomer sur le détail.


## `etatMode` sur le serveur

```json
{
  "phase": "recherche",
  "scene": { "id": "plage", "nom": "La plage", "image": "/cherche-trouve/plage.svg", "largeur": 3600, "hauteur": 2400 },
  "details": ["...tirés au lancement..."],
  "indexDetail": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_a", "j_b"],
  "reponses": { "j_a": { "trouveA": 1758641202000, "rates": 1, "dernierToucherA": 1758641202000 } }
}
```

Points de la manche : fonction pure `pointsDetail(ms, rates)`.


## Événements

| Événement | Contenu |
|---|---|
| `joueur:repondre` | En `recherche` : `{ x, y }`, la position touchée en pixels de l'image (nombres finis, dans l'image). Refusé hors recherche, après avoir trouvé, ou moins d'une seconde après le toucher précédent |
| `hote:suivant` | Pendant l'annonce ou la révélation |
| `hote:reglerMode` | `{ longueur: 4 \| 6 \| 8, temps: 45 \| 60 \| 90 }` (options communes) |


## Ce que reçoivent la TV et les téléphones

| Phase | TV | Téléphone |
|---|---|---|
| `annonce` | `scene: { nom, image, largeur, hauteur }`, `total` | `scene`, `total` |
| `recherche` | `numero`, `total`, `detail: { base, accessoire, texte }`, `tempsRestantMs`, `ontTrouve: [id]` | Idem pour le détail, plus `trouve`, `rates`, `dernierToucher: 'rate' \| 'trouve' \| null` ; jamais la position |
| `revelation` | Idem, plus `position: { x, y }`, `resultats: [{ id, secondes, rates, points }]`, `classement` | `position`, `trouve`, `secondes`, `points`, `score`, `rang` |


## Écrans

- **TV, annonce** : « Cherche & trouve », le nom de la scène en très grand, « 6 détails à trouver sur vos téléphones ».
- **TV, recherche** : le détail en très grand (les deux emojis, la phrase), le chrono et sa barre, les pastilles de ceux qui ont trouvé. Pas la scène : on la cherche sur son téléphone.
- **TV, révélation** : la scène dans OpenSeadragon, qui zoome sur le détail entouré ; à droite, qui a trouvé, en combien de secondes, ses points ; puis le classement.
- **Téléphone, recherche** : en haut, un bandeau avec le détail (emojis et phrase) et le chrono ; dessous, la scène en plein écran. « Raté ! » ou « Trouvé ! » s'affiche un instant après chaque toucher.
- **Téléphone, révélation** : la scène zoomée sur le détail, le résultat (« Trouvé en 12 s, +940 » ou « Pas trouvé »), score et rang ; « Suivant » pour l'hôte.


## Sons

| Moment | Son |
|---|---|
| Annonce | `etape` |
| Début d'une recherche | `etape` |
| Un joueur trouve (`ontTrouve` grandit) | `reponse` |
| Révélation | `revelation` |


## Cas limites

| Situation | Comportement |
|---|---|
| L'image ne se charge pas sur un téléphone | « Image indisponible, réessayer » ; le joueur peut réessayer, le chrono continue. |
| Joueur arrivé en cours de partie | Attend la manche suivante, puis joue. |
| Joueur déconnecté pendant la recherche | La manche ne l'attend pas ; il retrouve son écran s'il revient. |
| L'hôte termine | Podium avec les scores actuels. |


## Contenu

- `data/cherche-trouve.json` : `[{ id, nom, image, largeur, hauteur, details: [{ id, base, accessoire, texte, x, y }] }]`, écrit par le script.
- `scripts/construire-cherche-trouve.js` : écrit les SVG et le JSON depuis les thèmes décrits dans le script (fond, emojis figurants, détails et leurres), graine fixe.
- `scripts/verifier-cherche-trouve.js` : format, image présente, détails dans l'image et à plus de 150 px les uns des autres, ids uniques, au moins 8 détails par scène.


## Tests automatiques

- Registre, réglages (options communes), points (`pointsDetail` : 1 000, plancher 200, taps ratés, jamais négatif).
- Toucher : trouvé dans le rayon, raté au-delà, refusé hors image ou mal formé, refusé moins d'une seconde après, refusé après avoir trouvé.
- Phases : tous ont trouvé → révélation ; fin du chrono → révélation ; podium après le dernier détail.
- Secret : ni la TV ni les téléphones ne reçoivent la position avant la révélation.
- Le vérificateur et le vrai catalogue ; le script de construction redonne les mêmes scènes.


## Test de la partie (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080, joueurs sur de vrais téléphones :

1. Choisis « Cherche & trouve » ; options 4, 6 ou 8 détails, 45, 60 ou 90 s.
2. À l'annonce, la scène se charge sur les téléphones.
3. Pendant la recherche, zoome (pincer, double toucher) et glisse dans la scène ; touche un leurre : « Raté ! » ; touche le bon détail : « Trouvé ! », ta pastille apparaît sur la TV.
4. À la révélation, la TV zoome sur le détail entouré et montre les temps et les points.
5. Après le dernier détail, podium, médailles et points globaux.


## Choix faits

Par Claude, le 01/11/2026, sur demande de Paul de tout faire d'un coup :

1. **Scènes générées en emojis** par un script, faute de la version autonome et de ses illustrations.
2. **Un détail par manche**, tous les joueurs cherchent le même en même temps.
3. **La TV ne montre pas la scène pendant la recherche**, seulement le détail : on cherche sur son téléphone. Elle la montre zoomée à la révélation.
4. **Points jamais négatifs** dans une manche ; les taps ratés ne comptent que si l'on finit par trouver.
5. **Une seconde entre deux touchers** pris en compte.
6. **1 joueur minimum.**
7. **OpenSeadragon 4.1.1** depuis cdnjs, avec une seule image SVG, sans tuiles.
