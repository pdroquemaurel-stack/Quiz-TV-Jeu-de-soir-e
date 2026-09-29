# Tranche 29 — Le compte est bon

Mini-spec de la tranche 29. Elle a été validée le 29/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes (`docs/modes/estimation.md`), sur les options de l'hôte (tranche 27) et sur `docs/sons.md`.

Inspiré de « Des chiffres et des lettres » : 6 plaques et un nombre cible. Chacun construit en secret sur son téléphone un calcul qui tombe sur la cible, ou le plus près possible.

La tranche se code en trois temps, chacun testé (et commité avec ton accord) avant de passer au suivant. Il n'y a pas de temps « Contenu » : les tirages sont aléatoires, sans fichier de données ni script de vérification.

1. **Serveur** : `server/modes/le-compte-est-bon.js` (règles, recherche de solution, déroulé, vues) et ses tests. Le mode n'entre pas encore dans le registre : invisible en jeu.
2. **Téléphone** : le mode entre dans le registre, écrans du téléphone, options.
3. **TV, sons et doc** : plaques, cible et chrono, révélation, sons, mise à jour de `spec.md`, `sons.md` et `CLAUDE.md`.

Entre les temps 2 et 3, la TV n'a pas encore d'écran pour ce mode : on ne lance une partie qu'avec des onglets `?dev`, jamais en soirée.


## Règles

- **2 à 10 joueurs.**
- Une partie compte **3, 5 ou 7 manches** (option de l'hôte, **5** par défaut).
- **Manche** : la TV affiche 6 plaques, une cible et un chrono de **60 s** (option : 45, **60** ou 90 s). Chaque téléphone affiche les mêmes plaques et la même cible.
- **Construire un calcul** : le joueur enchaîne des étapes « plaque, opération, plaque » (voir « Écrans »). Le résultat d'une étape devient une nouvelle plaque, utilisable dans les étapes suivantes. Chaque plaque ne sert qu'une fois ; une plaque tirée deux fois peut servir deux fois. Il n'est pas obligatoire d'utiliser toutes les plaques. 5 étapes au plus (6 plaques).
- **Opérations permises** : le résultat de chaque étape est un **entier strictement positif**.
  - `+` et `×` : toujours ;
  - `−` : seulement si la première plaque est **plus grande** que la seconde (ni résultat nul, ni négatif) ;
  - `÷` : seulement si la division **tombe juste**.
- **Proposer** : « = » propose le résultat de la dernière étape. **3 propositions** au plus par manche ; la **plus proche de la cible** est gardée (à égalité, la première).
- **Joueur qui a fini** : il a trouvé le compte exact, ou fait 3 propositions, ou appuyé sur « J'ai fini » (proposé dès sa première proposition). Plus rien à toucher : « En attente des autres joueurs… (x/n) ».
- **Fin du chrono** : le calcul en cours d'un joueur qui n'a pas fini devient automatiquement une proposition (s'il a au moins une étape). Il ne peut qu'améliorer sa meilleure proposition, puisque la plus proche est gardée.
- **Fin de manche** : quand tous les joueurs attendus encore connectés ont fini, ou à 0 s.
- **Joueurs attendus** : ceux connectés au début de la manche, comme dans les autres modes.
- **Révélation** : 20 s, puis manche suivante. L'hôte peut passer plus tôt (« Suivant »). Après la dernière : podium commun, médailles et points globaux comme les autres modes.

### Validité d'un calcul

Le téléphone ne propose que les coups permis, mais **le serveur rejoue chaque calcul reçu** (serveur autoritaire), étape par étape, à partir des 6 plaques de la manche :

1. les deux nombres de l'étape sont disponibles (plaques pas encore utilisées, ou résultats d'étapes précédentes pas encore utilisés) ;
2. l'opération est l'une des quatre, et son résultat est un entier strictement positif ;
3. 5 étapes au plus.

Un calcul qui échoue est **ignoré sans message** (il ne peut venir que d'un téléphone trafiqué). Il n'y a donc jamais de proposition « invalide » à la révélation.

### Points

- **L'écart** d'une proposition est la distance à la cible, **au-dessus comme au-dessous** (cible 742 : 740 et 744 sont tous deux à 2).
- **Compte exact** (écart 0) : **10 points**, pour tous ceux qui l'ont trouvé.
- **Personne n'a le compte exact** : le ou les joueurs **les plus proches** marquent **5 points**, quel que soit leur écart.
- Si quelqu'un a le compte exact, les autres ne marquent rien, même proches.
- Pas de proposition : **0**.
- Barème bas comme au Mot le plus long (10 au plus par manche) : sans effet, les médailles se jouent au rang dans la partie.
- Classement avec ex æquo comme partout (1, 1, 3).

### Tirage

- **Plaques** : 6 plaques tirées **sans remise** parmi les 24 du jeu : 1 à 10 en deux exemplaires, et 25, 50, 75, 100 en un exemplaire.
- **Cible** : un entier tiré au hasard de **101 à 999**.
- **Tirage jouable** : le serveur cherche une solution exacte. S'il n'y en a pas, on retire plaques et cible. Environ 8 % des tirages sont retirés (7 à 9 % selon les mesures, sur 2 000 tirages). La solution trouvée est celle que la TV montre à la révélation.
- Les 3 à 7 tirages sont faits au lancement de la partie.

### La solution de l'ordinateur

- **Recherche exhaustive** en profondeur, avec **approfondissement progressif** : d'abord toutes les solutions en 1 étape, puis en 2, … jusqu'à 5. La première solution trouvée est donc l'une des **plus courtes**, la plus facile à lire sur la TV.
- Coups inutiles écartés pour aller plus vite : `× 1`, `÷ 1`, et `a − b` ou `a ÷ b` quand le résultat vaut `b` (on retrouve le même nombre). Ils ne changent pas l'existence d'une solution.
- **Temps mesuré** sur le PC de développement (Ryzen 5, 2 000 tirages) : **4 ms** en moyenne par tirage, **50 ms** au pire (un tirage sans solution, où tout est exploré). La recherche mémorise les ensembles de nombres déjà explorés : deux chemins qui mènent aux mêmes nombres restants ne sont explorés qu'une fois (4 fois plus rapide qu'un premier essai sans cette mémoire). Pour une partie de 5 manches, avec les tirages retirés : quelques dizaines de ms.
- **Sur Render** (offre gratuite, une fraction de processeur) : même 10 fois plus lent, le lancement d'une partie reste bien sous la seconde, pendant laquelle le serveur ne répond à personne. Un test vérifie qu'un tirage sans solution se résout en moins de 300 ms en local, et le journal (`journal.js`) note la durée des tirages au lancement, pour la voir dans les logs Render.


## Phases et chronos

`etatMode.phase` vaut `recherche` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `recherche` | 60 s (option) | Tous les attendus ont fini, ou fin du chrono (les calculs en cours sont alors proposés) |
| `revelation` | 20 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

Une manche dure donc au plus 1 min 20 s, une partie de 5 manches environ 7 minutes.


## `etatMode` sur le serveur

```json
{
  "phase": "recherche",
  "questions": [{
    "plaques": [75, 4, 7, 25, 9, 1],
    "cible": 742,
    "solution": [{ "a": 75, "op": "+", "b": 25, "resultat": 100 }, { "a": 100, "op": "*", "b": 7, "resultat": 700 }, "…"]
  }],
  "indexQuestion": 0,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d"],
  "brouillons": { "j_1b9c7d": [{ "a": 75, "op": "*", "b": 9, "resultat": 675 }] },
  "propositions": { "j_8f3k2a": [{ "etapes": ["…"], "resultat": 740, "recuA": 1758641201000 }] },
  "reponses": { "j_8f3k2a": { "recuA": 1758641230000 } }
}
```

- `questions`, `indexQuestion`, `debutPhaseA`, `attendus`, `reponses` : les noms des autres modes, pour réutiliser les aides de `commun.js`. Une « question » est ici un tirage.
- `op` vaut `'+'`, `'-'`, `'*'` ou `'/'` (affichés `+`, `−`, `×`, `÷`). Les étapes stockées portent leur `resultat`, **calculé par le serveur**.
- `brouillons` : le calcul en cours, **non proposé**, de chaque joueur. À la fin du chrono, le brouillon d'un attendu qui n'a pas fini devient une proposition.
- `propositions` : les 1 à 3 propositions de chaque joueur, dans l'ordre.
- `reponses` : les joueurs **qui ont fini** (exact, 3 propositions ou « J'ai fini »). C'est ce que comptent `tousOntRepondu` et les pastilles de la TV.
- Écarts et points ne sont pas stockés : `calculerResultats(propositions, cible)` les calcule (fonction pure).


## Événements

Aucun nouvel événement.

| Événement | Contenu au Compte est bon |
|---|---|
| `joueur:repondre` | En `recherche` : `{ action, etapes }`. `action: 'brouillon'` à chaque étape ajoutée ou annulée, `action: 'proposer'` avec « = », `action: 'fini'` avec « J'ai fini » (sans `etapes`). `etapes` : liste de `{ a, op, b }`, le serveur recalcule les résultats. Refusé si le calcul ne se rejoue pas (voir « Validité d'un calcul »), si le joueur n'est pas attendu ou a fini, si `proposer` n'a aucune étape, si `fini` arrive avant toute proposition. Ignoré en `revelation`. Un brouillon ne fait pas de diffusion. |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:reglerMode` | En salle d'attente et au tableau : `{ longueur: 3 | 5 | 7, temps: 45 | 60 | 90 }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Les 6 plaques et la cible | Tout le monde, dès le début de la manche. |
| Calculs et propositions d'un joueur | Personne avant la révélation, sauf le joueur lui-même. La TV sait seulement qui a fini (pas s'il a le compte exact). |
| La solution de l'ordinateur | **Personne avant la révélation**, ni la TV ni les téléphones. |
| Écarts, points | À la révélation. Le joueur voit l'écart de ses propres propositions dès qu'il propose (il connaît la cible, ce n'est pas un secret). |


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `recherche` | `phase`, `numero`, `total`, `plaques`, `cible`, `ontRepondu` (liste d'`id` des joueurs qui ont fini), `tempsRestantMs` |
| `revelation` | Idem, plus `resultats: [{ id, resultat, ecart, etapes, points }]` (la meilleure proposition de chaque joueur, triée par écart puis ordre d'arrivée), `sansReponse` (attendus sans proposition), `solution`, puis `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Contenu |
|---|---|
| `recherche` | `numero`, `total`, `plaques`, `cible`, `etapes` (son brouillon, ou `[]`), `propositions: [{ resultat, ecart }]` : le calcul et les propositions reviennent après un rechargement de la page |
| `fini` | `plaques`, `cible`, `propositions`, `nbFinis`, `nbAttendus` : « En attente des autres joueurs… (x/n) » |
| `resultat` | `cible`, `resultat` et `ecart` de sa meilleure proposition (ou `null`), `etapes` de ce calcul, `points`, `solution`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche |

Le téléphone calcule lui-même, pour l'affichage, les résultats des étapes et les coups permis (griser un bouton) : c'est de l'affichage, pas de la logique de jeu. Seul le serveur décide de ce qui compte.


## Écrans

### Téléphone (portrait)

- **Recherche** :
  - en haut « Manche 2/5 · Regarde la TV », puis la **cible** en très grand ;
  - dessous, le **calcul en cours**, une ligne par étape (`75 + 25 = 100`), et l'étape commencée (`100 × …`) ;
  - les **6 cases** des plaques, en grille 3×2. Quand une étape est complète, son résultat prend la case de la première plaque (en jaune, pour le distinguer d'une plaque tirée) et la case de la seconde se vide ;
  - les **4 opérations** `+ − × ÷` en une rangée ;
  - en bas, « ↶ Annuler » et « Effacer », puis le gros bouton **« = 740 »** (le résultat de la dernière étape), et les propositions déjà faites : « 1. 745 (à 3) · 2. 740 (à 2) ».
- **Construire une étape** :
  1. toucher une case : elle est sélectionnée (entourée) ; la toucher à nouveau la désélectionne ;
  2. toucher une opération : `−` est grisé si aucun autre nombre disponible n'est plus petit, `÷` si aucun ne divise la case choisie ;
  3. toucher une seconde case : les cases qui donneraient un coup interdit sont grisées (pour `−`, celles qui ne sont pas plus petites ; pour `÷`, celles qui ne divisent pas). L'étape est calculée tout de suite, sans autre bouton, et le téléphone envoie son brouillon.
- **Annuler et effacer** : « ↶ Annuler » défait le dernier geste (la seconde case, l'opération, la première case, ou toute la dernière étape, dont les deux nombres reviennent). « Effacer » vide tout le calcul : les 6 plaques reviennent.
- **Proposer** : « = » est grisé tant qu'il n'y a aucune étape, ou quand le dernier résultat vient d'être proposé. Après « = », la proposition s'ajoute à la liste avec son écart, et le **calcul reste affiché** : on peut le continuer, l'annuler en partie ou l'effacer pour une nouvelle tentative. Écart nul : « Le compte est bon ! » en vert, et le joueur a fini.
- **J'ai fini** : bouton discret, visible dès la première proposition, pour ne pas faire attendre les autres.
- **Fini** : « Le compte est bon ! » ou « Tes propositions », la liste, sans les cases (plus rien à toucher), bandeau « En attente des autres joueurs… (x/n) ».
- **Résultat** : son meilleur résultat et son écart (« 740, à 2 »), son calcul, les points gagnés (« +10, le compte est bon ! », « +5, le plus proche ! » ou « 0 point : quelqu'un a fait mieux »), « La solution de l'ordinateur » en dessous, score total et rang. Sans proposition : « Pas de proposition, 0 point ».

### TV (1920×1080)

Tout est écrit en **40 px au moins** (règle de lisibilité de la TV).

- **Recherche** : la **cible** en très grand au centre, les 6 plaques en grandes tuiles sur une ligne en dessous ; en haut « Manche 2/5 » et le chrono avec sa barre ; en bas les pastilles des joueurs qui ont fini (`afficherAttenteReponses` de `tv.js`).
- **Révélation** (20 s) :
  1. **0 s** : la cible et les plaques remontent en haut. Les joueurs apparaissent un par un (un toutes les 0,4 s), du plus loin au plus proche (suspense), chacun sur une ligne : pastille, résultat, écart (« à 12 » ou « Le compte est bon ! » en vert), points de la manche. Les joueurs sans proposition en dernier, grisés (« pas de proposition »).
  2. **8 s** : les lignes cèdent la place à deux calculs côte à côte, une étape par ligne : « Le calcul de Léa » (le meilleur joueur, le premier arrivé en cas d'égalité) et « La solution de l'ordinateur ». Personne n'a proposé : la solution seule, au centre.
  3. **14 s** : le classement général (flèches ▲▼ communes) prend la place des calculs. À 40 px, les lignes des joueurs, les calculs et le classement ne tiennent pas ensemble sur 1080 px.


## Sons

Communs à la TV, comme les autres modes (`docs/sons.md`, « Quand jouer quoi ») :

| Moment | Son |
|---|---|
| Nouvelle manche | `etape` |
| Un joueur a fini (`ontRepondu` s'allonge) | `reponse` |
| Révélation | `revelation` |

Tic-tac des 5 dernières secondes et podium : communs.


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la recherche | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. Ses propositions comptent, son brouillon est proposé à la fin du chrono. |
| Joueur qui revient pendant la même manche | Retrouve plaques, cible, calcul en cours et propositions. |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante. |
| Proposition après avoir fini | Refusée par le téléphone (écran « fini ») et par le serveur. |
| Même résultat proposé deux fois | Accepté (le téléphone grise « = » juste après, mais un même nombre peut revenir par un autre calcul) : compte comme une proposition de plus. |
| Calcul trafiqué (plaque absente, plaque utilisée deux fois, `7 − 9`, `7 ÷ 2`, 6 étapes) | Ignoré par le serveur, sans message. |
| Aucune proposition dans la manche | Révélation normale, personne ne marque, la solution est affichée. |
| Tirage sans solution exacte | Retiré par le serveur avant la partie (jamais vu par les joueurs). |
| L'hôte termine pendant une recherche | Podium avec les scores actuels, la manche en cours n'est pas comptée. |


## Modifications à reporter (code partagé)

Uniquement des ajouts :

- `server/modes/index.js` : `le-compte-est-bon` entre dans le registre (temps 2).
- `public/joueur/index.html`, `public/joueur/joueur.css`, `public/joueur/modes/le-compte-est-bon.js` : écrans du téléphone (temps 2).
- `public/tv/index.html`, `public/tv/modes/le-compte-est-bon.js` et `.css` : écrans de la TV (temps 3).
- `docs/spec.md` : ligne du mode dans « Modes de jeu supplémentaires » (« disponible »), tranche 29, « Options de l'hôte » (3 / **5** / 7 manches, 45 / **60** / 90 s) (temps 3).
- `docs/sons.md`, `CLAUDE.md` (structure) (temps 3).


## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Serveur (temps 1)** :

- tirage : 6 plaques, jamais plus d'exemplaires d'une plaque que dans le jeu (deux 7 au plus, un seul 100), cible de 101 à 999, chaque tirage a une solution exacte, sur 200 tirages (la recherche rend 1 000 tirages trop lents pour `npm test`) ;
- rejouer un calcul : résultats recalculés ; refus d'une plaque absente, d'une plaque utilisée deux fois (et acceptation d'une plaque tirée deux fois utilisée deux fois), d'un résultat intermédiaire réutilisé, d'une soustraction nulle ou négative, d'une division qui ne tombe pas juste, d'une opération inconnue, de 6 étapes, de nombres non entiers ;
- solution de l'ordinateur : exacte sur des tirages connus, validée par la même fonction que les calculs des joueurs, la plus courte (125 avec 100 et 25 : une seule étape), aucune solution sur un tirage impossible connu (1, 1, 2, 2, 3, 3 et 999) ; moins de 300 ms par tirage en local ;
- points : écart au-dessus comme au-dessous, exact 10 pour tous les exacts, sinon le plus proche 5 (ex æquo tous), 0 aux autres, la meilleure des 3 propositions est gardée, à égalité la première ;
- réglages : 3, 5, 7 manches et 45, 60, 90 s acceptés, le reste refusé, 5 et 60 par défaut ;
- `joueur:repondre` : validations (pas un objet, action inconnue, `etapes` pas une liste, calcul qui ne se rejoue pas, joueur non attendu, déjà fini, `proposer` sans étape, `fini` sans proposition, hors phase) ; un brouillon remplace le précédent ; fini à la 3ᵉ proposition et au compte exact ;
- fin de manche : anticipée quand tous ont fini, après la déconnexion du dernier attendu ; à la fin du chrono les brouillons deviennent des propositions, sauf brouillon vide ; révélation 20 s ; podium après la dernière manche ;
- secret : en `recherche`, ni `vueTv` ni `vueJoueur` ne contiennent `solution` ni les calculs d'un autre joueur ;
- points ajoutés à la révélation seulement, pas comptés si l'hôte termine pendant la recherche ; « Suivant » de l'hôte seulement ;
- `npm test` : tous les tests des autres modes restent verts, sans modification.


## Test de la tranche (à faire toi-même)

**Temps 1 (serveur)** : `npm test` passe (tests du mode et tous les autres).

**Temps 2 (téléphone)**, en local avec des onglets `?dev` (portrait) :

1. Le sélecteur de l'hôte propose « Le compte est bon », jouable à 2. Les options proposent 3, 5, 7 manches et 45, 60, 90 s.
2. Lancer : 6 plaques, une cible de 101 à 999. Construire `plaque, +, plaque` : le résultat s'affiche en jaune à la place de la première plaque, la seconde case se vide.
3. Coups interdits : choisir une petite plaque puis `−` ou `÷` : l'opération est grisée s'il n'existe aucun coup possible ; sinon, les cases qui donneraient un résultat négatif, nul ou à virgule sont grisées.
4. « ↶ Annuler » défait geste par geste, « Effacer » ramène les 6 plaques.
5. « = » : la proposition s'ajoute avec son écart, le calcul reste. Trois propositions : écran « fini », « En attente des autres joueurs… (1/2) ». Dans une autre manche, « J'ai fini » après une proposition.
6. Recharger l'onglet pendant la manche : le calcul et les propositions reviennent.
7. Construire un calcul sans « = » dans le second onglet, attendre la fin du chrono : il est pris en compte.
8. Résultat : écart, points, son calcul, la solution de l'ordinateur, score et rang ; « Suivant » chez l'hôte seulement.

**Temps 3 (TV)**, TV dans un onglet en 1920×1080 avec le son, puis sur Render avec de vrais téléphones :

1. La cible en très grand, les 6 plaques, « Manche 1/5 », chrono et barre ; « ding » à la manche, « tic » quand un joueur a fini, tic-tac sur les 5 dernières secondes.
2. Secret : dans les outils de développement de la TV (messages Socket.IO), aucun calcul de joueur ni `solution` pendant la recherche.
3. Révélation : les joueurs arrivent un par un, le plus proche en dernier ; à 8 s, le calcul du meilleur et la solution de l'ordinateur, lisibles depuis le canapé ; à 14 s, le classement.
4. Sur Render : le lancement d'une partie ne fige pas les écrans ; la durée des tirages est dans les logs.
5. Partie complète de 5 manches : podium et médailles comme les autres modes ; une partie de chaque autre mode se déroule comme avant.


## Choix validés

Tranchés par Paul le 29/09/2026 : toutes les propositions ci-dessous.

1. **Noms** : mode `le-compte-est-bon`, `server/modes/le-compte-est-bon.js`, phases `recherche` et `revelation`, écrans du téléphone `recherche`, `fini`, `resultat`.
2. **Joueurs** : 2 à 10.
3. **Options** : 3 / **5** / 7 manches, 45 / **60** / 90 s. Le milieu reprend tes règles (5 manches, 60 s).
4. **« Le plus proche » symétrique** : l'écart compte pareil au-dessus et au-dessous de la cible (740 et 744 pour 742 : ex æquo). Autre choix : à écart égal, celui du dessous gagne. Je préfère le symétrique, plus simple à comprendre et à afficher.
5. **Les 5 points vont au plus proche, quel que soit son écart**, et seulement si personne n'a le compte exact. Autre choix : un plafond (par exemple 5 points seulement à 10 ou moins de la cible). Avec 6 plaques et 60 s, on est presque toujours à moins de 10 : le plafond ne jouerait que contre celui qui a peu proposé, et il faudrait l'expliquer. Je propose sans plafond.
6. **Tirage garanti** : on retire les tirages sans solution exacte (environ 8 %). Le compte exact est donc toujours possible, et la TV montre toujours une solution. Autre choix : tirage libre, comme à la télévision, et la TV montre alors « Au plus près : 741 ». Je préfère garanti : c'est plus frustrant de chercher un compte impossible.
7. **Construction du calcul** : une étape est calculée dès la seconde plaque touchée, sans bouton, et **« = » propose** le résultat de la dernière étape. Ta demande disait « plaque, opération, plaque, = » : avec un « = » à chaque étape, il faudrait un bouton de plus pour proposer, donc un geste de plus par étape. Le résultat d'une étape prend la case de la première plaque, en jaune.
8. **Après une proposition, le calcul reste affiché**, pour le continuer ou l'annuler en partie (« 740, et si j'ajoute 2 ? »), plutôt que de tout effacer.
9. **« J'ai fini »** dès la première proposition, pour ne pas faire attendre les autres jusqu'au bout des 60 s. Autre choix : pas de bouton, la manche finit au compte exact, à la 3ᵉ proposition ou au chrono.
10. **Brouillon** comme au Mot le plus long : le calcul en cours est envoyé à chaque étape et devient une proposition à la fin du chrono (s'il reste de la place), pour ne pas perdre un bon calcul faute d'avoir appuyé sur « = ».
11. **Révélation de 20 s** (au lieu de 15 s) : les résultats, puis à 8 s le calcul du meilleur joueur et la solution de l'ordinateur côte à côte, puis à 14 s le classement. L'hôte peut passer plus tôt.
12. **Solution de l'ordinateur** : la plus courte (recherche exhaustive par approfondissement progressif), calculée au lancement de la partie : quelques dizaines de ms en local, bien moins d'une seconde sur Render, pendant lesquelles le serveur ne répond pas. Autre choix, si c'est trop lent sur Render : calculer chaque tirage au début de sa manche (5 petits arrêts au lieu d'un).
13. **Pas de proposition « invalide »** : un calcul qui ne se rejoue pas est ignoré sans message, le téléphone ne pouvant pas l'envoyer.
