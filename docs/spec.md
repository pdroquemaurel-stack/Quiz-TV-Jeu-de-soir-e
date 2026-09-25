# Quiz TV — Spec du MVP

## Objectif

Le MVP permet à 2 à 10 amis réunis dans une même pièce de jouer une partie complète de quiz de culture générale. La TV (Mi TV Stick 4K) affiche la partie, et chaque téléphone sert de manette via une simple page web, sans rien installer.

Le MVP est réussi si une soirée réelle se déroule sans intervention technique : ouvrir l'app TV, scanner le QR code, jouer 10 questions, voir le podium, puis rejouer. Il doit aussi supporter au moins une déconnexion de téléphone en cours de partie.

Le code et le modèle de données doivent permettre d'ajouter ensuite d'autres modes de jeu sans tout réécrire. Cinq modes sont prévus après le MVP (voir « Modes de jeu supplémentaires »).

## Déroulé d'une partie

Une salle passe par 5 états communs à tous les modes, pilotés par le serveur : `lobby`, `partie`, `podium`, `tableau` et `grandGagnant`. Pendant une partie, le mode a ses propres phases, dans `etatMode.phase`. La TV et les téléphones ne font qu'afficher l'état reçu.

```mermaid
stateDiagram-v2
    [*] --> lobby: app TV ouverte
    lobby --> partie: l'hôte lance (≥ 2 joueurs)
    partie --> podium: après la 10e question, ou l'hôte termine (médailles attribuées)
    podium --> tableau: après 15 s ou « Suivant »
    podium --> grandGagnant: idem, en aventure, si un seul joueur en tête a atteint l'objectif
    tableau --> partie: « Partie suivante » / « Rejouer » (≥ 2 joueurs)
    tableau --> lobby: « Changer de format » (points globaux gardés)
    grandGagnant --> partie: « Nouvelle aventure » (points globaux remis à 0)
    grandGagnant --> lobby: « Changer de format » (points globaux remis à 0)
```

Phases du quiz pendant la partie :

```mermaid
stateDiagram-v2
    [*] --> question
    question --> revelation: tous ont répondu ou 20 s
    revelation --> question: après 8 s ou « Suivant »
    revelation --> [*]: après la 10e question
```

La fermeture après 30 min sans aucune connexion (ni TV ni joueur) peut arriver dans n'importe quel état, pas seulement au podium.

1. **Création de la salle.** À l'ouverture de l'app, la TV demande une salle au serveur. Elle affiche un grand QR code, le code de salle en 4 lettres et la liste des joueurs (vide).
2. **Arrivée des joueurs.** Chaque joueur scanne le QR code (ou tape le code), saisit un pseudo et apparaît sur la TV avec sa couleur. Le premier arrivé devient l'hôte (couronne sur la TV).
3. **Lancement.** L'hôte choisit le mode et le format (« Petite partie » ou « Aventure », voir « Format et médailles »), puis voit un bouton « Lancer la partie », actif dès 2 joueurs connectés.
4. **Question.** La TV affiche la question, les 4 réponses (couleur + forme), le chrono de 20 s et qui a déjà répondu. Les téléphones affichent 4 gros boutons. Un joueur répond une seule fois, sans changer d'avis.
5. **Révélation.** Dès que tous les joueurs attendus ont répondu (voir « Fin anticipée »), ou à la fin du chrono, la TV montre la bonne réponse, le nombre de réponses par choix, qui a eu juste, puis le classement. Chaque téléphone affiche « Bonne réponse, +740 » ou « Raté ».
6. **Enchaînement.** Passage automatique après 8 s. L'hôte peut accélérer avec « Suivant ».
7. **Fin.** Après 10 questions, la TV affiche le podium avec les médailles et les téléphones le rang de chacun.
8. **Tableau.** Après 15 s (ou « Suivant » de l'hôte), la TV affiche les points globaux. En aventure, si un seul joueur en tête a atteint l'objectif, c'est l'écran du grand gagnant à la place.
9. **Rejouer.** L'hôte appuie sur « Partie suivante » (aventure) ou « Rejouer » (petite partie), actif dès 2 joueurs connectés : mêmes joueurs, scores remis à zéro, points globaux gardés, nouvelles questions jamais vues dans cette salle.

## Fonctionnalités du MVP

### Salle
- Création automatique d'une salle à l'ouverture de l'app TV (code de 4 lettres, QR code vers la page joueur)
- 2 à 10 joueurs connectés, 1 joueur autorisé pour tous les modes en mode développeur (`MODE_DEV=1`)
- Rôle d'hôte pour le premier arrivé, transféré automatiquement après 10 s de déconnexion
- Fermeture automatique après 30 min sans aucune connexion, dans n'importe quel état. Tant que la TV est connectée, la salle reste ouverte.
- Jeton secret remis à la TV à la création de la salle, exigé pour s'y reconnecter

### Joueur
- Rejoindre par QR code ou par saisie du code
- Pseudo unique de 1 à 12 caractères, couleur attribuée automatiquement (voir « Couleurs »)
- Reconnexion automatique avec conservation du pseudo et du score
- Écran maintenu allumé pendant la partie (Wake Lock)

### Partie de quiz
- 10 questions tirées au hasard, sans répétition dans la salle
- QCM à 4 choix, chrono de 20 s, points dégressifs selon la rapidité
- Révélation, classement intermédiaire, podium final avec médailles, tableau des points globaux, « Rejouer »

### TV
- Page TV ouverte dans un navigateur installé sur le stick (l'APK est en réserve, voir « Contraintes techniques »)
- Écran jamais mis en veille : Wake Lock sur la page TV et réglages du stick (tranche 18)
- Reconnexion automatique à sa salle après un rechargement ou une coupure réseau
- En réserve avec l'APK : touche Retour = « Quitter ? », touche OK = recréer une salle

### Contenu
- Fichier JSON d'environ 200 questions en français, texte uniquement, relues à la main

## Hors périmètre

Ces éléments sont volontairement repoussés. Le modèle de données ne doit pas les empêcher.

- Les modes de jeu autres que les six déjà en place (Quiz et les cinq modes des tranches 11 à 15) : La réplique est prévue à la tranche 23, les autres sont dans « Plus tard »
- Le choix d'un thème ou d'une difficulté (les champs existent déjà dans les questions) : prévu à la tranche 22
- Les questions avec image, son ou vidéo
- Les sons sur les téléphones, et la musique en dehors de la salle d'attente
- Le jeu à distance, hors de la pièce de la TV
- Les comptes, l'historique des parties et toute base de données
- Un back-office pour éditer les questions
- Les langues autres que le français
- La survie des parties à un redémarrage du serveur
- Le pilotage de la partie à la télécommande
- Plus de 10 joueurs et les spectateurs

## Règles des modes

### Quiz culture générale (MVP)

- Une partie compte 10 questions. Chaque question est un QCM à 4 choix avec une seule bonne réponse.
- Chaque joueur a 20 s pour répondre, en une seule réponse définitive.
- Une mauvaise réponse ou une absence de réponse rapporte 0 point.
- Une bonne réponse rapporte entre 1000 et 500 points selon la rapidité :

  `points = arrondi(1000 - 500 × t / 20)`

  Ici, `t` est le temps écoulé en secondes, mesuré par le serveur à la réception de la réponse. On n'utilise jamais l'horloge du téléphone.
- **Fin anticipée** : la manche se termine dès que tous les joueurs attendus ont répondu, ou à 20 s. Les joueurs attendus sont ceux qui étaient connectés au début de la manche et qui le sont encore. Un joueur arrivé en cours de manche n'est pas attendu. Si un joueur attendu se déconnecte, on vérifie à nouveau si tous les autres ont répondu.
- Classement par score total. En cas d'égalité, les joueurs partagent le même rang, sans départage, et le rang suivant est sauté : 1, 1, 3.

### Format et médailles (tous les modes)

- **Format**, choisi par l'hôte en salle d'attente : « Petite partie » (par défaut) ou « Aventure », avec un objectif de 3 à 15 points globaux (5 par défaut).
- **Médailles** à la fin de chaque partie, quel que soit le mode, y compris quand l'hôte la termine avant la fin (sur les scores du moment) : or = 3 points globaux, argent = 2, bronze = 1. Classement « olympique » : les ex æquo partagent la même médaille et le rang suivant est sauté (1, 1, 3 → or, or, bronze ; 1, 2, 2 → or, argent, argent). Un joueur à 0 point dans la partie n'a pas de médaille, même s'il est sur le podium.
- **Points globaux** : ils s'additionnent de partie en partie dans la salle, avec le nombre de médailles de chaque sorte. « Rejouer » et « Changer de format » les gardent. Un joueur qui arrive en cours de route part de 0.
- **Fin d'une aventure** : après les médailles, si un seul joueur a le plus de points globaux et au moins l'objectif, il est le grand gagnant. Si plusieurs joueurs sont à égalité en tête à l'objectif ou au-delà, on joue une partie de plus (« Départage ! » sur le tableau).
- **Nouvelle aventure** (ou « Changer de format » après un grand gagnant) : points globaux, médailles et numéro de partie remis à 0, même objectif.

### Modes de jeu supplémentaires (après le MVP)

Résumés seulement. Les règles détaillées de chaque mode sont écrites dans sa mini-spec (`docs/modes/`), juste avant de le coder. Le maximum reste 10 joueurs pour tous les modes.

| Ordre | Mode | Joueurs | Résumé |
|---|---|---|---|
| 1 | **Estimation** (disponible, voir `docs/modes/estimation.md`) | 3 à 10 | Une question à réponse numérique (« Combien de km entre Casablanca et Paris ? »). Chacun saisit un nombre, le plus proche gagne. |
| 2 | **Qui de nous ?** (disponible, voir `docs/modes/qui-de-nous.md`) | 4 à 10 | « Qui est le plus susceptible de rater son avion ? ». Chacun vote pour un joueur, la TV affiche les résultats. |
| 3 | **Undercover** (disponible, voir `docs/modes/undercover.md`) | 4 à 10 | Chacun reçoit un mot secret sur son téléphone : les undercovers ont un mot légèrement différent, Mister White (dès 5 joueurs) n'en a aucun. Tours de description à voix haute, puis vote pour éliminer les intrus. Mister White éliminé peut gagner en devinant le mot des civils. |
| 4 | **Même réponse** (disponible, voir `docs/modes/meme-reponse.md`) | 3 à 10 | « Cite un fruit rouge ». On marque des points si on donne la même réponse que d'autres joueurs. |
| 5 | **Le bluff** (disponible, voir `docs/modes/bluff.md`) | 4 à 10 | Question obscure : chacun invente une fausse réponse, puis tout le monde cherche la vraie parmi les bluffs. Points pour avoir trouvé et pour avoir piégé. |

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant une partie | Grisé sur la TV, garde son score et son pseudo (réservé), ne bloque pas la manche. Jamais supprimé pendant une partie. |
| Joueur déconnecté en salle d'attente | S'il n'a encore ni point global ni médaille : retiré de la salle après 10 s de déconnexion. Sinon (par exemple après « Changer de format ») : jamais retiré, grisé, il garde ses points globaux et ses médailles, comme au tableau. Ce second cas s'applique à partir de la tranche 20 (R4) ; avant, le joueur est retiré avec ses points globaux. |
| Joueur déconnecté au podium, au tableau ou au grand gagnant | Comme pendant une partie : jamais retiré, garde ses points globaux et ses médailles. |
| Joueur qui revient | Retrouve pseudo et score grâce à son identifiant mémorisé, et reprend à l'écran en cours. |
| Joueur retiré de la salle d'attente qui revient | Réinscrit automatiquement avec son pseudo mémorisé, comme un nouveau joueur. Si ce pseudo a été pris entre-temps, il revient au formulaire avec « Pseudo déjà pris ». |
| Hôte déconnecté plus de 10 s | Dans tous les états, le rôle passe au joueur connecté arrivé le plus tôt (`arriveeA`). Si aucun autre joueur n'est connecté, l'hôte ne change pas, et le rôle passe au premier joueur qui se connecte ensuite. L'ancien hôte ne récupère pas le rôle à son retour. En salle d'attente, l'hôte seul est retiré comme les autres, et le prochain joueur qui arrive devient l'hôte. |
| Arrivée en cours de partie | Acceptée avec 0 point, joue à partir de la question suivante. Le QR code reste visible dans un coin. Il en va de même pour un joueur déconnecté au début d'une manche qui revient pendant celle-ci. |
| Reconnexion alors que 10 joueurs sont connectés | Toujours acceptée : un joueur ne perd jamais sa place. |
| Plus de couleur libre (11e joueur pendant qu'un autre est déconnecté) | Le nouveau joueur reprend la couleur d'un joueur déconnecté. |
| Pseudo déjà pris | Message « Pseudo déjà pris », saisie à refaire. Les espaces de début et de fin sont retirés, et la comparaison ignore la casse (« paul » = « Paul »). |
| 11e joueur | Message « Salle pleine (10 max) ». Seuls les joueurs connectés comptent. |
| Code de salle inconnu ou salle fermée | Message « Salle introuvable ». |
| Moins de 2 joueurs connectés en cours de partie | La partie continue. |
| TV rechargée ou coupée | La TV se reconnecte à sa salle et reprend l'état en cours. |
| Serveur redémarré | Partie perdue. La TV recrée une salle et les joueurs voient « Salle introuvable ». |
| Plus assez de questions inédites | On réautorise les questions déjà vues, en commençant par les plus anciennes. |

## Format des données

Toutes les salles vivent en mémoire sur le serveur, dans un objet `salles` indexé par code. Le champ `mode` et le bloc `etatMode` isolent ce qui est propre au quiz : un nouveau mode ajoute son propre `etatMode` sans toucher au reste. Le serveur passe par un registre des modes (`server/modes/index.js`), et chaque mode respecte le même contrat (voir `docs/modes/estimation.md`).

### Question (fichier `questions.json`)

```json
{
  "id": "q0042",
  "texte": "Quelle est la capitale de l'Australie ?",
  "reponses": ["Sydney", "Canberra", "Melbourne", "Perth"],
  "bonneReponse": 1,
  "categorie": "geographie",
  "difficulte": 2
}
```

`bonneReponse` est l'index de la bonne réponse (de 0 à 3). L'ordre d'affichage est mélangé à chaque tirage, et `bonneReponse` est alors recalculé pour pointer vers la même réponse. Un test automatique vérifie ce recalcul. La `difficulte` va de 1 (facile) à 3 (difficile).

### Joueur

```json
{
  "id": "j_8f3k2a",
  "pseudo": "Paul",
  "couleur": 1,
  "score": 2740,
  "pointsGlobaux": 7,
  "medailles": { "or": 2, "argent": 0, "bronze": 1 },
  "connecte": true,
  "socketId": "aXc91...",
  "arriveeA": 1758641000000
}
```

`score` est celui de la partie en cours, remis à 0 à chaque lancement. `pointsGlobaux` et `medailles` s'accumulent de partie en partie (voir « Format et médailles »). `id` est généré par le serveur et mémorisé dans le navigateur du téléphone : c'est lui qui permet la reconnexion. `couleur` est un numéro de 1 à 10 : la teinte réelle est définie dans le CSS (`--joueur-1` à `--joueur-10`, voir « Couleurs »). `socketId` change à chaque reconnexion. `arriveeA` sert à choisir le prochain hôte.

### Salle

```json
{
  "code": "KDZP",
  "mode": "quiz",
  "etat": "partie",
  "hoteId": "j_8f3k2a",
  "tvSocketId": "Zp0e4...",
  "jetonTv": "t_91kd02mz4q...",
  "joueurs": ["...objets Joueur..."],
  "questionsVues": ["q0042", "q0107"],
  "derniereActiviteA": 1758641200000,
  "format": { "type": "aventure", "objectif": 5 },
  "numeroPartie": 3,
  "grandGagnantId": null,
  "debutPodiumA": 1758641100000,
  "medaillesPartie": { "j_8f3k2a": "or" },
  "etatMode": {
    "phase": "question",
    "questions": ["...10 questions tirées..."],
    "indexQuestion": 3,
    "debutQuestionA": 1758641190000,
    "attendus": ["j_8f3k2a", "j_2m9x7c"],
    "reponses": { "j_8f3k2a": { "choix": 1, "recuA": 1758641195300 } }
  }
}
```

`etat` vaut `lobby`, `partie`, `podium`, `tableau` ou `grandGagnant`. Pendant une partie, `etatMode.phase` vaut `question` ou `revelation` pour le quiz. `etatMode.attendus` liste les `id` des joueurs attendus pour la manche en cours (voir « Fin anticipée ») : tous les modes l'utilisent, via `server/modes/commun.js`. Les timers (20 s, 8 s, 15 s de podium, 10 s pour l'hôte et pour le retrait d'un joueur en salle d'attente) sont gérés par le serveur.

`format.type` vaut `petite` ou `aventure`, et `format.objectif` va de 3 à 15. `numeroPartie` compte les parties lancées depuis la création de la salle ou la dernière nouvelle aventure. `medaillesPartie` donne la médaille (`or`, `argent`, `bronze`) de chaque joueur médaillé de la dernière partie. `grandGagnantId` n'est rempli qu'à l'état `grandGagnant`. Ces champs sont communs à tous les modes : le code commun (`server/salles.js`, `server/medailles.js`) les gère sans jamais lire `etatMode`.

`jetonTv` est un secret aléatoire généré à la création de la salle et envoyé uniquement à la TV. Il empêche un joueur de se faire passer pour la TV avec le seul code de salle, puis de lire les bonnes réponses et les `id` des joueurs.

### Événements Socket.IO

Règle simple : les clients envoient des actions, le serveur répond en diffusant l'état complet de la salle. Pas de synchronisation fine, et la reconnexion devient triviale.

| Événement | Sens | Contenu |
|---|---|---|
| `tv:creer` | TV → serveur | code et `jetonTv` de l'ancienne salle, facultatifs, pour s'y reconnecter. Sans jeton valide, une nouvelle salle est créée. |
| `joueur:rejoindre` | téléphone → serveur | code, pseudo, id mémorisé éventuel |
| `hote:lancer` | téléphone de l'hôte → serveur | rien |
| `joueur:repondre` | téléphone → serveur | la réponse, interprétée par le mode : index du choix (Quiz, vote du bluff), nombre entier (Estimation), texte (Même réponse, bluff en saisie, devinette de Mister White), `id` d'un joueur (Qui de nous ?, vote d'Undercover). Le détail et les refus sont dans la mini-spec de chaque mode. |
| `hote:suivant` | téléphone de l'hôte → serveur | rien. Pendant une partie, le « Suivant » du mode. Au podium, passe au tableau (ou au grand gagnant). |
| `hote:rejouer` | téléphone de l'hôte → serveur | rien. Accepté au tableau et au grand gagnant. Relance le mode choisi ; depuis le grand gagnant, remet d'abord les points globaux à 0 (« Nouvelle aventure »). |
| `hote:configurer` | téléphone de l'hôte → serveur | `{ type: "petite" \| "aventure", objectif }`. Accepté seulement en salle d'attente, avec un objectif entier de 3 à 15. |
| `hote:changerFormat` | téléphone de l'hôte → serveur | rien. Accepté au tableau et au grand gagnant : retour en salle d'attente. |
| `hote:choisirMode` | téléphone de l'hôte → serveur | `id` du mode. Accepté seulement en salle d'attente ou au tableau, pour un mode jouable avec assez de joueurs connectés (voir `docs/modes/estimation.md`). |
| `hote:terminer` | téléphone de l'hôte → serveur | rien. Arrête la partie en cours et passe au podium. |
| `salle:etat` | serveur → TV | état complet de la salle, avec le texte des questions et le `jetonTv`. `bonneReponse` n'y figure qu'à partir de la révélation. Hors partie, aussi `tableau` (joueurs triés par points globaux, avec rang, médailles et `ecartAuLeader`), `departage` et `pointsMedaille`. |
| `joueur:etat` | serveur → un téléphone | vue personnalisée : mode, écran à afficher, a déjà répondu, résultat, rang, est hôte, `peutTerminer` (hôte pendant une partie). Hors partie, aussi `format` et `pointsGlobaux` ; au podium `medaille` et `gain` ; au tableau et au grand gagnant `rangGlobal`, `numeroPartie`, `grandGagnant` et `estGrandGagnant`. |
| `erreur` | serveur → client | code + message (pseudo pris, salle pleine, salle introuvable) |

Ni le téléphone ni la TV ne reçoivent la bonne réponse avant la révélation, pour éviter la triche via les outils du navigateur.

## Écrans à concevoir

Principe : l'information est sur la TV, le téléphone ne montre que ce qu'il faut pour agir. La TV doit rester lisible à 3 mètres (texte de 40 px minimum en 1080p). Les écrans du téléphone doivent s'utiliser d'une main.

### TV (1920×1080)

| Écran | Contenu |
|---|---|
| Connexion | « Connexion au serveur… » en plein écran tant que la page n'a jamais été connectée, puis en bandeau lors d'une coupure, avec nouvelle tentative automatique (tranche 18, voir Contraintes techniques) |
| Salle d'attente | QR code géant, code en 4 lettres, URL courte, joueurs arrivés (couleur, pseudo, couronne de l'hôte), mode choisi et sa règle courte (« N joueurs minimum » s'il en manque), format (« Petite partie » ou « Aventure — premier à 5 points »), « En attente que l'hôte lance » |
| Question | Numéro (3/10), texte, 4 réponses (couleur + forme ▲ ◆ ● ■), chrono, pastilles des joueurs ayant répondu, petit QR code dans un coin |
| Révélation | Bonne réponse mise en avant, nombre de réponses par choix, qui a eu juste, puis classement avec les points gagnés |
| Podium | Tous les joueurs de rang 3 ou mieux (ex æquo possibles, donc parfois plus de 3) avec leur médaille, classement complet dessous avec « 🥇 +3 / 🥈 +2 / 🥉 +1 », « Points globaux dans un instant » |
| Tableau | Joueurs triés par points globaux (rang, pseudo, médailles obtenues 🥇🥈🥉, points), « Après la partie N ». En aventure : l'objectif, l'écart au leader et « Départage ! » en cas d'égalité en tête à l'objectif. « Prochain mode : … », « L'hôte peut relancer » |
| Grand gagnant | Nom du grand gagnant en grand, classement final de l'aventure, « L'hôte peut lancer une nouvelle aventure » |
| Quitter ? | Boîte de confirmation déclenchée par la touche Retour (en réserve avec l'APK, tranche 9) |

### Téléphone (portrait)

| Écran | Contenu |
|---|---|
| Rejoindre | Code pré-rempli depuis le QR code, champ pseudo, bouton « Entrer », messages d'erreur |
| Attente | « Tu es dans la salle », sa couleur. Pour l'hôte : « Petite partie » / « Aventure » (et en aventure le réglage − / + de l'objectif), un bouton par mode (grisé s'il manque des joueurs ; « Bientôt » pour un mode annoncé mais pas encore codé, listé dans `modesAVenir` du registre des modes, vide aujourd'hui : l'affichage « Bientôt » est gardé pour les prochains modes), puis « Lancer la partie » (inactif sous le minimum du mode choisi). Pour les autres : « Mode : … » et le format |
| Répondre | 4 gros boutons couleur + forme, sans texte, qui occupent tout l'écran |
| Réponse envoyée | « Réponse envoyée, regarde la TV » avec le bouton choisi |
| Résultat | « Bonne réponse, +740 » ou « Raté », rang actuel. Pour l'hôte : bouton « Suivant » |
| Fin | Rang final, score, médaille et points globaux gagnés (« 🥇 Médaille d'or, +3 » ou « Pas de médaille cette fois »). Pour l'hôte : « Suivant » |
| Tableau | Rang et points globaux. Pour l'hôte : les boutons de mode, « Partie suivante » (aventure) ou « Rejouer » (petite partie), inactif sous le minimum du mode choisi, et « Changer de format ». Pour les autres : « Mode : … » |
| Grand gagnant | « Tu gagnes l'aventure ! » ou « X gagne l'aventure », rang et points globaux. Pour l'hôte : « Nouvelle aventure » et « Changer de format » |
| En attente de la prochaine question | Pour un joueur arrivé en cours de manche |
| Reconnexion | Bandeau « Reconnexion… » quand la connexion saute |

### Couleurs

Ambiance « Pop et coloré » (choisie à la tranche 7) : fond crème à pois, gros contours foncés, relief par une bordure basse épaisse, police Fredoka hébergée dans le dépôt. Toutes les couleurs sont des variables dans `public/commun/theme.css` : changer d'ambiance revient à modifier ce seul fichier. Les réponses ne sont jamais identifiées par la couleur seule : la forme (dessinée en SVG) les distingue toujours.

Fond `#FFF1CC`, texte et contours `#1B1035`, accent `#FF4F8B`.

Réponses :

| Forme | Couleur |
|---|---|
| ▲ | Rouge `#F2353F` |
| ◆ | Bleu `#2F6BFF` |
| ● | Jaune `#FFC01F` (forme et texte foncés) |
| ■ | Vert `#17A34A` |

Joueurs, attribués dans cet ordre (première couleur libre). Le serveur n'envoie que le numéro.

| # | Couleur |
|---|---|
| 1 | Orange `#FF7A00` |
| 2 | Rose `#FF4FA0` |
| 3 | Violet `#8A4DFF` |
| 4 | Cyan `#00B4C6` |
| 5 | Menthe `#19C37D` |
| 6 | Citron vert `#8BC000` |
| 7 | Brun `#9A5B34` |
| 8 | Encre `#1B1035` |
| 9 | Bleu ciel `#3E9BFF` |
| 10 | Gris `#7B8190` |

## Contraintes techniques

### Mi TV Stick 4K

- Android TV 11 et 2 Go de RAM : la page TV reste en HTML/CSS/JS sans framework, avec des animations CSS simples (opacité, déplacement) et aucune image lourde.
- **Pour l'instant, la TV tourne dans un navigateur installé sur le stick**, qui ouvre la page `/tv` du serveur. Cela suffit pour jouer : l'APK est en réserve (tranche 9) et ne sera repris que si la soirée test révèle un problème.
- Réglages du stick avant une soirée : économiseur d'écran et mise en veille réglés sur le délai le plus long. La page TV demande en plus un Wake Lock quand le navigateur le permet (tranche 18).
- Dans le navigateur, le son reste bloqué jusqu'au premier geste : la touche OK de la télécommande le débloque (voir `docs/sons.md`).

### APK (en réserve)

- L'APK est une coquille minimale en Kotlin :
  - une activité plein écran avec une WebView qui charge l'URL de la page TV, sans code métier ;
  - l'écran reste allumé (`FLAG_KEEP_SCREEN_ON`) ;
  - l'app est déclarée pour Android TV (catégorie Leanback + bannière), sinon elle n'apparaît pas sur l'accueil du stick ;
  - les touches Retour et OK sont transmises à la page ;
  - la WebView joue le son sans geste (`mediaPlaybackRequiresUserGesture = false`).
- Toute modification d'affichage se fait côté serveur. On ne réinstalle l'APK que si la coquille change.
- Mettre à jour « Android System WebView » via le Play Store du stick avant les tests.
- Installation de l'APK : on active les options développeur et les sources inconnues, puis on transfère l'APK via l'app « Send Files to TV » ou via ADB en Wi-Fi. C'est détaillé dans la tranche 9.

### Hébergement : Render gratuit pour commencer

Décision : offre gratuite de Render pour le développement et les premières soirées. On passera à une offre payante si les limites gênent. Il n'y a rien à réécrire pour migrer : c'est un simple serveur Node.

Limites connues (doc Render) :

- Mise en veille après 15 min sans requête HTTP ni message WebSocket entrant, puis environ 1 min de réveil. Le premier lancement de la soirée attend donc ~1 min.
  - Parade : ouvrir la page TV quelques minutes avant l'arrivée des invités. Tant que le serveur ne répond pas, c'est le navigateur qui attend. Une fois la page chargée, elle affiche « Connexion au serveur… » tant que le socket n'est pas connecté (tranche 18). La page locale « Réveil du serveur… » de l'APK est en réserve avec lui.
  - Pendant une partie, les échanges Socket.IO (ping/pong toutes les 10 s) devraient empêcher la mise en veille. À vérifier en conditions réelles, salle d'attente ouverte 20 min (tranche 18, H3). Si le serveur s'endort, la TV interrogera `/sante` toutes les 5 min.
- Redémarrages possibles à tout moment, et fichiers locaux effacés : cohérent avec le choix « tout en mémoire, partie perdue si redémarrage ». `questions.json` est versionné dans le dépôt, donc il n'est pas concerné.
- 750 h gratuites par mois : suffisant pour un seul service.

### Réseau et navigateurs

- HTTPS obligatoire en production : l'API Wake Lock ne fonctionne qu'en HTTPS. En développement local (http sur le Wi-Fi), elle est simplement ignorée.
- Page joueur testée sur Chrome Android et Safari iOS récents.
- Socket.IO gère les reconnexions. L'identité du joueur repose sur son `id` mémorisé dans le `localStorage`, pas sur le socket.
- Une coupure réelle (4G perdue, écran verrouillé) est détectée par le serveur en 20 s au plus (`pingInterval` et `pingTimeout` de Socket.IO à 10 s). Le délai de 10 s ne démarre qu'après cette détection.
- La TV mémorise son code et son `jetonTv` dans le `sessionStorage` : un rechargement ou une coupure retrouve la salle, un nouvel onglet ou l'app relancée en crée une nouvelle.
- Tests à plusieurs onglets : avec le paramètre `?dev` dans l'URL de la page joueur, l'`id` est mémorisé dans le `sessionStorage` au lieu du `localStorage`. Chaque onglet devient ainsi un joueur distinct.

### Configuration

| Variable d'environnement | Rôle | Par défaut |
|---|---|---|
| `URL_PUBLIQUE` | Adresse de base encodée dans le QR code et affichée sous celui-ci | L'IP locale du PC sur le Wi-Fi (par exemple `http://192.168.1.20:3000`), pour que les téléphones puissent l'ouvrir |
| `MODE_DEV` | `1` autorise une partie à 1 joueur dans tous les modes (lancer, rejouer, choisir le mode) | Désactivé |

Dépendance validée pour le QR code : `qrcode`.

## Tranches de développement

Chaque tranche se termine par un test concret. Les numéros des tranches ne changent jamais, même quand l'ordre change.

- **Terminées**, dans l'ordre de réalisation : 1, 2, 3, 4, 5, **8**, 6, 7, **11, 12, 13** (modes de jeu), **16** (sons), **14** (mode de jeu), **17** (médailles et aventure), **15** (mode de jeu).
- **À venir**, après l'audit (`AUDIT.md`) : **18 → 19 → 10 → 20 → 21 → 22 → 23**. Les identifiants entre parenthèses (R1, TV2…) renvoient à l'audit.
- **En réserve** : la tranche 9 (APK).

Le PC de développement est sur un réseau d'entreprise : les téléphones ne peuvent pas joindre un serveur local. Le déploiement sur Render (tranche 8) est donc passé avant la tranche 6, et les tests sur vrais téléphones se font toujours sur le serveur en ligne. Pendant le développement, la TV est un onglet de navigateur du PC en 1920×1080 ; en soirée, c'est le navigateur du stick.

### MVP (tranches 1 à 8)

- **1. Squelette.** ✅ Terminée. Serveur Node + Express + Socket.IO, pages `/tv` et `/joueur` vides, route `/sante`.
  *Test : un message tapé dans l'onglet joueur s'affiche dans l'onglet TV.*
- **2. Salle d'attente.** ✅ Terminée. Création de salle (code de 4 lettres + QR code), rejoindre avec un pseudo, liste des joueurs en direct, hôte = premier arrivé, erreurs (pseudo pris, salle pleine, salle introuvable).
  *Test : 3 onglets joueurs (avec `?dev`) apparaissent sur la TV, et un 2e « Paul » (ou « paul ») est refusé.*
- **3. Boucle de quiz minimale.** ✅ Terminée. L'hôte lance, 3 questions écrites en dur, les joueurs répondent, révélation, « Suivant » manuel, fin. Mode développeur à 1 joueur (`MODE_DEV=1`).
  *Test : partie complète seul, en 2 onglets.*
- **4. Règles complètes.** ✅ Terminée. Chrono 20 s côté serveur, fin anticipée, points dégressifs, enchaînement automatique après 8 s, classement avec ex æquo, podium, « Rejouer ».
  *Test : les scores correspondent à la formule, et une égalité donne le même rang.*
- **5. Banque de questions.** ✅ Terminée. `questions.json` d'environ 200 questions (générées avec Claude, relues par Paul), tirage sans répétition dans la salle, mélange de l'ordre des réponses (avec test automatique du recalcul de `bonneReponse`), script qui vérifie le format du fichier.
  *Test : 3 parties d'affilée sans aucune question répétée.*
- **8. Déploiement Render** (réalisée juste après la tranche 5) ✅ Terminée. Dépôt GitHub, service gratuit, HTTPS, vérification de la mise en veille pendant une salle d'attente longue. La vérification de la mise en veille reste à faire : elle passe à la tranche 18 (H3).
  *Test : jouer avec un téléphone en 4G.*
- **6. Robustesse.** ✅ Terminée. Reconnexion des joueurs, transfert de l'hôte après 10 s, arrivée en cours de partie, reconnexion de la TV, fermeture des salles après 30 min.
  - Boutons de test sur la page joueur, visibles seulement avec `?dev` : « Couper la connexion 5 s » et « Couper 15 s ». Ils coupent le socket puis le rétablissent après ce délai, ce qui simule une coupure sans avoir à verrouiller un téléphone. 5 s reste sous le seuil de 10 s (l'hôte et le joueur en salle d'attente sont conservés), 15 s le dépasse.
  - Tests automatiques de scénarios avec le temps simulé (`mock.timers` de `node:test`), sans attendre les vrais délais : reconnexion d'un joueur avec conservation du pseudo et du score, retrait d'un joueur déconnecté en salle d'attente après 10 s, transfert de l'hôte après 10 s (et pas avant), pas de transfert si aucun autre joueur n'est connecté, fermeture d'une salle après 30 min sans connexion.
  *Test : sur Render, avec de vrais téléphones en 4G et des onglets `?dev` sur le PC : couper un joueur 5 s puis 15 s, couper l'hôte plus de 10 s, recharger la TV.*
- **7. Habillage.** ✅ Terminée. Design TV lisible à 3 mètres, boutons couleur + forme, écrans d'attente et de résultat, Wake Lock.
  - Mise à l'échelle de la page TV : elle reste conçue en 1920×1080, mais elle est réduite ou agrandie en bloc pour tenir entière dans la fenêtre, centrée et sans déformation. Cela évite de zoomer quand le navigateur offre moins de place (écran de PC avec mise à l'échelle Windows à 125 %, WebView du stick qui voit souvent 960×540). Le facteur est calculé en JavaScript (`ajusterEchelle()`), au chargement et à chaque redimensionnement, car le calcul en CSS pur demande des fonctions trop récentes pour la WebView d'Android TV 11.
  - Arrêt de la partie par l'hôte : un bouton « Terminer la partie » sur le téléphone de l'hôte, pendant une question ou une révélation, avec une confirmation pour éviter un appui accidentel. Le téléphone envoie `hote:terminer`, le serveur vérifie que l'émetteur est bien l'hôte et passe directement au podium avec les scores actuels. Une manche en cours n'est pas comptée. « Rejouer » reste disponible ensuite.
  *Test : partie à 4 sur la vraie TV, via l'ordinateur branché. La page TV s'affiche en entier sans zoom du navigateur, quelle que soit la taille de la fenêtre. L'hôte termine une partie à la 4e question : la TV affiche le podium, un autre joueur ne peut pas terminer.*

### Étape « Modes de jeu » (tranches 11 à 15)

Cinq modes ajoutés un par un, dans l'ordre ci-dessous (résumés dans « Modes de jeu supplémentaires »). Chaque mode est testé dans le navigateur via Render : TV dans un onglet du PC, joueurs sur de vrais téléphones et sur des onglets `?dev`.

Règles de l'étape :

- **Une mini-spec par mode**, dans `docs/modes/<mode>.md`, écrite et validée avant de coder le mode. Elle précise au moins : les règles et le calcul des points, les phases de jeu et les chronos, les événements et leur contenu, ce que voient la TV et chaque téléphone (et ce qu'ils ne doivent jamais recevoir), le contenu à préparer (fichier de données et script de vérification), les cas limites (déconnexion, arrivée en cours de partie, joueurs sous le minimum en cours de partie, arrêt par l'hôte) et les tests automatiques.
- **Contraintes du Mi TV Stick** (voir « Contraintes techniques ») : animations CSS simples (opacité, déplacement), pas de flou (`filter: blur`, `backdrop-filter`), pas d'images lourdes.
- Les règles d'architecture restent valables : serveur autoritaire, temps mesuré par le serveur, aucune information secrète envoyée avant la révélation, actions `hote:*` vérifiées côté serveur, ce qui est propre à un mode reste dans `etatMode` et `server/modes/<mode>.js`.
- Le quiz reste disponible et continue de marcher à chaque tranche.

Tranches :

- **11. Choix du mode + Estimation.** ✅ Terminée. L'hôte choisit le mode depuis son téléphone, en salle d'attente et à la fin d'une partie. Un mode est grisé tant qu'il n'y a pas assez de joueurs connectés. La TV affiche le mode choisi. Puis le mode Estimation (3 à 10 joueurs).
  *Test : défini dans `docs/modes/estimation.md`.*
- **12. Qui de nous ?** (4 à 10 joueurs) ✅ Terminée.
  *Test : défini dans `docs/modes/qui-de-nous.md`.*
- **13. Undercover** (4 à 10 joueurs) ✅ Terminée.
  *Test : défini dans `docs/modes/undercover.md`.*
- **14. Même réponse** (3 à 10 joueurs) ✅ Terminée.
  *Test : défini dans `docs/modes/meme-reponse.md`.*
- **15. Le bluff** (4 à 10 joueurs) ✅ Terminée.
  *Test : défini dans `docs/modes/bluff.md`.*

### Tranche « Sons » (réalisée après la tranche 13)

- **16. Sons.** ✅ Terminée. Sons synthétisés par le navigateur (Web Audio API, aucun fichier audio) et joués par la TV seulement, musique de fond en salle d'attente, planche de sons `/tv?sons`.
  *Test : défini dans `docs/sons.md`.*

### Tranche « Médailles et aventure » (réalisée après la tranche 14)

- **17. Médailles, points globaux et format « Aventure ».** ✅ Terminée. Choix du format en salle d'attente, médailles de fin de partie (fonction pure `attribuerMedailles` dans `server/medailles.js`, avec tests), points globaux, états `tableau` et `grandGagnant`, passage automatique du podium au tableau après 15 s. Règles dans « Format et médailles ».
  *Test : en local avec 3 onglets `?dev`, une aventure à 3 points jusqu'au grand gagnant, en vérifiant médailles et totaux à chaque tableau ; une égalité en tête (plus simple en Même réponse) donne des médailles partagées ; un joueur coupé pendant le tableau revient avec ses points globaux ; en petite partie, « Rejouer » garde les points globaux et « Changer de format » ramène à la salle d'attente.*

### Priorités après l'audit (tranches 18 à 23)

Ordre : **18 → 19 → 10 → 20 → 21 → 22 → 23**. Les tranches 18 et 19 préparent la soirée test (10). Ses retours peuvent réordonner la suite.

- **18. Fiabilité avant soirée.** Qu'aucun incident technique connu ne puisse gâcher la soirée test, et qu'on puisse comprendre après coup ce qui s'est passé.
  - Plantage du serveur sur un message `null` (R1, T1) : aucune donnée reçue ne fait tomber le process, et une erreur imprévue dans une action est journalisée sans arrêter le serveur.
  - Joueur fantôme (R3, TEL2) : un socket déjà joueur de la salle ne crée pas de 2e joueur, et « Entrer » reste désactivé jusqu'à la réponse du serveur.
  - Double « Suivant » (R2) : un « Suivant » qui ne correspond plus à l'étape affichée est ignoré.
  - Undercover bloqué à 2 participants (R9) : la manche se termine.
  - Tests automatiques TE1 à TE4 et TE7.
  - Journal des événements et des erreurs (H1) : une ligne courte par événement important (salle créée, arrivée, départ, hôte, partie lancée, podium, salle fermée) et chaque erreur complète.
  - `/sante` enrichi (H6) : nombre de salles, nombre de joueurs connectés, heure de démarrage du serveur.
  - Écran et bandeau « Connexion au serveur… » sur la TV (R6, H2) : ils remplacent la page de réveil que devait fournir l'APK.
  - Message clair sur le téléphone après un redémarrage du serveur (R7, H7) : champ code vidé, « Cette partie n'existe plus. Scanne le nouveau QR code sur la TV ».
  - Écran de la TV toujours allumé sans APK : Wake Lock sur la page TV si le navigateur le supporte, et consigne de réglage du stick (voir « Contraintes techniques »).
  - Vérification de la mise en veille de Render sur un lobby de 20 min (H3).
  - Règles dans `CLAUDE.md` : pas de push sur `main` pendant une soirée (H4), `URL_PUBLIQUE` obligatoire sur Render (H5).

  *Test : `npm test` passe avec les nouveaux tests. Sur Render, TV dans le navigateur du stick : (1) depuis la console d'un onglet joueur, `socket.emit('joueur:rejoindre', null)` → les autres joueurs continuent de jouer et l'heure de démarrage de `/sante` n'a pas changé ; (2) double appui très rapide sur « Suivant » à la 10e révélation → le podium reste affiché 15 s ; en Undercover, double appui à l'élimination → le tour de description s'affiche ; (3) double appui sur « Entrer » puis changement de pseudo → la TV ne montre qu'un seul joueur, et la manche suivante se termine dès que tout le monde a répondu ; (4) lobby ouvert 20 min sans action → l'écran de la TV est resté allumé et la partie se lance sans attendre le réveil du serveur ; (5) redéploiement manuel pendant une partie → la TV affiche « Connexion au serveur… » puis une nouvelle salle, les téléphones affichent le message de redémarrage avec un champ code vide, et les logs Render montrent l'enchaînement complet (arrivées, partie, redémarrage).*

- **19. Lisibilité TV et accessibilité.** Chaque texte de la TV se lit depuis le canapé, y compris par un joueur daltonien.
  - Aucun texte de la TV sous 40 px (TV1) : pour tenir 10 joueurs, on réduit le contenu plutôt que la taille (2 colonnes, pseudos tronqués, classement limité avec « et N autres »).
  - Pastilles seules du bluff remplacées par des pastilles avec l'initiale du pseudo, de 40 px au moins (TV2).
  - Joueur déconnecté lisible : moins transparent, avec un signe qui ne dépend pas de la seule transparence (TV3, A4).
  - Couleurs de joueurs 8 et 10 remplacées, initiale dans toute pastille qui n'a pas le pseudo à côté (TV4, A2).
  - Textes neutres au lieu du masculin (TV6).
  - « En attente que l'hôte lance » clignote sans devenir illisible (TV7).

  *Test : TV à 3 m, 10 onglets `?dev` : une partie de bluff et une de Même réponse ; chaque texte est lisible depuis le canapé, y compris les piégés, les joueurs déconnectés et les textes d'Undercover. Dans Chrome DevTools, « Emulate vision deficiencies : deuteranopia » : les 10 joueurs restent distinguables grâce aux initiales. Vérification automatique : aucune règle `font-size` sous 40 px dans `tv.css`, hors planche de sons.*

- **10. Soirée test.** Une vraie soirée avec des amis, en notant les bugs et les frictions. Ces retours décideront si on migre vers une offre payante, si l'on sort l'APK de la réserve, et quels modes améliorer en priorité. La soirée se joue **dans le navigateur du stick, sans APK**.

  *Test : la soirée se déroule sans intervention technique, et on note en plus : la netteté du texte à 3 m (P4) ; l'affichage des émojis de médaille 🥇🥈🥉🏆 (P6) ; l'absence de saccades après 30 min de lobby avec musique (P2) ; si l'écran de la TV s'éteint ou non ; si la touche Retour de la télécommande quitte la page par erreur ; si la touche OK débloque bien le son (bandeau « Cliquez pour activer le son »).*

- **20. Jouabilité.** Le téléphone répond tout de suite, aucun joueur ne perd ses points par accident, et les parties de quiz sont plus régulières.
  - Retours sur le téléphone : bouton marqué dès l'appui (TEL1), « Pas de réponse » au lieu de « Raté » (TEL3), champ d'Estimation vidé à chaque nouvelle question (TEL4), vibration à l'appui et au résultat sur Android (AMB8).
  - Points globaux gardés en salle d'attente (R4) : voir la règle dans « Cas limites ».
  - Tirage équilibré des 10 questions du quiz (F1) : environ 4 faciles, 4 moyennes et 2 difficiles, au plus 2 par catégorie, fonction pure testée.
  - Corrections de contenu (C1) : difficultés de q0160, q0118, q0136 et q0196, formulations de q0054 et q0170.
  - Alerte « paires voisines » dans `scripts/verifier-questions.js` (C3).

  *Test : en 4G, un appui sur une réponse marque le bouton immédiatement (et vibre sur Android). Une question sans réponse affiche « Pas de réponse ». Une Estimation terminée à la 1re question puis relancée montre un champ vide. Après une aventure, « Changer de format », puis verrouillage d'un téléphone 1 min : au déverrouillage, le joueur est toujours là avec ses points globaux. Test automatique : sur 1 000 tirages, jamais plus de 2 questions de la même catégorie ni plus de 2 difficiles. `node scripts/verifier-questions.js` signale les paires voisines connues (par exemple q0081 / q0084, La Joconde).*

- **21. Mise en scène.** Donner à la TV le rythme d'un jeu télévisé et des moments forts à chaque partie.
  - Écran de transition avec la catégorie avant chaque question, compté dans l'échéance du serveur (AMB1).
  - Podium échelonné : 3e, puis 2e, puis 1er (AMB2).
  - Compteur de score animé au classement, avec flèches de changement de rang (AMB3).
  - Réponse la plus rapide mise en avant à chaque révélation (MEC7).
  - Statistiques de fin de partie : le plus rapide, la meilleure série, la question la plus ratée… (F4).

  *Test : partie de quiz à 4 sur la vraie TV (navigateur du stick) : chaque question est précédée de sa catégorie ; le podium révèle le 3e, le 2e puis le 1er ; les scores montent au classement ; chaque révélation affiche la réponse la plus rapide (« ⚡ Léa en 1,8 s ») ; l'écran de fin montre au moins 3 « prix » justes, vérifiés à la main sur la partie jouée ; aucune saccade visible sur le stick.*

- **22. Contenu et choix des questions.** Plus de questions, plus variées, choisies selon le groupe, et une reconnexion impossible à usurper.
  - Environ 100 questions récentes et de culture populaire, relues à la main, plus une catégorie `maths-logique` (C2).
  - Choix du thème et de la difficulté par l'hôte en salle d'attente, comme le format (F2).
  - Clé secrète de reconnexion, remise au seul téléphone, distincte de l'`id` public (T2).

  *Test : `node scripts/verifier-questions.js` passe. 3 parties d'affilée sans répétition, où les nouvelles questions apparaissent (journal des tirages). En salle d'attente, l'hôte choisit « Cinéma, facile » : 10 questions de cinéma, aucune de difficulté 3. En Qui de nous ?, un onglet qui envoie `joueur:rejoindre` avec l'`id` d'un autre joueur (lu dans la console) est refusé, et ce joueur garde sa place. Test automatique : une reconnexion sans la bonne clé est refusée.*

- **23. Nettoyage puis mode « La réplique ».** Alléger la dette de lisibilité avant d'ajouter un 7e mode, puis ajouter un mode de rire qui recycle le bluff. Deux commits distincts.
  - Temps 1 : dette de lisibilité (L1 à L5, L7), sans aucun changement visible, avec tous les tests au vert.
  - Temps 2 : mode La réplique (M3), avec sa mini-spec `docs/modes/replique.md` écrite et validée avant le code (règles de l'étape « Modes de jeu »).

  *Test : temps 1 : `npm test` passe sans qu'aucun test existant n'ait été modifié pour passer, et une partie de chaque mode sur Render se déroule comme avant. Temps 2 : défini dans la mini-spec, au minimum : partie à 4 sur Render, répliques anonymes jusqu'à la révélation, impossible de voter pour sa propre réplique, points égaux au nombre de votes reçus multiplié par le barème.*

### En réserve

Le navigateur du stick suffit pour jouer : l'APK n'est plus urgente. On la reprendra si la soirée test révèle un problème (écran qui s'éteint, touche Retour qui quitte la page, son bloqué, texte flou…).

- **9. APK Android TV.** Coquille WebView avec page « Réveil du serveur… », touches Retour/OK, lecture du son sans geste dans la WebView (`mediaPlaybackRequiresUserGesture = false`, voir `docs/sons.md`), installation sur le stick pas à pas.
  - Boîte « Quitter ? » déclenchée par la touche Retour.
  - Salles orphelines d'un même socket TV (R5), à corriger avant la touche OK = recréer une salle, qui les déclencherait à chaque appui, avec son test (TE5).
  *Test : lancer l'app depuis l'accueil du stick et jouer une partie, avec le son.*

## Plus tard

Sans numéro de tranche pour l'instant. Les identifiants renvoient à `AUDIT.md`.

- **Nouveaux modes**, dans l'ordre : M7 (Vrai ou faux éclair), M1 (Le sondage), M2 (Dans l'ordre), M4 (Deux vérités, un mensonge), M5 (Le mot interdit), M6 (Dessine !).
- **Évolutions des modes existants** : EV1 (Le bluff), EV2 (Undercover), EV3 (Qui de nous ?).
- **Mécaniques** : MEC1 à MEC6 (séries, jokers, manches à thème, question finale à pari, rattrapage, équipes).
- **Finitions** : T5, T6, T7, T8, T9, R8, R10, R11, TEL6, TEL8, TEL9, TV9, P3, A6, L6, AMB4 à AMB7, F3, F5, F6.
- **Tests** : TE6, TE8 (longueur des questions), TE9.
- **Écartés pour l'instant** : F7 (spectateurs), F8 (multi-langue), F9 (questions avec image).

## Questions ouvertes

- Nom définitif du jeu, affiché sur la TV et dans l'accueil du stick
- URL courte à afficher sous le QR code : l'adresse onrender.com par défaut ou un nom de domaine à toi ?
