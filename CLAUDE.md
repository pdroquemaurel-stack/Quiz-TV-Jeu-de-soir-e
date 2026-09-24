# Quiz TV

Jeu de soirée entre amis : la TV (app Android TV = simple WebView) héberge une salle de jeu, les joueurs la rejoignent en scannant un QR code et jouent depuis une page web sur leur téléphone.

**La spec complète du MVP est dans `docs/spec.md`. Lis la section concernée avant de commencer chaque tranche.**

## Stack

- Serveur : Node.js + Express + Socket.IO (ES modules, `"type": "module"`)
- Pages TV et joueur : HTML/CSS/JS vanilla, sans framework, sans build
- App TV : coquille Kotlin minimale (WebView plein écran), dans `android-tv/`
- Hébergement : Render (offre gratuite)
- Aucune base de données : toutes les salles vivent en mémoire

## Structure

```
server/
  index.js          # Express + Socket.IO, routes /tv, /joueur, /sante
  salles.js         # création, recherche, fermeture des salles, joueurs, hôte
  modes/index.js    # registre des modes : salles.js et index.js ne passent que par lui
  modes/commun.js   # tirage, classement, joueurs attendus : partagés entre modes
  modes/quiz.js     # tout ce qui est propre au mode quiz (etatMode)
public/
  tv/               # page TV (1920x1080), tv/modes/<mode>.js pour les écrans d'un mode
  joueur/           # page téléphone (portrait), joueur/modes/<mode>.js idem
  commun/           # CSS et JS partagés
data/questions.json
scripts/verifier-questions.js
android-tv/
docs/spec.md
docs/modes/        # une mini-spec par mode de jeu
```

## Commandes

- `npm install`
- `npm run dev` : lance le serveur en rechargement auto (`node --watch`)
- `npm test` : tests avec `node:test`
- `node scripts/verifier-questions.js` : vérifie le format de `questions.json`

## Règles d'architecture (non négociables)

- **Serveur autoritaire** : les clients envoient des actions, le serveur diffuse l'état complet. Aucune logique de jeu côté client.
- Le temps est **toujours mesuré par le serveur**, jamais par l'horloge du téléphone.
- Un téléphone ne reçoit **jamais** la bonne réponse avant la révélation.
- Chaque action `hote:*` vérifie côté serveur que l'émetteur est bien l'hôte.
- L'identité d'un joueur repose sur son `id` mémorisé dans le `localStorage`, pas sur le socket.
- Ce qui est propre au quiz reste dans `etatMode` et `server/modes/quiz.js`, pour pouvoir ajouter d'autres modes sans toucher au reste.
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
- Jusqu'à la tranche 9, la TV est un onglet de navigateur en 1920x1080.
- Quand le code d'une tranche est prêt, lance les tests automatiques.
- Donne-moi ensuite des instructions pas à pas pour faire moi-même le test de la spec : quoi lancer, quelles URL ouvrir, quoi faire, et ce que je dois observer.
- Attends mon retour. Ne commite jamais sans m'avoir demandé explicitement « Je peux commiter ? ».
- Après chaque commit validé, demande-moi si tu peux pousser sur GitHub (git push).
- Ne t'écarte jamais d'un plan validé sans me demander.
