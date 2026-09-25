# Tranche 15 — Le bluff

Mini-spec de la tranche 15. Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes de la tranche 11 (`docs/modes/estimation.md`), sur `docs/modes/meme-reponse.md` (saisie de texte, clé de comparaison), sur `docs/modes/qui-de-nous.md` (vote) et sur `docs/sons.md`. Elle a été validée le 25/09/2026 (voir « Choix validés » à la fin).

Ce mode est le seul à enchaîner **deux saisies par question** : chacun écrit un bluff, puis chacun vote parmi les bluffs et la vraie réponse. C'est aussi celui où le secret est le plus délicat : ni la vraie réponse ni l'auteur d'un bluff ne doivent fuiter avant la révélation.

La tranche se code en deux temps, chacun testé avant de passer au suivant :

1. **Contenu** : `data/bluff.json`, le script de vérification et leurs tests. `cleReponse` quitte `meme-reponse.js` pour `commun.js`. Paul peut relire les questions pendant que le mode se code.
2. **Mode Le bluff** : le mode côté serveur, ses écrans TV et téléphone, ses sons, ses tests. Il quitte `modesAVenir` pour entrer dans le registre.

## Règles

- Une partie compte **8 questions**. Chaque question est un fait **vrai et surprenant**, dont la réponse est courte et que presque personne ne connaît : « Au sumo, les lutteurs lancent ___ sur le ring pour le purifier » → « Du sel ».
- **Saisie** : chaque joueur écrit une **fausse réponse crédible** (un bluff), en une seule réponse définitive (« Valider »). Texte de 1 à 30 caractères une fois les bords retirés, comme en Même réponse.
- **Vote** : la TV et les téléphones affichent toutes les propositions (les bluffs et la vraie réponse), **mélangées par le serveur**, sans auteur. Chaque joueur vote pour celle qu'il croit vraie, un seul vote définitif (un appui). **Son propre bluff n'est pas proposé** sur son téléphone, et le serveur refuse ce vote.
- **Révélation** : la TV dévoile qui a écrit chaque bluff, qui s'y est laissé prendre, puis la vraie réponse.
- **Joueurs** : les joueurs attendus de la manche (connectés au début de la question), comme dans les autres modes. La liste est figée pour la saisie **et** le vote de cette question.
- Fin anticipée de chaque phase : identique au quiz (joueurs attendus encore connectés qui ont tous écrit, puis tous voté).
- Classement général par score total, avec les ex æquo du quiz.

### Points

| Situation | Points |
|---|---|
| Voter pour la vraie réponse | **1000** |
| Chaque joueur qui a voté pour son bluff | **+ 500** |
| Pas de vote, pas de bluff, vote pour un bluff | 0 (pas de malus) |

Exemple à 5 joueurs (Paul, Léa, Sam, Tom, Zoé). Léa et Tom votent pour le bluff de Paul, Sam vote pour celui de Léa, Paul et Zoé trouvent la vérité :
Paul 1000 + 2 × 500 = 2000 ; Léa 500 ; Zoé 1000 ; Sam et Tom 0.

Pourquoi ce barème :

- **Trouver vaut deux piégés** : c'est le barème du jeu de référence (Fibbage). Bluffer rapporte gros si l'on piège plusieurs joueurs, ce qui pousse à écrire des bluffs soignés plutôt qu'à voter au hasard.
- **Aucun malus** : se faire avoir est déjà puni (pas de 1000) et fait rire toute la pièce.
- Ordres de grandeur comparables aux autres modes (quelques milliers de points par partie).

Alternatives écartées :

- *Points de vérité dégressifs selon la rapidité du vote* : pousse à voter sans lire, à l'opposé de l'esprit du jeu.
- *Valeurs qui doublent à la dernière question* : spectaculaire, mais écrase les premières questions.

## Cas délicats de la saisie

### Un bluff qui est (presque) la vraie réponse

On compare avec la **clé** de Même réponse (`cleReponse` : casse, accents, espaces, ponctuation, article en tête, pluriel simple ignorés), et avec les **variantes** de la vraie réponse listées dans le fichier (« Du gros sel » pour « Du sel »…). Pas de tolérance aux fautes de frappe, pour les mêmes raisons qu'en Même réponse.

Si la clé du bluff est celle de la vraie réponse ou d'une variante, le bluff est **accepté sans message** (le téléphone affiche « Ton bluff : … » comme pour tout le monde), puis **fondu dans la vraie réponse** au début du vote :

- il n'apparaît pas comme proposition : la vraie réponse n'est proposée qu'une fois, avec le texte du fichier ;
- son auteur **ne peut marquer aucun point de bluff** pour cette question ;
- il **vote normalement**, y compris pour la vraie réponse (il la connaissait : 1000 points s'il la choisit) ;
- à la révélation, la TV le montre sur la carte de la vérité (« L'avait écrite : Paul ») et son téléphone affiche « Ton bluff était la vraie réponse ! ».

Aucun message pendant la saisie : personne ne peut « sonder » la vraie réponse en essayant des bluffs.

### Deux bluffs identiques

Deux bluffs de **même clé** forment **une seule proposition** au vote, affichée avec le texte du premier arrivé, et elle a **plusieurs auteurs**. Chaque joueur piégé rapporte 500 points **à chacun** de ses auteurs. Aucun des auteurs ne peut voter pour elle.

La fusion se fait au début du vote seulement : pendant la saisie, personne ne sait qu'un autre a eu la même idée. Alternative écartée : refuser le second bluff (« Déjà proposé ») : cela révèle pendant la saisie le bluff d'un autre joueur.

### Présentation uniforme des propositions

Pour qu'on ne repère pas la vraie réponse à sa forme, le serveur **met la première lettre de chaque bluff en majuscule** et retire un point final. Les vraies réponses du fichier sont écrites comme un joueur les taperait : première lettre en majuscule, pas de point final, pas de formulation trop soignée. Les fautes d'orthographe des bluffs restent visibles : c'est le jeu.

### Voter pour son propre bluff

Interdit. Le téléphone ne propose pas son bluff (ni la proposition fusionnée dont il est co-auteur) ; le serveur refuse ce vote. À 1 joueur (`MODE_DEV`), il ne reste que la vraie réponse : le vote est trivial, mais tous les écrans sont parcourables.

### Un joueur qui n'a pas écrit de bluff

Il **vote quand même** : il était attendu, il a toutes les propositions. Il ne peut simplement rien gagner par le bluff.

### Personne n'a écrit de bluff

S'il n'y a aucun bluff (ou seulement des bluffs fondus dans la vérité), il n'y a qu'une proposition : on **saute le vote** et on passe directement à la révélation (« Personne n'a bluffé »), sans points.

### Un joueur arrivé en cours de question

Il n'est pas attendu : ni bluff ni vote pour cette question, écran « En attente de la prochaine question ». Il joue à partir de la question suivante, avec 0 point au départ. Même règle pour un joueur déconnecté au début de la question qui revient pendant celle-ci.

## Phases et chronos

`etatMode.phase` vaut `saisie`, `vote` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `saisie` | 45 s | Tous les attendus ont écrit, ou fin du chrono. Sans proposition à part la vérité : révélation directe |
| `vote` | 25 s | Tous les attendus ont voté, ou fin du chrono |
| `revelation` | 15 s | Fin du chrono ou « Suivant » de l'hôte. Après la 8e : podium |

- 45 s de saisie, plus qu'en Même réponse (30 s) : il faut inventer quelque chose de crédible, pas seulement citer.
- 25 s de vote, plus qu'en Qui de nous ? (20 s) : il faut lire jusqu'à 11 propositions sur la TV.
- 15 s de révélation : les bluffs apparaissent un par un avant la vérité (voir « Écrans »).

Une question dure donc environ 1 min 30, une partie de 8 questions une douzaine de minutes.

## `etatMode` sur le serveur

```json
{
  "phase": "vote",
  "questions": ["...8 questions tirées..."],
  "indexQuestion": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d", "j_4d2e9f", "j_7a1c3b"],
  "bluffs": {
    "j_8f3k2a": { "texte": "chien", "recuA": 1758641195300 },
    "j_1b9c7d": { "texte": "les sels", "recuA": 1758641197100 }
  },
  "propositions": [
    { "texte": "Chien", "auteurs": ["j_8f3k2a"], "vraie": false },
    { "texte": "Du sel", "auteurs": [], "vraie": true, "ontEcritLaVerite": ["j_1b9c7d"] }
  ],
  "reponses": { "j_4d2e9f": { "choix": 1, "recuA": 1758641230000 } }
}
```

- `reponses` garde ce nom pour réutiliser `tousOntRepondu` de `commun.js` : il contient les bluffs pendant la saisie, puis il est vidé au début du vote pour recevoir les votes (comme le fait Undercover entre ses phases). Les bluffs sont alors copiés dans `bluffs`.
- `propositions` : construites au début du vote par une fonction pure (`formerPropositions`) : bluffs trop proches de la vérité rangés dans `ontEcritLaVerite`, fusion des autres bluffs de même clé, présentation uniforme, ajout de la vraie réponse, mélange. **L'ordre est fixé une fois pour toutes** : la TV et tous les téléphones voient le même ordre, et un vote est l'index d'une proposition.
- Les points ne sont pas stockés : `calculerPoints(propositions, reponses)` les calcule, comme `formerGroupes` en Même réponse.

## Événements

Aucun nouvel événement.

| Événement | Contenu en Le bluff |
|---|---|
| `joueur:repondre` | En `saisie` : le texte du bluff (chaîne). Refusé si ce n'est pas une chaîne, s'il est vide ou fait plus de 30 caractères une fois les bords retirés, si sa clé est vide, si le joueur n'est pas attendu ou a déjà un bluff. Un bluff trop proche de la vraie réponse est accepté (voir « Cas délicats »). En `vote` : l'index de la proposition choisie (entier). Refusé si ce n'est pas un index valide, si le joueur en est l'auteur, s'il n'est pas attendu ou a déjà voté. Ignoré en `revelation`. |
| `hote:suivant` | Pendant la révélation : question suivante (ou podium) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Vraie réponse (texte et variantes) | **Personne** avant la révélation. Au vote, la vraie réponse est une proposition parmi d'autres, **sans aucun marqueur** (ni champ `vraie`, ni position fixe, ni forme reconnaissable). Les variantes ne quittent jamais le serveur. |
| Texte d'un bluff | Personne pendant la saisie (seul son auteur voit le sien). Au vote : tout le monde, sans auteur. Un bluff fondu dans la vérité n'est montré à personne avant la révélation. |
| Auteur d'un bluff | Personne avant la révélation, sauf l'auteur lui-même (son téléphone sait quelle proposition est la sienne, pour ne pas la proposer). |
| Qui a voté quoi | Personne pendant le vote (seulement qui a voté). Public à la révélation : c'est le sel du jeu. |

Les vues TV et joueur sont construites champ par champ (jamais en recopiant `propositions`) pour qu'aucun `auteurs`, `vraie` ou `ontEcritLaVerite` ne s'y glisse avant la révélation. Des tests le vérifient.

## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `saisie` | `phase`, `numero`, `total`, `question: { texte }`, `ontRepondu` (liste d'`id`), `tempsRestantMs` |
| `vote` | Idem, plus `propositions: [{ texte }]` dans l'ordre mélangé. `ontRepondu` liste alors ceux qui ont voté |
| `revelation` | Idem, avec `propositions: [{ texte, vraie, auteurs, votants, points }]` (la vraie a aussi `ontEcritLaVerite`), plus `sansBluff` (attendus sans bluff), `sansVote` (attendus sans vote), `personneNaBluffe`, `tousOntTrouve` et `personneNaTrouve` (parmi les votants, faux s'il n'y a aucun vote), puis `classement` |
| podium | `classement` |

`points` d'une proposition : ce que chacun de ses auteurs gagne par elle (500 × votants), 0 pour la vraie.

## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Données |
|---|---|
| `ecrire` | `numero`, `total`, `question: { texte }` |
| `bluff_envoye` | Son bluff |
| `voter` | `numero`, `total`, `question: { texte }`, `propositions: [{ texte, laTienne }]` (`laTienne` vrai seulement sur la sienne) |
| `vote_envoye` | Le texte de la proposition choisie |
| `resultat` | `numero`, `vraieReponse` (texte), `aVote`, `personneNaBluffe` (le vote a été sauté), `aTrouve`, `sonBluff` (texte ou `null`), `bluffVrai` (son bluff était la vraie réponse), `pieges` (nombre de joueurs piégés par son bluff), `pointsBluff` (ce que son bluff lui rapporte), `points` (total de la question), `rang` général. Pour l'hôte : « Suivant » |
| `attente_question`, `fin` | Comme au quiz |

Un joueur attendu qui n'a pas de bluff à la fin de la saisie passe directement à `voter`.

**Jamais** avant la révélation : la vraie réponse, ses variantes, l'auteur d'un bluff d'un autre joueur, le vote d'un autre joueur.

## Écrans

| Où | Écran | Contenu |
|---|---|---|
| TV | Saisie | « Question 3/8 », la question en très gros (le trou `___` bien visible), « Invente une fausse réponse, avec son article (le, la, du…) », chrono, pastilles des joueurs ayant écrit, petit QR code |
| TV | Vote | La question en haut, puis les propositions numérotées en cartes sur deux colonnes (jusqu'à 11), sans couleur de joueur. « Trouve la vraie réponse ! », chrono, pastilles de ceux qui ont voté |
| TV | Révélation | Les cartes apparaissent une par une (opacité et déplacement, une par seconde) : d'abord les bluffs qui ont piégé quelqu'un, du moins au plus voté, une carte d'une ligne par bluff : le texte, « +1000 », « de » et la pastille de l'auteur, puis « a piégé » et les pastilles des piégés (3 au plus, sinon 2 et « +N ») ; au plus les 5 bluffs les plus votés, les autres résumés en « et N autres bluffs » ; puis la vraie réponse, mise en avant (« La vérité ! »), avec dessous les pastilles de ceux qui l'ont trouvée et, s'il y en a, « l'avait écrite : » avec leurs pastilles. Toutes ces pastilles portent l'initiale du joueur (tranche 19 : tout à 40 px au moins). Les bluffs qui n'ont piégé personne sont regroupés sur une ligne discrète « Personne n'y a cru : ». « Pas de bluff : » et « Pas de vote : » avec les pastilles à initiale. Verdict : « Tout le monde s'est fait avoir ! », « Personne ne s'est fait avoir ! » ou « Personne n'a bluffé ». Classement général à droite, avec les points gagnés |
| TV | Podium | Le podium commun, sans `completerPodium` |
| Téléphone | Écrire | « Question 3/8 », la question, « Invente une fausse réponse crédible, avec son article s'il en faut un (le, la, du, des…) », un champ texte (30 caractères max), « Valider » inactif tant que le champ est vide |
| Téléphone | Bluff envoyé | « Ton bluff : Chien. Regarde la TV » |
| Téléphone | Voter | « Laquelle est la vraie ? », la question en petit, un gros bouton par proposition, numéroté comme sur la TV, sans la sienne |
| Téléphone | Vote envoyé | « Tu as choisi : Sel » |
| Téléphone | Résultat | « Bien vu ! C'était : Sel, +1000 », « Raté ! C'était : Sel » ou « Pas de vote. C'était : Sel » (seulement « C'était : Sel » si le vote a été sauté). Puis « Ton bluff a piégé 2 joueurs, +1000 », « Ton bluff n'a piégé personne », « Ton bluff était la vraie réponse ! » ou « Pas de bluff ». Score et rang général |

Si une révélation est affichée après un rechargement de la TV, les cartes s'affichent d'un coup, sans animation. Contraintes du Mi TV Stick : opacité et déplacement seulement, pas de flou. 11 cartes au plus : la mise en page tient dans 1920×1080 sans défilement (textes de 30 caractères au plus).

## Sons

| Moment | Détection | Son |
|---|---|---|
| Nouvelle question | `nouvelleEtape` en phase `saisie` | `etape` |
| Un bluff, un vote | `ontRepondu` s'allonge | `reponse` |
| Début du vote | `nouvelleEtape` en phase `vote` | `etape` |
| Révélation | `nouvelleEtape` en phase `revelation` | `victoire` si `tousOntTrouve`, `rate` si `personneNaTrouve`, sinon `revelation` |
| Tic-tac, lancement, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js` ni côté serveur. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.

## Contenu

**Fichier `data/bluff.json`** : **120 questions**, soit 15 parties sans répétition : 80 anecdotes et 40 définitions de mots rares (plus difficiles). Générées par Claude, relues par Paul.

```json
{
  "id": "b0001",
  "texte": "Au sumo, les lutteurs lancent ___ sur le ring pour le purifier",
  "reponse": "Du sel",
  "variantes": ["Du gros sel"]
}
```

- Préfixe d'id : **`b`**.
- `texte` : une **phrase à trou**, avec exactement un `___` à la place de la réponse. La phrase à trou guide la forme du bluff (un nom, un métier, un animal…), ce qui rend les bluffs crédibles et difficiles à distinguer de la vérité.
- **Pas d'article ni de possessif juste avant le trou** (le, la, un, une, du, des, son, d', l'…) : il trahirait le genre ou le nombre de la réponse. Il va dans la réponse : « L'animal national de l'Écosse est ___ » → « La licorne ». Idem pour un accord qui trahirait le genre (« un ___ cassé » est à reformuler). Les joueurs sont invités à écrire l'article dans leur bluff, pour que toutes les propositions aient la même allure.
- `reponse` : la vraie réponse, avec son article s'il en faut un, 30 caractères au plus, écrite comme un joueur la taperait (voir « Présentation uniforme »).
- `variantes` : les formes qu'un joueur pourrait taper et qui valent la vraie réponse (synonymes, pluriels irréguliers, orthographes alternatives). Liste vide autorisée ; inutile d'y mettre casse, accents, articles et pluriels en `s`/`x`.
- Pas de `categorie` ni de `difficulte`, comme Même réponse.

Règles de rédaction :

- **Vrai et vérifiable** : des faits connus des amateurs d'anecdotes, pas des rumeurs. Paul relit ; au moindre doute, la question est retirée.
- **Surprenant** : la vraie réponse doit sembler aussi absurde qu'un bluff.
- **Réponse courte** : un à trois mots, qu'on pourrait inventer. Pas de dates ni de nombres purs : les bluffs deviennent des tirages au hasard, sans humour.
- Pas de réponse devinable par la simple logique de la phrase.
- Mêmes interdits que les autres modes : rien qui gêne ou blesse.
- Variété : animaux, histoire, inventions, lois étranges, records, nourriture, célébrités, langue, sport…
- **Définitions de mots rares**, plus difficiles : « Un « copocléphile » collectionne ___ » → « Les porte-clés ». Le mot doit exister dans les dictionnaires et sa définition être sûre.

**Script `scripts/verifier-bluff.js`**, sur le modèle de `verifier-meme-reponse.js` :

- seuls les champs `id`, `texte`, `reponse` et `variantes` ;
- `id` au format `b` + 4 chiffres, unique ;
- `texte` non vide, longueur maximale `LONGUEUR_MAX_TEXTE` du quiz, **exactement un `___`**, sans article, possessif ou élision juste avant ; pas deux textes identiques ;
- `reponse` et chaque variante : chaîne non vide, sans espace au bord, 30 caractères au plus, clé non vide ;
- pas deux formes (réponse ou variantes) de même clé dans une question ;
- nombre total de questions affiché.

`cleReponse` quitte `server/modes/meme-reponse.js` pour `server/modes/commun.js`, à côté de `normaliser` : Même réponse, Le bluff et leurs scripts de vérification l'importent de là (aucun changement de comportement pour Même réponse). Le fichier de données est lu au premier lancement seulement, comme `banqueMemeReponse()`.

Le tirage réutilise `tirerQuestions` et `noterQuestionsVues` de `commun.js` : `questionsVues` reste une seule liste pour la salle.

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la saisie | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. S'il avait envoyé un bluff, il reste en jeu (proposé au vote, peut lui rapporter des points). |
| Joueur déconnecté pendant le vote | Idem : ne bloque pas le vote. Son bluff reste proposé. |
| Joueur qui revient pendant la même question | Retrouve l'écran de la phase : bluff envoyé, vote à faire, vote envoyé ou résultat. S'il était attendu et n'a pas encore écrit (saisie) ou voté (vote), il peut encore le faire. |
| Arrivée en cours de partie | 0 point, joue à partir de la question suivante. |
| Moins de 4 joueurs connectés en cours de partie | La partie continue. Seul « Rejouer » est désactivé tant que le compte n'y est pas (ou l'hôte choisit un autre mode). |
| Aucun bluff (ou seulement des bluffs fondus dans la vérité) | Pas de vote, révélation directe « Personne n'a bluffé », personne ne marque. |
| Aucun vote | Révélation normale, personne ne marque. |
| Tout le monde a trouvé | « Personne ne s'est fait avoir ! », son `victoire`. |
| Personne n'a trouvé | « Tout le monde s'est fait avoir ! », son `rate`. |
| Bluff trop proche de la vérité | Accepté sans message, fondu dans la vraie réponse, 0 point de bluff (voir « Cas délicats »). |
| Saisie invalide (vide, trop longue, que de la ponctuation, pas une chaîne) | Bloquée sur le téléphone quand c'est possible. Sinon ignorée par le serveur, sans message. |
| Bluff grossier | Accepté et affiché : c'est un jeu entre amis. |
| L'hôte termine pendant une saisie, un vote ou une révélation | Podium avec les scores actuels. La question en cours n'est pas comptée si la révélation n'a pas commencé (les points ne sont ajoutés qu'à la révélation). |
| `MODE_DEV` à 1 joueur | Seule la vraie réponse est votable : tous les écrans sont parcourables. |
| Plus assez de questions inédites | On réautorise les plus anciennes, comme au quiz. |

## Modifications à reporter

- `server/modes/commun.js` : reçoit `cleReponse` (et le petit `retirerPluriel`), qui quittent `meme-reponse.js` ; `meme-reponse.js` et `scripts/verifier-meme-reponse.js` l'importent désormais de `commun.js`.
- `server/modes/index.js` : `bluff` sort de `modesAVenir` (la liste devient vide, gardée pour de futurs modes) et entre dans le registre.
- `docs/spec.md`, « Modes de jeu supplémentaires » : « (disponible, voir `docs/modes/bluff.md`) ».
- `docs/sons.md`, « Quand jouer quoi » : les lignes du bluff.
- `CLAUDE.md`, structure : `server/modes/bluff.js`, `data/bluff.json`, `scripts/verifier-bluff.js`, et la commande `node scripts/verifier-bluff.js`.

## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Contenu (temps 1)** :

- `cleReponse` dans `commun.js` : les tests de Même réponse restent verts ;
- `verifier-bluff.js` : détecte un id en double, un id au mauvais préfixe, un champ en trop, un texte en double, un texte sans `___` ou avec deux, un article ou un possessif juste avant le `___`, une réponse trop longue, une variante de même clé que la réponse ou qu'une autre variante ;
- le vrai fichier `data/bluff.json` passe la vérification.

**Mode (temps 2)** :

- le registre contient `bluff` avec tout le contrat, `modesAVenir` est vide ;
- `hote:choisirMode` refuse Le bluff à 3 joueurs, l'accepte à 4 ;
- saisie : validation (pas une chaîne, vide, 31 caractères, que de la ponctuation, deuxième bluff, joueur non attendu, hors phase) ; 30 caractères acceptés ;
- `formerPropositions` : un bluff égal à la vraie réponse, à sa clé (« les SELS ») ou à une variante n'est pas une proposition et va dans `ontEcritLaVerite` ; deux bluffs de même clé fusionnés (texte du premier, deux auteurs) ; majuscule initiale et point final retiré ; la vraie réponse présente une fois ; le mélange ne place pas toujours la vérité au même endroit (sur de nombreux tirages) ;
- vote : index invalide, non entier, sa propre proposition, proposition fusionnée dont on est co-auteur, deuxième vote, joueur non attendu, hors phase : refusés ; le joueur dont le bluff est fondu dans la vérité peut voter pour elle ;
- points : l'exemple de la section « Points », bluff fondu dans la vérité (0 point de bluff, mais 1000 s'il vote pour elle), bluff fusionné qui rapporte à ses deux auteurs, pas de vote 0, pas de bluff 0 ;
- enchaînement : fin anticipée de la saisie puis du vote quand tous ont répondu, et après la déconnexion du dernier attendu ; aucun bluff, ou seulement des bluffs fondus dans la vérité → révélation directe ; chronos 45 s, 25 s, 15 s ; podium après la 8e question ;
- secret : en `saisie`, `vueTv` ne contient aucun texte de bluff ni la vraie réponse ; en `vote`, `vueTv` et `vueJoueur` ne contiennent ni `vraie`, ni `auteurs`, ni `ontEcritLaVerite`, ni un `id` de joueur dans les propositions ; `laTienne` n'est vrai que chez l'auteur ; jamais les variantes, à aucune phase ;
- points ajoutés à la révélation seulement, pas comptés si l'hôte termine pendant le vote ;
- `questionsVues` : les `id` `b…` cohabitent avec les autres, pas de répétition sur 3 parties.

## Test de la tranche (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev` (il en faut au moins 4).

**Temps 1 (contenu)**

1. `node scripts/verifier-bluff.js` affiche « 120 questions OK ».
2. Relire `data/bluff.json` : vérité des faits, réponses, variantes. Noter celles à corriger ou retirer.

**Temps 2 (mode)**

1. **Choix du mode.** Rejoindre à 3 : Le bluff est grisé (« 4 joueurs min. »), sans « Bientôt ». Un 4e joueur arrive : il devient actif. L'hôte le choisit : la TV affiche « Le bluff » et sa règle.
2. **Saisie.** Lancer. La phrase à trou s'affiche sur la TV et sur chaque téléphone. Pendant la saisie, la TV montre qui a écrit, jamais quoi. « Ding » à la question, « tic » à chaque bluff, tic-tac sur les 5 dernières secondes.
3. **Vraie réponse tapée comme bluff.** Chercher la phrase affichée dans `data/bluff.json` et taper sa réponse en minuscules au pluriel : le téléphone affiche « Ton bluff : … » sans rien signaler. Au vote, la vraie réponse n'apparaît qu'une fois, et ce joueur la voit dans ses choix. À la révélation : « L'avait écrite » sur la carte de la vérité, « Ton bluff était la vraie réponse ! » sur son téléphone.
4. **Vote.** Les propositions s'affichent dans le même ordre sur la TV et les téléphones, sans auteur ; chaque téléphone ne propose pas son propre bluff. Deux joueurs ont tapé le même bluff (« chien » et « Chien ») : une seule proposition, absente de leurs deux téléphones.
5. **Révélation.** Les bluffs apparaissent un par un avec leur auteur et leurs victimes, puis la vérité. Vérifier les points d'un cas concret (1000 pour la vérité, 500 par piégé) sur la TV et sur les téléphones.
6. **Secret.** Pendant le vote, dans les outils de développement de la TV (onglet Réseau, messages Socket.IO) : les propositions n'ont que `texte`.
7. **Déconnexion.** Couper un joueur pendant le vote (« Couper 15 s ») : le vote se termine dès que les autres ont voté ; son bluff reste proposé. À son retour, il joue la question suivante.
8. **Arrêt et podium.** L'hôte termine pendant un vote : podium avec les scores actuels, la question en cours non comptée. Médailles et tableau des points globaux comme dans les autres modes. Avec 3 joueurs connectés, « Rejouer » est désactivé en Le bluff. L'hôte choisit Quiz : « Rejouer » lance un quiz qui marche comme avant.

## Choix validés

Tranchés par Paul le 25/09/2026 :

1. **Points** : 1000 pour la vérité, 500 par joueur piégé, pas de malus.
2. **Rythme** : 8 questions, saisie 45 s, vote 25 s, révélation 15 s.
3. **Bluff trop proche de la vérité** : accepté sans message, fondu dans la vraie réponse, sans points de bluff.
4. **Contenu** : 80 questions en phrase à trou (`___` obligatoire), sans dates ni nombres purs. Ajouts de Paul le 25/09/2026 : pas d'article juste avant le trou (il va dans la réponse), et 40 définitions de mots rares, soit 120 questions.

5. **Deux bluffs identiques** : fusionnés en une proposition à plusieurs auteurs (validé avec la mini-spec).
