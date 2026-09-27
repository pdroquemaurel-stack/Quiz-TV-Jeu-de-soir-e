# Tranche 25 — Blind test

Mini-spec de la tranche 25. Elle a été validée le 27/09/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md`.

La TV joue des extraits de chansons, les joueurs crient leurs réponses **à voix haute**. À chaque manche, un joueur est **maître du jeu** : son téléphone affiche la réponse, et c'est lui qui désigne qui a trouvé. Le rôle tourne d'une manche à l'autre.

Un seul mode, **Blind test**, avec deux formats choisis par l'hôte en salle d'attente :

- **Classique** : une chanson par manche, 30 s d'écoute. Le titre et l'artiste rapportent des points séparément, éventuellement à deux joueurs différents.
- **Mix** : cinq chansons jouées en même temps. Dès qu'une chanson est trouvée, elle disparaît du mix, qui reprend avec les chansons restantes. Un seul joueur marque par chanson.

Les extraits viennent de **Deezer** (extraits publics de 30 s). Le dépôt ne contient **aucun fichier audio** : seulement les identifiants Deezer et les métadonnées.

La tranche se code en trois temps, chacun testé avant de passer au suivant :

1. **Extraits et contenu** : la route `/extrait/:id`, la planche d'écoute `/tv?extraits` (tester la lecture sur le stick, dont 5 extraits en même temps), le catalogue `data/blind-test.json`, le script d'import et le script de vérification, avec leurs tests. **Ce temps valide ou non la faisabilité** : s'il échoue sur le stick, on s'arrête là.
2. **Format classique** : le mode côté serveur, ses écrans TV et téléphone, ses sons, ses tests. Il entre dans le registre.
3. **Format mix** : le second format, ses écrans, ses tests.


## Règles communes aux deux formats

- **3 à 10 joueurs** : le maître et au moins deux joueurs qui répondent.
- **Ordre des maîtres** : au lancement, le serveur mélange les joueurs connectés. Cette liste figée donne l'ordre des maîtres. **Une partie compte autant de manches que de joueurs dans cette liste** : chacun est maître une fois.
- **Maître absent** : si le maître d'une manche n'est pas connecté au moment où elle commence, sa manche est sautée (ses chansons ne sont pas jouées) et on passe au suivant. Si toutes les manches restantes sont sautées, on passe au podium.
- **Joueur arrivé en cours de partie** : il n'est pas dans la liste des maîtres, mais il peut être désigné dès la manche suivante. Il part de 0 point.
- **Réponses à l'oral** : rien n'est saisi sur les téléphones des joueurs qui répondent. Le jeu repose sur la parole du maître, comme un vrai blind test entre amis.
- **Le maître ne marque aucun point** pendant sa manche, et ne peut pas se désigner lui-même.
- **Qui peut être désigné** : les joueurs connectés de la salle, sauf le maître. Un joueur déconnecté depuis la désignation garde ses points.
- **Pas de saisie de texte** : aucune comparaison de réponses, aucune tolérance aux fautes à gérer. C'est le maître qui juge (« Daft Punk » suffit, « Harder Better » aussi : à lui de décider ce qui compte).
- Fin de partie : podium commun, médailles et points globaux comme les autres modes.

### Choix du format

Le format est un réglage du mode, comme les thèmes du quiz : `reglagesMode["blind-test"] = { format: "classique" | "mix" }`, envoyé par `hote:reglerMode` avec `{ format }`, accepté seulement en salle d'attente. Par défaut : `classique`. Il est gardé d'une partie à l'autre.

Le téléphone de l'hôte affiche le choix dans ses réglages (deux boutons « Classique » et « Mix »), la TV l'affiche en salle d'attente sous le nom du mode (« Blind test · Mix »).

### Exception au secret

La règle d'architecture « un téléphone ne reçoit jamais la bonne réponse avant la révélation » a **une exception, propre à ce mode** : le téléphone du **maître de la manche** reçoit le titre et l'artiste des chansons de sa manche, et seulement celles-là. Aucun autre téléphone ne les reçoit avant la révélation. Des tests le vérifient.

La TV reçoit l'identifiant de l'extrait (pour le jouer), jamais le titre ni l'artiste avant la révélation : ce qui s'affiche sur l'écran commun ne trahit rien.


## Format classique

- **Une chanson par manche.** Pendant l'écoute (30 s), la TV joue l'extrait, avec un décompte. Les joueurs crient leurs réponses.
- Le téléphone du maître affiche en grand le **titre** et l'**artiste**, et deux lignes de boutons :
  - « Le titre : » un bouton par joueur désignable, plus « Personne » ;
  - « L'artiste : » idem.
- Le maître coche au fur et à mesure (la sélection reste sur son téléphone, modifiable), puis appuie sur **« Valider »**. L'envoi est **définitif** : le serveur passe aussitôt à la révélation, la musique s'arrête.
- Le même joueur peut être choisi pour les deux (« Doublé ! »), deux joueurs différents peuvent se partager la chanson, et « Personne » est possible pour l'un ou l'autre, ou les deux.
- Si les 30 s s'écoulent sans validation : la musique s'arrête et le maître a encore **15 s** (phase `designation`) pour valider. Sans validation à la fin de ces 15 s, la chanson ne rapporte rien.
- **Révélation** : la TV montre la pochette, le titre, l'artiste, et qui a trouvé quoi, puis le classement.

### Points (classique)

| Situation | Points |
|---|---|
| Désigné pour le titre | **+ 500** |
| Désigné pour l'artiste | **+ 500** |
| Désigné pour les deux (« Doublé ! ») | **+ 1000** |
| Maître, non désigné | 0 |

Pas de points de rapidité : les réponses sont orales, le serveur ne sait pas qui a parlé le premier. Le maître désigne le premier qui a donné la bonne réponse.


## Format mix

- **Une manche = un mix de 5 chansons** jouées en même temps, chacune démarrée à un endroit différent de son extrait, en boucle.
- La TV affiche **5 cartes « ? »** et le décompte d'écoute (**120 s**, mis en pause pendant les désignations).
- Le téléphone du maître affiche les 5 chansons (titre et artiste), chacune sur un gros bouton.
- **Quand quelqu'un trouve** : le maître appuie sur la chanson concernée. Le serveur passe en phase `designation` : **le mix se met en pause** sur la TV, le décompte aussi, et la TV annonce « Le maître du jeu désigne… ».
- Sur son téléphone, le maître choisit **qui** a trouvé (un bouton par joueur désignable) et **quoi** (« Titre », « Artiste » ou « Les deux »), puis « Valider ». Ou bien « Annuler » (fausse alerte).
- Après validation, la chanson est **retirée du mix** : sa carte se retourne sur la TV (pochette, titre, artiste, nom du joueur, points), et le mix **reprend** avec les chansons restantes. Après une annulation, le mix reprend tel quel.
- **Un seul joueur marque par chanson** : une chanson désignée est définitivement retirée, même si seul le titre ou l'artiste a été trouvé.
- Désignation sans validation au bout de **20 s** : annulée d'elle-même, le mix reprend (le maître a pu se déconnecter ou s'être trompé).
- La manche se termine quand les 5 chansons sont trouvées, ou quand le décompte d'écoute arrive à 0. **Révélation** : les chansons non trouvées se retournent à leur tour, puis le classement.

### Points (mix)

| Situation | Points |
|---|---|
| Titre **et** artiste d'une chanson | **+ 1000** |
| Titre **ou** artiste seulement | **+ 500** |
| Chanson non trouvée, maître | 0 |

Les barèmes des deux formats sont alignés : le titre et l'artiste valent chacun 500. Dans le mix, trouver les deux d'un coup rapporte la même chose qu'un doublé en classique.


## Cas délicats

### L'extrait ne se charge pas

La TV seule joue l'audio : le serveur ne sait pas si l'extrait se lit. En cas d'erreur de chargement :

- **classique** : la TV affiche « Extrait indisponible » à la place de l'animation d'écoute. Le maître voit la chanson et peut valider « Personne » pour passer à la suite. Rien n'attend l'audio, les chronos sont ceux du serveur ;
- **mix** : la carte de cette chanson est marquée « Indisponible » sur la TV, et le mix continue avec les autres. Elle peut encore être désignée (le maître voit tout), sinon elle se retourne à la révélation.

Ce cas doit rester rare : l'import écarte les titres sans extrait, et `verifier-blind-test.js --deezer` repère ceux qui ont disparu depuis.

### Rechargement de la TV en pleine écoute

L'extrait reprend à l'endroit où il devrait être : position de départ + temps d'écoute déjà écoulé (tous deux fournis par le serveur), modulo la durée de l'extrait. Pas de son d'étape au rechargement, comme ailleurs.

### Le maître se déconnecte

- Classique : la manche continue. S'il revient avant la fin, il retrouve son écran (sa sélection non validée est perdue). Sinon, la chanson ne rapporte rien.
- Mix : si c'est pendant une désignation, elle s'annule au bout de 20 s. Pendant l'écoute, plus personne ne peut arrêter le mix : la manche va au bout du décompte.

### Désigner un joueur déconnecté

Les boutons du maître ne proposent que les joueurs connectés. Si le joueur se déconnecte entre l'affichage et l'envoi, le serveur accepte quand même la désignation (il a bien crié la réponse) : il vérifie seulement que c'est un joueur de la salle, et pas le maître.

### Hôte et maître

L'hôte est un joueur comme les autres : il est maître à son tour. Le bouton « Terminer la partie » reste le sien, quelle que soit la manche.


## Phases et chronos

`etatMode.phase` vaut `ecoute`, `designation` ou `revelation`.

### Classique

| Phase | Durée | Fin |
|---|---|---|
| `ecoute` | 30 s | « Valider » du maître (révélation directe), ou fin du chrono |
| `designation` | 15 s | « Valider » du maître, ou fin du chrono (rien n'est compté) |
| `revelation` | 12 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

Une manche dure de 45 s à 1 min. Une partie à 3 joueurs dure donc environ 3 min, à 10 joueurs une dizaine de minutes.

### Mix

| Phase | Durée | Fin |
|---|---|---|
| `ecoute` | 120 s au total, décompte mis en pause pendant `designation` | Les 5 chansons trouvées, ou fin du décompte |
| `designation` | 20 s | « Valider » ou « Annuler » du maître : retour à `ecoute` (ou `revelation` si c'était la 5e). Fin du chrono : annulée, retour à `ecoute` |
| `revelation` | 15 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |

Une manche dure environ 2 à 3 min. Avec autant de manches que de joueurs, une partie à 10 joueurs dure près de 30 min : choix validé (voir « Choix validés », point 7).

Le décompte d'écoute du mix est mesuré par le serveur : `ecouteRestanteMs` est figé à l'entrée en `designation` et repart de `debutPhaseA` au retour en `ecoute`.


## Les extraits Deezer

### Ce qui a été vérifié (27/09/2026)

- `GET https://api.deezer.com/track/<id>` répond sans clé ni compte, avec `title_short`, `artist.name`, `album.cover_medium` (pochette 250×250), `gain` (sonie du morceau, en dB : plus il est haut, plus le morceau est fort), `readable` et `preview`.
- `preview` est un MP3 de **30 s** (environ 480 Ko, 128 kbit/s), sur le CDN de Deezer, avec `Access-Control-Allow-Origin: *` et `Accept-Ranges`.
- **Le lien `preview` expire au bout de 15 min** (jeton `hdnea=exp=…`). Il ne peut donc pas être stocké dans le catalogue : il faut le redemander au moment de jouer.
- `GET https://api.deezer.com/playlist/<id>/tracks` liste les titres d'une playlist publique, **sans le `gain`** : l'import redemande chaque nouvelle piste à `/track/<id>`.
- `readable` dépend du pays d'où part la requête : environ 20 % des pistes étaient illisibles depuis le PC de développement.
- L'API Deezer (`api.deezer.com`) ne renvoie pas d'en-tête CORS pour une page web : la TV ne peut pas l'appeler elle-même. C'est le serveur qui l'appelle.

### La route `/extrait/:id`

La TV ne reçoit que l'id de la chanson (`d3135556`) et joue `<audio src="/extrait/d3135556">`. Le serveur :

1. vérifie que l'id est celui d'une chanson gardée du catalogue (sinon 404 : ce n'est pas un relais ouvert vers Deezer) ;
2. demande `https://api.deezer.com/track/3135556` (avec `fetch`, intégré à Node : aucune dépendance), 5 s au plus ;
3. répond par une **redirection 302** vers le lien `preview`. Le navigateur de la TV suit la redirection et lit le MP3 directement depuis le CDN de Deezer.

Le lien obtenu est gardé en mémoire **10 min** par id (moins que ses 15 min de validité) : un rechargement de la TV ou le préchargement ne redemandent pas Deezer. En cas d'échec (Deezer injoignable, `readable` faux, `preview` vide) : 404, et une ligne dans le journal.

Pourquoi une redirection plutôt que demander le lien dans la logique du mode : les fonctions des modes sont synchrones, et le serveur n'a pas à attendre Deezer pour avancer. La route vit dans `server/extraits.js` ; `index.js` la déclare comme `/qr/:code.svg`. Elle lit le catalogue, jamais `etatMode`.

### Lecture sur la TV

- Un élément `<audio>` par chanson en cours : 1 en classique, 5 en mix. Jamais de `<video>`, rien à afficher.
- **Départ** : le serveur tire pour chaque chanson une position de départ (`depart`, en secondes) entre 0 et 10 s dans l'extrait, pour que les 5 chansons du mix ne démarrent pas sur la même mesure. L'extrait Deezer est déjà pris au cœur du morceau : « lancé au milieu de la chanson » est donc naturel.
- **En boucle** (`loop`) : en mix, 120 s d'écoute font tourner chaque extrait 4 fois.
- **Volume** : en mix, chaque piste est réglée d'après son `gain` pour qu'aucune chanson n'écrase les autres (`volume = min(1, 10^((GAIN_CIBLE − gain) / 20))`). La valeur de `GAIN_CIBLE` est choisie à l'oreille au temps 1.
- **Pause** : en `designation`, la TV met les pistes en pause ; au retour en `ecoute`, elle les relance. Une chanson trouvée est arrêtée et vidée.
- **Préchargement** : pendant la révélation, la TV reçoit les ids de la manche suivante et les charge dans des `<audio preload="auto">` cachés, jamais lus.
- **Au podium**, tous les `<audio>` sont arrêtés et vidés (crochet `completerPodium`).
- La **musique de fond** de la salle d'attente est déjà coupée pendant une partie. Les sons du jeu (`tictac`, `revelation`…) passent par-dessus les extraits.
- Déblocage du son : le même que pour `sons.js` (touche OK de la télécommande). **À vérifier au temps 1** : que ce geste débloque aussi la lecture des `<audio>` dans le navigateur du stick.

### Droits

Seuls des identifiants et des métadonnées sont versionnés, aucun son. Les extraits sont lus depuis Deezer, dans le cadre d'un usage privé et non commercial. La TV affiche une petite mention « Extraits : Deezer » pendant l'écoute.


## `etatMode` sur le serveur

### Classique

```json
{
  "format": "classique",
  "phase": "ecoute",
  "questions": ["...une chanson par manche..."],
  "maitres": ["j_4d2e9f", "j_8f3k2a", "j_1b9c7d"],
  "indexQuestion": 1,
  "debutPhaseA": 1758641190000,
  "depart": 7,
  "designation": null
}
```

- `questions[i]` est une chanson du catalogue, `maitres[i]` son maître. Les deux listes ont la même longueur.
- `designation` : `null` pendant l'écoute, puis `{ "titre": "j_1b9c7d", "artiste": null }` une fois validée (`null` = personne).

### Mix

```json
{
  "format": "mix",
  "phase": "designation",
  "questions": [["...5 chansons..."], ["...5 chansons..."]],
  "maitres": ["j_4d2e9f", "j_8f3k2a"],
  "indexQuestion": 0,
  "debutPhaseA": 1758641190000,
  "ecouteRestanteMs": 84000,
  "departs": [3, 9, 0, 6, 2],
  "trouvees": { "1": { "joueur": "j_8f3k2a", "trouve": "les-deux" } },
  "chansonEnDesignation": 3
}
```

- Une « question » est ici un mix de 5 chansons.
- `trouvees` : par index de chanson dans le mix, qui l'a trouvée et quoi (`titre`, `artiste` ou `les-deux`).
- `chansonEnDesignation` : l'index de la chanson arrêtée par le maître, `null` hors `designation`.

Les points ne sont pas stockés : `pointsClassique(designation)` et `pointsMix(trouvees)` les calculent, comme au bluff. Les noms `questions`, `indexQuestion` et `debutPhaseA` sont ceux des autres modes, pour réutiliser `questionSuivanteOuPodium`, `echeanceDePhase` et `tempsRestantMs` de `commun.js`.

Le tirage réutilise `tirerQuestions` et `noterQuestionsVues` de `commun.js`, sur les seules chansons gardées. En mix, on tire 5 × N chansons puis on les range par 5.


## Événements

Aucun nouvel événement. Le maître envoie ses choix par `joueur:repondre` ; le serveur refuse tout `joueur:repondre` d'un joueur qui n'est pas le maître de la manche.

| Événement | Contenu en Blind test |
|---|---|
| `hote:reglerMode` | `{ format: "classique" \| "mix" }`, en salle d'attente seulement |
| `joueur:repondre` (classique) | En `ecoute` ou `designation` : `{ titre, artiste }`, chacun l'`id` d'un joueur désignable ou `null`. Refusé si l'émetteur n'est pas le maître, si un id n'est pas un joueur de la salle ou est celui du maître, si la désignation est déjà validée. Ignoré en `revelation`. |
| `joueur:repondre` (mix) | En `ecoute` : `{ arreter: index }`, index d'une chanson du mix pas encore trouvée → `designation`. En `designation` : `{ joueur, trouve }` (`trouve` vaut `titre`, `artiste` ou `les-deux`) pour la chanson en cours, ou `{ annuler: true }`. Refusé si l'émetteur n'est pas le maître, index invalide ou déjà trouvé, joueur non désignable, mauvaise phase. |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Titre, artiste, pochette | **Le maître de la manche** dès le début de la manche. Tous les autres (TV comprise) : à la révélation (classique) ; au moment où la chanson est trouvée, ou à la révélation (mix). |
| Id de la chanson (`d…`) | La TV seulement, pour l'extrait. Jamais un téléphone, même celui du maître (rien à charger en 4G). |
| Désignations | Personne avant la validation. Publiques ensuite. |

Les vues sont construites champ par champ, jamais en recopiant une chanson du catalogue. Des tests vérifient qu'aucun `titre`, `artiste`, `pochette` ni `deezer` n'apparaît dans la vue d'un autre joueur que le maître, ni dans la vue TV avant qu'il le faille.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Format, phase | Contenu |
|---|---|
| Classique, `ecoute` | `format`, `phase`, `numero`, `total`, `maitre` (id), `extrait: { id, depart }`, `tempsRestantMs`, `tempsEcouleMs` |
| Classique, `designation` | Idem, sans `extrait` (la musique est coupée) |
| Classique, `revelation` | Idem, plus `chanson: { titre, artiste, pochette }`, `titre` et `artiste` (id du joueur désigné ou `null`), `points` par joueur, `extraitsSuivants` (préchargement, absent à la dernière manche), `classement` |
| Mix, `ecoute` | `format`, `phase`, `numero`, `total`, `maitre`, `tempsRestantMs` (décompte d'écoute), `tempsEcouleMs`, `cartes` : 5 entrées, soit `{ extrait: { id, depart, gain } }` (pas encore trouvée), soit `{ titre, artiste, pochette, joueur, trouve, points }` (trouvée) |
| Mix, `designation` | Idem, plus `chansonEnDesignation` et le `tempsRestantMs` de la désignation. Le décompte d'écoute est figé (`ecouteRestanteMs`) |
| Mix, `revelation` | Toutes les cartes retournées (les non trouvées sans `joueur`), `extraitsSuivants`, `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Pour qui | Données |
|---|---|---|
| `ecouter` | Joueurs qui répondent | `numero`, `total`, nom du `maitre`. « Écoute la TV et crie ta réponse ! » |
| `maitre_classique` | Maître (classique) | `numero`, `total`, `chanson: { titre, artiste, pochette }`, `designables: [{ id, pseudo }]`, `tempsRestantMs` |
| `maitre_mix` | Maître (mix, `ecoute`) | `chansons` : 5 × `{ titre, artiste, trouvee, joueur }` |
| `maitre_designation` | Maître (mix, `designation`) | La chanson arrêtée, `designables`, `tempsRestantMs` |
| `attente_designation` | Joueurs qui répondent (mix, `designation`) | « Le maître désigne… » |
| `resultat` | Tous | Les chansons de la manche (titre, artiste, qui), `points` gagnés dans la manche, score et `rang`. Pour l'hôte : « Suivant » |
| `attente_question`, `fin` | Comme au quiz | |


## Écrans

| Où | Écran | Contenu |
|---|---|---|
| TV | Écoute (classique) | « Chanson 3/6 », « Maître du jeu : Paul » avec sa pastille, un grand disque vinyle qui tourne (animation CSS de rotation, sans filtre), chrono, « Extraits : Deezer », petit QR code |
| TV | Désignation (classique) | Le disque à l'arrêt, « Paul désigne les gagnants… », chrono de 15 s |
| TV | Révélation (classique) | Pochette en grand, titre, artiste, et dessous « Titre : Léa +500 », « Artiste : Sam +500 » (ou « Doublé ! Léa +1000 », « Personne n'a trouvé »), puis le classement |
| TV | Écoute (mix) | « Mix 2/6 », « Maître du jeu : Paul », 5 cartes « ? » en ligne ; une carte trouvée montre sa pochette, titre, artiste, le joueur et ses points. Décompte, « Extraits : Deezer » |
| TV | Désignation (mix) | Les cartes, la carte arrêtée mise en avant, « Paul désigne… », chrono de 20 s ; le décompte d'écoute affiché figé |
| TV | Révélation (mix) | Les cartes non trouvées se retournent une par une (0,8 s d'écart), puis le classement |
| Téléphone | Écouter | « Chanson 3/6 · Maître du jeu : Paul », « Écoute la TV et crie ta réponse ! » |
| Téléphone | Maître (classique) | Titre et artiste en grand, pochette, « Le titre : » + boutons joueurs + « Personne », « L'artiste : » idem, « Valider » (inactif tant que les deux lignes n'ont pas de choix) |
| Téléphone | Maître (mix) | 5 gros boutons « Titre — Artiste » ; les trouvées grisées avec le nom du joueur |
| Téléphone | Maître, désignation (mix) | La chanson, « Qui ? » (boutons joueurs), « Quoi ? » (Titre, Artiste, Les deux), « Valider », « Annuler » |
| Téléphone | Résultat | « +1000 : titre et artiste ! », « +500 : l'artiste », « Pas de point cette fois » ; pour le maître, « Tu étais le maître du jeu ». Score et rang |

Contraintes du Mi TV Stick : animations en opacité, déplacement et rotation seulement ; pas de flou ni de `filter`. Pochettes de 250×250 au plus.


## Sons

| Moment | Détection | Son |
|---|---|---|
| Nouvelle manche | `nouvelleEtape` en phase `ecoute` | `etape` (juste avant que l'extrait démarre) |
| Classique : révélation | `nouvelleEtape` en phase `revelation` | `victoire` si doublé, `revelation` si au moins un trouvé, `rate` si personne |
| Mix : désignation | `nouvelleEtape` en phase `designation` | Aucun (le mix se coupe, cela suffit) |
| Mix : chanson trouvée | Une carte de plus dans `cartes` a un `joueur` | `revelation` |
| Mix : révélation | `nouvelleEtape` en phase `revelation` | `victoire` si les 5 sont trouvées, sinon aucun |
| Tic-tac, lancement, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js`. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.


## Contenu

### Catalogue `data/blind-test.json`

```json
{
  "id": "d3135556",
  "deezer": 3135556,
  "titre": "Harder, Better, Faster, Stronger",
  "artiste": "Daft Punk",
  "pochette": "https://cdn-images.dzcdn.net/images/cover/5718f7c81c27e0b2417e2a4c45224f8a/250x250-000000-80-0-0.jpg",
  "gain": -12.4,
  "garder": true
}
```

- Préfixe d'id : **`d`** + l'id Deezer, comme `g` + l'id Imgflip pour La légende.
- `titre` : `title_short` de Deezer, relu (on retire « Remastered », « Radio Edit », « feat. … » s'ils restent). C'est ce que lit le maître.
- `artiste` : l'artiste principal, suivi des invités d'un « feat. » retirés du titre (« Mark Ronson, Bruno Mars » pour « Uptown Funk ») : le maître accepte l'un ou l'autre.
- `garder` : `false` exclut la chanson du tirage (relecture, extrait disparu).
- **Pas deux fois la même chanson** : deux chansons gardées de même artiste et même titre (sans accents ni majuscules) sont un doublon, même sous deux ids Deezer différents (album et compilation).
- Pas de `categorie` ni de `difficulte` pour l'instant.

Taille visée : **au moins 100 chansons gardées**. Une partie de mix à 10 joueurs en consomme 50.

### Script `scripts/importer-deezer.js`

Node seul (avec `fetch`), aucune dépendance. `node scripts/importer-deezer.js <id de playlist> [<id>…]` :

- lit les titres de la playlist publique Deezer, puis le détail de chaque nouvelle piste (`/track/<id>`, pour le `gain`), et ajoute les nouvelles à la fin de `data/blind-test.json`, en `garder: true` ;
- ne modifie jamais une entrée existante, ne rajoute pas un id déjà présent ni un doublon ;
- écarte les titres `readable: false`, sans `preview` ou sans `gain` ;
- relançable avec d'autres playlists.

On relit ensuite les titres et artistes, puis on lance `node scripts/verifier-blind-test.js`.

### Script `scripts/verifier-blind-test.js`

Sur le modèle de `verifier-legende.js`, **hors ligne** :

- seuls les champs `id`, `deezer`, `titre`, `artiste`, `pochette`, `gain`, `garder` ;
- `id` = `d` + `deezer`, unique ; `deezer` entier positif ;
- `titre`, `artiste` : chaînes non vides, sans espace au bord ;
- `pochette` : URL `https://` ; `gain` : nombre ; `garder` : booléen ;
- pas de doublon parmi les chansons gardées ;
- au moins 50 chansons gardées (une partie de mix à 10 joueurs) ;
- affichage : nombre de chansons gardées, d'exclues.

Avec l'option **`--deezer`**, il interroge en plus Deezer pour chaque chanson gardée et liste celles dont l'extrait n'est plus disponible (sans modifier le fichier). Les tests n'appellent jamais Deezer.

### Planche `/tv?extraits`

Comme `/tv?sons` : une page de test sur la TV, pour le temps 1. Boutons « 1 extrait », « Mix de 5 », « Pause », « Reprendre », « Retirer une chanson », « Tout arrêter ». Elle sert à vérifier sur le stick la lecture, les 5 pistes en même temps, les reprises et le volume, avant tout écran de jeu.


## Cas limites

| Situation | Comportement |
|---|---|
| Maître absent au début de sa manche | Manche sautée, on passe au maître suivant. Plus aucune manche jouable : podium. |
| Maître déconnecté pendant l'écoute | Classique : la manche va au bout, rien n'est compté sans validation. Mix : plus d'arrêt possible, la manche va au bout du décompte. |
| Maître déconnecté pendant une désignation (mix) | Annulée au bout de 20 s, le mix reprend. |
| Maître qui revient | Retrouve son écran de maître (sélection non validée perdue). |
| Joueur désigné qui se déconnecte ensuite | Garde ses points. |
| Arrivée en cours de partie | 0 point, désignable dès la manche suivante, jamais maître dans cette partie. |
| Moins de 3 joueurs connectés en cours de partie | La partie continue (le maître peut désigner l'unique joueur restant, ou « Personne »). « Rejouer » est désactivé tant que le compte n'y est pas. |
| Extrait indisponible | Voir « Cas délicats » : la manche continue. |
| Deezer injoignable pendant toute une soirée | Tous les extraits échouent : le mode reste jouable mais sans intérêt. L'hôte choisit un autre mode. |
| L'hôte termine pendant une manche | Podium avec les scores actuels. En mix, les chansons déjà trouvées de la manche en cours sont comptées (leurs points sont acquis à la validation). En classique, une manche non validée n'est pas comptée. |
| Plus assez de chansons inédites | On réautorise les plus anciennes, comme au quiz. |


## Modifications à reporter

- `server/extraits.js` : la route `/extrait/:id` et son cache ; `server/index.js` la déclare.
- `server/modes/blind-test.js` et ses tests ; `server/modes/index.js` : `blind-test` entre dans le registre.
- `docs/spec.md` :
  - « Modes de jeu supplémentaires » : ligne « Blind test » ;
  - « Hors périmètre » : retirer « Les questions avec image, son ou vidéo » pour le son de ce mode, et « la musique en dehors de la salle d'attente » ;
  - « Règles d'architecture » (et `CLAUDE.md`) : l'exception du maître au secret ;
  - `reglagesMode` et `hote:reglerMode` : le réglage `format` du blind test ;
  - « Contraintes techniques / Mi TV Stick » : jusqu'à 5 `<audio>` en même temps dans ce mode ;
  - « Tranches de développement » : tranche 25.
- `docs/sons.md`, « Quand jouer quoi » : les lignes du Blind test.
- `CLAUDE.md`, structure et commandes : `server/extraits.js`, `server/modes/blind-test.js`, `data/blind-test.json`, `scripts/importer-deezer.js`, `scripts/verifier-blind-test.js`.


## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`. Aucun test n'appelle Deezer : `fetch` est remplacé par une fausse fonction.

**Extraits et contenu (temps 1)** :

- `/extrait/:id` : id inconnu ou non gardé → 404 sans appel à Deezer ; id gardé → 302 vers le `preview` reçu ; deuxième appel dans les 10 min → pas de nouvel appel ; `readable: false`, `preview` vide, erreur réseau, délai dépassé → 404 ;
- `verifier-blind-test.js` détecte : id en double, id ≠ `d` + `deezer`, champ en trop ou manquant, `titre` ou `artiste` vide, `pochette` non `https`, `gain` non numérique, `garder` non booléen, même chanson gardée deux fois, moins de 50 chansons gardées ; le vrai catalogue passe ;
- import : un id déjà présent n'est ni modifié ni rajouté ; les titres sans extrait et les doublons sont écartés.

**Format classique (temps 2)** :

- le registre contient `blind-test` avec tout le contrat ; refusé à 2 joueurs, accepté à 3 ;
- `hote:reglerMode` : `classique` et `mix` acceptés, autre valeur refusée, hors salle d'attente refusé ;
- autant de manches que de joueurs connectés au lancement, chacun maître une fois ; maître absent → manche sautée ; plus de maître disponible → podium ;
- désignation : refusée d'un autre joueur que le maître, avec le maître comme désigné, avec un id inconnu, deux fois ; acceptée en `ecoute` (révélation directe) et en `designation` ; ignorée en `revelation` ;
- points : titre seul 500, artiste seul 500, doublé 1000, deux joueurs différents 500 chacun, personne 0, maître 0 ;
- chronos : 30 s → `designation`, 15 s sans validation → révélation sans points, 12 s → manche suivante ; podium après la dernière ;
- secret : en `ecoute`, la vue TV ne contient ni titre ni artiste ni pochette ; la vue d'un joueur qui n'est pas le maître non plus, ni l'id `d…` ; la vue du maître contient titre et artiste mais pas l'id `d…` ;
- tirage : seules les chansons gardées, pas de répétition sur 3 parties, les `d…` cohabitent avec les autres ids dans `questionsVues`.

**Format mix (temps 3)** :

- 5 chansons par manche, toutes différentes, positions de départ entre 0 et 10 s ;
- `arreter` : refusé d'un autre joueur, sur une chanson déjà trouvée, avec un index invalide, hors `ecoute` ; passe en `designation` et fige le décompte ;
- désignation : `titre` ou `artiste` → 500, `les-deux` → 1000 ; la chanson est retirée ; `annuler` → retour en `ecoute` sans rien compter ; 20 s sans réponse → annulée ;
- décompte : le temps passé en `designation` n'est pas décompté de l'écoute ; 120 s d'écoute cumulée → révélation ; 5 chansons trouvées → révélation directe ;
- secret : une carte non trouvée de la vue TV n'a que `extrait` ; la vue des joueurs qui répondent ne contient aucune chanson non trouvée ;
- l'hôte termine pendant une manche : les chansons déjà trouvées sont comptées.


## Test de la tranche (à faire toi-même)

Sur Render (les téléphones ne joignent pas le serveur local depuis le PC d'entreprise), TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev`. Puis sur le **vrai stick**.

**Temps 1 (extraits et contenu)**

1. `node scripts/importer-deezer.js <id de playlist>` ajoute des chansons ; relire titres et artistes dans `data/blind-test.json`.
2. `node scripts/verifier-blind-test.js` : aucune erreur, le nombre de chansons gardées. Puis avec `--deezer` : la liste des extraits disparus (vide, normalement).
3. Ouvrir `https://<service>/extrait/d3135556` dans le navigateur : l'extrait se lit. Un id inventé : 404.
4. **Sur le stick**, ouvrir `/tv?extraits`, appuyer sur OK pour débloquer le son, puis : « 1 extrait » se lit ; « Mix de 5 » : les 5 pistes jouent ensemble sans craquement ni décalage croissant, chacune reconnaissable ; « Pause » et « Reprendre » répondent tout de suite ; « Retirer une chanson » en coupe une seule ; volumes équilibrés (régler `GAIN_CIBLE`). Laisser tourner le mix 2 min : pas de saccade.

**Temps 2 (classique)**

1. **Choix.** À 2 joueurs, Blind test est grisé ; à 3, il s'active. L'hôte choisit Blind test et « Classique » : la TV affiche « Blind test · Classique ».
2. **Écoute.** Lancer. L'extrait joue sur la TV avec le disque et le chrono ; un seul téléphone (le maître) affiche le titre et l'artiste, les autres « Crie ta réponse ! ». Dans les outils de développement d'un onglet joueur (messages Socket.IO) : aucun titre ni artiste.
3. **Désignation.** Le maître choisit Léa pour le titre, Sam pour l'artiste, et valide : la musique s'arrête, la révélation montre la pochette, « Titre : Léa +500 », « Artiste : Sam +500 ». Manche suivante : un autre maître ; tenter un doublé (« Doublé ! », +1000, fanfare `victoire`).
4. **Sans validation.** Laisser passer 30 s : la musique s'arrête, « Paul désigne… », 15 s ; ne rien faire : « Personne n'a trouvé », son `rate`.
5. **Rotation.** Chaque joueur est maître exactement une fois, puis podium.
6. **Maître absent.** Couper le prochain maître pendant une révélation (« Couper 15 s ») : sa manche est sautée.
7. **Rechargement.** Recharger la TV en pleine écoute : l'extrait reprend à peu près où il en était.

**Temps 3 (mix)**

1. L'hôte choisit « Mix ». Lancer : 5 chansons ensemble, 5 cartes « ? », décompte de 120 s.
2. Le maître touche une chanson : le mix se coupe, le décompte se fige. Il désigne Léa, « Les deux » : la carte se retourne (+1000), le mix reprend avec 4 chansons, le décompte repart d'où il était.
3. « Artiste » seul pour une autre : +500. Une fausse alerte : « Annuler », le mix reprend avec les mêmes chansons.
4. Toucher une chanson puis ne rien faire 20 s : la désignation s'annule d'elle-même.
5. Trouver les 5 : révélation directe, `victoire`. Sur une autre manche, laisser le décompte finir : les chansons restantes se retournent.
6. **Sur le vrai stick**, une partie complète de mix à 4 joueurs au moins : lecture, pauses et reprises sans à-coup.


## Choix validés

Tranchés par Paul le 27/09/2026 :

1. **Source** : extraits Deezer, aucun fichier audio dans le dépôt.
2. **Un seul mode**, deux formats (Classique, Mix) choisis par l'hôte.
3. **Classique** : autant de chansons que de joueurs, 30 s d'écoute, le maître désigne qui a trouvé le titre et qui a trouvé l'artiste.
4. **Mix** : 5 chansons en même temps, retirées dès qu'elles sont trouvées, un seul joueur marque par chanson (double s'il a le titre et l'artiste). Le maître tourne aussi à chaque manche.

Proposés par la mini-spec, validés par Paul le même jour :

5. **Points** : titre 500, artiste 500 (classique) ; les deux 1000, l'un des deux 500 (mix). Le maître ne marque rien. Chacun étant maître une fois, personne n'est désavantagé. *Alternative écartée : un bonus au maître quand sa chanson est trouvée. Il ne choisit pas la chanson, donc ce bonus ne récompenserait rien, et il pousserait à désigner trop généreusement.*
6. **Joueurs** : 3 à 10, pour les deux formats.
7. **Nombre de manches du mix** : autant que de joueurs, comme en classique (chacun maître une fois). À 10 joueurs, une partie de mix dure près de 30 min et consomme 50 chansons. *Alternative écartée : 5 mix au plus, seuls les 5 premiers de la liste sont maîtres.*
8. **Chronos** : classique 30 s + 15 s de désignation + 12 s de révélation ; mix 120 s d'écoute (en pause pendant les désignations) + 20 s par désignation + 15 s de révélation.
9. **Le mix se met en pause** pendant que le maître désigne (c'est ce qui permet de ne pas rater une autre chanson pendant ce temps). *Alternative écartée : le mix continue, la chanson disparaît seulement à la validation.*
10. **Validation définitive** en classique (le maître coche, puis « Valider » une seule fois) : pas de correction après coup.
11. **Pochette** affichée à la révélation (TV) et sur le téléphone du maître.
12. **Catalogue** : au moins 50 chansons gardées pour que le script passe, 100 visées ; import par playlists publiques Deezer. Premier import (temps 1) : « En mode 70, 80, 90, 2000, 2010 » et « Essentiels chanson française ».
13. **Découpage** en trois temps : extraits et contenu (avec l'essai sur le stick), classique, mix.
