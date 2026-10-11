# Tranche 34 — Qui suis-je ?

Mini-spec de la tranche 34, deuxième des 8 nouveaux jeux (tranches 33 à 40, prioritaires). Choix de Paul du 11/10/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le Blind test (`docs/modes/blind-test.md`) pour le rôle tournant et le relais, et sur le GéoQuiz (`docs/modes/geoquiz.md`) pour les images Wikimedia Commons.

Chacun son tour, un joueur tourne le dos à la TV. La TV affiche un personnage (nom et, si possible, photo). Le joueur actif pose des questions à voix haute, auxquelles les autres répondent par oui ou non. Il a 2 minutes pour deviner le plus de personnages possible.

La tranche se code en **deux temps** :

1. **Contenu** : `data/qui-suis-je.json` (environ 200 personnages, tous avec photo), `scripts/construire-qui-suis-je.py` (image principale des articles Wikipédia), `scripts/verifier-qui-suis-je.js`.
2. **Le mode** : serveur, écrans TV et téléphone, sons, doc et tests.


## Règles

- **2 à 10 joueurs** : le joueur actif et au moins un joueur pour répondre et valider.
- **Tours** : chaque joueur est actif **1 fois** par partie (1, 2 ou 3 fois, option de l'hôte). Au lancement, le serveur fixe la liste des joueurs actifs parmi les joueurs connectés, dans un ordre tiré au sort à chaque tour, jamais deux fois d'affilée (comme les maîtres du Blind test).
- **Préparation** (sans chrono) : la TV et les téléphones annoncent « Au tour de Léa ! Tourne le dos à la TV ». Le personnage n'est pas encore affiché. Léa appuie sur **« C'est parti ! »** quand elle est installée.
- **Jeu** (**2 min**, ou 1 min 30 ou 3 min, option de l'hôte) : la TV affiche le premier personnage. Léa pose ses questions à voix haute (« Suis-je une femme ? », « Suis-je réel ? »…), les autres répondent.
  - **« Trouvé ! »** (téléphone de Léa) : elle pense avoir trouvé. Le **valideur** voit alors « Valider / Refuser » sur son téléphone. **Le chrono continue** pendant ce temps.
    - Validé : +1 personnage trouvé, la TV passe au personnage suivant.
    - Refusé : Léa garde le même personnage.
    - Tant que la validation attend, les boutons de Léa sont inactifs.
  - **« Passer »** (téléphone de Léa) : le personnage est abandonné, la TV passe au suivant, et le chrono **perd 15 s**. S'il reste 15 s ou moins, le tour s'arrête.
- **Valideur** : l'**hôte**. Si l'hôte est le joueur actif, c'est le premier autre joueur connecté, dans l'ordre d'arrivée dans la salle. Le valideur est recalculé s'il se déconnecte.
- **Fin du chrono** : le tour s'arrête. Si une validation est en attente, le serveur attend la décision du valideur (sans chrono), puis le tour s'arrête.
- **Bilan** (10 s, l'hôte peut passer plus tôt avec « Suivant ») : les personnages trouvés et passés, les points du tour et le classement. Puis la préparation du joueur actif suivant. Après le dernier : podium commun, médailles et points globaux.

### Points

| Situation | Points |
|---|---|
| Personnage trouvé (validé) | **300** pour le joueur actif, quel que soit le temps mis |
| Personnage passé | 0, et 15 s de moins au chrono |
| Joueurs qui répondent | 0 |

- Classement avec ex æquo comme partout (1, 1, 3).
- Les points sont ajoutés au bilan : si l'hôte termine pendant un tour, ce tour n'est pas compté.


## Phases et chronos

`etatMode.phase` vaut `preparation`, `jeu` ou `bilan`.

| Phase | Durée | Fin |
|---|---|---|
| `preparation` | aucune | « C'est parti ! » du joueur actif → `jeu`. S'il n'est pas connecté (ou se déconnecte), son tour est sauté : préparation du suivant, ou podium |
| `jeu` | 2 min (90, 120 ou 180 s), moins 15 s par « Passer » | Fin du chrono, ou « Passer » avec 15 s ou moins restantes → `bilan` (après la décision du valideur si une validation attend) |
| `bilan` | 10 s | Fin du chrono ou « Suivant » de l'hôte : préparation du tour suivant, ou podium |

Un tour dure environ 2 min 30. À 6 joueurs, une partie d'un tour dure une quinzaine de minutes.

Échéance du jeu : `debutPhaseA + duree − 15 s × passes.length`, recalculée à chaque « Passer ». Si une validation attend à l'échéance, `echeance` vaut `null` jusqu'à la décision.


## `etatMode` sur le serveur

```json
{
  "phase": "jeu",
  "tours": ["j_4d2e9f", "j_8f3k2a", "j_1b9c7d"],
  "indexTour": 1,
  "personnages": ["...tirés au lancement..."],
  "indexPersonnage": 7,
  "debutPhaseA": 1758641190000,
  "enValidation": false,
  "tempsEcoule": false,
  "trouves": ["qs-zinedine-zidane", "qs-asterix"],
  "passes": ["qs-marie-curie"]
}
```

- `tours` : un joueur actif par tour, fixé au lancement.
- `personnages` : tirés au lancement, sans répétition, parmi les niveaux cochés (`tirerQuestions` de `commun.js` : d'abord les jamais vus). On en tire assez pour la partie (30 par tour, largement au-delà de ce qu'on trouve en 3 min). Un seul pointeur `indexPersonnage` pour toute la partie : un personnage passé n'est pas reproposé.
- `trouves` et `passes` : les personnages du tour en cours, remis à zéro à chaque préparation.
- `tempsEcoule` : le chrono est fini, et on attend la décision du valideur.
- Les points du tour : fonction pure `pointsDuTour(etatMode)` = 300 × `trouves.length`.


## Événements

Aucun nouvel événement : tout passe par `joueur:repondre`.

| Événement | Contenu à Qui suis-je ? |
|---|---|
| `joueur:repondre` (départ) | En `preparation` : `{ partir: true }` du joueur actif → `jeu` |
| `joueur:repondre` (trouvé) | En `jeu` : `{ trouve: true }` du joueur actif, refusé si une validation attend déjà |
| `joueur:repondre` (passer) | En `jeu` : `{ passer: true }` du joueur actif, refusé si une validation attend |
| `joueur:repondre` (validation) | En `jeu`, validation en attente : `{ valider: true }` ou `{ valider: false }` du valideur seulement |
| `hote:suivant` | Pendant le bilan : tour suivant (ou podium) |
| `hote:reglerMode` | En salle d'attente : `{ longueur: 1 \| 2 \| 3, temps: 90 \| 120 \| 180, niveaux: [...] }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

- **Le téléphone du joueur actif ne reçoit jamais le personnage** (ni le nom, ni l'image, ni la catégorie), ni pendant son tour, ni ceux à venir. Il ne voit les personnages de son tour qu'au bilan.
- Les autres téléphones reçoivent le nom et la catégorie du personnage en cours, pour pouvoir répondre sans se retourner vers la TV. Ils ne chargent aucune image (rien à télécharger en 4G).
- La TV ne reçoit que le personnage en cours, jamais la liste tirée.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `preparation` | `phase`, `numero`, `total` (tour 2/6), `actif` (id), `personnageSuivant: { image }` (préchargement, absent s'il n'y a pas d'image) |
| `jeu` | `phase`, `numero`, `total`, `actif`, `personnage: { nom, categorie, image, auteur, licence }`, `nbTrouves`, `enValidation`, `tempsEcoule`, `valideur` (id), `tempsRestantMs`, `personnageSuivant: { image }` |
| `bilan` | `phase`, `numero`, `total`, `actif`, `trouves: [{ nom, image }]`, `passes: [{ nom }]`, `points`, `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Pour qui | Données |
|---|---|---|
| `preparation_actif` | Le joueur actif | `numero`, `total`. « C'est ton tour ! Tourne le dos à la TV » et « C'est parti ! » |
| `preparation` | Les autres | `numero`, `total`, `actif` (pseudo). « Léa va tourner le dos à la TV » |
| `actif` | Le joueur actif en `jeu` | `nbTrouves`, `enValidation`, `tempsEcoule`, `valideur` (pseudo), `tempsRestantMs`. Jamais le personnage |
| `repondre` | Les autres en `jeu` | `actif` (pseudo), `personnage: { nom, categorie }`, `nbTrouves`, `enValidation`, `tempsEcoule`, `valideur` (pseudo), `estValideur`, `tempsRestantMs` |
| `bilan` | Tous | `actif`, `trouves` et `passes` (noms), `points`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de partie | Comme au quiz |


## Écrans

### TV (1920×1080)

- **Préparation** : « Tour 2/6 », « Au tour de Léa ! » avec sa pastille, « Tourne le dos à la TV ». Petit QR code.
- **Jeu** : la photo du personnage à gauche (`object-fit: contain`, fond sombre), à droite le nom en très grand et sa catégorie (« Footballeur »). En haut : « Léa devine », le chrono et sa barre, « 3 trouvés ». En bas : le crédit de la photo (« Photo : <auteur>, <licence>, Wikimedia », 40 px). Si la photo ne se charge pas : le nom seul, centré, en très grand.
  - Validation en attente : bandeau « Léa pense avoir trouvé… Sam vérifie. » (le nom du valideur), sans cacher le personnage.
  - Trouvé : le nom passe en vert un instant (opacité et déplacement, pas de flou), puis le suivant.
  - Passé : « Passé ! −15 s » un instant.
- **Bilan** : « Léa : 4 personnages trouvés, +1 200 », les vignettes des trouvés, les noms des passés en plus petit, puis le classement.

### Téléphone (portrait)

- **Joueur actif, préparation** : « C'est ton tour ! Tourne le dos à la TV », gros bouton « C'est parti ! ».
- **Joueur actif, jeu** : le chrono, « 3 trouvés », un très grand bouton **« Trouvé ! »** et un bouton plus petit **« Passer (−15 s) »**. Validation en attente : « L'hôte vérifie… », boutons inactifs. Un appui marque le bouton tout de suite et vibre sur Android.
- **Autres, jeu** : « Léa devine : », le nom en grand et sa catégorie, « Réponds par oui ou non ! ». Pour le valideur, une validation en attente affiche deux grands boutons « Valider » et « Refuser » à la place.
- **Bilan** : « Léa a trouvé 4 personnages » (ou « Tu as trouvé 4 personnages, +1 200 »), la liste des noms, score et rang ; « Suivant » pour l'hôte.


## Sons

| Moment | Détection | Son |
|---|---|---|
| Préparation | `nouvelleEtape` en phase `preparation` | `etape` |
| Début du jeu | `nouvelleEtape` en phase `jeu` | `lancement` |
| Trouvé validé | `nbTrouves` augmente | `victoire` |
| Refusé ou passé | Personnage refusé (`enValidation` repasse à faux sans hausse de `nbTrouves`), ou personnage suivant sans hausse de `nbTrouves` | `rate` |
| Bilan | `nouvelleEtape` en phase `bilan` | `etape` |
| Tic-tac, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js`. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.


## Cas limites

| Situation | Comportement |
|---|---|
| Le joueur actif n'est pas connecté à sa préparation, ou se déconnecte pendant | Son tour est sauté, préparation du suivant (ou podium). |
| Le joueur actif se déconnecte pendant le jeu | Le chrono continue. Il ne peut plus appuyer ; s'il revient, il retrouve son écran. Le valideur ne peut valider que sur un « Trouvé ! » du joueur actif. |
| Le valideur (l'hôte) se déconnecte pendant une validation | Le valideur est recalculé : le nouvel hôte après le transfert (10 s), ou le premier autre joueur connecté. La validation en attente lui passe. |
| Personne pour valider (le joueur actif est seul connecté) | « Trouvé ! » reste en attente jusqu'au retour d'un autre joueur, qui devient valideur. Si le chrono se termine sans personne pour valider, le tour s'arrête sans compter ce personnage. |
| Plus de personnage dans la liste tirée | Le tour s'arrête comme à la fin du chrono. |
| Arrivée en cours de partie | 0 point, répond et valide (s'il devient hôte) mais n'est pas joueur actif : la liste des tours est fixée au lancement. |
| Moins de 2 joueurs connectés en cours de partie | La partie continue. « Rejouer » est désactivé tant que le compte n'y est pas. |
| L'hôte termine pendant un tour | Podium avec les scores actuels, le tour en cours n'est pas compté. |
| Plus assez de personnages inédits | On réautorise les plus anciens, comme au quiz. |
| Photo introuvable ou lente sur la TV | Le nom seul, en très grand ; le jeu continue. |


## Contenu

### Catalogue `data/qui-suis-je.json`

```json
{
  "id": "qs-zinedine-zidane",
  "nom": "Zinédine Zidane",
  "categorie": "Footballeur",
  "niveau": 1,
  "wikipedia": "Zinédine Zidane",
  "image": "https://upload.wikimedia.org/…",
  "auteur": "…",
  "licence": "CC BY-SA 3.0"
}
```

- `id` : `qs-` suivi de minuscules, chiffres et tirets, unique.
- `nom` : le nom tel qu'on le dit (« Astérix », « Marie Curie »).
- `categorie` : courte, au masculin ou au féminin selon le personnage (« Chanteuse », « Personnage de BD », « Reine d'Angleterre »).
- `niveau` : 1 (Facile, connu de tous) ou 2 (Difficile).
- `wikipedia` : le titre de l'article de Wikipédia en français (« Napoléon Ier », « Mario (personnage) »), d'où le script tire la photo.
- `image`, `auteur`, `licence` : **obligatoires**, remplis par le script, jamais à la main. Chaque personnage a sa photo : le catalogue sert aussi au futur jeu de photos (tranche 41). Pour changer une mauvaise photo : retirer ces trois champs et corriger `wikipedia`, ou retirer le personnage.
- Environ **200 personnages**, la moitié de chaque niveau, rédigés par Claude et relus par Paul : personnes réelles connues en France (chanteurs, sportifs, acteurs, personnages historiques, scientifiques…) et personnages de fiction (BD, dessins animés, films, jeux vidéo, contes).
- **Images non libres** : choix de Paul (jeu entre amis, sans but commercial), les personnages de fiction ont l'image officielle de leur article anglais (dessin, affiche), créditée « Droits réservés ».

### Script `scripts/construire-qui-suis-je.py` (Python + requests)

Comme `telecharger-gifs.py`, il complète le catalogue sans toucher aux personnages déjà illustrés :

1. pour chaque personnage sans `image`, prend l'**image principale** de l'article Wikipédia en français (celle de l'en-tête, toujours libre ; redirections suivies). S'il n'y en a pas, celle de l'article anglais correspondant, même non libre. Garde-fou : un article absent ou une page d'homonymie est signalé, et le personnage reste sans photo. Les SVG (presque toujours des logos) sont écartés ;
2. demande au Wikipédia concerné une miniature de 1 280 px de large, l'auteur (texte, sans HTML) et la licence courte. Licence libre (CC BY, CC BY-SA, CC0, domaine public, « No restrictions », OGL) : gardée telle quelle, « Auteur inconnu » s'il n'y a pas d'auteur. Sinon : licence « Droits réservés », auteur « Wikipédia » s'il n'y en a pas ;
3. réécrit `data/qui-suis-je.json` (un personnage par ligne) et affiche la liste des personnages restés sans image, à corriger ou retirer ;
4. écrit la page d'aperçu `scripts/apercu-qui-suis-je.html` (non commitée) : une vignette par personnage (photo ou « sans photo »), avec nom, catégorie, niveau, id et crédit, pour relire les photos d'un coup.

### Script `scripts/verifier-qui-suis-je.js`

- `id` au format `qs-…`, unique ; seuls les champs ci-dessus ;
- `nom` et `categorie` : chaînes non vides, sans espace au bord ;
- `niveau` : 1 ou 2 ;
- `wikipedia`, `image`, `auteur`, `licence` : chaînes non vides, sans espace au bord ; image en `https://upload.wikimedia.org/` ou `https://thumb.wikimedia.org/` ;
- pas deux noms identiques (sans accents ni majuscules) ;
- au moins 30 personnages par niveau ;
- affichage : le nombre de personnages par niveau et le nombre d'images non libres.


## Tests automatiques

- Le registre contient `qui-suis-je` avec tout le contrat ; refusé à 1 joueur, accepté à 2.
- `hote:reglerMode` : longueur 1, 2, 3, temps 90, 120, 180, niveaux (pas de liste vide) ; autres valeurs refusées.
- Tours : chaque joueur connecté au lancement est actif `longueur` fois, jamais deux fois d'affilée.
- Préparation : « C'est parti ! » refusé d'un autre joueur ; joueur actif déconnecté → tour sauté, podium s'il n'y en a plus.
- Trouvé : refusé d'un autre joueur que l'actif et hors `jeu` ; validé par le valideur → personnage suivant et +1 trouvé ; refusé → même personnage ; validation refusée d'un autre joueur que le valideur ; « Trouvé ! » et « Passer » refusés pendant une validation.
- Valideur : l'hôte, ou le premier autre joueur connecté si l'hôte est actif ; recalculé à la déconnexion.
- Passer : personnage suivant, échéance avancée de 15 s ; avec 15 s ou moins restantes → `bilan`.
- Chrono : fin → `bilan` ; validation en attente à l'échéance → attente de la décision, puis `bilan` (et le personnage compte s'il est validé).
- Points : 300 × trouvés au joueur actif, 0 aux autres, ajoutés au bilan seulement.
- Secret : `vueJoueur` du joueur actif ne contient jamais `nom`, `categorie` ni `image` du personnage, en aucune phase avant le bilan ; `vueTv` ne contient jamais la liste tirée.
- Tirage : personnages distincts, parmi les niveaux cochés.
- `verifier-qui-suis-je.js` : id en double ou mal formé, champ en trop, nom ou catégorie vide, niveau hors 1–2, image sans auteur, image hors Commons, nom en double ; le vrai catalogue passe.


## Modifications à reporter

- `server/modes/qui-suis-je.js` et ses tests ; `server/modes/index.js` : le mode entre dans le registre.
- `public/tv/index.html`, `public/tv/modes/qui-suis-je.js` et `.css` ; `public/joueur/index.html`, `public/joueur/modes/qui-suis-je.js`, styles dans `joueur.css`.
- `data/qui-suis-je.json`, `scripts/construire-qui-suis-je.py`, `scripts/verifier-qui-suis-je.js` et ses tests.
- `docs/sons.md` : les lignes du mode. `docs/spec.md` : « Modes de jeu supplémentaires », tableau des options, tranche 34. `CLAUDE.md` : structure et commandes. `admin.html` : la fiche du mode (liste `JEUX`).


## Test de la tranche (à faire toi-même)

Temps 1 : `py scripts/construire-qui-suis-je.py` puis `node scripts/verifier-qui-suis-je.js` passent ; tu relis la liste des personnages et leurs photos.

Temps 2, sur Render (les téléphones ne joignent pas le serveur local depuis le PC d'entreprise), TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev` :

1. **Choix.** À 1 joueur, « Qui suis-je ? » est grisé ; à 2, il s'active. Options : 1, 2 ou 3 tours, 1 min 30, 2 min ou 3 min, niveaux Facile et Difficile.
2. **Préparation.** Lancer. La TV annonce le premier joueur actif ; son téléphone affiche « C'est parti ! », les autres « Léa va tourner le dos à la TV ». Aucun personnage nulle part.
3. **Jeu.** « C'est parti ! » : la TV affiche le personnage (photo, nom, catégorie, crédit) et le chrono. Les autres téléphones montrent le nom ; celui du joueur actif ne le montre pas.
4. **Trouvé validé.** Le joueur actif appuie sur « Trouvé ! » : bandeau sur la TV, « Valider / Refuser » chez l'hôte, le chrono continue. « Valider » : personnage suivant, « 1 trouvé ».
5. **Trouvé refusé.** Même chose avec « Refuser » : le même personnage reste.
6. **Passer.** « Passer » : personnage suivant, le chrono perd 15 s.
7. **Hôte actif.** Au tour de l'hôte, c'est un autre joueur qui voit « Valider / Refuser ».
8. **Bilan.** À la fin du chrono : les personnages trouvés et passés, +300 par trouvé, le classement. Le téléphone du joueur actif découvre alors ses personnages.
9. **Joueur absent.** Couper le prochain joueur actif (« Couper 15 s ») pendant sa préparation : son tour est sauté.
10. **Fin.** Après le dernier tour (ou « Terminer »), podium, médailles et points globaux comme d'habitude.


## Choix validés

Choisis par Paul le 11/10/2026 :

1. **Le plus de personnages possible** pendant le chrono du tour.
2. **Points fixes** : 300 par personnage trouvé.
3. **« Passer » coûte 15 s** de chrono.
4. **L'hôte seul valide** un « Trouvé ! » (un autre joueur si l'hôte est actif).
5. **Le chrono continue** pendant la validation.
6. **Longueur** : 1, 2 ou 3 tours par joueur (1 par défaut) ; chrono de 1 min 30, 2 min ou 3 min (2 min par défaut).
7. **Contenu** : personnes réelles et personnages de fiction, avec niveaux (option de l'hôte), nom et photo Commons quand il y en a une.

Précisés par la mini-spec (à valider avec elle) :

8. **2 joueurs minimum** (le joueur actif et un valideur).
9. **Préparation sans chrono**, lancée par « C'est parti ! » du joueur actif, pour qu'il ait le temps de se retourner (comme le relais du Blind test).
10. **Deux niveaux** (Facile, Difficile), cochés tous deux par défaut, et environ **200 personnages**, tous avec photo (choix de Paul du 11/10/2026, images non libres comprises).
11. **Les autres téléphones montrent le nom** du personnage (pas l'image), pour répondre sans se retourner.
12. **Boutons du joueur actif inactifs** pendant une validation, pour éviter « Trouvé ! » deux fois de suite.
13. **Validation en attente à la fin du chrono** : on attend la décision, et le personnage compte s'il est validé.
14. **Joueur actif absent à sa préparation** : son tour est sauté, comme le maître absent du Blind test.
15. **Bilan de 10 s**, l'hôte peut passer plus tôt.
16. **Un personnage passé n'est pas reproposé** dans la partie.
