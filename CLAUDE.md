# Quiz TV

Jeu de soirée entre amis : la TV (page web ouverte dans le navigateur du Mi TV Stick) héberge une salle de jeu, les joueurs la rejoignent en scannant un QR code et jouent depuis une page web sur leur téléphone.

**La spec complète du MVP est dans `docs/spec.md`. Lis la section concernée avant de commencer chaque tranche.**

## Stack

- Serveur : Node.js + Express + Socket.IO (ES modules, `"type": "module"`)
- Pages TV et joueur : HTML/CSS/JS vanilla, sans framework, sans build
- TV : la page `/tv`, ouverte dans un navigateur installé sur le Mi TV Stick 4K. L'APK (coquille Kotlin, dossier `android-tv/`) est en réserve (tranche 9)
- Hébergement : Render (offre gratuite)
- Aucune base de données : toutes les salles vivent en mémoire

## Structure

```
server/
  index.js          # Express + Socket.IO, routes /tv, /joueur, /sante
  salles.js         # création, recherche, fermeture des salles, joueurs, hôte
  medailles.js      # médailles de fin de partie, points globaux, grand gagnant
  modes/index.js    # registre des modes : salles.js et index.js ne passent que par lui
  modes/commun.js   # tirage, classement, joueurs attendus : partagés entre modes
  modes/quiz.js     # tout ce qui est propre au mode quiz (etatMode)
  modes/estimation.js # mode Estimation (docs/modes/estimation.md)
  modes/qui-de-nous.js # mode Qui de nous ? (docs/modes/qui-de-nous.md)
  modes/undercover.js # mode Undercover (docs/modes/undercover.md)
  modes/meme-reponse.js # mode Même réponse (docs/modes/meme-reponse.md)
  modes/bluff.js    # mode Le bluff (docs/modes/bluff.md)
public/
  tv/               # page TV (1920x1080), tv/modes/<mode>.js pour les écrans d'un mode
  joueur/           # page téléphone (portrait), joueur/modes/<mode>.js idem
  tv/sons.js        # sons et musique synthétisés par la TV (docs/sons.md)
  commun/           # CSS et JS partagés
data/questions.json
data/estimation.json
data/qui-de-nous.json
data/undercover.json
data/meme-reponse.json
data/bluff.json
scripts/verifier-questions.js
scripts/verifier-estimation.js
scripts/verifier-qui-de-nous.js
scripts/verifier-undercover.js
scripts/verifier-meme-reponse.js
scripts/verifier-bluff.js
docs/spec.md
docs/modes/        # une mini-spec par mode de jeu
docs/sons.md       # mini-spec des sons (tranche 16)
```

## Commandes

- `npm install`
- `npm run dev` : lance le serveur en rechargement auto (`node --watch`)
- `npm test` : tests avec `node:test`
- `node scripts/verifier-questions.js` : vérifie le format de `questions.json`
- `node scripts/verifier-estimation.js` : vérifie le format de `estimation.json`
- `node scripts/verifier-qui-de-nous.js` : vérifie le format de `qui-de-nous.json`
- `node scripts/verifier-undercover.js` : vérifie le format de `undercover.json`
- `node scripts/verifier-meme-reponse.js` : vérifie le format de `meme-reponse.json`
- `node scripts/verifier-bluff.js` : vérifie le format de `bluff.json`

## Règles d'architecture (non négociables)

- **Serveur autoritaire** : les clients envoient des actions, le serveur diffuse l'état complet. Aucune logique de jeu côté client.
- Le temps est **toujours mesuré par le serveur**, jamais par l'horloge du téléphone.
- Un téléphone ne reçoit **jamais** la bonne réponse avant la révélation.
- Chaque action `hote:*` vérifie côté serveur que l'émetteur est bien l'hôte.
- L'identité d'un joueur repose sur son `id` mémorisé dans le `localStorage`, pas sur le socket.
- Ce qui est propre au quiz reste dans `etatMode` et `server/modes/quiz.js`, pour pouvoir ajouter d'autres modes sans toucher au reste.
- Le code commun (`server/index.js`, `server/salles.js`) ne lit jamais `etatMode` : c'est la zone privée de chaque mode.
- Noms de champs et d'événements : exactement ceux de la spec (`salle:etat`, `joueur:repondre`, `etatMode`…).

## Style de code

- Simple et lisible avant tout, jamais optimisé au détriment de la clarté.
- Pas de TypeScript, pas de framework front, pas d'étape de build.
- Dépendances au strict minimum : **demande-moi avant d'en ajouter une**.
- Noms de variables et de fonctions en français, cohérents avec la spec.
- Commentaires en français, uniquement quand le code ne suffit pas.
- Fonctions courtes. Pas d'abstraction « pour plus tard ».

## Méthode de travail

- **Une tranche à la fois** (voir « Tranches de développement » dans la spec). Ne code rien qui appartient à une tranche suivante ou au hors-périmètre.
- Commence chaque tranche par un plan, que je valide avant tout code.
- La logique pure (calcul des points, classement avec ex æquo, tirage des questions) a des tests automatiques.
- Pendant le développement, la TV est un onglet de navigateur en 1920x1080 ; en soirée, c'est le navigateur du stick.
- Quand le code d'une tranche est prêt, lance les tests automatiques.
- Donne-moi ensuite des instructions pas à pas pour faire moi-même le test de la spec : quoi lancer, quelles URL ouvrir, quoi faire, et ce que je dois observer.
- Attends mon retour. Ne commite jamais sans m'avoir demandé explicitement « Je peux commiter ? ».
- Après chaque commit validé, demande-moi si tu peux pousser sur GitHub (git push).
- Ne t'écarte jamais d'un plan validé sans me demander.
