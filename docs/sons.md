# Tranche 16 — Sons

Mini-spec de la tranche 16, ajoutée à la demande de Paul et réalisée juste après la tranche 13, avant la tranche 14. Elle complète `docs/spec.md`. Elle a été validée le 24/09/2026.

La tranche se code en deux temps, chacun testé avant de passer au suivant :

1. **Moteur et planche** : `public/tv/sons.js` (les 9 sons, la musique, le déblocage) et la planche `/tv?sons`. Paul écoute chaque son et le fait ajuster avant qu'il ne soit branché.
2. **Branchement** : les sons joués aux bonnes étapes, dans tous les modes.

## Choix de départ (validés)

- Les sons sont joués **par la TV seulement**. Les téléphones restent silencieux.
- Les sons sont **synthétisés par le navigateur** (Web Audio API) : aucun fichier audio, aucune dépendance, aucun droit à vérifier, très léger pour le Mi TV Stick.
- Une **musique de fond en salle d'attente**, synthétisée elle aussi.
- **Pas de réglage du son dans le jeu** : on règle ou coupe le son avec le volume de la TV.
- Le son est de l'affichage : **rien ne change côté serveur**, aucun nouvel événement, aucun nouveau champ.

## Principe

Le son est de l'affichage, comme une animation. La TV joue un son quand l'état qu'elle reçoit change (nouvelle étape, nouveau joueur, nouvelle réponse…), en comparant avec l'état précédent, comme elle le fait déjà avec `etapeAffichee` et `nouvelleEtape` pour ne pas rejouer ses animations.

Règles communes :

- **Premier état après le chargement de la page** : aucun son. Un rechargement de la TV en pleine partie ne rejoue donc rien pour l'état retrouvé. Seules la musique (si l'on est en salle d'attente) et le tic-tac (si un chrono affiché est dans ses 5 dernières secondes) reprennent, car ils suivent l'affichage en continu.
- **Reconnexion du socket** sans rechargement : l'état renvoyé est le même, donc aucun son.
- **Un seul son d'étape à la fois** : quand une étape en appelle deux (lancement de la partie et première question), seul le plus important joue (voir « Quand jouer quoi »).
- Le temps reste mesuré par le serveur : le tic-tac suit le chrono affiché par `lancerChrono`, qui vient de `tempsRestantMs`.

## Catalogue des sons

Neuf sons courts, communs à tous les modes.

| Son | Caractère | Durée |
|---|---|---|
| `arrivee` | « Pop » joyeux | 0,2 s |
| `lancement` | Petit jingle montant (4 notes) | 1 s |
| `etape` | « Ding » léger | 0,4 s |
| `reponse` | « Tic » très discret, nettement moins fort que les autres | 0,1 s |
| `tictac` | Tic-tac sec. Le dernier (à 1 s) est plus aigu | 0,1 s |
| `revelation` | Accord de « tadam » | 0,8 s |
| `victoire` | Arpège montant | 1 s |
| `rate` | « Wah-wah » descendant | 1 s |
| `podium` | Fanfare | 2 à 3 s |

Pas de son de « bonne » ou « mauvaise réponse » par joueur : la TV est commune, et le détail est déjà sur chaque téléphone.

## Quand jouer quoi

### Sons communs (`public/tv/tv.js`)

| Moment | Détection | Son |
|---|---|---|
| Un joueur apparaît en salle d'attente | Un `id` absent de l'état précédent. Un joueur qui se reconnecte (même `id`) ne fait pas de bruit | `arrivee` |
| La partie démarre | `salle.etat` passe de `lobby` ou `podium` à `partie`. Remplace le son de la première étape | `lancement` |
| Les 5 dernières secondes d'un chrono affiché | La seconde affichée par `lancerChrono` change et vaut 5, 4, 3, 2 ou 1. Jamais deux fois la même seconde, même si `lancerChrono` est relancé par un nouvel état (une réponse arrive) | `tictac` |
| Le podium s'affiche | `salle.etat` passe à `podium` (fin normale ou « Terminer la partie ») | `podium` |

### Sons propres à chaque mode (`public/tv/modes/<mode>.js`)

Chaque mode joue ses sons dans ses fonctions d'affichage, sur `nouvelleEtape` ou en comparant une liste avec l'état précédent.

| Mode | Moment | Son |
|---|---|---|
| Quiz | Nouvelle question | `etape` |
| | Un joueur répond (`ontRepondu` s'allonge) | `reponse` |
| | Révélation | `revelation` |
| Estimation | Nouvelle question | `etape` |
| | Un joueur répond (`ontRepondu` s'allonge) | `reponse` |
| | Révélation | `revelation` |
| Qui de nous ? | Nouveau vote | `etape` |
| | Un joueur vote (`ontVote` s'allonge) | `reponse` |
| | Résultats | `revelation` |
| Undercover | Tour de parole (`description`) | `etape` |
| | Vote, départage compris | `etape` |
| | Un joueur vote (`ontVote` s'allonge) | `reponse` |
| | Élimination avec un éliminé | `revelation` |
| | Élimination sans éliminé (égalité, aucun vote) | Aucun : le vote de départage ou le tour suivant joue `etape` |
| | Mister White cherche le mot (`devinette`) | `etape` |
| | Résultat de la devinette (`devinette.resultatConnu` passe à vrai, dans la même étape) | `victoire` s'il a trouvé, `rate` sinon (proposition fausse ou pas de proposition) |
| | Fin de manche, quel que soit le camp gagnant | `victoire` |
| Même réponse | Nouvelle question | `etape` |
| | Un joueur répond (`ontRepondu` s'allonge) | `reponse` |
| | Résultats | `revelation`, ou `victoire` en cas d'unanimité |

Le son d'une étape ne joue qu'à son arrivée, jamais à chaque état reçu pendant l'étape.

## Musique de salle d'attente

- **Style** : boucle « jeu vidéo rétro » (chiptune) douce et entraînante, une basse et une petite mélodie, environ 100 battements par minute. La boucle dure une quinzaine de secondes, pour ne pas lasser pendant une salle d'attente de quelques minutes.
- **Volume** : bas, environ le tiers du volume des sons, pour qu'on puisse parler par-dessus et que le « pop » des arrivées reste audible.
- **Quand** : elle joue tant que la TV affiche la salle d'attente (`salle.etat` vaut `lobby`), y compris après un rechargement.
- **Arrêt** : fondu d'une demi-seconde au lancement de la partie, puis le jingle `lancement` joue. Elle ne joue ni pendant la partie ni au podium (la fanfare prend le relais, et une salle ne revient jamais en salle d'attente après une partie).

## Déblocage du son

Les navigateurs refusent de jouer un son tant que l'utilisateur n'a pas interagi avec la page.

- **Navigateur du PC (jusqu'à la tranche 9)** : tant que le son est bloqué, la TV affiche un petit bandeau discret « Cliquez pour activer le son » en bas de l'écran, sans masquer le QR code ni le code de la salle. Un clic n'importe où sur la page ou une touche du clavier débloque le son et fait disparaître le bandeau. Si le navigateur autorise le son d'emblée, le bandeau n'apparaît jamais.
- **APK (tranche 9)** : la coquille Kotlin autorise la WebView à jouer du son sans geste (`mediaPlaybackRequiresUserGesture = false`). Si le son reste bloqué malgré tout, le bandeau s'affiche et la touche OK de la télécommande le débloque (elle arrive à la page comme une touche du clavier).
- Les sons demandés pendant que le son est bloqué sont simplement perdus, sauf la musique, qui démarre au déblocage si l'on est encore en salle d'attente.

## Planche de sons

Avec `/tv?sons`, la TV affiche en plus une rangée de boutons en bas de l'écran : un par son (avec son nom) et un bouton « Musique » qui lance ou arrête la boucle. Paul peut ainsi écouter et juger chaque son sans jouer une partie. La page TV fonctionne normalement par ailleurs (elle crée sa salle comme d'habitude).

Sans `?sons`, rien ne change. La planche reste dans le code après la tranche, comme les boutons `?dev` de la page joueur, pour les réglages futurs.

## Contraintes du Mi TV Stick

- Sons courts (moins de 3 s, sauf la musique), quelques oscillateurs à la fois au plus, sans effet coûteux (pas de réverbération).
- Un seul contexte audio (`AudioContext`) pour toute la page, créé une fois.
- Les notes de la musique sont programmées sur l'horloge audio, par petits paquets à l'avance, pour ne pas hoqueter quand la page est occupée.
- Si le navigateur ne connaît pas Web Audio, le jeu marche normalement, sans son et sans bandeau.

## Code

| Fichier | Rôle |
|---|---|
| `public/tv/sons.js` | Le moteur : contexte audio, déblocage et bandeau, les 9 sons, la musique, la planche `?sons`. Expose `jouerSon(nom)`, `lancerMusique()`, `arreterMusique()` |
| `public/tv/tv.js` | Les sons communs : arrivée d'un joueur, lancement, tic-tac du chrono, podium, musique de la salle d'attente, et la règle « aucun son au premier état » |
| `public/tv/modes/<mode>.js` | Les sons propres au mode (tableau ci-dessus) |
| `public/tv/index.html` | Charge `sons.js`, contient le bandeau |
| `public/tv/tv.css` | Style du bandeau et de la planche |

Aucun fichier du serveur ni de la page joueur ne change.

## Modifications à reporter

- `docs/spec.md`, « Hors périmètre » : « Le son et la musique (chrono, jingles) » devient « Les sons sur les téléphones, et la musique en dehors de la salle d'attente ».
- `docs/spec.md`, « Tranches de développement » : « 15 tranches » devient « 16 tranches », ajout de la tranche 16 (renvoi vers `docs/sons.md`), et ordre de réalisation 1, 2, 3, 4, 5, 8, 6, 7, 11, 12, 13, **16**, 14, 15, 9, 10.
- `docs/spec.md`, tranche 9 : autoriser la lecture du son sans geste dans la WebView, et vérifier le son sur le stick.
- `CLAUDE.md`, structure : `public/tv/sons.js`, et `docs/sons.md`.

## Tests

Pas de test automatique : le son dépend du navigateur (Web Audio), et aucune logique de jeu ne change. `npm test` doit rester vert.

## Test de la tranche (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080 avec le son du PC allumé, joueurs sur des téléphones et des onglets `?dev`.

**Temps 1 (moteur et planche)**

1. **Planche.** Ouvrir `/tv?sons`, cliquer pour activer le son, écouter chaque son et la musique. Noter ceux à ajuster.
2. **Sans planche.** Ouvrir `/tv` : aucun bouton de son, la page est inchangée à part le bandeau.

**Temps 2 (branchement)**

1. **Déblocage.** Ouvrir `/tv` dans un nouvel onglet : le bandeau « Cliquez pour activer le son » est visible (sauf si le navigateur autorise déjà le son). Un clic : la musique démarre, le bandeau disparaît.
2. **Salle d'attente.** Chaque joueur qui rejoint fait un « pop ». Couper un joueur 5 s (`?dev`) : pas de « pop » à son retour. Au lancement, la musique s'arrête en fondu et le jingle joue, sans « ding » par-dessus.
3. **Partie de quiz.** « Ding » à chaque question, « tic » à chaque réponse, tic-tac sur les 5 dernières secondes (même si des réponses arrivent pendant ce temps), « tadam » à la révélation, fanfare au podium.
4. **Estimation et Qui de nous ?** Mêmes sons que le quiz, à leurs étapes.
5. **Undercover.** « Ding » au tour de parole et au vote, « tadam » à une élimination, rien sur une égalité avant le « ding » du départage. Mister White éliminé : « ding », puis arpège s'il trouve ou « wah-wah » s'il rate. Arpège à la fin de manche.
6. **Rechargement.** Recharger la TV en pleine partie (hors 5 dernières secondes) : aucun son, le jeu reprend. Recharger en salle d'attente : la musique reprend (après un clic si le bandeau revient).
7. **Terminer la partie.** L'hôte termine en cours de partie : fanfare du podium.
8. **Téléphones.** Aucun téléphone ne fait de bruit.
