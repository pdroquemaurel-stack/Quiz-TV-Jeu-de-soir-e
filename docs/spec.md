# Quiz TV — Spec du MVP

## Objectif

Le MVP permet à 2 à 10 amis réunis dans une même pièce de jouer une partie complète de quiz de culture générale. La TV (Mi TV Stick 4K) affiche la partie, et chaque téléphone sert de manette via une simple page web, sans rien installer.

Le MVP est réussi si une soirée réelle se déroule sans intervention technique : ouvrir l'app TV, scanner le QR code, jouer 10 questions, voir le podium, puis rejouer. Il doit aussi supporter au moins une déconnexion de téléphone en cours de partie.

Le code et le modèle de données doivent permettre d'ajouter ensuite les modes « Fausses réponses », « L'imposteur » et « Qui de nous… ? » sans tout réécrire.

## Déroulé d'une partie

Une salle passe par 4 états, pilotés par le serveur. La TV et les téléphones ne font qu'afficher l'état reçu.

```mermaid
stateDiagram-v2
    [*] --> lobby: app TV ouverte
    lobby --> question: l'hôte lance (≥ 2 joueurs)
    question --> revelation: tous ont répondu ou 20 s
    revelation --> question: après 8 s ou « Suivant »
    revelation --> podium: après la 10e question
    question --> podium: l'hôte termine (tranche 7)
    revelation --> podium: l'hôte termine (tranche 7)
    podium --> question: l'hôte appuie sur « Rejouer » (≥ 2 joueurs)
    podium --> [*]: 30 min sans connexion
```

La fermeture après 30 min sans aucune connexion (ni TV ni joueur) peut arriver dans n'importe quel état, pas seulement au podium.

1. **Création de la salle.** À l'ouverture de l'app, la TV demande une salle au serveur. Elle affiche un grand QR code, le code de salle en 4 lettres et la liste des joueurs (vide).
2. **Arrivée des joueurs.** Chaque joueur scanne le QR code (ou tape le code), saisit un pseudo et apparaît sur la TV avec sa couleur. Le premier arrivé devient l'hôte (couronne sur la TV).
3. **Lancement.** L'hôte voit un bouton « Lancer la partie », actif dès 2 joueurs connectés.
4. **Question.** La TV affiche la question, les 4 réponses (couleur + forme), le chrono de 20 s et qui a déjà répondu. Les téléphones affichent 4 gros boutons. Un joueur répond une seule fois, sans changer d'avis.
5. **Révélation.** Dès que tous les joueurs attendus ont répondu (voir « Fin anticipée »), ou à la fin du chrono, la TV montre la bonne réponse, le nombre de réponses par choix, qui a eu juste, puis le classement. Chaque téléphone affiche « Bonne réponse, +740 » ou « Raté ».
6. **Enchaînement.** Passage automatique après 8 s. L'hôte peut accélérer avec « Suivant ».
7. **Fin.** Après 10 questions, la TV affiche le podium et les téléphones le rang de chacun.
8. **Rejouer.** L'hôte appuie sur « Rejouer », actif dès 2 joueurs connectés : mêmes joueurs, scores remis à zéro, nouvelles questions jamais vues dans cette salle.

## Fonctionnalités du MVP

### Salle
- Création automatique d'une salle à l'ouverture de l'app TV (code de 4 lettres, QR code vers la page joueur)
- 2 à 10 joueurs connectés, 1 joueur autorisé en mode développeur (`MODE_DEV=1`)
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
- Révélation, classement intermédiaire, podium final, « Rejouer »

### TV
- App Android TV (APK) : une WebView plein écran qui charge la page TV du serveur
- Écran jamais mis en veille, touche Retour = « Quitter ? », touche OK = recréer une salle
- Reconnexion automatique à sa salle après un rechargement ou une coupure réseau

### Contenu
- Fichier JSON d'environ 200 questions en français, texte uniquement, relues à la main

## Hors périmètre

Ces éléments sont volontairement repoussés. Le modèle de données ne doit pas les empêcher.

- Les modes « Fausses réponses », « L'imposteur » et « Qui de nous… ? »
- Le choix d'un thème ou d'une difficulté (les champs existent déjà dans les questions)
- Les questions avec image, son ou vidéo
- Le son et la musique (chrono, jingles)
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

### Modes futurs (hors MVP, intentions à préciser)

- **Fausses réponses** : chaque joueur invente une fausse réponse à une question peu connue, puis tous votent parmi les fausses réponses et la vraie. On marque des points en trouvant la vraie et en piégeant les autres.
- **L'imposteur** : tous reçoivent le même mot sauf un joueur. Chacun donne un indice, puis on vote pour démasquer l'imposteur.
- **Qui de nous… ?** : une question du type « Qui de nous est le plus susceptible de… ». Chacun vote pour un joueur, et on marque en votant comme la majorité.

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant une partie | Grisé sur la TV, garde son score et son pseudo (réservé), ne bloque pas la manche. Jamais supprimé pendant une partie. |
| Joueur déconnecté en salle d'attente | Retiré de la salle après 10 s de déconnexion. |
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

Toutes les salles vivent en mémoire sur le serveur, dans un objet `salles` indexé par code. Le champ `mode` et le bloc `etatMode` isolent ce qui est propre au quiz : un nouveau mode ajoute son propre `etatMode` sans toucher au reste.

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
  "couleur": "#FF8C1A",
  "score": 2740,
  "connecte": true,
  "socketId": "aXc91...",
  "arriveeA": 1758641000000
}
```

`id` est généré par le serveur et mémorisé dans le navigateur du téléphone : c'est lui qui permet la reconnexion. `socketId` change à chaque reconnexion. `arriveeA` sert à choisir le prochain hôte.

### Salle

```json
{
  "code": "KDZP",
  "mode": "quiz",
  "etat": "question",
  "hoteId": "j_8f3k2a",
  "tvSocketId": "Zp0e4...",
  "jetonTv": "t_91kd02mz4q...",
  "joueurs": ["...objets Joueur..."],
  "questionsVues": ["q0042", "q0107"],
  "derniereActiviteA": 1758641200000,
  "etatMode": {
    "questions": ["...10 questions tirées..."],
    "indexQuestion": 3,
    "debutQuestionA": 1758641190000,
    "reponses": { "j_8f3k2a": { "choix": 1, "recuA": 1758641195300 } }
  }
}
```

`etat` vaut `lobby`, `question`, `revelation` ou `podium`. Les timers (20 s, 8 s, 10 s pour l'hôte et pour le retrait d'un joueur en salle d'attente) sont gérés par le serveur.

`jetonTv` est un secret aléatoire généré à la création de la salle et envoyé uniquement à la TV. Il empêche un joueur de se faire passer pour la TV avec le seul code de salle, puis de lire les bonnes réponses et les `id` des joueurs.

### Événements Socket.IO

Règle simple : les clients envoient des actions, le serveur répond en diffusant l'état complet de la salle. Pas de synchronisation fine, et la reconnexion devient triviale.

| Événement | Sens | Contenu |
|---|---|---|
| `tv:creer` | TV → serveur | code et `jetonTv` de l'ancienne salle, facultatifs, pour s'y reconnecter. Sans jeton valide, une nouvelle salle est créée. |
| `joueur:rejoindre` | téléphone → serveur | code, pseudo, id mémorisé éventuel |
| `hote:lancer` | téléphone de l'hôte → serveur | rien |
| `joueur:repondre` | téléphone → serveur | index du choix |
| `hote:suivant` | téléphone de l'hôte → serveur | rien |
| `hote:rejouer` | téléphone de l'hôte → serveur | rien |
| `hote:terminer` | téléphone de l'hôte → serveur | rien (tranche 7 : arrête la partie et passe au podium) |
| `salle:etat` | serveur → TV | état complet de la salle, avec le texte des questions et le `jetonTv`. `bonneReponse` n'y figure qu'à partir de la révélation. |
| `joueur:etat` | serveur → un téléphone | vue personnalisée : écran à afficher, a déjà répondu, résultat, rang, est hôte |
| `erreur` | serveur → client | code + message (pseudo pris, salle pleine, salle introuvable) |

Ni le téléphone ni la TV ne reçoivent la bonne réponse avant la révélation, pour éviter la triche via les outils du navigateur.

## Écrans à concevoir

Principe : l'information est sur la TV, le téléphone ne montre que ce qu'il faut pour agir. La TV doit rester lisible à 3 mètres (texte de 40 px minimum en 1080p). Les écrans du téléphone doivent s'utiliser d'une main.

### TV (1920×1080)

| Écran | Contenu |
|---|---|
| Chargement | « Réveil du serveur… » avec nouvelle tentative automatique (voir Contraintes techniques) |
| Salle d'attente | QR code géant, code en 4 lettres, URL courte, joueurs arrivés (couleur, pseudo, couronne de l'hôte), « En attente que l'hôte lance » |
| Question | Numéro (3/10), texte, 4 réponses (couleur + forme ▲ ◆ ● ■), chrono, pastilles des joueurs ayant répondu, petit QR code dans un coin |
| Révélation | Bonne réponse mise en avant, nombre de réponses par choix, qui a eu juste, puis classement avec les points gagnés |
| Podium | Tous les joueurs de rang 3 ou mieux (ex æquo possibles, donc parfois plus de 3), classement complet dessous, « L'hôte peut relancer » |
| Quitter ? | Boîte de confirmation déclenchée par la touche Retour |

### Téléphone (portrait)

| Écran | Contenu |
|---|---|
| Rejoindre | Code pré-rempli depuis le QR code, champ pseudo, bouton « Entrer », messages d'erreur |
| Attente | « Tu es dans la salle », sa couleur. Pour l'hôte : bouton « Lancer la partie » (inactif sous 2 joueurs connectés) |
| Répondre | 4 gros boutons couleur + forme, sans texte, qui occupent tout l'écran |
| Réponse envoyée | « Réponse envoyée, regarde la TV » avec le bouton choisi |
| Résultat | « Bonne réponse, +740 » ou « Raté », rang actuel. Pour l'hôte : bouton « Suivant » |
| Fin | Rang final et score. Pour l'hôte : bouton « Rejouer » (inactif sous 2 joueurs connectés) |
| En attente de la prochaine question | Pour un joueur arrivé en cours de manche |
| Reconnexion | Bandeau « Reconnexion… » quand la connexion saute |

### Couleurs

Proposition, à valider sur la vraie TV à la tranche 7. Les réponses ne sont jamais identifiées par la couleur seule : la forme les distingue toujours.

Réponses :

| Forme | Couleur |
|---|---|
| ▲ | Rouge `#E21B3C` |
| ◆ | Bleu `#1368CE` |
| ● | Jaune `#FFC400` |
| ■ | Vert `#26890C` |

Joueurs, attribués dans cet ordre (première couleur libre) :

| # | Couleur |
|---|---|
| 1 | Orange `#FF8C1A` |
| 2 | Rose `#FF5CA8` |
| 3 | Violet `#9B5DE5` |
| 4 | Cyan `#00C2D1` |
| 5 | Menthe `#3DDC97` |
| 6 | Citron vert `#B5E61D` |
| 7 | Brun `#A0522D` |
| 8 | Blanc `#F1F1F1` |
| 9 | Bleu ciel `#8EC5FF` |
| 10 | Gris `#8A8F98` |

## Contraintes techniques

### Mi TV Stick 4K et APK

- Android TV 11 et 2 Go de RAM : la page TV reste en HTML/CSS/JS sans framework, avec des animations CSS simples (opacité, déplacement) et aucune image lourde.
- L'APK est une coquille minimale en Kotlin :
  - une activité plein écran avec une WebView qui charge l'URL de la page TV, sans code métier ;
  - l'écran reste allumé (`FLAG_KEEP_SCREEN_ON`) ;
  - l'app est déclarée pour Android TV (catégorie Leanback + bannière), sinon elle n'apparaît pas sur l'accueil du stick ;
  - les touches Retour et OK sont transmises à la page.
- Toute modification d'affichage se fait côté serveur. On ne réinstalle l'APK que si la coquille change.
- Mettre à jour « Android System WebView » via le Play Store du stick avant les tests.
- Installation de l'APK : on active les options développeur et les sources inconnues, puis on transfère l'APK via l'app « Send Files to TV » ou via ADB en Wi-Fi. C'est détaillé dans une tranche dédiée.
- Avant l'APK, on peut tester la page TV dans le navigateur d'un ordinateur branché à la TV.

### Hébergement : Render gratuit pour commencer

Décision : offre gratuite de Render pour le développement et les premières soirées. On passera à une offre payante si les limites gênent. Il n'y a rien à réécrire pour migrer : c'est un simple serveur Node.

Limites connues (doc Render) :

- Mise en veille après 15 min sans requête HTTP ni message WebSocket entrant, puis environ 1 min de réveil. Le premier lancement de la soirée attend donc ~1 min.
  - Parade : l'APK affiche d'abord une page locale « Réveil du serveur… » qui interroge `/sante` toutes les 3 s, puis charge la page TV.
  - Pendant une partie, les échanges Socket.IO (ping/pong toutes les 25 s par défaut) devraient empêcher la mise en veille. À vérifier en conditions réelles, salle d'attente ouverte plus de 15 min.
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
| `MODE_DEV` | `1` autorise une partie à 1 joueur (lancer et rejouer) | Désactivé |

Dépendance validée pour le QR code : `qrcode`.

## Tranches de développement

On découpe en 10 tranches. Chacune se termine par un test concret. La TV est simulée par un onglet de navigateur jusqu'à la tranche 9.

Ordre de réalisation : 1, 2, 3, 4, 5, **8**, 6, 7, 9, 10. Le PC de développement est sur un réseau d'entreprise : les téléphones ne peuvent pas joindre un serveur local. Le déploiement sur Render (tranche 8) passe donc avant la tranche 6, pour que les tests sur vrais téléphones se fassent toujours sur le serveur en ligne. Les numéros des tranches ne changent pas.

- **1. Squelette.** Serveur Node + Express + Socket.IO, pages `/tv` et `/joueur` vides, route `/sante`.
  *Test : un message tapé dans l'onglet joueur s'affiche dans l'onglet TV.*
- **2. Salle d'attente.** Création de salle (code de 4 lettres + QR code), rejoindre avec un pseudo, liste des joueurs en direct, hôte = premier arrivé, erreurs (pseudo pris, salle pleine, salle introuvable).
  *Test : 3 onglets joueurs (avec `?dev`) apparaissent sur la TV, et un 2e « Paul » (ou « paul ») est refusé.*
- **3. Boucle de quiz minimale.** L'hôte lance, 3 questions écrites en dur, les joueurs répondent, révélation, « Suivant » manuel, fin. Mode développeur à 1 joueur (`MODE_DEV=1`).
  *Test : partie complète seul, en 2 onglets.*
- **4. Règles complètes.** Chrono 20 s côté serveur, fin anticipée, points dégressifs, enchaînement automatique après 8 s, classement avec ex æquo, podium, « Rejouer ».
  *Test : les scores correspondent à la formule, et une égalité donne le même rang.*
- **5. Banque de questions.** `questions.json` d'environ 200 questions (générées avec Claude, relues par Paul), tirage sans répétition dans la salle, mélange de l'ordre des réponses (avec test automatique du recalcul de `bonneReponse`), script qui vérifie le format du fichier.
  *Test : 3 parties d'affilée sans aucune question répétée.*
- **8. Déploiement Render** (réalisée juste après la tranche 5). Dépôt GitHub, service gratuit, HTTPS, vérification de la mise en veille pendant une salle d'attente longue.
  *Test : jouer avec un téléphone en 4G.*
- **6. Robustesse.** Reconnexion des joueurs, transfert de l'hôte après 10 s, arrivée en cours de partie, reconnexion de la TV, fermeture des salles après 30 min.
  - Boutons de test sur la page joueur, visibles seulement avec `?dev` : « Couper la connexion 5 s » et « Couper 15 s ». Ils coupent le socket puis le rétablissent après ce délai, ce qui simule une coupure sans avoir à verrouiller un téléphone. 5 s reste sous le seuil de 10 s (l'hôte et le joueur en salle d'attente sont conservés), 15 s le dépasse.
  - Tests automatiques de scénarios avec le temps simulé (`mock.timers` de `node:test`), sans attendre les vrais délais : reconnexion d'un joueur avec conservation du pseudo et du score, retrait d'un joueur déconnecté en salle d'attente après 10 s, transfert de l'hôte après 10 s (et pas avant), pas de transfert si aucun autre joueur n'est connecté, fermeture d'une salle après 30 min sans connexion.
  *Test : sur Render, avec de vrais téléphones en 4G et des onglets `?dev` sur le PC : couper un joueur 5 s puis 15 s, couper l'hôte plus de 10 s, recharger la TV.*
- **7. Habillage.** Design TV lisible à 3 mètres, boutons couleur + forme, écrans d'attente et de résultat, Wake Lock.
  - Mise à l'échelle de la page TV : elle reste conçue en 1920×1080, mais elle est réduite ou agrandie en bloc pour tenir entière dans la fenêtre, centrée et sans déformation. Cela évite de zoomer quand le navigateur offre moins de place (écran de PC avec mise à l'échelle Windows à 125 %, WebView du stick qui voit souvent 960×540). Le facteur est calculé en JavaScript (`ajusterEchelle()`), au chargement et à chaque redimensionnement, car le calcul en CSS pur demande des fonctions trop récentes pour la WebView d'Android TV 11.
  - Arrêt de la partie par l'hôte : un bouton « Terminer la partie » sur le téléphone de l'hôte, pendant une question ou une révélation, avec une confirmation pour éviter un appui accidentel. Le téléphone envoie `hote:terminer`, le serveur vérifie que l'émetteur est bien l'hôte et passe directement au podium avec les scores actuels. Une manche en cours n'est pas comptée. « Rejouer » reste disponible ensuite.
  *Test : partie à 4 sur la vraie TV, via l'ordinateur branché. La page TV s'affiche en entier sans zoom du navigateur, quelle que soit la taille de la fenêtre. L'hôte termine une partie à la 4e question : la TV affiche le podium, un autre joueur ne peut pas terminer.*
- **9. APK Android TV.** Coquille WebView avec page « Réveil du serveur… », touches Retour/OK, installation sur le stick pas à pas.
  *Test : lancer l'app depuis l'accueil du stick et jouer une partie.*
- **10. Soirée test.** Une vraie soirée avec des amis, en notant les bugs et les frictions. Ces retours décideront si on migre vers une offre payante et quel mode ajouter en premier.

## Questions ouvertes

- Nom définitif du jeu, affiché sur la TV et dans l'accueil du stick
- URL courte à afficher sous le QR code : l'adresse onrender.com par défaut ou un nom de domaine à toi ?
