# Tranche 28 — Mot le plus long

Mini-spec de la tranche 28. Elle a été validée le 28/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes (`docs/modes/estimation.md`), sur les options de l'hôte (tranche 27) et sur `docs/sons.md`.

Inspiré de « Des chiffres et des lettres » : 9 lettres tirées au hasard, chacun forme en secret le mot le plus long possible sur son téléphone.

La tranche se code en quatre temps, chacun testé (et commité avec ton accord) avant de passer au suivant, comme le GéoQuiz :

1. **Contenu** : `scripts/construire-mots.js`, `data/mots.txt`, `scripts/verifier-mots.js` et leurs tests.
2. **Serveur** : `server/modes/mot-le-plus-long.js` et ses tests. Le mode n'entre pas encore dans le registre : invisible en jeu.
3. **Téléphone** : le mode entre dans le registre, écrans du téléphone, options.
4. **TV, sons et doc** : lettres et chrono, révélation des mots, sons, mise à jour de `spec.md`, `sons.md` et `CLAUDE.md`.

Entre les temps 3 et 4, la TV n'a pas encore d'écran pour ce mode : on ne lance une partie qu'avec des onglets `?dev`, jamais en soirée.


## Règles

- **2 à 10 joueurs.**
- Une partie compte **5, 6 ou 7 manches** (option de l'hôte, **6** par défaut).
- **Manche** : la TV affiche 9 lettres et un chrono de **45 s** (option : 30, **45** ou 60 s). Chaque téléphone affiche les mêmes 9 lettres.
- **Former son mot** : le joueur touche les lettres dans l'ordre (voir « Écrans »). Chaque lettre ne sert qu'une fois ; une lettre tirée deux fois peut servir deux fois.
- **Valider** : bouton grisé tant que le mot a moins de 2 lettres. Une fois validé, le mot ne change plus : « En attente des autres joueurs… (x/n) ».
- **Fin du chrono** : le dernier mot formé est validé automatiquement par le serveur. Mot vide : pas de mot, 0 point.
- **Fin de manche** : quand tous les joueurs attendus encore connectés ont validé, ou à 0 s.
- **Joueurs attendus** : ceux connectés au début de la manche, comme dans les autres modes.
- **Révélation** : 15 s, puis manche suivante. L'hôte peut passer plus tôt (« Suivant »). Après la dernière : podium commun, médailles et points globaux comme les autres modes.

### Validité d'un mot

Vérifiée **par le serveur**, dans cet ordre :

1. **Lettres** : le mot n'utilise que des lettres du tirage, chacune au plus autant de fois qu'elle a été tirée. Sinon : « lettres absentes » (impossible avec les tuiles, mais le serveur vérifie toujours).
2. **Dictionnaire** : le mot est dans `data/mots.txt`. Sinon : « pas dans le dictionnaire ».

Les mots sont comparés **en majuscules, sans accents ni cédille** (`ÉTÉ` = `ETE`, `ŒUF` = `OEUF`). Les formes conjuguées, pluriels et féminins comptent (« CHANTIONS », « BELLES »), s'ils sont dans le dictionnaire. Pas de nom propre, pas de mot composé (trait d'union, apostrophe, espace).

### Points

- Le **mot valide le plus long** de la manche marque **autant de points que de lettres** (7 lettres → 7 points).
- **Ex æquo** : tous les joueurs qui ont un mot valide de cette longueur marquent.
- Mot valide plus court, mot invalide ou pas de mot : **0**.
- Aucun mot valide dans la manche : personne ne marque.
- Barème bien plus bas que les autres modes (9 au plus par manche) : sans effet, les médailles se jouent au rang dans la partie.
- Classement avec ex æquo comme partout (1, 1, 3).

### Tirage des lettres

- Les lettres sont tirées **sans remise dans un sac** qui suit la répartition des lettres du Scrabble français (sans les jokers), pour que les lettres fréquentes sortent plus souvent : A 9, B 2, C 2, D 3, E 15, F 2, G 2, H 2, I 8, J 1, K 1, L 5, M 3, N 6, O 6, P 2, Q 1, R 6, S 6, T 6, U 6, V 2, W 1, X 1, Y 1, Z 1.
- **Au moins 2 voyelles et 2 consonnes** (voyelles : A, E, I, O, U, Y).
- **Tirage jouable** : le serveur cherche dans le dictionnaire le mot le plus long possible avec ces lettres. S'il fait moins de **6 lettres**, on retire. C'est aussi le mot que la TV montre à la révélation (« Le plus long possible : … »).
- Les 5 à 7 tirages sont faits au lancement de la partie.


## Phases et chronos

`etatMode.phase` vaut `recherche` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `recherche` | 45 s (option) | Tous les attendus ont validé, ou fin du chrono (les mots en cours sont alors validés) |
| `revelation` | 15 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

Une manche dure donc au plus 1 min, une partie de 6 manches environ 6 minutes.


## `etatMode` sur le serveur

```json
{
  "phase": "recherche",
  "questions": [{ "lettres": ["T", "R", "E", "S", "A", "L", "N", "I", "G"], "meilleur": "TRIANGLES" }],
  "indexQuestion": 0,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d"],
  "brouillons": { "j_1b9c7d": "SIGNE" },
  "reponses": { "j_8f3k2a": { "mot": "SANGLIER", "recuA": 1758641201000 } }
}
```

- `questions`, `indexQuestion`, `debutPhaseA`, `attendus`, `reponses` : les noms des autres modes, pour réutiliser les aides de `commun.js`. Une « question » est ici un tirage. Pas de `questionsVues` : les tirages sont aléatoires, pas pris dans une banque.
- `meilleur` : un mot le plus long possible pour ce tirage (le premier trouvé dans l'ordre du dictionnaire).
- `brouillons` : le dernier mot **non validé** de chaque joueur. À la fin du chrono, le brouillon non vide d'un attendu sans réponse devient sa réponse.
- `reponses` : les mots **validés**.
- Validité et points ne sont pas stockés : `calculerResultats(reponses, question, dictionnaire)` les calcule (fonction pure).
- Le dictionnaire est lu **une fois au démarrage du serveur** (un `Set` des mots de `data/mots.txt`), hors de `etatMode`.


## Événements

Aucun nouvel événement.

| Événement | Contenu en Mot le plus long |
|---|---|
| `joueur:repondre` | En `recherche` : `{ mot, valide }`. `valide: false` à chaque lettre touchée ou effacée (brouillon), `valide: true` avec « Valider ». Le mot est ramené en majuscules sans accents. Refusé si `mot` n'est pas un texte de 0 à 9 lettres A–Z, s'il utilise des lettres absentes du tirage (le téléphone ne le permet pas), si le joueur n'est pas attendu ou a déjà validé, si `valide: true` avec moins de 2 lettres. Ignoré en `revelation`. Un brouillon ne fait pas de diffusion. |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:reglerMode` | En salle d'attente et au tableau : `{ longueur: 5 | 6 | 7, temps: 30 | 45 | 60 }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Les 9 lettres | Tout le monde, dès le début de la manche. |
| Mot d'un joueur (brouillon ou validé) | Personne avant la révélation, sauf le joueur lui-même. La TV sait seulement qui a validé. |
| Le plus long possible (`meilleur`) | **Personne avant la révélation**, ni la TV ni les téléphones. |
| Validité, points | À la révélation. |


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `recherche` | `phase`, `numero`, `total`, `lettres`, `ontRepondu` (liste d'`id`), `tempsRestantMs` |
| `revelation` | Idem, plus `resultats: [{ id, mot, longueur, valide, raison, points }]` triés par longueur de mot valide puis invalide, `sansReponse` (attendus sans mot), `meilleur`, puis `classement` |
| podium | `classement` |

`raison` : `null`, `'lettres'` ou `'dictionnaire'`.


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Contenu |
|---|---|
| `recherche` | `numero`, `total`, `lettres`, `mot` (son brouillon, ou `''`) : le mot revient après un rechargement de la page |
| `mot_valide` | `lettres`, `mot`, `nbValides`, `nbAttendus` : « En attente des autres joueurs… (x/n) » |
| `resultat` | `mot` (ou `null`), `valide`, `raison`, `points`, `meilleur`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche |


## Écrans

### Téléphone (portrait)

- **Recherche** : en haut « Manche 2/6 · Regarde la TV ». Au milieu, le mot en cours en grandes lettres (cases vides jusqu'à 9). Dessous, les **9 tuiles** des lettres tirées, en grille 3×3. Toucher une tuile ajoute sa lettre au mot et grise la tuile ; « ⌫ » retire la dernière lettre (la tuile revient), « Effacer » vide le mot. Bouton « Valider » en bas, grisé sous 2 lettres. Pas de clavier du téléphone : pas de correcteur automatique, pas d'accents, pas de lettre absente du tirage, et l'écran n'est pas caché par le clavier.
- **Mot validé** : « Mot validé » et le mot, sans les tuiles (plus rien à toucher), bandeau « En attente des autres joueurs… (x/n) ».
- **Résultat** : son mot, « Valide ✓ » en vert ou la raison en rouge (« Pas dans le dictionnaire », « Lettres absentes »), les points gagnés (« +7, le plus long ! » ou « 0 point : il y avait plus long »), « Le plus long possible : TRIANGLES », score total et rang. Sans mot : « Pas de mot, 0 point ».

### TV (1920×1080)

- **Recherche** : les 9 lettres en grandes tuiles sur une ligne, au centre ; en haut « Manche 2/6 » et le chrono avec sa barre ; en bas les pastilles des joueurs qui ont validé (`afficherAttenteReponses` de `tv.js`).
- **Révélation** :
  1. en haut, à côté du numéro de manche : « Le plus long possible » et ce mot en tuiles, qui arrive après les mots des joueurs ;
  2. les mots des joueurs apparaissent un par un (un toutes les 0,4 s), du dernier de la liste au premier, donc le plus long en dernier (suspense), chacun sur une ligne : pastille du joueur, mot en tuiles, longueur, ✓ vert ou ✗ rouge avec la raison, points de la manche ; les joueurs sans mot en dernier, grisés (« pas de mot ») ;
  3. le mot gagnant garde ses tuiles jaunes, les autres sont sur fond blanc ; tout est écrit en 40 px au moins (règle de lisibilité de la TV) ;
  4. à 8 s, le classement général (flèches ▲▼ communes) prend la place des mots : à 40 px, les mots et le classement ne tiennent pas côte à côte sur 1920 px.


## Sons

Communs à la TV, comme les autres modes (`docs/sons.md`, « Quand jouer quoi ») :

| Moment | Son |
|---|---|
| Nouvelle manche | `etape` |
| Un joueur valide (`ontRepondu` s'allonge) | `reponse` |
| Révélation | `revelation` |

Tic-tac des 5 dernières secondes et podium : communs.


## Contenu

### Source du dictionnaire

**Lexique 3.83** (lexique.org, New & Pallier), sous **licence CC BY-SA 4.0** : environ 140 000 formes du français (conjugaisons, pluriels, féminins), avec leur catégorie grammaticale. Fichier `Lexique383.tsv` (26 Mo), téléchargeable directement sur `http://www.lexique.org/databases/Lexique383/`.

- Libre et redistribuable : `data/mots.txt` en est dérivé, il est donc lui aussi sous CC BY-SA 4.0. Le crédit est écrit en tête de `scripts/construire-mots.js`, dans cette mini-spec et dans `docs/spec.md` (« Contenu »).
- Limite : Lexique vient de textes réels, pas d'un dictionnaire de Scrabble. Quelques formes rares (« CHANTASSE ») manquent, et un mot juste être refusé. On l'accepte (voir « Choix validés », point 6).
- L'Officiel du Scrabble (ODS) est écarté : il n'est pas libre.

### Fichiers

- `scripts/construire-mots.js` (Node, sans dépendance), **jamais exécuté par le serveur** :
  1. lit `Lexique383.tsv`, téléchargé par le script avec `fetch`, ou un fichier local passé en argument si le téléchargement est bloqué (pare-feu du PC d'entreprise) ;
  2. garde les formes (colonne `ortho`) qui ne sont faites que de lettres, sans trait d'union, apostrophe ni espace ;
  3. écarte les catégories qui ne sont pas des mots du jeu : onomatopées (`ONO`), abréviations et sigles s'il y en a ;
  4. ramène chaque forme en majuscules sans accents (`Œ` → `OE`, `Æ` → `AE`), garde celles de **2 à 9 lettres** qui ont au moins une voyelle (les abréviations de Lexique, « km », « ml », « pc », n'en ont pas), retire les doublons, trie ;
  5. écrit `data/mots.txt` et affiche le nombre de mots par longueur.
- `data/mots.txt` : un mot par ligne, `A`–`Z` seulement, trié. 69 948 mots, 574 Ko. Lexique n'a pas de noms propres (« PARIS » y est, pluriel de « pari »).
- `scripts/verifier-mots.js` : vérifie le fichier.


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la recherche | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. Son brouillon est validé à la fin du chrono. |
| Joueur qui revient pendant la même manche | Retrouve ses lettres et son mot (brouillon ou validé). |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante. |
| Mot validé puis nouvelle lettre | Refusé par le téléphone (tuiles verrouillées) et par le serveur. |
| Mot d'une lettre à la fin du chrono | Validé tel quel, puis invalide (pas dans le dictionnaire, qui commence à 2 lettres) : 0 point. |
| Mot trafiqué (lettre absente, chiffre, 12 lettres) | Ignoré par le serveur, sans message. |
| Aucun mot valide | Révélation normale, personne ne marque, « Le plus long possible » affiché. |
| Tirage sans mot de 6 lettres | Retiré par le serveur avant la partie (jamais vu par les joueurs). |
| L'hôte termine pendant une recherche | Podium avec les scores actuels, la manche en cours n'est pas comptée. |
| `data/mots.txt` absent au démarrage | Comme le pack du GéoQuiz : le fichier est commité et lu au démarrage, le serveur ne démarre pas et `npm test` échoue, avant tout déploiement. |


## Modifications à reporter (code partagé)

Uniquement des ajouts :

- `server/modes/index.js` : `mot-le-plus-long` entre dans le registre (temps 3).
- `public/joueur/index.html`, `public/joueur/joueur.css`, `public/joueur/modes/mot-le-plus-long.js` : écrans du téléphone (temps 3).
- `public/tv/index.html`, `public/tv/modes/mot-le-plus-long.js` et `.css` : écrans de la TV (temps 4).
- `docs/spec.md` : ligne du mode dans « Modes de jeu supplémentaires » (« disponible »), tranche 28, « Options de l'hôte » (5 / **6** / 7 manches, 30 / **45** / 60 s), crédit de Lexique dans « Contenu » (temps 4).
- `docs/sons.md`, `CLAUDE.md` (structure, commandes) (temps 4).


## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`. Les tests du serveur utilisent un petit dictionnaire de test, pas `data/mots.txt`.

**Contenu (temps 1)** : `verifier-mots.js` détecte une ligne vide, un caractère hors `A`–`Z` (accent, minuscule, trait d'union), un mot de 1 ou de plus de 9 lettres, un doublon, un fichier non trié, moins de 20 000 mots ; le vrai fichier passe. La normalisation de `construire-mots.js` : `Été` → `ETE`, `œuvre` → `OEUVRE`, `aujourd'hui` et `c'est-à-dire` écartés.

**Serveur (temps 2)** :

- tirage : 9 lettres, au moins 2 voyelles et 2 consonnes, jamais plus d'exemplaires d'une lettre que dans le sac, sur 1 000 tirages ; tirage retiré quand le plus long possible fait moins de 6 lettres ;
- plus long possible : trouvé dans le petit dictionnaire, lettres en double respectées (avec un seul L tiré, `ELLE` n'est pas trouvé) ;
- validité : lettres absentes, lettre utilisée trop de fois, absent du dictionnaire, accents et minuscules ramenés ;
- points : le plus long seul marque sa longueur, ex æquo tous marquent, plus court 0, invalide plus long qu'un valide ne compte pas, aucun valide personne ;
- réglages : 5, 6, 7 manches et 30, 45, 60 s acceptés, le reste refusé, 6 et 45 par défaut ;
- `joueur:repondre` : validations (pas un objet, `mot` non texte, 10 lettres, chiffre, lettre absente, joueur non attendu, déjà validé, `valide` sous 2 lettres, hors phase) ; un brouillon remplace le précédent ;
- fin de manche : anticipée quand tous ont validé, après la déconnexion du dernier attendu ; à la fin du chrono les brouillons sont validés, brouillon vide = pas de mot ; révélation 15 s ; podium après la dernière manche ;
- secret : en `recherche`, ni `vueTv` ni `vueJoueur` ne contiennent `meilleur` ni le mot d'un autre joueur ;
- points ajoutés à la révélation seulement, pas comptés si l'hôte termine pendant la recherche ; « Suivant » de l'hôte seulement ;
- `npm test` : tous les tests des autres modes restent verts, sans modification.


## Test de la tranche (à faire toi-même)

**Temps 1 (contenu)**

1. `node scripts/construire-mots.js` (ou, si le téléchargement est bloqué, télécharger `Lexique383.tsv` à la main et `node scripts/construire-mots.js <chemin du fichier>`) : le nombre de mots par longueur s'affiche.
2. Ouvrir `data/mots.txt` : que des majuscules sans accents, triées ; chercher quelques mots (`MAISON`, `CHANTONS`, `OEUF`, `ETE`) et vérifier qu'un nom propre (`MARSEILLE`) et une abréviation (`KM`) n'y sont pas.
3. `node scripts/verifier-mots.js` sans erreur. `npm test` passe.

**Temps 2 (serveur)** : `npm test` passe (tests du mode et tous les autres).

**Temps 3 (téléphone)**, en local avec des onglets `?dev` (portrait) :

1. Le sélecteur de l'hôte propose « Mot le plus long », jouable à 2. Les options proposent 5, 6, 7 manches et 30, 45, 60 s.
2. Lancer : 9 tuiles, au moins 2 voyelles et 2 consonnes. Toucher une tuile : la lettre s'ajoute, la tuile se grise. « ⌫ » et « Effacer » fonctionnent. « Valider » grisé sous 2 lettres.
3. Valider : tuiles verrouillées, « En attente des autres joueurs… (1/2) ».
4. Recharger l'onglet pendant la manche : le mot revient.
5. Former un mot sans valider dans le second onglet, attendre la fin du chrono : il est pris en compte. Former un mot inventé : « Pas dans le dictionnaire », 0 point.
6. Résultat : validité, points, « Le plus long possible », score et rang ; « Suivant » chez l'hôte seulement.

**Temps 4 (TV)**, TV dans un onglet en 1920×1080 avec le son, puis sur Render avec de vrais téléphones :

1. Les 9 lettres en grand, « Manche 1/6 », chrono et barre ; « ding » à la manche, « tic » à chaque validation, tic-tac sur les 5 dernières secondes.
2. Secret : dans les outils de développement de la TV (messages Socket.IO), aucun mot de joueur ni `meilleur` pendant la recherche.
3. Révélation : les mots arrivent un par un, le plus long en dernier, ✓/✗ et raisons lisibles depuis le canapé, puis le plus long possible en haut ; à 8 s, le classement prend la place des mots.
4. Partie complète de 6 manches : podium et médailles comme les autres modes ; une partie de chaque autre mode se déroule comme avant.


## Choix validés

Tranchés par Paul le 28/09/2026 :

1. **Noms** : mode `mot-le-plus-long`, `server/modes/mot-le-plus-long.js`, `data/mots.txt`, `scripts/construire-mots.js`, `scripts/verifier-mots.js`, phases `recherche` et `revelation`.
2. **Joueurs** : 2 à 10.
3. **Options** : 5 / **6** / 7 manches, 30 / **45** / 60 s.
4. **Saisie par tuiles** plutôt qu'au clavier du téléphone (ta demande disait « tape son mot ») : pas de correcteur, pas d'accents, pas de lettre absente, et le clavier ne cache pas l'écran.
5. **Dictionnaire** : Lexique 3.83 (CC BY-SA 4.0), mots comparés sans accents, formes conjuguées et pluriels acceptés, ni noms propres ni mots composés.
6. **Mot juste mais absent du dictionnaire** : refusé, sans recours. Autre choix possible : l'hôte peut accepter à la main un mot refusé pour « pas dans le dictionnaire » pendant la révélation, comme au Petit bac (plus de code : une action `hote:*` et un recalcul des points).
7. **Tirage** : sac du Scrabble français, au moins 2 voyelles (Y compris) et 2 consonnes, retiré si le plus long possible fait moins de 6 lettres.
8. **Révélation** : 15 s puis manche suivante automatique, l'hôte pouvant passer plus tôt ; la TV montre le plus long possible trouvé par l'ordinateur.
9. **Brouillon et validation** comme au GéoQuiz : le mot en cours est envoyé à chaque changement et validé automatiquement à la fin du chrono.
