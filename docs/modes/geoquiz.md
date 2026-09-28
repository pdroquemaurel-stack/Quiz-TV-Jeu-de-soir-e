# Tranche 26 — GéoQuiz

Mini-spec de la tranche 26. Elle a été validée le 28/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes (`docs/modes/estimation.md`) et sur `docs/sons.md`.

Inspiré de GeoGuessr : la TV montre la photo d'un lieu réel, chacun pose un pin sur une carte du monde sur son téléphone, le plus proche marque le plus.

La tranche se code en quatre temps, chacun testé (et commité avec ton accord) avant de passer au suivant :

1. **Contenu** : `scripts/construire-geoquiz.py`, la page d'aperçu, `data/geoquiz.json`, `data/geoquiz-exclus.json`, `scripts/verifier-geoquiz.js` et leurs tests.
2. **Serveur** : `server/modes/geoquiz.js` et ses tests. Le mode n'entre pas encore dans le registre : invisible en jeu.
3. **Téléphone** : le mode entre dans le registre (il apparaît dans le sélecteur de l'hôte), carte, pin, validation, résultat, réglage du nombre de manches.
4. **TV, sons et doc** : photo et chrono, carte des résultats, classement de la manche, crédits, sons, mise à jour de `spec.md`, `sons.md` et `CLAUDE.md`.

Entre les temps 3 et 4, la TV n'a pas encore d'écran GéoQuiz : on ne lance une partie qu'avec des onglets `?dev`, jamais en soirée.


## Règles

- **2 à 10 joueurs.**
- Une partie compte **3, 5 ou 10 manches**, au choix de l'hôte en salle d'attente (**5** par défaut).
- **Manche** : la TV affiche la photo d'un lieu réel en plein écran, le numéro de manche et un chrono de **60 s**. Chaque téléphone affiche une carte du monde.
- **Pin** : un tap sur la carte pose le pin, un nouveau tap le déplace. Glisser pour se déplacer, pincer pour zoomer.
- **Valider** : bouton en bas, grisé tant qu'aucun pin n'est posé. Une fois validé, le pin ne bouge plus et le téléphone affiche « En attente des autres joueurs… (x/n) ».
- **Fin du chrono** : le dernier pin posé est validé automatiquement par le serveur. Sans pin : 0 point.
- **Fin de manche** : quand tous les joueurs attendus encore connectés ont validé, ou à 0 s.
- **Joueurs attendus** : ceux connectés au début de la manche, comme dans les autres modes.
- **Révélation** : 20 s, puis manche suivante. L'hôte peut passer plus tôt (« Suivant »). Après la dernière : podium commun, médailles et points globaux comme les autres modes.

### Points

La distance est calculée **par le serveur** (formule de Haversine, rayon terrestre 6 371 km), entre le pin et le vrai lieu.

`points = arrondi(5000 × e^(−km / 2000))`

| Distance | Points |
|---|---|
| 0 km | 5 000 |
| 100 km | 4 756 |
| 500 km | 3 894 |
| 1 000 km | 3 033 |
| 2 000 km | 1 839 |
| 5 000 km | 410 |
| 10 000 km | 34 |
| 20 000 km | 0 |

- Aucun pin : 0 point.
- Le barème est plus haut que celui des autres modes (5 000 contre 1 000) : sans effet, les médailles se jouent au rang dans la partie.
- Classement avec ex æquo comme partout (1, 1, 3).

### Difficulté des lieux

Chaque lieu a une difficulté (1 facile, 2 moyen, 3 difficile), tirée de sa notoriété (voir « Contenu »). **Une partie mélange les trois**, dans l'ordre croissant (on commence par un lieu facile) :

| Manches | Faciles | Moyens | Difficiles |
|---|---|---|---|
| 3 | 1 | 1 | 1 |
| 5 | 2 | 2 | 1 |
| 10 | 4 | 4 | 2 |

Dans chaque difficulté : d'abord les lieux jamais vus, puis les plus anciennement vus (`tirerQuestions` de `commun.js`). S'il manque des lieux d'une difficulté, on complète avec la difficulté voisine. Jamais deux fois le même lieu dans une partie.


## Phases et chronos

`etatMode.phase` vaut `devinette` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `devinette` | 60 s | Tous les attendus ont validé, ou fin du chrono (les pins posés sont alors validés) |
| `revelation` | 20 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

Une manche dure donc environ 1 min 20, une partie de 5 manches moins de 7 minutes.


## `etatMode` sur le serveur

```json
{
  "phase": "devinette",
  "questions": ["...5 lieux tirés..."],
  "indexQuestion": 1,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d"],
  "pins": { "j_1b9c7d": { "lat": 48.2, "lng": 2.1 } },
  "reponses": { "j_8f3k2a": { "lat": 41.9, "lng": 12.5, "recuA": 1758641201000 } }
}
```

- `questions`, `indexQuestion`, `debutPhaseA`, `attendus`, `reponses` : les noms des autres modes, pour réutiliser les aides de `commun.js` (`questionCourante`, `tousOntRepondu`, `questionSuivanteOuPodium`, `echeanceDePhase`…). Une « question » est ici un lieu du catalogue.
- `pins` : le dernier pin **non validé** de chaque joueur (brouillon). À la fin du chrono, chaque brouillon d'un attendu sans réponse devient sa réponse.
- `reponses` : les pins **validés**. Seuls eux comptent.
- Distances et points ne sont pas stockés : `calculerResultats(reponses, lieu)` les calcule (fonction pure), comme l'Estimation.


## Événements

Aucun nouvel événement.

| Événement | Contenu en GéoQuiz |
|---|---|
| `joueur:repondre` | En `devinette` : `{ lat, lng, valide }`. `valide: false` à chaque tap (brouillon), `valide: true` avec « Valider ». Refusé si `lat` n'est pas un nombre entre −90 et 90, si `lng` n'est pas un nombre fini, si le joueur n'est pas attendu ou a déjà validé. `lng` est ramenée entre −180 et 180 (la carte peut « faire le tour » du monde). Ignoré en `revelation`. |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:reglerMode` | En salle d'attente : `{ manches: 3 | 5 | 10 }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

Pourquoi un brouillon envoyé à chaque tap : le pin doit être validé à la fin du chrono, et **le temps est mesuré par le serveur**, jamais par le téléphone. Le serveur doit donc déjà connaître le dernier pin. Un brouillon ne fait pas de diffusion (`diffuser`) : personne d'autre n'a besoin de le savoir.


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Coordonnées, nom et pays du lieu | **Personne avant la révélation**, ni la TV ni les téléphones. |
| Photo (URL) et crédit | La TV seulement, dès la devinette. Les téléphones ne chargent aucune photo (rien à télécharger en 4G). |
| Pin d'un joueur (brouillon ou validé) | Personne avant la révélation, sauf le joueur lui-même. La TV sait seulement qui a validé. |
| Distances, points | À la révélation. |

Les vues sont construites champ par champ, jamais en recopiant le lieu. Des tests le vérifient.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `devinette` | `phase`, `numero`, `total`, `photo: { image, auteur, licence }`, `ontRepondu` (liste d'`id`), `tempsRestantMs` |
| `revelation` | Idem, plus `lieu: { nom, pays, lat, lng }`, `resultats: [{ id, lat, lng, km, points }]` triés par distance, `sansReponse` (attendus sans pin), `photoSuivante` (pour le préchargement, absente après la dernière), puis `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Contenu |
|---|---|
| `devinette` | `numero`, `total`, `pin` (son brouillon, ou `null`) : le pin revient après un rechargement de la page |
| `pin_valide` | `pin`, `nbValides`, `nbAttendus` : « En attente des autres joueurs… (x/n) » |
| `resultat` | `lieu: { nom, pays, lat, lng }`, `pin` (ou `null`), `km` (ou `null`), `points`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche |


## Écrans

### Téléphone (portrait)

- **Devinette** : en haut « Manche 2/5 · Regarde la TV », la carte occupe tout le reste, bouton « Valider » en bas (grisé sans pin). Pin à la couleur du joueur.
- **Pin validé** : la carte reste visible avec le pin, **verrouillée** (plus de tap, de glisser ni de zoom), bandeau « En attente des autres joueurs… (x/n) ».
- **Résultat** : la carte montre le vrai lieu (marqueur **vert**), le pin du joueur et une **ligne pointillée** entre les deux, cadrée sur les deux. Dessous : nom du lieu et pays, distance (« 342 km », « moins de 1 km »), points gagnés, score total et rang. Sans pin : le vrai lieu seul et « Pas de pin, 0 point ».

### TV (1920×1080)

- **Devinette** : photo en plein écran (`object-fit: cover` sur un fond sombre, `contain` si l'image est plus haute que large), en haut « Manche 2/5 » et le chrono avec sa barre, en bas les pastilles des joueurs qui ont validé (`afficherAttenteReponses` de `tv.js`) et le crédit de la photo.
- **Révélation** :
  1. carte plein écran : le vrai lieu (marqueur vert, grand), le pin de chaque joueur (disque à sa couleur avec ses initiales), une ligne pointillée de chaque pin vers le vrai lieu, cadrage sur l'ensemble (zoom 6 au plus) ; en haut, le nom du lieu et le pays ;
  2. après 5 s, le classement de la manche arrive à droite par-dessus la carte : rang, joueur, distance, points de la manche, puis le classement général (flèches ▲▼ communes) ;
  3. en bas, le crédit de la photo, toujours visible.
- **Crédit** : « Photo : <auteur>, <licence>, Wikimedia Commons », à 40 px (règle de lisibilité de la TV), sur une ou deux lignes, coupé par « … » au-delà.

### La carte (Leaflet)

- **Leaflet 1.9.4** depuis cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/`), chargé par les deux `index.html`. Aucune dépendance npm.
- Tuiles **CARTO `light_nolabels`** (sans noms de villes ni de pays), attribution « © OpenStreetMap contributors © CARTO ».
- **Clé CARTO** : depuis 2026, les tuiles CARTO demandent une clé (gratuite, sans compte, sur carto.com/basemaps/apikey ; 5 millions de tuiles par mois en usage non commercial). Sans elle, les tuiles portent « API KEY REQUIRED ». Le dépôt étant public, la clé est une **variable d'environnement `CLE_CARTO`** (sur Render et en local), lue par `server/modes/geoquiz.js` et transmise aux écrans dans les vues (`cleCarte`). Choix de Paul le 28/09/2026.
- Zoom de départ : le monde entier. Zoom max **10**. Bouton de zoom masqué (pincement sur le téléphone ; la TV ne se manipule pas).
- La carte du monde se répète horizontalement ; le serveur ramène la longitude entre −180 et 180, et les lignes pointillées prennent le plus court chemin affiché.
- Si Leaflet ne se charge pas (CDN inaccessible) : seul GéoQuiz est touché, les autres modes n'utilisent pas Leaflet. Le téléphone affiche « Carte indisponible ».


## Sons

Communs à la TV, comme les autres modes (`docs/sons.md`, « Quand jouer quoi ») :

| Moment | Son |
|---|---|
| Nouvelle manche | `etape` |
| Un joueur valide (`ontRepondu` s'allonge) | `reponse` |
| Révélation | `revelation` |

Tic-tac des 5 dernières secondes et podium : communs.


## Contenu

### Fichiers

- `scripts/construire-geoquiz.py` (Python + `requests`, comme `telecharger-gifs.py`), **jamais exécuté par le serveur** :
  1. interroge le SPARQL de Wikidata (`https://query.wikidata.org/sparql`, User-Agent explicite « QuizTV-GeoQuiz/1.0 (contact) »), une requête par type pour éviter les délais dépassés : lieux avec coordonnées (P625), image (P18), pays (P17) et un nom en français, parmi les types jouables : sites du patrimoine mondial, monuments, attractions touristiques, montagnes, lacs, chutes d'eau, villes, ponts, lieux de culte, châteaux, îles ;
  2. classe par notoriété (nombre de sitelinks) ;
  3. attribue la difficulté selon les sitelinks : plus de 80 → 1 (facile), 30 à 80 → 2 (moyen), 10 à 29 → 3 (difficile ; en dessous de 10, trop obscur) ;
  4. remplit un **quota par difficulté** : 250 faciles, 150 moyens, 100 difficiles, soit 500 lieux. Les 500 lieux les plus connus ont tous plus de 80 sitelinks : sans quotas, il n'y aurait que des faciles (constaté au premier lancement, quotas choisis par Paul le 28/09/2026). Wikidata est donc interrogé par type et par difficulté ;
  5. plafonne à **12 lieux par pays**, répartis au prorata des quotas : 6 faciles, 4 moyens, 2 difficiles au plus ;
  6. demande à l'API de Commons (`imageinfo` + `extmetadata`) une miniature de **1 920 px** de large (Commons ne sert que des largeurs standard, … 1 280, 1 920… : 1 600 serait arrondi à 1 920, qui est aussi la largeur de la TV ; environ 300 à 600 Ko), l'auteur (texte, sans HTML) et la licence courte. **Les images sans licence libre (CC BY, CC BY-SA, CC0, domaine public) sont écartées**, ainsi que les PNG et SVG (presque toujours des cartes ou des logos) ;
  7. écrit `data/geoquiz.json` et la page d'aperçu `scripts/apercu-geoquiz.html`.
- `data/geoquiz.json` : `[{ id, nom, pays, lat, lng, image, auteur, licence, difficulte }]`. Id : `l` + numéro Wikidata (`l243` pour la tour Eiffel, Q243), sans collision avec les autres banques dans `questionsVues`.
- `scripts/apercu-geoquiz.html` : page de vignettes (photo, nom, pays, difficulté), une case à cocher par lieu. Les cases cochées au chargement sont celles de `geoquiz-exclus.json` au moment de la génération. Un bouton affiche la liste JSON des ids cochés, à coller dans `data/geoquiz-exclus.json`. Page générée, non commitée (ajoutée au `.gitignore`).
- `data/geoquiz-exclus.json` : liste d'ids exclus à la main (`["l243", …]`), **lue par le serveur** au démarrage. Un lieu exclu n'est jamais tiré. Relancer le script ne l'écrase pas.
- `scripts/verifier-geoquiz.js` : vérifie les deux fichiers.

### Relance du script

Le script réécrit `data/geoquiz.json` en entier. Les ids exclus restent exclus (ils sont dans un fichier à part). Il s'arrête sur une erreur réseau claire plutôt que d'écrire un pack incomplet.


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la devinette | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. Son brouillon est validé à la fin du chrono. |
| Joueur qui revient pendant la même manche | Retrouve sa carte et son pin (brouillon ou validé). |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante. |
| Pin validé puis nouveau tap | Refusé par le téléphone (carte verrouillée) et par le serveur. |
| Pin hors du monde (tap sur une copie de la carte) | Longitude ramenée entre −180 et 180. |
| Coordonnées invalides (texte, `NaN`, latitude 95) | Ignorées par le serveur, sans message. |
| Aucun joueur n'a posé de pin | Révélation normale : le vrai lieu seul, personne ne marque. |
| Photo introuvable ou lente sur la TV | « Photo indisponible » avec le crédit ; la manche continue, l'hôte peut attendre la fin ou tout le monde valider. |
| L'hôte termine pendant une devinette | Podium avec les scores actuels, la manche en cours n'est pas comptée. |
| Plus assez de lieux inédits | On réautorise les plus anciens, comme au quiz. |
| Tuiles de la carte lentes | La carte s'affiche quand même (fond gris), les pins restent placés. |


## Modifications à reporter (code partagé)

Uniquement des ajouts :

- `server/modes/index.js` : `geoquiz` entre dans le registre (temps 3).
- `public/joueur/index.html` : écrans GéoQuiz, `<link>` et `<script>` de Leaflet, `<script src="/joueur/modes/geoquiz.js">` (temps 3).
- `public/joueur/joueur.css` : styles des écrans GéoQuiz (temps 3).
- `public/tv/index.html` : écrans GéoQuiz, Leaflet, `tv/modes/geoquiz.js` et `tv/modes/geoquiz.css` (temps 4).
- `.gitignore` : `scripts/apercu-geoquiz.html` (temps 1).
- `docs/spec.md` : ligne « GéoQuiz » dans « Modes de jeu supplémentaires », tranche 26 ; « Contraintes techniques » : une photo à la fois chargée depuis Wikimedia, et Leaflet depuis cdnjs (temps 4).
- `docs/sons.md`, `CLAUDE.md` (structure, commandes) (temps 4).


## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Contenu (temps 1)** : `verifier-geoquiz.js` détecte un id en double ou sans `l` + chiffres, un champ manquant ou en trop, un nom ou un pays vide, une latitude ou une longitude hors bornes, une image qui n'est pas en `https://upload.wikimedia.org/` ou `https://thumb.wikimedia.org/` (d'où Commons sert ses miniatures), un auteur ou une licence vide, une difficulté hors 1–3, un id exclu absent du pack, moins de 10 lieux par difficulté une fois les exclus retirés ; le vrai pack passe.

**Serveur (temps 2)** :

- Haversine : Paris → New York ≈ 5 837 km (à 1 km près), même point → 0, points antipodaux ≈ 20 015 km ; longitude ramenée (190 → −170) ;
- barème : les valeurs du tableau « Points » ;
- tirage : répartition par difficulté (3, 5, 10 manches), ordre croissant, aucun exclu, aucun doublon, complément par la difficulté voisine, pas de répétition sur 3 parties ;
- réglages : 3, 5, 10 acceptés, le reste refusé, 5 par défaut ;
- `joueur:repondre` : validations (pas un objet, `lat` 95, `NaN`, texte, joueur non attendu, déjà validé, hors phase) ; un brouillon remplace le précédent ;
- fin de manche : anticipée quand tous ont validé, après la déconnexion du dernier attendu ; à 60 s les brouillons sont validés, sans brouillon 0 point ; révélation 20 s ; podium après la dernière manche ;
- secret : en `devinette`, ni `vueTv` ni `vueJoueur` ne contiennent `lat`/`lng`/`nom`/`pays` du lieu ; `vueJoueur` ne contient jamais `image` ni le pin d'un autre joueur ;
- points ajoutés à la révélation seulement, pas comptés si l'hôte termine pendant la devinette ; « Suivant » de l'hôte seulement ;
- `npm test` : tous les tests des autres modes restent verts, sans modification.


## Test de la tranche (à faire toi-même)

**Temps 1 (contenu)**

1. `pip install requests` si besoin, puis `py scripts/construire-geoquiz.py` : le script affiche l'avancement (types, lieux, pays, images) puis « 500 lieux écrits ».
2. Ouvrir `scripts/apercu-geoquiz.html` dans le navigateur : 500 vignettes avec nom, pays, difficulté. Cocher les photos inutilisables (plan, logo, intérieur anonyme, nom écrit sur la photo…), cliquer « Liste des exclus », coller le résultat dans `data/geoquiz-exclus.json`.
3. `node scripts/verifier-geoquiz.js` : nombre de lieux par difficulté, de pays et d'exclus, sans erreur. `npm test` passe.

**Temps 2 (serveur)** : `npm test` passe (tests GéoQuiz et tous les autres).

**Temps 3 (téléphone)**, en local avec des onglets `?dev` (portrait) :

1. Le sélecteur de l'hôte propose GéoQuiz, jouable à 2. Le réglage « Manches » propose 3, 5, 10.
2. Lancer : la carte du monde entier, sans noms de villes, attribution en bas. Glisser, zoomer à la molette (pincement sur un vrai téléphone, sur Render). Zoom bloqué au niveau 10.
3. « Valider » grisé ; un clic pose le pin, un autre le déplace ; « Valider » s'active. Valider : carte verrouillée, « En attente des autres joueurs… (1/2) ».
4. Recharger l'onglet pendant la manche : le pin revient.
5. Poser un pin sans valider dans le second onglet, attendre 60 s : révélation, ses points sont comptés. Un troisième onglet sans pin : « Pas de pin, 0 point ».
6. Résultat : marqueur vert, ligne pointillée, lieu, pays, distance, points ; « Suivant » chez l'hôte seulement.

**Temps 4 (TV)**, TV dans un onglet en 1920×1080 avec le son, puis sur Render avec de vrais téléphones :

1. Photo plein écran, « Manche 1/5 », chrono et barre, crédit en bas ; « ding » à la manche, « tic » à chaque validation, tic-tac sur les 5 dernières secondes.
2. Secret : dans les outils de développement de la TV (messages Socket.IO), aucune coordonnée ni nom du lieu pendant la devinette.
3. Révélation : carte avec le vrai lieu, pins aux couleurs et initiales des joueurs, lignes pointillées ; après 5 s, le classement de la manche ; nom, pays et crédit lisibles depuis le canapé.
4. Partie complète de 5 manches : difficulté croissante, aucun lieu répété, podium et médailles comme les autres modes ; une partie de chaque autre mode se déroule comme avant.
5. **Sur le vrai stick** : les photos s'affichent vite (préchargement pendant la révélation), la carte des résultats est fluide.


## Choix validés

Tranchés par Paul le 28/09/2026 :

1. **Noms** en français : `scripts/construire-geoquiz.py`, `data/geoquiz.json`, `data/geoquiz-exclus.json`, `scripts/apercu-geoquiz.html`, champs `id, nom, pays, lat, lng, image, auteur, licence, difficulte`.
2. **Joueurs** : 2 à 10.
3. **Manches** : 3, 5 ou 10 au choix de l'hôte, 5 par défaut.
4. **Rythme** : devinette 60 s, révélation 20 s puis manche suivante automatique, l'hôte pouvant passer plus tôt.
5. **Difficulté** : plusieurs difficultés dans une même partie, dans l'ordre croissant.
6. **Crédit** de la photo visible sur la TV dès la devinette.
7. **Types de lieux** : ceux de la demande, plus châteaux et îles.
