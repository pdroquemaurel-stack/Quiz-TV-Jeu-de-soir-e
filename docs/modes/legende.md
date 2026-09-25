# Tranche 24 — La légende

Mini-spec de la tranche 24. Elle a été validée le 25/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et reprend presque tout le bluff (`docs/modes/bluff.md`) : saisie d'un texte, fusion des textes de même clé, vote anonyme sans sa propre proposition, révélation. La différence : **il n'y a pas de vraie réponse**, on vote pour le titre qu'on préfère, et le support de la manche est un **GIF animé** (une courte vidéo MP4) joué par la TV.

C'est le mécanisme de « La réplique » (M3 de l'audit, tranche 23), avec un GIF à la place d'une amorce texte. La légende est un mode à part ; la mini-spec de La réplique dira si elle devient une seconde source de ce mode.

La tranche se code en deux temps, chacun testé avant de passer au suivant :

1. **Contenu** : les vidéos dans `public/gifs/`, le catalogue `data/legende.json`, `scripts/verifier-legende.js` et leurs tests.
2. **Mode La légende** : le mode côté serveur, ses écrans TV et téléphone, ses sons, ses tests. Il entre dans le registre.


## Règles

- **3 à 10 joueurs.** À 3, chacun a encore 2 titres au choix (ceux des deux autres).
- Une partie compte **8 GIF**.
- **Saisie** : la TV joue un GIF en boucle. Chaque joueur écrit sur son téléphone le titre qu'il lui donnerait, en une seule réponse définitive (« Valider »). Texte de 1 à **40 caractères** une fois les bords retirés, de clé non vide.
- **Vote** : la TV et les téléphones affichent tous les titres, **mélangés par le serveur**, sans auteur. Chacun vote pour son préféré, un seul vote définitif. **Son propre titre n'est pas proposé** sur son téléphone, et le serveur refuse ce vote. Un joueur qui n'a pas écrit de titre vote quand même.
- **Révélation** : la TV dévoile qui a écrit chaque titre et combien de votes il a reçus, puis affiche le titre gagnant en grand sous le GIF, avec le classement.
- **Joueurs** : les joueurs attendus de la manche (connectés au début du GIF), liste figée pour la saisie **et** le vote, comme au bluff.
- Fin anticipée de chaque phase : identique au bluff (les attendus encore connectés ont tous écrit, puis tous voté).
- Fin de partie : podium commun, médailles et points globaux comme les autres modes.

### Points

| Situation | Points |
|---|---|
| Chaque vote reçu par son titre | **+ 500** |
| « Légendaire ! » : son titre reçoit le vote de **tous les votants qui pouvaient le choisir** (ses auteurs, qui votent forcément ailleurs, ne comptent pas), avec au moins 2 votes et au moins 2 titres proposés | **+ 1000** en plus |
| Voter, ne pas voter, pas de titre, titre sans vote | 0 (pas de malus) |

Exemples à 5 joueurs (Paul, Léa, Sam, Tom, Zoé), chacun a écrit un titre :

- Léa, Sam et Tom votent pour Paul, Paul vote pour Zoé, Zoé vote pour Léa : Paul 3 × 500 = 1500 ; Zoé 500 ; Léa 500 ; Sam et Tom 0. Pas de « Légendaire » : Zoé pouvait choisir Paul et ne l'a pas fait.
- Léa, Sam, Tom et Zoé votent pour Paul, Paul vote pour Zoé : Paul 4 × 500 + 1000 = **3000** (« Légendaire ! ») ; Zoé 500.
- Même chose, mais Zoé ne vote pas : Paul 3 × 500 + 1000 = 2500. Un joueur qui ne vote pas n'empêche pas l'unanimité.

Pourquoi ce barème :

- **500 par vote**, comme un joueur piégé au bluff : quelques milliers de points par partie, comme les autres modes.
- **Le bonus récompense le titre qui met tout le monde d'accord**, le moment fort de la manche (son `victoire`). « Au moins 2 votes » évite qu'il tombe à chaque GIF à 3 joueurs quand un seul vote a été exprimé ; « au moins 2 titres » évite un bonus sans concurrence.
- **Aucun point pour voter** : on vote pour s'amuser, le vote ne se « gagne » pas. Aucun malus.

Titres fusionnés (même clé) : chaque vote rapporte 500 **à chacun** de leurs auteurs, et le bonus aussi (comme au bluff).

Alternative écartée : *points dégressifs selon le rang du titre* (1er 1000, 2e 500…) : moins lisible que « 500 par vote », et la TV montre déjà les votes.

## Cas délicats

### Deux titres identiques

Même règle que les bluffs identiques : deux titres de **même clé** (`cleReponse` de `commun.js`) forment **une seule proposition** au vote, affichée avec le texte du premier arrivé, avec **plusieurs auteurs**. Aucun des auteurs ne peut voter pour elle. La fusion se fait au début du vote seulement.

### Présentation des titres

Contrairement au bluff, il n'y a pas de vraie réponse à cacher : **le texte est gardé tel quel** (bords retirés). On ne retire pas le point final (« … », « ?! » font partie de la blague), on ne force pas la majuscule. Les fautes restent visibles.

### Moins de 2 titres

Avec 0 ou 1 titre (après fusion), il n'y a rien à départager : on **saute le vote** et on passe à la révélation (« Pas assez de titres pour voter »), sans points. Le titre seul, s'il existe, est affiché sous le GIF. Cela évite aussi le cas d'un joueur qui ne pourrait voter pour rien (auteur du seul titre).

Conséquence : en `MODE_DEV` à 1 joueur, le vote est toujours sauté. Pour voir les écrans de vote, il faut 2 onglets.

### Égalité en tête

Tous les titres qui ont le plus de votes (au moins 1) sont **gagnants**. Sous le GIF : les 2 premiers dans l'ordre d'affichage, l'un sous l'autre ; au-delà de 2, « Égalité ! » et les cartes gagnantes mises en avant. Aucun vote : pas de gagnant, « Aucun vote ».

### Le GIF ne se charge pas

La TV seule joue la vidéo : le serveur ne sait pas si elle se lit. Si la vidéo déclenche une erreur de chargement, la TV affiche à sa place le **nom du template** (« 🎬 Disappearing kid gif ») dans le cadre. La manche se déroule normalement : rien n'attend la vidéo, les chronos sont ceux du serveur.

### Un joueur arrivé en cours de GIF

Comme au bluff : pas attendu, écran « En attente de la prochaine question », il joue à partir du GIF suivant avec 0 point.

## Phases et chronos

`etatMode.phase` vaut `saisie`, `vote` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `saisie` | 45 s | Tous les attendus ont écrit, ou fin du chrono. Moins de 2 titres : révélation directe |
| `vote` | 40 s | Tous les attendus ont voté, ou fin du chrono |
| `revelation` | 20 s | Fin du chrono ou « Suivant » de l'hôte. Après le 8e : podium |

- 45 s de saisie, comme le bluff : il faut regarder le GIF tourner deux ou trois fois et trouver la chute.
- **40 s de vote plutôt que 60 s** : il faut lire jusqu'à 10 titres (le bluff en donne 25 s pour 11 propositions plus courtes), et on rit en lisant. 60 s serait long quand un seul joueur hésite ; la fin anticipée coupe de toute façon dès que tout le monde a voté.
- **20 s de révélation plutôt que 15 s** : jusqu'à 10 cartes apparaissent une par une (0,8 s d'écart), puis le titre gagnant sous le GIF.

Un GIF dure donc environ 1 min 30, une partie de 8 GIF une douzaine de minutes.

## `etatMode` sur le serveur

```json
{
  "phase": "vote",
  "questions": ["...8 GIF tirés..."],
  "indexQuestion": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d", "j_4d2e9f"],
  "titres": {
    "j_8f3k2a": { "texte": "Moi quand le prof dit en binôme", "recuA": 1758641195300 },
    "j_1b9c7d": { "texte": "moi quand le prof dit en binome", "recuA": 1758641197100 },
    "j_4d2e9f": { "texte": "Lundi matin", "recuA": 1758641199000 }
  },
  "propositions": [
    { "texte": "Lundi matin", "auteurs": ["j_4d2e9f"] },
    { "texte": "Moi quand le prof dit en binôme", "auteurs": ["j_8f3k2a", "j_1b9c7d"] }
  ],
  "reponses": { "j_4d2e9f": { "choix": 1, "recuA": 1758641230000 } }
}
```

- Les noms `questions`, `indexQuestion`, `debutPhaseA`, `reponses` sont ceux du bluff : ils permettent de réutiliser `tousOntRepondu` et, après le nettoyage L1 de la tranche 23, les aides communes (`passerALaSuite`…). Une « question » est ici un GIF du catalogue.
- `reponses` contient les titres pendant la saisie, puis il est vidé au début du vote pour recevoir les votes ; les titres sont copiés dans `titres`.
- `propositions` : construites au début du vote par une fonction pure (`formerPropositions(titres)`) : fusion des titres de même clé, mélange. **L'ordre est fixé une fois pour toutes**, un vote est l'index d'une proposition.
- Les points ne sont pas stockés : `calculerPoints(propositions, votes)` les calcule, comme au bluff.

La fusion par clé est la même qu'au bluff : elle sort de `bluff.js` dans une petite fonction de `commun.js` (`fusionnerParCle`) que les deux modes utilisent, sans changement de comportement pour le bluff (ses tests restent verts). Voir le plan.

## Événements

Aucun nouvel événement.

| Événement | Contenu en La légende |
|---|---|
| `joueur:repondre` | En `saisie` : le texte du titre (chaîne). Refusé si ce n'est pas une chaîne, s'il est vide ou fait plus de 40 caractères une fois les bords retirés, si sa clé est vide, si le joueur n'est pas attendu ou a déjà un titre. En `vote` : l'index de la proposition choisie (entier). Refusé si ce n'est pas un index valide, si le joueur en est l'auteur (ou co-auteur), s'il n'est pas attendu ou a déjà voté. Ignoré en `revelation`. |
| `hote:suivant` | Pendant la révélation : GIF suivant (ou podium) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Texte d'un titre | Personne pendant la saisie (seul son auteur voit le sien). Au vote : tout le monde, sans auteur. |
| Auteur d'un titre | **Personne avant la révélation**, ni la TV ni les téléphones, sauf l'auteur lui-même (son téléphone sait quelle proposition est la sienne, pour ne pas la proposer). |
| Qui a voté quoi | Personne pendant le vote (seulement qui a voté). Public à la révélation. |
| Le GIF (fichier, nom) | La TV seulement. Les téléphones ne reçoivent ni le fichier ni le nom : rien à charger en 4G. |

Les vues TV et joueur sont construites champ par champ (jamais en recopiant `propositions`) pour qu'aucun `auteurs` ne s'y glisse avant la révélation. Des tests le vérifient.

## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `saisie` | `phase`, `numero`, `total`, `gif: { fichier, nom }`, `ontRepondu` (liste d'`id`), `tempsRestantMs` |
| `vote` | Idem, plus `propositions: [{ texte }]` dans l'ordre mélangé. `ontRepondu` liste alors ceux qui ont voté |
| `revelation` | Idem, avec `propositions: [{ texte, auteurs, votants, points, gagnant }]`, plus `legendaire` (vrai si un titre a eu le bonus), `pasAssezDeTitres`, `sansTitre` (attendus sans titre), `sansVote` (attendus sans vote), `gifSuivant: { fichier }` (pour le préchargement, absent après le 8e), puis `classement` |
| podium | `classement` |

`points` d'une proposition : ce que chacun de ses auteurs gagne par elle (500 × votes, + 1000 si légendaire).

## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Données |
|---|---|
| `ecrire` | `numero`, `total` (pas de GIF) |
| `titre_envoye` | Son titre |
| `voter` | `numero`, `total`, `propositions: [{ texte, laTienne }]` (`laTienne` vrai seulement sur la sienne) |
| `vote_envoye` | Le texte de la proposition choisie |
| `resultat` | `numero`, `aVote`, `pasAssezDeTitres`, `sonTitre` (texte ou `null`), `votesRecus`, `legendaire`, `gagnant` (son titre est parmi les gagnants), `points` (total du GIF), `rang` général. Pour l'hôte : « Suivant » |
| `attente_question`, `fin` | Comme au quiz |

**Jamais** avant la révélation : l'auteur d'un titre d'un autre joueur, le vote d'un autre joueur.

## Écrans

Mesure faite dans le navigateur avec la police du jeu (Fredoka) : à 40 px, un titre courant de 40 caractères fait environ 710 px de large (30 caractères : 530 px ; 50 : 870 px). Un titre anormalement large (majuscules « MMMWWW… ») est coupé par « … », comme au bluff.

| Où | Écran | Contenu |
|---|---|---|
| TV | Saisie | « GIF 3/8 », le GIF en grand au centre (cadre de 1280×720 au plus, proportions gardées, fond sombre autour), « Donne un titre à ce GIF ! », chrono, pastilles des joueurs ayant écrit, petit QR code |
| TV | Vote | Le GIF en haut, plus petit (cadre de 640×360), puis les titres numérotés en cartes sur **deux colonnes de 5** (jusqu'à 10), sans couleur de joueur. Chaque colonne laisse environ 770 px au texte : un titre de 40 caractères tient sur une ligne à 40 px. « Vote pour ton préféré ! », chrono, pastilles de ceux qui ont voté |
| TV | Révélation | À gauche : le GIF (cadre de 760×428) et dessous, en bandeau, le ou les titres gagnants en 56 px sur 2 lignes au plus, avec « Légendaire ! » s'il y a lieu ; sous le bandeau, le classement général limité à 5 lignes (« et N autres »). À droite : une carte par titre, du moins au plus voté, une par 0,8 s (opacité et déplacement) : nombre de votes, texte, « de » et la pastille à initiale de l'auteur (ou des co-auteurs), « +1500 ». Les cartes gagnantes mises en avant. Ligne discrète « Pas de titre : » avec les pastilles à initiale. Verdict : « Légendaire ! », « Égalité ! », « Aucun vote » ou « Pas assez de titres pour voter ». Tout à 40 px au moins (tranche 19) |
| TV | Podium | Le podium commun |
| Téléphone | Écrire | « GIF 3/8 », « Regarde la TV et donne un titre à ce GIF », un champ texte (40 caractères max), « Valider » inactif tant que le champ est vide |
| Téléphone | Titre envoyé | « Ton titre : … Regarde la TV » |
| Téléphone | Voter | « Ton préféré ? », un gros bouton par titre, numéroté comme sur la TV, sans le sien |
| Téléphone | Vote envoyé | « Tu as choisi : … » |
| Téléphone | Résultat | « Ton titre a reçu 3 votes, +1500 », « Légendaire ! +2500 », « Ton titre n'a reçu aucun vote » ou « Pas de titre » (seulement « Pas assez de titres pour voter » si le vote a été sauté). Score et rang général |

### La vidéo sur la TV

- `<video autoplay loop muted playsinline>`, jamais `<img>`. `muted` est obligatoire pour la lecture automatique sans geste.
- Une seule vidéo jouée à la fois. Le même élément `<video>` sert aux trois phases : il est seulement déplacé et redimensionné, sa source ne change qu'au GIF suivant (la vidéo ne redémarre pas entre saisie, vote et révélation).
- **Préchargement** : pendant la révélation, la TV reçoit `gifSuivant` et le charge dans un second `<video preload="auto" muted>` caché, jamais lu. Au GIF suivant, le fichier est déjà dans le cache du navigateur.
- Erreur de chargement : le nom du template à la place (voir « Cas délicats »).
- Petites vidéos (certaines font 220 px de large) : agrandies dans le cadre, un peu floues de près, lisibles depuis le canapé. Les plus petites sont à signaler à la relecture (voir « Contenu »).
- Contraintes du Mi TV Stick : pas de flou, pas de `filter`, animations en opacité et déplacement seulement. Le bandeau du titre gagnant est un fond plein, pas un texte détouré.

Si une révélation est affichée après un rechargement de la TV, les cartes s'affichent d'un coup, sans animation.

## Sons

| Moment | Détection | Son |
|---|---|---|
| Nouveau GIF | `nouvelleEtape` en phase `saisie` | `etape` |
| Un titre, un vote | `ontRepondu` s'allonge | `reponse` |
| Début du vote | `nouvelleEtape` en phase `vote` | `etape` |
| Révélation | `nouvelleEtape` en phase `revelation` | `victoire` si `legendaire`, sinon `revelation` |
| Tic-tac, lancement, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js` ni côté serveur. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.

## Contenu

### Ce qui est présent aujourd'hui

Constaté le 25/09/2026 dans le dossier principal du dépôt (pas dans les worktrees), non commité :

- `gifs.json` : **100 entrées**, toutes `"garder": true`, `id` uniques, champs `id`, `nom`, `fichier`, `garder`.
- `gifs/` : **100 fichiers MP4** (H.264), aucun manquant, aucun orphelin. Durée de 0,2 s à 5 s (médiane 3,8 s).
- **Poids total : 37,1 Mo.** Médiane 194 Ko, mais 21 fichiers dépassent 500 Ko et **12 dépassent 1 Mo** (le plus gros : 2,5 Mo, « Big Brain Galaxy Gif »).

| Limite par fichier | GIF gardés | Poids ajouté au dépôt |
|---|---|---|
| Aucune | 100 | 37,1 Mo |
| 1,5 Mo | 96 | 29,5 Mo |
| **1 Mo (proposée)** | **88** | **19,8 Mo** |
| 800 Ko | 85 | 17,3 Mo |
| 500 Ko | 79 | 13,6 Mo |

À signaler pour la relecture (avis de Paul) :

- **Très courts**, qui ressemblent à une image fixe : 258651081 « Penguin pointing at shipping label » (0,2 s), 239316701 « fire elmo » (0,8 s), 352095076 « one of us » (1 s).
- **Très petits** (moins de 300 px de large), flous une fois agrandis : 495060859 « Fridge Disappointment » (144 px), 648704754 « jack black book gif », 187397945 « Spongebob Searching », 286126573 « Confused Math Lady », 305074372 « Sweaty Speedrunner » (220 px), et 9 autres entre 240 et 290 px.
- Les noms sont ceux d'Imgflip, en anglais : ils ne servent que si la vidéo ne se charge pas.

### Fichiers

**Vidéos** : `public/gifs/<id Imgflip>.mp4`, servies par `express.static` comme le reste de `public/`.

**Catalogue `data/legende.json`** (le nom du mode, comme `bluff.json`) :

```json
{
  "id": "g222516354",
  "nom": "Disappearing kid gif",
  "fichier": "gifs/222516354.mp4",
  "garder": true
}
```

- Préfixe d'id : **`g`** + l'id Imgflip (`g222516354`). Les autres modes ont `q`, `e`, `n`, `u`, `m`, `b` suivis de 4 chiffres ; ici on garde l'id Imgflip tel quel pour ne pas casser le lien avec le fichier. `questionsVues` reste une seule liste pour la salle.
- `fichier` : chemin relatif à `public/`, qui est aussi l'URL servie (`/gifs/222516354.mp4`). Il vaut toujours `gifs/` + l'id sans le `g` + `.mp4` : le script de vérification le contrôle.
- `garder` : `false` exclut le GIF du tirage. Un GIF non gardé peut rester dans le catalogue (trace de la relecture) **sans que sa vidéo soit commitée**.
- Pas de `categorie` ni de `difficulte`.

**Script `scripts/verifier-legende.js`**, sur le modèle de `verifier-bluff.js` :

- seuls les champs `id`, `nom`, `fichier` et `garder` ;
- `id` au format `g` + chiffres, unique ;
- `nom` : chaîne non vide, sans espace au bord ;
- `garder` : booléen ;
- `fichier` : exactement `gifs/<id sans g>.mp4` ; pour un GIF gardé, le fichier existe dans `public/` et pèse **1 Mo au plus** (1 000 000 octets) ;
- au moins 8 GIF gardés (une partie) ;
- une vidéo de `public/gifs/` qui n'appartient à aucun GIF gardé est une erreur : elle serait commitée pour rien (après avoir passé un GIF à `false`, on supprime sa vidéo) ;
- affichage : nombre de GIF gardés, nombre d'exclus, poids total des vidéos gardées.

La fonction de vérification reçoit les tailles des vidéos présentes (`verifierLegende(liste, tailles)`) : les tests lui passent de fausses tailles, la ligne de commande lit le disque.

Le catalogue est lu au premier lancement seulement, comme `banqueBluff()`. Le tirage réutilise `tirerQuestions` et `noterQuestionsVues` de `commun.js`, sur les seuls GIF gardés.

**Script `scripts/telecharger-gifs.py`** (Python, avec `requests` : outil de contenu, pas une dépendance du serveur) : relançable, réglages `NB_PAGES` et `MAX_GIFS` en haut du fichier. Il parcourt les « GIF templates » d'Imgflip et ajoute les nouveaux à la fin de `data/legende.json`, vidéos dans `public/gifs/` :

- il ne modifie jamais une entrée existante (les `garder: false` de la relecture sont conservés) et ne retente pas un GIF déjà au catalogue ;
- il ne garde que les `.mp4` (un `.gif` ne se lit pas dans `<video>`) ;
- une vidéo de plus de 1 Mo est supprimée aussitôt et inscrite en `garder: false` ;
- les nouveaux GIF arrivent en `garder: true` : relire, puis lancer `node scripts/verifier-legende.js`.

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la saisie | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. S'il avait envoyé un titre, il reste proposé au vote et peut lui rapporter des points. |
| Joueur déconnecté pendant le vote | Idem : ne bloque pas le vote. Son titre reste proposé. |
| Joueur qui revient pendant le même GIF | Retrouve l'écran de la phase. S'il était attendu et n'a pas encore écrit (saisie) ou voté (vote), il peut encore le faire. |
| Arrivée en cours de partie | 0 point, joue à partir du GIF suivant. |
| Moins de 3 joueurs connectés en cours de partie | La partie continue. Seul « Rejouer » est désactivé tant que le compte n'y est pas. |
| 0 ou 1 titre (après fusion) | Pas de vote, révélation directe « Pas assez de titres pour voter », personne ne marque. |
| Aucun vote | Révélation normale, « Aucun vote », personne ne marque. |
| Vidéo introuvable ou illisible sur la TV | Nom du template à la place, la manche continue. |
| Saisie invalide (vide, trop longue, que de la ponctuation, pas une chaîne) | Bloquée sur le téléphone quand c'est possible. Sinon ignorée par le serveur, sans message. |
| Titre grossier | Accepté et affiché : c'est un jeu entre amis. |
| L'hôte termine pendant une saisie, un vote ou une révélation | Podium avec les scores actuels. Le GIF en cours n'est pas compté si la révélation n'a pas commencé. |
| Plus assez de GIF inédits | On réautorise les plus anciens, comme au quiz. |

## Modifications à reporter

- `server/modes/commun.js` : reçoit `fusionnerParCle` (sortie de `formerPropositions` du bluff) ; `bluff.js` l'utilise, sans changement de comportement.
- `server/modes/index.js` : `legende` entre dans le registre.
- `docs/spec.md` : ligne « La légende » dans « Modes de jeu supplémentaires » ; tranche 24 dans « Tranches de développement » ; « Contraintes techniques / Mi TV Stick » : exception « aucune image lourde » pour les vidéos de La légende (une seule jouée à la fois, 1 Mo au plus) ; « Plus tard » : F9 reste écarté pour les questions à image du quiz, mais les GIF de La légende en sont une première forme.
- `docs/sons.md`, « Quand jouer quoi » : les lignes de La légende.
- `CLAUDE.md`, structure et commandes : `server/modes/legende.js`, `data/legende.json`, `public/gifs/`, `scripts/verifier-legende.js`, `node scripts/verifier-legende.js` (et le script de téléchargement selon la décision).

## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Contenu (temps 1)** :

- `verifier-legende.js` détecte : un id en double, un id sans `g` ou non numérique, un champ en trop ou manquant, un `nom` vide, un `garder` non booléen, un `fichier` qui ne correspond pas à l'id, une vidéo gardée absente du disque, une vidéo gardée de plus de 1 Mo, moins de 8 GIF gardés ;
- un GIF non gardé sans vidéo sur le disque est accepté ;
- le vrai catalogue `data/legende.json` passe la vérification.

**Mode (temps 2)** :

- le registre contient `legende` avec tout le contrat ;
- `hote:choisirMode` refuse La légende à 2 joueurs, l'accepte à 3 ;
- tirage : seuls les GIF `garder: true` sont tirés ; les `id` `g…` cohabitent avec les autres dans `questionsVues`, pas de répétition sur 3 parties ;
- saisie : validation (pas une chaîne, vide, 41 caractères, que de la ponctuation, deuxième titre, joueur non attendu, hors phase) ; 40 caractères acceptés ; texte gardé tel quel (bords retirés, ponctuation finale conservée) ;
- `formerPropositions` : deux titres de même clé fusionnés (texte du premier arrivé, deux auteurs) ; le mélange ne place pas toujours le même titre au même endroit ; `fusionnerParCle` : les tests du bluff restent verts ;
- vote : index invalide, non entier, son propre titre, titre fusionné dont on est co-auteur, deuxième vote, joueur non attendu, hors phase : refusés ; un joueur sans titre peut voter ;
- points : l'exemple de la section « Points » (500 par vote) ; « Légendaire » (tous les votes exprimés des non-auteurs, + 1000) ; pas de bonus avec un seul vote, ni avec un seul titre ; titre fusionné qui rapporte votes et bonus à ses deux auteurs ; pas de vote, pas de titre : 0 ;
- enchaînement : fin anticipée de la saisie puis du vote quand tous ont répondu, et après la déconnexion du dernier attendu ; 0 ou 1 titre → révélation directe ; chronos 45 s, 40 s, 20 s ; podium après le 8e GIF ;
- secret : en `saisie`, `vueTv` et `vueJoueur` ne contiennent aucun texte de titre d'un autre joueur ; en `vote`, ni `auteurs` ni `id` de joueur dans les propositions, ni les votes des autres ; `laTienne` n'est vrai que chez l'auteur ; `vueJoueur` ne contient jamais `fichier` ni `nom` du GIF ;
- points ajoutés à la révélation seulement, pas comptés si l'hôte termine pendant le vote ; « Suivant » de l'hôte seulement, un autre joueur est refusé.

## Test de la tranche (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev` (il en faut au moins 3). Puis la lecture des vidéos sur le **vrai stick**.

**Temps 1 (contenu)**

1. `node scripts/verifier-legende.js` affiche le nombre de GIF gardés, d'exclus et le poids total, sans erreur.
2. Relire les GIF (en ouvrant `public/gifs/` dans l'explorateur, ou `/gifs/<id>.mp4` dans le navigateur) et passer à `false` ceux à exclure, en commençant par la liste « À signaler ».

**Temps 2 (mode)**

1. **Choix du mode.** Rejoindre à 2 : La légende est grisée (« 3 joueurs min. »). Un 3e joueur arrive : elle devient active. L'hôte la choisit : la TV affiche « La légende » et sa règle.
2. **Saisie.** Lancer. Le GIF tourne en boucle sur la TV, sans son ; les téléphones affichent « Regarde la TV » et le champ, sans vidéo (onglet Réseau d'un téléphone `?dev` : aucune requête `.mp4`). La TV montre qui a écrit, jamais quoi. « Ding » au GIF, « tic » à chaque titre, tic-tac sur les 5 dernières secondes. Un titre de 40 caractères passe, le 41e est bloqué.
3. **Vote.** Les titres s'affichent dans le même ordre sur la TV et les téléphones, sans auteur ; aucun téléphone ne propose son propre titre. Deux joueurs ont tapé le même titre (« Lundi matin » et « lundi matin ! ») : une seule proposition, absente de leurs deux téléphones. Avec 10 onglets, les 10 titres de 40 caractères tiennent sur la TV sans défilement, chacun sur une ligne.
4. **Révélation.** Les cartes apparaissent une par une avec leur auteur et leurs votes, puis le titre gagnant sous le GIF, qui continue de tourner. Vérifier les points d'un cas concret (500 par vote) sur la TV et les téléphones. Faire voter tout le monde pour le même titre : « Légendaire ! », + 1000 et la fanfare `victoire`.
5. **Secret.** Pendant le vote, dans les outils de développement de la TV (onglet Réseau, messages Socket.IO) : les propositions n'ont que `texte`.
6. **Vidéo manquante.** Dans les outils de développement de la TV, bloquer l'URL d'un `.mp4` (clic droit sur la requête, « Bloquer l'URL de la requête ») puis passer au GIF suivant si c'est lui, ou recharger : le nom du template s'affiche dans le cadre et la manche continue.
7. **Déconnexion.** Couper un joueur pendant le vote (« Couper 15 s ») : le vote se termine dès que les autres ont voté ; son titre reste proposé.
8. **Arrêt et podium.** L'hôte termine pendant un vote : podium avec les scores actuels, le GIF en cours non compté. Médailles et points globaux comme les autres modes.
9. **Sur le vrai stick** (navigateur du Mi TV Stick, TV à 3 m) : une partie complète de 8 GIF. Chaque vidéo démarre seule et tourne en boucle sans à-coup, y compris les plus lourdes (proche de 1 Mo) ; le passage d'un GIF au suivant est immédiat (préchargement) ; aucune saccade des cartes pendant que la vidéo tourne ; les titres se lisent depuis le canapé.

## Choix validés

Tranchés par Paul le 25/09/2026 :

1. **Titre** : 1 à 40 caractères.
2. **Rythme** : 8 GIF, saisie 45 s, vote 40 s, révélation 20 s.
3. **Points** : 500 par vote reçu, + 1000 « Légendaire ! » si tous les votants qui pouvaient choisir le titre l'ont choisi (au moins 2 votes, au moins 2 titres). Pas de malus.
4. **Moins de 2 titres** : vote sauté, sans points.
5. **Présentation** : titre gardé tel quel, bords retirés.
6. **Poids** : 1 Mo au plus par vidéo. Les 12 plus lourdes sont `garder: false` et leur vidéo n'est pas commitée.
7. **Contenu** : catalogue `data/legende.json`, vidéos dans `public/gifs/`, préfixe d'id `g` + id Imgflip, script de téléchargement dans `scripts/telecharger-gifs.py`.
8. **La réplique** : La légende est un mode à part. Ordre : contenu de La légende, puis nettoyage de la tranche 23 (temps 1), puis mode La légende.
