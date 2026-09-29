# Tranche 30 — Petit bac

Mini-spec de la tranche 30. Elle a été validée le 29/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes (`docs/modes/estimation.md`), sur les options de l'hôte (tranche 27) et sur `docs/sons.md`.

Le jeu du bac de la cour de récré : une lettre, 6 catégories, et chacun cherche un mot par catégorie qui commence par cette lettre. Le premier qui a tout rempli crie « STOP ! ». Ensuite, on débat à voix haute, et l'hôte tranche.

La tranche se code en trois temps, chacun testé (et commité avec ton accord) avant de passer au suivant. Il n'y a pas de temps « Contenu » : les 13 catégories sont une liste dans le code, lettres et catégories sont tirées au hasard, sans fichier de données ni script de vérification.

1. **Serveur** : `server/modes/petit-bac.js` (règles, déroulé, vues) et ses tests. Le mode n'entre pas encore dans le registre : invisible en jeu.
2. **Téléphone** : le mode entre dans le registre, écrans du téléphone (saisie, validation de l'hôte), options.
3. **TV, sons et doc** : lettre, catégories et chrono, STOP, validation catégorie par catégorie, bilan, sons, mise à jour de `spec.md`, `sons.md` et `CLAUDE.md`.

Entre les temps 2 et 3, la TV n'a pas encore d'écran pour ce mode : on ne lance une partie qu'avec des onglets `?dev`, jamais en soirée.


## Règles

- **2 à 10 joueurs.**
- Une partie compte **3, 5 ou 7 manches** (option de l'hôte, **5** par défaut).
- **Manche** : la TV tire une **lettre** et **6 catégories**. Chaque téléphone affiche la même lettre et 6 cases, une par catégorie.
- **Écriture** : chacun remplit ses cases, dans l'ordre qu'il veut, jusqu'à **90 s** (option : 60, **90** ou 120 s).
- **STOP** : le premier joueur dont les 6 cases commencent par la lettre peut appuyer sur **STOP**. Les autres ont alors **10 secondes** (compte à rebours sur la TV, mesuré par le serveur). Si le chrono principal a moins de 10 s devant lui, il n'est pas prolongé.
- **J'ai fini** : après un STOP, chacun peut arrêter plus tôt avec « J'ai fini », même avec des cases vides, pour ne pas faire attendre les autres.
- **Fin de l'écriture** : quand tous les joueurs attendus encore connectés ont fini (STOP ou « J'ai fini »), à la fin des 10 s après le STOP, ou à la fin du chrono principal. Les cases de chacun sont prises **telles quelles** à cet instant : pas de bouton « Valider », ce qui est écrit compte.
- **Joueurs attendus** : ceux connectés au début de la manche, comme dans les autres modes.
- **Validation** : la TV affiche les réponses **catégorie par catégorie**, celles de tous les joueurs côte à côte. Toutes sont **acceptées par défaut** (en vert), sauf celles qui ne commencent pas par la lettre (voir « La lettre »). On débat à voix haute ; l'hôte **décoche** sur son téléphone les réponses refusées (en rouge), ou recoche. Il passe à la catégorie suivante quand le débat est clos. **Pas de chrono** pendant la validation : le débat dure ce qu'il dure.
- **Bilan** : après la 6ᵉ catégorie, l'hôte appuie sur « Voir les scores ». La TV montre les points de la manche, puis le classement, pendant **15 s**, puis manche suivante. L'hôte peut passer plus tôt (« Suivant »). Après la dernière : podium commun, médailles et points globaux comme les autres modes.

### La lettre

- **Tirage** : une lettre au hasard parmi les lettres permises, **jamais deux fois la même dans une partie**. Par défaut, **K, Q, W, X, Y et Z sont exclues** (20 lettres) ; l'option « Lettres rares » les ajoute (26 lettres). Tirage uniforme : chaque lettre permise a la même chance.
- **Une réponse commence par la lettre** si, en majuscules sans accents ni cédille (`Élan` = `ELAN`, `Œuf` = `OEUF`), sa première lettre est la lettre tirée, **ou** la première lettre du mot qui suit un article en tête (`le`, `la`, `les`, `l'`, `un`, `une`, `des`, `du`, `d'`). Avec la lettre H, « Le Havre » passe ; avec la lettre S, « Les Simpson » passe.
- **Vérifiée par le serveur** :
  - pour permettre le STOP : les 6 cases doivent commencer par la lettre ;
  - à la validation : une réponse qui ne commence pas par la lettre est **refusée d'office** (en rouge, marquée « pas un M »). L'hôte peut la **réaccepter** : c'est le même geste que pour les autres, et ça couvre les cas que la règle n'a pas prévus (« The Office » pour la lettre O).

### Les catégories

- **13 catégories** : Prénom, Pays, Ville, Animal, Fruit ou légume, Métier, Objet, Marque, Sport, Célébrité réelle, Film ou série, Partie du corps, Personnage de fiction.
- **6 tirées au hasard à chaque manche**, sans répétition dans la manche, affichées dans l'ordre de la liste ci-dessus (Prénom avant Pays…), pour que l'ordre des cases soit prévisible d'une manche à l'autre.

### Réponses

- Texte libre, **30 caractères au plus**. Le serveur retire les espaces au début et à la fin et réduit les espaces multiples. Une case vide (ou faite d'espaces) est une **absence de réponse**.
- La réponse est gardée **telle que tapée** (accents, majuscules) pour l'affichage. Seule la vérification de la lettre la ramène en majuscules sans accents.

### Points

- **1 point par réponse acceptée**, 0 si vide ou refusée. 6 points au plus par manche.
- **Deux réponses identiques valent 1 point chacune** (voir « Choix validés », point 5).
- Barème bas comme au Mot le plus long et au Compte est bon : sans effet, les médailles se jouent au rang dans la partie.
- Les points d'une manche sont ajoutés au score au **début du bilan**. Si l'hôte termine pendant l'écriture ou la validation, la manche en cours n'est pas comptée.
- Classement avec ex æquo comme partout (1, 1, 3).


## Phases et chronos

`etatMode.phase` vaut `ecriture`, `validation` ou `bilan`.

| Phase | Durée | Fin |
|---|---|---|
| `ecriture` | 90 s (option), réduite à 10 s après le STOP | Tous les attendus ont fini, 10 s après le STOP ou fin du chrono |
| `validation` | Pas de chrono | « Voir les scores » de l'hôte, sur la 6ᵉ catégorie |
| `bilan` | 15 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

L'écriture dure en pratique 40 à 90 s. La validation est le plus long : environ 20 s par catégorie, 2 min par manche. Une partie de 5 manches dure donc environ **20 minutes**, plus que les autres modes (voir « Choix validés », point 3).


## `etatMode` sur le serveur

```json
{
  "phase": "ecriture",
  "questions": [{ "lettre": "M", "categories": ["Prénom", "Pays", "Animal", "Métier", "Sport", "Film ou série"] }],
  "indexQuestion": 0,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d"],
  "textes": { "j_8f3k2a": ["Martin", "Maroc", "Marmotte", "Maçon", "", ""] },
  "stop": { "id": "j_8f3k2a", "a": 1758641250000 },
  "reponses": { "j_8f3k2a": { "recuA": 1758641250000 } },
  "indexCategorie": 0,
  "acceptees": { "j_8f3k2a": [true, true, true, true, false, false] }
}
```

- `questions`, `indexQuestion`, `debutPhaseA`, `attendus`, `reponses` : les noms des autres modes, pour réutiliser les aides de `commun.js`. Une « question » est ici une manche : sa lettre et ses 6 catégories, toutes tirées au lancement de la partie.
- `textes` : les 6 cases de chaque joueur, mises à jour à chaque changement pendant l'écriture (comme un brouillon), figées à la fin de l'écriture.
- `stop` : qui a appuyé sur STOP et quand (`null` avant). C'est lui qui raccourcit le chrono.
- `reponses` : les joueurs **qui ont fini** (STOP ou « J'ai fini »). C'est ce que comptent `tousOntRepondu` et les pastilles de la TV.
- `indexCategorie` : la catégorie affichée pendant la validation (0 à 5).
- `acceptees` : créé au début de la validation. Pour chaque joueur qui a au moins une case, 6 booléens : `true` si la case est remplie et commence par la lettre. L'hôte les bascule. Une case vide reste `false` et ne peut pas être basculée.
- Les points ne sont pas stockés : `calculerPoints(acceptees)` les calcule (fonction pure).


## Événements

Aucun nouvel événement : les gestes de l'hôte pendant la validation passent par `joueur:repondre`, et le mode vérifie que l'émetteur est l'hôte (`salle.hoteId`), comme le maître du jeu du Blind test.

| Événement | Contenu au Petit bac |
|---|---|
| `joueur:repondre` | En `ecriture` : `{ action, textes }`, `textes` étant les 6 cases. `action: 'ecrire'` à chaque changement (ne fait pas de diffusion), `action: 'stop'` avec STOP ou « J'ai fini ». Refusé si `textes` n'est pas une liste de 6 textes de 30 caractères au plus, si le joueur n'est pas attendu ou a déjà fini, si c'est le premier STOP et qu'une case ne commence pas par la lettre. |
| `joueur:repondre` (hôte) | En `validation`, de l'hôte seulement : `{ action: 'categorie', index }` affiche la catégorie `index` (0 à 5) ; `{ action: 'basculer', categorie, joueurId }` accepte ou refuse une réponse. `categorie` doit être la catégorie affichée (un appui en retard, après un changement de catégorie, est ignoré). Refusé pour une case vide. Ignoré dans les autres phases. |
| `hote:suivant` | En `validation`, sur la 6ᵉ catégorie seulement : « Voir les scores », passage au bilan. En `bilan` : manche suivante (ou podium). |
| `hote:reglerMode` | En salle d'attente et au tableau : `{ longueur: 3 | 5 | 7, temps: 60 | 90 | 120, lettresRares: true | false }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

`action: 'categorie'` envoie l'index voulu plutôt que « suivante » : un double appui ne saute pas de catégorie. Pour la même raison, « Voir les scores » passe par `hote:suivant`, qui porte déjà l'étape affichée.


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| La lettre et les 6 catégories | Tout le monde, dès le début de la manche. |
| Les cases d'un joueur | Personne pendant l'écriture, sauf le joueur lui-même. La TV sait seulement qui a fini et qui a appuyé sur STOP. |
| Les réponses de tous | La TV et l'hôte dès la validation. Les autres téléphones ne voient que leurs propres réponses (le reste est sur la TV). |
| Accepté ou refusé | Tout le monde, en direct pendant la validation. |


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `ecriture` | `phase`, `numero`, `total`, `lettre`, `categories`, `ontRepondu` (liste d'`id` des joueurs qui ont fini), `stop` (`id` du joueur, ou `null`), `tempsRestantMs` |
| `validation` | `phase`, `numero`, `total`, `lettre`, `categories`, `indexCategorie`, `lignes: [{ id, textes, acceptees, horsLettre }]` (`horsLettre` : les cases refusées d'office, pour afficher « pas un M »), `sansReponse` (attendus qui n'ont rien écrit) |
| `bilan` | Idem, plus `points: [{ id, points }]` (tous les attendus, triés du plus au moins), `classement` et `tempsRestantMs` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Contenu |
|---|---|
| `ecriture` | `numero`, `total`, `lettre`, `categories`, `textes` (ses cases, ou 6 textes vides) : elles reviennent après un rechargement de la page. `stop` : le pseudo de celui qui a appuyé, ou `null` ; `tempsRestantMs` après un STOP, pour le compte à rebours |
| `fini` | `numero`, `total`, `lettre`, `categories`, `textes`, `nbFinis`, `nbAttendus` : « En attente des autres joueurs… (x/n) » |
| `validation` | `numero`, `total`, `lettre`, `categories`, `categorie` (le nom de celle affichée), `indexCategorie`, `maReponse` (`{ texte, acceptee }` ou `null`), `pointsProvisoires` (ses réponses acceptées jusqu'à la catégorie affichée) |
| `validation_hote` | Idem, plus `lignes: [{ id, pseudo, texte, acceptee, horsLettre }]` pour la catégorie affichée, tous les attendus |
| `bilan` | `numero`, `total`, `lettre`, `categories`, `textes`, `acceptees`, `points` (de la manche), `rang` (le score vient de la vue commune) ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche |

Le téléphone vérifie lui-même, pour l'affichage, si une case commence par la lettre (griser STOP, entourer une case) : c'est de l'affichage, pas de la logique de jeu. Seul le serveur décide.


## Écrans

### Téléphone (portrait)

- **Écriture** :
  - un **bandeau collé en haut** (il reste visible quand on fait défiler et quand le clavier est ouvert) : la **lettre** en grand, « Manche 2/5 », et le bouton **STOP** rouge ;
  - dessous, les **6 cases**, chacune avec le nom de sa catégorie au-dessus. Une case remplie qui ne commence pas par la lettre est entourée en orange, avec « Doit commencer par M » ;
  - **clavier du téléphone** : correcteur automatique, suggestions et saisie automatique **désactivés** (`autocorrect="off"`, `autocomplete="off"`, `spellcheck="false"`), majuscule automatique en début de case (`autocapitalize="sentences"`). La touche Entrée passe à la case suivante (`enterkeyhint="next"`, puis `"done"` sur la dernière) ;
  - chaque changement est envoyé au serveur tout de suite (`action: 'ecrire'`) : ce qui est écrit compte, même sans STOP ;
  - **STOP** est grisé tant que les 6 cases ne commencent pas toutes par la lettre.
- **Après un STOP** (d'un autre joueur) : le bandeau passe au rouge, « STOP de Léa ! » et un compte à rebours de 10 à 0 (calculé depuis `tempsRestantMs`, pour l'affichage). Le bouton devient **« J'ai fini »**, toujours actif.
- **Fini** : « STOP ! » ou « Terminé », ses 6 réponses sans les cases (plus rien à toucher), bandeau « En attente des autres joueurs… (x/n) ».
- **Validation (joueurs)** : « Débat : Pays (2/6) · Regarde la TV », sa réponse en grand avec ✓ vert ou ✗ rouge, mis à jour en direct, et « Tes points de la manche : 3 pour l'instant ». Pas de réponse : « Pas de réponse ».
- **Validation (hôte)** : « Pays (2/6) · lettre M », puis une ligne par joueur attendu : pseudo, réponse, et un gros interrupteur ✓/✗ (au moins 56 px de haut) qui bascule d'un appui. Les réponses refusées d'office portent « pas un M ». Les cases vides sont grisées, sans interrupteur. En bas, « ← Précédente » et « Catégorie suivante → » ; sur la 6ᵉ, « Voir les scores ». L'hôte est aussi joueur : sa propre réponse est dans la liste, comme les autres.
- **Bilan** : « +4 points » en grand, ses 6 réponses avec ✓/✗, score total et rang ; « Suivant » pour l'hôte.

### TV (1920×1080)

Tout est écrit en **40 px au moins** (règle de lisibilité de la TV).

- **Écriture** : à gauche, la **lettre** dans une grande tuile (environ 400 px de haut) ; à droite, les **6 catégories** en cartes de 56 px, sur 2 colonnes de 3 ; en haut « Manche 2/5 » et le chrono avec sa barre ; en bas les pastilles des joueurs qui ont fini (`afficherAttenteReponses` de `tv.js`).
- **STOP** : un bandeau rouge sur toute la largeur, « STOP ! Léa a fini », et le compte à rebours de 10 à 0 en très grand (120 px), qui remplace le chrono rond. La barre du chrono passe au rouge et repart de 10 s.
- **Validation** : une catégorie à la fois.
  - En haut : « Manche 2/5 », la lettre et le nom de la catégorie en 72 px ; dessous, les 6 catégories en onglets (40 px, sur une ou deux lignes), celle en cours en jaune, celles déjà vues cochées.
  - Puis **une carte par joueur**, en grille de **5 colonnes sur 2 rangées** (10 joueurs au plus), en laissant la place du QR code du coin : chaque carte fait environ 290 px de large. Sur la première ligne, pastille, pseudo et ✓/✗ en 40 px (un pseudo trop long est coupé, la pastille garde l'initiale). Dessous, la réponse en **44 px, sur 4 lignes au plus** (points de suspension au-delà) : les réponses réalistes de 30 caractères tiennent entières (« Inspecteur Gadget et son chien » sur 3 lignes), seules des réponses faites de lettres très larges (« WWWW… ») sont coupées, et l'hôte voit toujours la réponse entière sur son téléphone. Fond vert si acceptée ; fond rouge et texte barré si refusée (« pas un M » en 40 px dessous si refusée d'office) ; pointillés et « — » si vide.
  - Mesuré en 1920×1080 : même dans le pire cas (deux onglets sur deux lignes, 10 réponses de 4 lignes refusées d'office), les cartes s'arrêtent à 1037 px, dans la marge du bas. À 48 px, « Le Seigneur des anneaux » ne tenait pas sur 3 lignes : d'où 44 px et 4 lignes.
  - Quand l'hôte bascule une réponse, sa carte change de couleur tout de suite, avec une petite secousse.
  - Pourquoi une catégorie à la fois : les 6 catégories × 10 joueurs ensemble demanderaient des colonnes d'environ 270 px, soit 10 caractères par ligne à 40 px, et 11 rangées de 85 px. Ça ne tient pas lisiblement.
- **Bilan** (15 s) :
  1. **0 s** : une ligne par joueur, du plus au moins de points de la manche : pastille, pseudo, « +4 », et ses 6 réponses en petites marques ✓/✗ (40 px). 10 lignes de 80 px tiennent.
  2. **8 s** : le classement général (flèches ▲▼ communes) prend la place, comme au Mot le plus long.


## Sons

Communs à la TV, comme les autres modes (`docs/sons.md`, « Quand jouer quoi ») :

| Moment | Son |
|---|---|
| Nouvelle manche | `etape` |
| STOP | `lancement` (jingle, pour que tout le monde lève la tête) |
| Un joueur a fini après le STOP (`ontRepondu` s'allonge) | `reponse` |
| Validation : nouvelle catégorie affichée | `etape` |
| Validation : une réponse refusée par l'hôte | `rate` |
| Bilan | `revelation` |

Tic-tac des 5 dernières secondes (du chrono principal comme du compte à rebours du STOP) et podium : communs.


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant l'écriture | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. Ses cases telles qu'elles étaient comptent. |
| Joueur qui revient pendant la même manche | Retrouve lettre, catégories et ses cases (ou l'écran « fini »). |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante. |
| Deux STOP presque en même temps | Le premier reçu par le serveur est le STOP ; le second compte comme « J'ai fini ». |
| STOP avec une case qui ne commence pas par la lettre | Refusé par le téléphone (bouton grisé) et par le serveur. |
| Texte trafiqué (7 cases, 200 caractères, pas un texte) | Ignoré par le serveur, sans message. |
| Personne n'appuie sur STOP | Fin au chrono principal, les cases comptent telles quelles. |
| Personne n'a rien écrit | Validation sautée : bilan direct, personne ne marque. |
| Tout le monde a laissé une catégorie vide | La catégorie est affichée quand même (cartes grises) : l'hôte passe. |
| L'hôte se déconnecte pendant la validation | Le rôle d'hôte passe à un autre joueur comme d'habitude (`salles.js`) : son téléphone affiche l'écran de validation de l'hôte, où l'on en était. |
| L'hôte termine pendant l'écriture ou la validation | Podium avec les scores actuels, la manche en cours n'est pas comptée. |


## Modifications à reporter (code partagé)

Uniquement des ajouts :

- `server/modes/index.js` : `petit-bac` entre dans le registre (temps 2).
- `public/joueur/index.html`, `public/joueur/joueur.css`, `public/joueur/modes/petit-bac.js` : écrans du téléphone, dont l'interrupteur « Lettres rares » des options par `remplirReglages`, comme les thèmes du quiz (temps 2).
- `public/joueur/joueur.js` : `bilan` fait vibrer le téléphone comme les autres écrans de résultat, et le téléphone attend la fin du chargement de la page avant de reprendre sa salle (sinon l'état reçu pouvait arriver avant les écrans du mode) (temps 2).
- `public/tv/index.html`, `public/tv/modes/petit-bac.js` et `.css` : écrans de la TV (temps 3).
- `public/tv/tv.js` : la TV attend elle aussi la fin du chargement de la page avant de reprendre sa salle, comme le téléphone (temps 3).
- `docs/spec.md` : ligne du mode dans « Modes de jeu supplémentaires » (« disponible »), tranche 30, « Options de l'hôte » (3 / **5** / 7 manches, 60 / **90** / 120 s, lettres rares) (temps 3).
- `docs/sons.md`, `CLAUDE.md` (structure) (temps 3).

Les options communes (`creerOptions`) ne connaissent que longueur et temps : le mode les complète avec `lettresRares` (validation, valeur par défaut, résumé « 5 manches · 90 s · sans K Q W X Y Z »), sans toucher à `commun.js`.


## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Serveur (temps 1)** :

- tirage : 6 catégories distinctes parmi les 13, dans l'ordre de la liste ; lettres toutes différentes dans une partie ; jamais K, Q, W, X, Y, Z sans l'option, sur 1 000 tirages ; avec l'option, les 26 lettres possibles ; 7 manches tirables même sans lettres rares ;
- lettre : `Maroc`, `maroc`, `  Maroc`, `Élan` (lettre E), `Œuf` (O), `Le Havre` (H), `L'Oréal` (O), `Les Simpson` (S) et `Lion` (L) acceptés ; `Paris` (M), vide, `123` et `Le` seul (M) refusés ;
- nettoyage : espaces retirés et réduits, 31 caractères refusés ;
- points : 1 par acceptée, 0 vide ou refusée, deux réponses identiques 1 point chacune ;
- réglages : 3, 5, 7 manches, 60, 90, 120 s et `lettresRares` booléen acceptés, le reste refusé ; 5, 90 et `false` par défaut ;
- `joueur:repondre` en écriture : validations (pas un objet, action inconnue, `textes` pas une liste de 6 textes, trop long, joueur non attendu, déjà fini, hors phase) ; `ecrire` remplace les cases sans diffusion ; premier STOP refusé si une case ne commence pas par la lettre ; « J'ai fini » après un STOP accepté avec des cases vides ;
- chrono : sans STOP, fin à 90 s ; STOP à 30 s, fin à 40 s ; STOP à 85 s, fin à 90 s ; fin anticipée quand tous ont fini, après la déconnexion du dernier attendu ;
- validation : `acceptees` initialisé (vide et hors lettre à `false`) ; basculer de l'hôte seulement, pas une case vide, pas une autre catégorie que celle affichée ; `categorie` hors 0–5 refusée ; « Voir les scores » (`hote:suivant`) seulement sur la 6ᵉ catégorie ; personne n'a rien écrit : bilan direct ;
- bilan : 15 s, podium après la dernière manche ; points ajoutés au début du bilan seulement, pas comptés si l'hôte termine pendant l'écriture ou la validation ;
- secret : en `ecriture`, ni `vueTv` ni la `vueJoueur` d'un autre joueur ne contiennent les cases d'un joueur ; en `validation`, seul l'hôte reçoit les réponses des autres ;
- `npm test` : tous les tests des autres modes restent verts, sans modification.


## Test de la tranche (à faire toi-même)

**Temps 1 (serveur)** : `npm test` passe (tests du mode et tous les autres).

**Temps 2 (téléphone)**, en local avec des onglets `?dev` (portrait) :

1. Le sélecteur de l'hôte propose « Petit bac », jouable à 2. Les options proposent 3, 5, 7 manches, 60, 90, 120 s et l'interrupteur « Lettres rares ».
2. Lancer : une lettre, 6 catégories. Taper dans les cases : Entrée passe à la case suivante, le bandeau reste visible. Une case qui ne commence pas par la lettre est entourée ; STOP est grisé tant qu'il en reste une.
3. Recharger l'onglet pendant l'écriture : les cases reviennent.
4. STOP dans le premier onglet : écran « fini ». Le second onglet affiche « STOP de … ! » et le compte à rebours ; 10 s plus tard, validation, même avec des cases vides.
5. Validation, onglet de l'hôte : les réponses de la catégorie, basculer ✓/✗, une réponse hors lettre déjà en ✗ et réaccepter, « Catégorie suivante », « ← Précédente », « Voir les scores » sur la 6ᵉ. L'autre onglet voit sa réponse changer en direct.
6. Bilan : points de la manche, réponses ✓/✗, score et rang ; « Suivant » chez l'hôte seulement.
7. Une manche sans STOP : fin au chrono, les cases comptent.

**Temps 3 (TV)**, TV dans un onglet en 1920×1080 avec le son, puis sur Render avec de vrais téléphones :

1. La lettre en grand, les 6 catégories, « Manche 1/5 », chrono et barre ; « ding » à la manche.
2. STOP : bandeau rouge, jingle, compte à rebours de 10 s avec tic-tac sur les 5 dernières.
3. Secret : dans les outils de développement de la TV (messages Socket.IO), aucune case de joueur pendant l'écriture.
4. Validation avec 10 onglets (ou le plus possible) : 10 cartes lisibles depuis le canapé, une réponse de 30 caractères sur 3 lignes, les cartes changent de couleur quand l'hôte bascule, « wah-wah » au refus.
5. Bilan puis classement à 8 s ; partie complète de 5 manches : podium et médailles comme les autres modes ; une partie de chaque autre mode se déroule comme avant.
6. Sur Render, avec de vrais téléphones (iPhone et Android) : le correcteur ne change pas les mots, Entrée passe à la case suivante, le bandeau et STOP restent visibles clavier ouvert.


## Choix validés

Tranchés par Paul le 29/09/2026 : toutes les propositions ci-dessous.

1. **Noms** : mode `petit-bac`, `server/modes/petit-bac.js`, phases `ecriture`, `validation` et `bilan`, écrans du téléphone `ecriture`, `fini`, `validation`, `validation_hote`, `bilan`.
2. **Joueurs** : 2 à 10.
3. **Options** : 3 / **5** / 7 manches, 60 / **90** / 120 s, « Lettres rares » (K, Q, W, X, Y, Z) désactivé par défaut. Le chrono maximal de **90 s** sans STOP : 15 s par case, assez pour un groupe lent, et le STOP écourte presque toujours. Une partie de 5 manches dure environ 20 minutes à cause des débats : le choix « 3 manches » sert aux soirées pressées.
4. **Lettre hors règle refusée d'office, mais l'hôte peut la réaccepter** : accents ignorés, et l'article en tête toléré (« Le Havre » pour H). Autre choix : refus définitif, sans recours (plus strict, mais « The Office » pour O serait perdu). Je préfère le refus d'office réversible : même geste que les autres refus, pas de code en plus.
5. **Deux réponses identiques : 1 point chacune**, comme tu l'as écrit (« 1 point par réponse acceptée »). La règle classique (réponse unique 2 points, partagée 1 point, ou 10 et 5) récompense l'originalité, mais demande de décider ce qui est « identique » (« Maroc » et « le Maroc », « Tomate » et « Tomates ») : on pourrait reprendre `cleReponse` de Même réponse, mais ça ajoute un affichage et un débat de plus. Je propose 1 point chacune, et la règle classique plus tard si elle vous manque.
6. **STOP seulement avec 6 cases qui commencent par la lettre** (vérifié par le serveur). Sinon, taper « a » partout et appuyer sur STOP couperait les autres à 10 s. Après un STOP, « J'ai fini » est permis à tout moment, même avec des cases vides.
7. **Pas de bouton « Valider »** : les cases sont envoyées à chaque changement et comptent telles quelles à la fin de l'écriture, comme les brouillons du Mot le plus long. Rien n'est perdu faute d'avoir appuyé à temps.
8. **Clavier du téléphone**, avec correcteur, suggestions et saisie automatique désactivés : le correcteur remplace souvent un mot rare ou un nom propre. Entrée passe à la case suivante ; lettre et STOP dans un bandeau collé en haut, pour rester visibles clavier ouvert.
9. **Compte à rebours du STOP sur le téléphone** aussi (en plus de la TV), calculé depuis `tempsRestantMs` envoyé par le serveur : les joueurs ont les yeux sur leur téléphone quand ils tapent. C'est de l'affichage : le serveur seul décide de la fin.
10. **Validation sans chrono, au rythme de l'hôte**, catégorie par catégorie, avec « ← Précédente » pour revenir sur une erreur. Autre choix : un chrono par catégorie (par exemple 30 s) qui passe tout seul, mais il couperait les débats, qui sont le sel du jeu.
11. **Les autres joueurs**, pendant la validation, ne voient sur leur téléphone que leur propre réponse et son ✓/✗ en direct, plus leurs points provisoires : les réponses de tous sont sur la TV.
12. **TV : une catégorie à la fois**, cartes de 5 colonnes × 2 rangées, réponse en 48 px (44 px sur 4 lignes après mesure, voir « Écrans »). Les 6 catégories × 10 joueurs à 40 px ne tiennent pas (voir « Écrans »).
13. **Catégories retirées à chaque manche** (6 parmi 13), et pas seulement la lettre : plus de variété. Autre choix : les mêmes 6 catégories pour toute la partie, comme sur une feuille de papier.
14. **Bilan de 15 s** : les points de la manche, puis le classement à 8 s. L'hôte peut passer plus tôt.
15. **Sons** : `lancement` au STOP (le seul moment où il faut que tout le monde lève la tête), `rate` quand l'hôte refuse une réponse, `etape` à chaque catégorie. Aucun nouveau son.
