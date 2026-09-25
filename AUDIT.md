# Audit de Quiz TV

Audit en lecture seule du dépôt au commit `e7730ae` (« Tranche 15 : mode Le bluff »), le 25/09/2026.
Aucun fichier du projet n'a été modifié. Seul ce rapport a été ajouté.

**Méthode.** J'ai lu tout le code serveur et client, les CSS, `docs/spec.md`, les mini-specs de `docs/modes/`, `docs/sons.md`, les six fichiers de données (`questions.json` en entier) et les tests. J'ai lancé `npm test` : **291 tests, 291 réussis**. Deux bugs ont été reproduits avec des scripts jetables placés **hors du dépôt** (dossier temporaire) : le plantage du serveur sur une donnée `null` et le joueur fantôme.

**Légende.**

- **C** = constaté dans le code (ou reproduit). **S** = supposé, pas vérifiable sans le stick, un vrai téléphone ou Render.
- Gravité : **bloquant** (peut ruiner une soirée), **important** (friction réelle ou triche facile), **mineur** (confort, dette).
- Effort : **S** (moins d'une demi-journée), **M** (une tranche courte), **L** (une tranche longue ou plus).

---

## 1. Comprendre le projet

### 1.1 Résumé

1. **Architecture** : un serveur Node (Express 5 + Socket.IO 4), sans base de données. Toutes les salles vivent en mémoire dans l'objet `salles` (`server/salles.js`). Deux pages statiques sans build : `/tv` (1920×1080, mise à l'échelle en JS) et `/joueur` (portrait).
2. **Serveur autoritaire** : les clients n'envoient que des actions (`joueur:*`, `hote:*`, `tv:creer`). Après chaque action, `diffuser()` envoie l'état complet à la TV (`salle:etat`) et une vue personnalisée à chaque téléphone (`joueur:etat`).
3. **Registre des modes** (`server/modes/index.js`) : chaque mode exporte le même contrat (`demarrerPartie`, `enregistrerReponse`, `verifierFinAnticipee`, `suivant`, `echeance`, `avancer`, `classement`, `vueTv`, `vueJoueur`). Le code commun ne lit jamais `etatMode`, et la règle est bien respectée.
4. **États d'une salle** : `lobby` → `partie` → `podium` (15 s) → `tableau` ou `grandGagnant` → `partie` ou `lobby`. Pendant la partie, chaque mode a ses phases dans `etatMode.phase`.
5. **Timers** : un seul minuteur d'étape par salle, recalé sur une heure fixe à chaque diffusion (`synchroniserMinuteur`). S'y ajoutent les minuteurs d'absence (10 s) et de fermeture (30 min). Tous sont côté serveur.
6. **Six modes jouables** : Quiz (2+ joueurs, 10 QCM, 20 s), Estimation (3+, 8 questions numériques), Qui de nous ? (4+, vote anonyme), Undercover (4+, 3 manches, mots secrets, Mister White dès 5), Même réponse (3+, réponses libres regroupées par une « clé »), Le bluff (4+, fausses réponses puis vote).
7. **Deux formats** : « Petite partie », ou « Aventure » avec un objectif de 3 à 15 points globaux. Médailles olympiques (3/2/1), départage en cas d'égalité, grand gagnant.
8. **Robustesse en place** : reconnexion par `id` mémorisé (`localStorage`, ou `sessionStorage` avec `?dev`), transfert d'hôte après 10 s, retrait en salle d'attente après 10 s, arrivée en cours de partie (on joue à la manche suivante), TV reconnectée par `jetonTv` en `sessionStorage`, fermeture après 30 min sans connexion.
9. **Anti-triche** : aucune bonne réponse, aucun mot secret ni vote anonyme n'est envoyé avant la révélation. C'est vérifié mode par mode, avec des tests.
10. **Ambiance** : thème « Pop et coloré » centralisé dans `theme.css`, police Fredoka hébergée (16 Ko), formes SVG en masque CSS, sons et musique d'attente synthétisés en Web Audio par la TV seulement.
11. **Téléphone** : Wake Lock, bandeau « Reconnexion… », boutons de coupure en `?dev`, confirmation avant « Terminer ».
12. **Contenu** : 200 questions de quiz (10 catégories × 20, difficultés 1/2/3 = 80/80/40), 80 d'estimation, 120 de Qui de nous, 60 paires Undercover, 120 de Même réponse, 120 de bluff. Chaque fichier a son script de vérification.
13. **Tests** : 291 tests `node:test`, logique pure et scénarios de temps simulé, plus quelques tests Socket.IO de bout en bout.
14. **Pas encore fait** : la tranche 9 (APK, page « Réveil du serveur… », touches Retour/OK, écran « Quitter ? ») et la tranche 10 (soirée test). Le dossier `android-tv/` cité dans `CLAUDE.md` n'existe pas encore.

### 1.2 Écarts constatés

| # | Écart | Où | Commentaire |
|---|---|---|---|
| E1 | **La demande d'audit cite comme « prévus » trois modes qui existent déjà** : « Fausses réponses » = **Le bluff** (tranche 15), « L'imposteur » = **Undercover** (tranche 13), « Qui de nous… ? » (tranche 12). | `server/modes/` | Dans la partie 3, je les traite comme existants et je propose des évolutions, puis 7 modes vraiment nouveaux. |
| E2 | La spec exige « texte de 40 px minimum » sur la TV, mais **11 règles CSS descendent de 24 à 36 px**. | `public/tv/tv.css:682, 826, 852, 907, 990, 995, 1005, 1026, 1030, 1090, 1180` | Voir TV1. |
| E3 | La spec décrit `joueur:repondre` comme « index du choix ». Selon le mode, c'est en fait un index, un nombre, un texte ou un `id` de joueur. | `docs/spec.md:230` | Seules les mini-specs le disent. La ligne de la spec est à mettre à jour. |
| E4 | L'exemple de `Salle` dans la spec n'a pas `etatMode.attendus`, pourtant utilisé par tous les modes. | `docs/spec.md:205-211` | Documentation. |
| E5 | L'écran TV « Chargement / Réveil du serveur… » et la boîte « Quitter ? » figurent dans la spec mais pas dans le code. | `docs/spec.md:251, 258` | Normal : c'est la tranche 9, pas encore faite. Aujourd'hui, une TV sans serveur affiche un fond crème vide (voir H2). |
| E6 | La section « Hors périmètre » annonce encore les modes comme futurs (« tranches 11 à 15 »). | `docs/spec.md:82` | Documentation. |
| E7 | `modesAVenir` est vide, mais l'interface « Bientôt » reste codée. | `server/modes/index.js:14`, `server/salles.js:117`, `public/joueur/joueur.js:235` | Code mort tant qu'aucun mode n'est annoncé. À garder si de nouveaux modes arrivent. |

---

## 2. Audit

### 2.1 Robustesse temps réel

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| R1 | **C (reproduit)** | `server/index.js:67-68`, `72-73` | **bloquant** | **Un seul message fait tomber le serveur.** `socket.emit('joueur:rejoindre', null)` (ou `tv:creer` avec `null`) lève une `TypeError` : la valeur par défaut `= {}` ne s'applique qu'à `undefined`. L'exception n'est pas rattrapée, donc le process Node s'arrête. Render redémarre, toutes les salles sont perdues et chaque TV recrée une salle avec un nouveau code. N'importe quel joueur peut le faire depuis la console du navigateur, et un client bogué aussi. | Écrire `(donnees) => { const { code, jetonTv } = donnees ?? {}; … }` dans les deux gestionnaires. En plus, un petit enrobage commun `surEvenement(nom, action)` qui fait `try/catch` et `console.error` : une erreur imprévue dans un mode ne tue plus que l'action, pas la soirée. Ajouter un test Socket.IO « payload null ». |
| R2 | C | `server/index.js:115-122`, `server/modes/quiz.js:91-95`, `server/modes/undercover.js:247-255`, `server/salles.js:159` | **important** | **Un double appui sur « Suivant » saute un écran.** `hote:suivant` ne dit pas de quelle étape il part. Deuxième appui sur « Suivant » à la révélation de la **dernière question** : la partie passe au podium, puis aussitôt au tableau, et **le podium n'est jamais vu**. En Undercover, un double appui sur « Suivant » à l'élimination ou en fin de manche enchaîne sur « Passer au vote » : **le tour de description est sauté**. Le risque est réel en 4G, où la réponse met plusieurs centaines de ms. | Le téléphone envoie l'étape qu'il affiche (`{ etape: "partie:revelation:10" }`, la même chaîne que la TV) et le serveur ignore un « Suivant » dont l'étape n'est plus la bonne. Variante encore plus simple, côté client seulement : griser le bouton au clic jusqu'au prochain `joueur:etat`. C'est moins sûr, mais cela suffit en pratique. |
| R3 | **C (reproduit)** | `server/index.js:72-81`, `public/joueur/joueur.js:45-50` | **important** | **Joueur fantôme.** Le serveur ne vérifie pas si le socket est déjà joueur de la salle. Scénario : double appui sur « Entrer ». Le 1er appui crée « Paul », le 2e renvoie « Pseudo déjà pris » et le téléphone revient au formulaire alors qu'il est dans la salle. Le joueur tape « Paul2 » : un 2e joueur est créé sur le même socket. À la déconnexion, seul le 1er est marqué déconnecté. « Paul2 » reste `connecte: true` pour toujours. Conséquences : il bloque la fin anticipée de chaque manche (on attend toujours le chrono complet), il compte dans les 10 places et dans le minimum de joueurs, et la salle ne se ferme jamais. | Au début de `joueur:rejoindre`, si `trouverJoueurParSocket(socket.id)` trouve déjà un joueur dans cette salle, renvoyer simplement l'état (ou ignorer). Côté client, désactiver « Entrer » jusqu'à la réponse. Ajouter un test. |
| R4 | C | `server/salles.js:243-252`, conforme à `docs/spec.md:134` | **important** | **Des points globaux perdus en salle d'attente.** Après « Changer de format », un téléphone verrouillé plus de 10 s (et jusqu'à 20 s de détection) retire le joueur **avec tous ses points globaux de l'aventure**. C'est conforme à la spec, mais c'est un piège en soirée : on revient au lobby pour choisir un autre mode, quelqu'un pose son téléphone… et perd son avance. | Ne retirer en salle d'attente que les joueurs **sans historique** (`pointsGlobaux === 0` et aucune médaille). Les autres restent grisés, comme au tableau. Décision de spec à valider. |
| R5 | **C (reproduit)** | `server/index.js:67-68`, `server/salles.js:64-84`, `288-293` | mineur (important à la tranche 9) | **Un même socket TV peut avoir plusieurs salles.** Un 2e `tv:creer` sur le même socket crée une nouvelle salle sans détacher l'ancienne. À la déconnexion, `deconnecterTv` ne libère que la première trouvée. Les autres gardent un `tvSocketId` mort, ne sont **jamais fermées** et restent en mémoire. Aujourd'hui, cela n'arrive que via un client modifié. Mais la touche **OK = recréer une salle** de la tranche 9 le déclenchera à chaque appui. | Dans `tv:creer`, appeler d'abord `deconnecterTv(socket.id)`. Faire aussi la recherche sur toutes les salles (`filter` au lieu de `find`). |
| R6 | C | `public/tv/tv.js:18-23` | important | **La TV ne signale pas une coupure.** Il n'y a pas de gestionnaire `disconnect` : la TV garde le dernier écran figé (chrono arrêté, QR valide en apparence) pendant que Socket.IO retente. Après un redémarrage du serveur, elle affiche d'un coup une autre salle avec un autre code, sans explication. | Un bandeau « Connexion au serveur… » sur la TV, comme sur le téléphone. Au premier chargement, le même écran sert d'écran d'attente pendant le réveil de Render (voir H2). |
| R7 | C | `public/joueur/joueur.js:17`, `119-126` | important | **Après un redémarrage du serveur**, le téléphone reçoit « Salle introuvable » avec l'**ancien code encore pré-rempli** (il vient de `?code=` dans l'URL). Les joueurs réessaient en boucle au lieu de rescanner. | Pour `salle_introuvable` : vider le champ code et afficher « Cette partie n'existe plus. Scanne le nouveau QR code sur la TV ». Retirer `?code=` de l'URL (`history.replaceState`). |
| R8 | C | `server/salles.js:206-209`, `docs/spec.md:137` | mineur | **Un pseudo réservé est irrécupérable** pendant une partie si le téléphone a perdu son `localStorage` (autre navigateur, navigation privée, page ouverte depuis une appli). Le joueur doit prendre un autre pseudo et repart de 0. | À garder tel quel (c'est la parade contre l'usurpation). On peut ajouter un bouton hôte « Libérer le pseudo de X » (joueur déconnecté seulement), plus tard. |
| R9 | C | `server/modes/undercover.js:60-67`, `197-198` | mineur | En Undercover, s'il ne reste que **2 participants** à une manche (les autres déconnectés), il y a 1 civil et 1 undercover. Chacun vote pour l'autre : égalité, départage, égalité, nouveau tour… **à l'infini**, parce que `vainqueur` n'est testé qu'après une élimination. | Tester `vainqueur(roles, elimines)` aussi au début d'une manche et d'un tour. |
| R10 | C | `server/salles.js:296-301` | mineur | Une salle dont la TV reste connectée ne ferme jamais (voulu par la spec). Un stick laissé allumé toute la nuit garde sa salle, avec des minuteurs d'absence qui tournent pour rien. | Rien à faire. Éventuellement fermer au bout de 12 h sans aucune action d'un joueur. |
| R11 | S | `server/index.js:30` | mineur | Détection d'une coupure en 20 s au plus, puis 10 s de délai : un hôte qui part ne cède son rôle qu'après 20 à 30 s. En Undercover, la phase de description n'a pas de chrono et reste bloquée pendant ce temps. | Acceptable. Si c'est gênant en soirée, n'importe quel joueur connecté pourrait « Passer au vote » quand l'hôte est déconnecté. |

Points solides (C) : réponses en double refusées dans chaque mode ; actions hors état refusées (`phaseEnCours`) ; minuteur recalé sur une heure fixe (pas de dérive) ; fin anticipée recalculée à chaque déconnexion ; arrivées en cours de manche bien exclues des « attendus » ; reconnexion TV protégée par jeton ; minuteurs d'une salle tous annulés à sa fermeture.

### 2.2 Triche et sécurité

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| T1 | C | voir R1 | **bloquant** | Déni de service trivial (un message `null`). | Voir R1. |
| T2 | C | `server/salles.js:231-240`, `server/modes/qui-de-nous.js:174-177, 187`, `server/modes/undercover.js:371-374, 427` | important (peu probable entre amis) | **Usurpation d'identité.** La reconnexion ne repose que sur l'`id` du joueur (8 caractères hexadécimaux). Or ces `id` sont **envoyés à tous les téléphones** dans les listes de candidats de Qui de nous ? et d'Undercover. Un joueur qui ouvre les outils du navigateur peut envoyer `joueur:rejoindre { code, id: idDeLéa }` et devenir Léa : il **voit son mot secret** en Undercover et prend son rôle d'hôte si elle l'était. Léa perd la main jusqu'à son prochain rechargement. | Séparer l'`id` public (dans les vues) d'une **clé secrète de reconnexion** (`cle`, 16 octets aléatoires), remise au seul téléphone et exigée par `reconnecterJoueur`. C'est le même principe que `jetonTv`. |
| T3 | C | tous les `vueTv` / `vueJoueur` des modes | ok | Aucune bonne réponse, aucun mot, aucun vote anonyme ni auteur de bluff ne sort avant la révélation. Tests présents pour chaque mode. | Rien. |
| T4 | C | `server/index.js:83-143`, `server/salles.js:319-323` | ok | Chaque `hote:*` passe par `trouverHoteParSocket`. | Rien. Les tests de bout en bout ne couvrent que `terminer` et `choisirMode` (voir TE2). |
| T5 | C | `server/salles.js:343-344` | mineur | `vueTv` recopie **tout** l'objet salle (`...salle`), y compris les `socketId` des joueurs et tout champ ajouté plus tard. Un futur champ secret partirait à la TV sans qu'on y pense. | Construire la vue TV champ par champ, comme le font déjà les vues de modes. |
| T6 | C | `server/salles.js:202-209` | mineur | **Pseudo** : seule la longueur est vérifiée. Les caractères invisibles (U+200B), les inversions de sens (U+202E) et les retours à la ligne passent. On peut donc avoir deux « Paul » d'apparence identique, ou un pseudo qui casse la mise en page. | Retirer les caractères de contrôle et de format (`/[\p{C}]/gu`) avant le `trim`. |
| T7 | C | `public/**/*.js` | ok | **Aucune injection HTML possible** : tout le texte passe par `textContent`, `append` ou `replaceChildren`. Aucun `innerHTML` dans le dépôt. | Rien. Garder cette règle (à noter dans `CLAUDE.md`). |
| T8 | C | `server/index.js:67-81` | mineur | Aucune limite de débit. Un script peut créer des milliers de salles (`tv:creer`) ou essayer les 456 976 codes pour entrer dans une salle au hasard. | Hors sujet pour une soirée privée. Si besoin : 5 salles par socket et un petit délai après 20 codes inconnus. |
| T9 | S | `public/joueur/modes/undercover.js:389, 407` | mineur | Mister White voit une **phrase longue** là où les autres voient un mot court : un voisin qui jette un œil devine son rôle à la forme du texte. | Afficher « (aucun mot) » en gros, avec l'explication en petit, ou montrer l'explication seulement au début de la manche. |
| T10 | C | `server/modes/quiz.js:59-65` | ok | Temps mesuré à la réception par le serveur. Un joueur en 4G perd environ 2,5 points par 100 ms de latence : négligeable. | Rien. |

### 2.3 Lisibilité du code

Le code est globalement **très propre** : fonctions courtes, noms français cohérents avec la spec, commentaires utiles, contrat de mode clair et testé. Les remarques portent surtout sur la duplication, qui augmente à chaque mode.

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| L1 | C | `quiz.js:84-110`, `estimation.js:251-277`, `qui-de-nous.js:102-128`, `meme-reponse.js:325-351`, `bluff.js:174-201` | mineur | **Cinq copies** presque identiques de `passerALaSuite`, `suivant`, `echeance`, `avancer`, `questionCourante`, `demarrerQuestion` et `vueQuestion`, avec des noms de champs qui varient (`debutQuestionA` / `debutPhaseA`, `ontRepondu` / `ontVote`). | Garder les modes indépendants, mais sortir dans `modes/commun.js` 2 ou 3 aides sans abstraction lourde, par exemple `passerALaSuite(salle, demarrerQuestion)` et `tempsRestant(salle, echeance)`. Uniformiser `debutPhaseA`. |
| L2 | C | `public/tv/modes/*.js` (fonctions `afficherQuestion…`, `afficherSaisie…`, `afficherVote…`) | mineur | Même motif copié 7 fois côté TV : numéro, texte, barre de temps, chrono, pastilles « ont répondu », son. | Une fonction commune `afficherAttenteReponses(prefixe, salle, nouvelleEtape)` dans `tv.js`. |
| L3 | C | `public/joueur/modes/qui-de-nous.js:294-307`, `undercover.js:453-466`, `listerNoms` / `listerPseudos`, `REVELATIONS` / `REVELATIONS_UC` | mineur | Doublons entre scripts, rendus nécessaires par l'espace global partagé (suffixes `Uc`, `Bluff` pour éviter les collisions). | Déplacer `boutonCandidat` et `listerNoms` dans `joueur.js`. À terme, passer les scripts en `<script type="module">` (supporté par la WebView d'Android TV 11) pour isoler les noms sans build. |
| L4 | C | `public/tv/index.html` (281 lignes), `public/joueur/index.html` (299), `public/tv/tv.css` (1 304) | mineur | **Ajouter un mode touche 8 fichiers** : serveur, registre, 2 HTML, 2 JS, 2 CSS, plus les données et le script de vérification. Tout le HTML et le CSS des modes sont mélangés dans les fichiers communs. | Découper `tv.css` en `tv/modes/<mode>.css`. Ajouter à `CLAUDE.md` une liste de contrôle « Ajouter un mode ». Les écrans HTML peuvent rester dans l'index (c'est simple et lisible). |
| L5 | C | `server/modes/qui-de-nous.js:135-137`, `public/tv/modes/undercover.js:163-164` | mineur | Garde-fous morts avec des commentaires trompeurs (« l'hôte a changé de mode au podium ») : on ne peut changer de mode qu'au tableau, donc au podium `salle.mode` est toujours le mode joué. | Retirer le `?? {}` et le `if (!victoires)`, ou corriger les commentaires. |
| L6 | C | `server/modes/meme-reponse.js:305-317`, `bluff.js:158-166` | mineur | `groupes()` et `resultats()` sont recalculés pour chaque joueur à chaque diffusion. C'est négligeable à 10 joueurs, mais surprenant à la lecture. | Rien, ou calculer une fois dans `montrerResultats` et stocker dans `etatMode`. |
| L7 | C | `server/salles.js` (406 lignes) | mineur | Le fichier mélange joueurs, hôte, minuteurs, format et vues. | Sortir `vueTv` / `vueJoueur` / `vueFin` / `vueTableau` dans `server/vues.js`. |

Logique métier et affichage : **bien séparés** (C). Les clients n'ont aucune règle de jeu, seulement de l'aide à la saisie, revalidée par le serveur.

### 2.4 Performance sur le stick

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| P1 | C | `public/` | ok | **Pages légères** : police 16 Ko, aucune image, QR en SVG généré une seule fois par salle, client Socket.IO environ 50 Ko, 6 petits scripts de mode. Animations en `opacity` et `transform` seulement, sans flou ni ombre. | Rien. |
| P2 | S | `public/tv/sons.js:285-300`, `374-399` | mineur | La musique d'attente crée environ **4 nœuds audio par croche** (oscillateur + gain), soit environ 15 nœuds par seconde. Ils sont libérés par le ramasse-miettes, mais sur 2 Go de RAM et un lobby ouvert 30 min, c'est à surveiller. | Mesurer via `chrome://inspect` (mémoire JS et « Audio » sur 30 min de lobby). Si ça grimpe : un seul gain par voix, réutilisé. |
| P3 | C | `public/tv/tv.css:40`, `231`, `public/commun/commun.css:119` | mineur | `.attente` clignote **en continu** (`infinite`) sur tous les écrans d'attente, et le chrono tremble les 5 dernières secondes. C'est peu coûteux, mais c'est une animation permanente sur un scène mise à l'échelle. | Clignotement plus lent, ou arrêté après 3 cycles. |
| P4 | S | `public/tv/tv.js:5-14` | mineur | La scène est mise à l'échelle (souvent environ 0,5 sur le stick) : selon la WebView, le texte peut être rastérisé flou ou chaque animation repeinte toute la scène. | Vérifier sur le stick. Si le texte est flou, essayer `zoom` au lieu de `transform: scale` (supporté par Chromium). |
| P5 | C | `public/tv/tv.js:54, 184-197` | ok | Minuteurs remis à zéro à chaque état reçu, DOM remplacé par `replaceChildren` : pas de fuite visible dans le code. | Rien. Confirmer lors d'une soirée de 3 h (mémoire stable). |
| P6 | S | `public/tv/tv.js:199` | mineur | Les émojis de médaille (🥇🥈🥉🏆) dépendent de la police émoji du système Android TV. | Vérifier sur le stick. Sinon, dessiner les médailles en CSS (cercle + chiffre). |

### 2.5 Interface TV

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| TV1 | C | `tv.css:682, 826, 852, 907, 990, 995, 1005, 1026, 1030, 1090, 1180` | **important** | **Textes sous 40 px**, contre la règle de la spec : classement en colonne (36 px), lignes « Seuls / Pas de réponse » de Même réponse (28 à 30 px), cartes du bluff (24 à 34 px), rôle Undercover (32 px). Ce sont justement les écrans les plus chargés, lus à 3 m. | Remonter à 40 px minimum. Pour tenir 10 joueurs, réduire le contenu plutôt que la taille : 2 colonnes, pseudo tronqué, classement limité au top 5 plus « et 5 autres ». |
| TV2 | C | `public/tv/modes/bluff.js:324-329`, `tv.css:1021-1026` | **important** | À la révélation du bluff, « a piégé » et « trouvée par » sont des **pastilles seules de 24 px, sans pseudo** : illisible à 3 m et impossible à suivre pour un daltonien. | Pastille avec l'**initiale** du pseudo dedans (40 px minimum), ou les pseudos en entier si c'est 3 joueurs ou moins. |
| TV3 | C | `tv.css:170-172` | important | Joueur déconnecté = **opacité 0,35** : le contraste tombe à environ 2:1 et le pseudo devient illisible. | Opacité 0,6 plus une icône « ⏸ » ou un pseudo barré, pour ne pas dépendre de la seule transparence. |
| TV4 | C | `public/commun/theme.css:28` | mineur | La couleur de joueur 8 (« Encre » `#1B1035`) est **identique au contour** : sa pastille est un disque noir, peu identifiable. La 10 (gris) ressemble à un joueur grisé. | Remplacer la 8 par un bleu marine distinct du contour (`#2B3A8F`), et la 10 par un rouge brique. |
| TV5 | C | `tv.js:228-231`, `index.html:523-533` | mineur | Le podium arrive d'un bloc, en même temps que le classement complet : pas de suspense. | Voir AMB2 (révélation échelonnée 3, 2, puis 1). |
| TV6 | S | `index.html:432`, `tv/modes/undercover.js:90`, `126` | mineur | Textes au masculin (« Il a une seule chance », « est éliminé », « Il cherche… »). | Tournures neutres : « Une seule chance de trouver… », « Éliminé : Léa », « Recherche en cours… ». |
| TV7 | C | `tv.css:40` | mineur | « En attente que l'hôte lance » clignote jusqu'à 20 % d'opacité : illisible la moitié du temps. | Clignoter entre 100 % et 60 %. |
| TV8 | C | tous les écrans | ok | Hiérarchie claire (numéro, question, réponses), formes en plus des couleurs, cohérence des écrans d'un mode à l'autre, QR dans le coin pendant la partie. | Rien. |
| TV9 | S | `tv.css` `.question { height: 220px }` | mineur | La question a une hauteur fixe (2 lignes à 64 px). Des questions de joueurs ou de nouveaux fichiers plus longs déborderont. | Le script de vérification signale déjà les longueurs ? À ajouter si ce n'est pas le cas (limite environ 85 caractères). |

### 2.6 Interface téléphone

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| TEL1 | C | `public/joueur/modes/quiz.js:356-360`, `bluff.js:33-36`, `qui-de-nous.js:285-288` | important | **Aucun retour immédiat à l'appui** : le bouton ne change qu'au retour du serveur. En 4G lente, on ne sait pas si l'appui est pris, on retape, et avec R2 on peut sauter un écran. | Au clic : marquer le bouton choisi (`.choisi`, rebond) et désactiver les autres jusqu'au prochain `joueur:etat`. C'est purement visuel, le serveur reste seul juge. |
| TEL2 | C | `public/joueur/joueur.js:45-50` | important | « Entrer » reste actif après l'envoi (cause de R3). | Désactiver jusqu'à `joueur:etat` ou `erreur`. |
| TEL3 | C | `public/joueur/modes/quiz.js:373`, `server/modes/quiz.js:156-157` | mineur | Pas de réponse au quiz = « Raté », comme une mauvaise réponse. | Envoyer `aRepondu` et afficher « Pas de réponse ». |
| TEL4 | C | `public/joueur/modes/estimation.js:176` | mineur | Le champ n'est vidé que si le **numéro** de question change. Si l'hôte termine une Estimation à la question 1 puis relance, le champ garde l'ancienne saisie. Même réponse et Le bluff, eux, comparent numéro + texte. | Faire la même comparaison que les autres modes. |
| TEL5 | C | `public/joueur/joueur.css:212-219` | mineur | Le bouton « Terminer » (18 px, en haut à droite) est hors de portée du pouce. C'est **voulu** (contre les appuis accidentels), et il y a une confirmation. | Rien. |
| TEL6 | S | `joueur/index.html:551-554`, `joueur.css:108-139` | mineur | Au tableau, l'hôte a 6 boutons de mode, « Rejouer » et « Changer de format » en bas. Sur un petit iPhone (SE), l'écran déborde probablement et l'action principale passe sous la ligne de flottaison. | Vérifier sur un petit écran. Sinon, replier les modes dans un « Changer de mode ▾ ». |
| TEL7 | C | `joueur.css:180-183` | ok | Champs à 28 px : pas de zoom automatique sur iOS (qui zoome sous 16 px). `100dvh` avec repli `100vh`. `inputmode="numeric"`. Actions principales en bas. | Rien. |
| TEL8 | C | tous les modes | mineur | Une action refusée par le serveur (réponse arrivée après le chrono, vote invalide) ne donne **aucun message** : le téléphone change simplement d'écran. | Acceptable. Au besoin, un `erreur` « Trop tard ! » pour `joueur:repondre` refusé en dehors de la bonne phase. |
| TEL9 | S | `public/joueur/joueur.js:163-180` | mineur | Wake Lock : Safari iOS ne le supporte qu'à partir de la version 16.4. Sur un iPhone plus ancien, l'écran se verrouille et le joueur est déconnecté après 20 s. | Documenter (« Réglages > Luminosité > Verrouillage : jamais » pendant la soirée), ou ajouter une vidéo muette en boucle comme repli (astuce connue, à éviter si possible). |

### 2.7 Accessibilité

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| A1 | C | `theme.css:15-18`, `commun.css:73-76` | ok | Réponses : couleur **plus** forme SVG, toujours. Rouge et vert (▲ et ■) sont confondus par un deutéranope, mais les formes les distinguent. | Rien. |
| A2 | C | `theme.css:21-30` | important | **Couleurs de joueurs confusables** pour un daltonien : orange (1) / brun (7) / rose (2) ; menthe (5) / citron vert (6) / cyan (4). Là où la pastille est seule (bluff, TV2), l'information est perdue. | Initiale dans la pastille partout où le pseudo n'est pas écrit juste à côté. Revoir 2 ou 3 teintes avec un simulateur (DevTools > Rendering > « Emulate vision deficiencies »). |
| A3 | C | calcul sur `theme.css` | mineur | Contrastes : blanc sur accent `#FF4F8B` ≈ 3,1:1, blanc sur vert `#17A34A` ≈ 3,3:1, blanc sur rouge ≈ 3,9:1. C'est suffisant pour du **grand texte** (tous les boutons font 28 px ou plus) mais pas pour du petit. Texte doux sur fond crème ≈ 5,2:1 : bon. | Ne jamais mettre de texte blanc de moins de 24 px sur ces fonds (aujourd'hui, c'est respecté). |
| A4 | C | voir TV3 | important | Joueur grisé ≈ 2:1. | Voir TV3. |
| A5 | C | `public/joueur/index.html:351-354` | ok | Les boutons de réponse sans texte ont un `aria-label` (« Triangle rouge »…). | Rien. |
| A6 | S | `public/joueur/joueur.css` | mineur | Tailles en `px` fixes : le réglage « taille de texte » du téléphone est ignoré. | Acceptable pour un jeu. Passer éventuellement le `font-size` de base en `rem`. |

### 2.8 Contenu de `questions.json`

**Constats chiffrés (C)** : 200 questions, **équilibre parfait** (10 catégories × 20 ; difficultés 1/2/3 = 8/8/4 par catégorie). Bonne réponse également répartie entre les 4 positions avant mélange (49/51/50/50), et de toute façon remélangée à chaque tirage. Aucun doublon de texte ni d'identifiant. Question la plus longue : 81 caractères ; réponse la plus longue : 29.

**Erreurs factuelles** : **aucune erreur évidente trouvée** après relecture des 200 questions. Quelques formulations méritent quand même un coup d'œil (S) :

| Id | Question | Remarque |
|---|---|---|
| q0054 | Plus grand organe du corps humain → la peau | Réponse admise, mais l'intestin est parfois cité (en surface déployée). Préciser « le plus lourd » ou « le plus étendu visible ». |
| q0170 | Avec quelle **farine**… → « Le sarrasin » | Les propositions sont des céréales, pas des farines (« La farine de sarrasin »…). |
| q0168 | Nems originaires du Vietnam | Juste, mais la Chine (rouleaux de printemps) peut prêter à débat à table. Garder. |
| q0167 | Mayonnaise : huile + jaune d'œuf | Juste (la moutarde est souvent citée, mais elle n'est pas proposée). OK. |
| q0080 | Mammifère qui pond → ornithorynque | Juste (l'échidné aussi, mais il n'est pas proposé). OK. |

**Difficultés mal calibrées (C)** :

| Id | Question | Difficulté | Proposée |
|---|---|---|---|
| q0160 | Combien de cases compte un échiquier ? | 3 | 1 ou 2 |
| q0118 | Prix du meilleur film à Cannes (Palme d'or) | 3 | 1 |
| q0136 | Combien de musiciens compte un quatuor ? | 2 | 1 (la réponse est dans le mot) |
| q0196 | Combien de degrés mesure un angle droit ? | 2 | 1 |
| q0140 | À quel âge Mozart est-il mort ? | 3 | 3 (OK, vraiment difficile) |

**Paires qui se « répondent » dans une même partie (C)** : elles peuvent tomber ensemble (10 questions tirées parmi 200) et donnent l'impression de répétition : q0081 / q0084 (La Joconde), q0111 / q0117 (Amélie Poulain), q0121 / q0122 (« le King » / « le roi de la pop », mêmes propositions), q0161 / q0169 (paella), q0043 / q0047 (planètes), q0082 / q0088 (Hugo et Dumas en réponses croisées), q0095 / q0182 (« L'Avare » / « avare »).

**Catégories fourre-tout (C)** : `langue-divers` contient 6 questions de maths ou géométrie (q0184, q0186, q0189, q0196, q0197, q0198) et un animal (q0187). Les échecs (q0160) sont en `sport`.

**Variété (S)** : le ton est très « scolaire » et classique (capitales, dates, auteurs). Il y a peu de questions récentes (après 2015), peu de culture populaire française actuelle (séries, YouTube, jeux vidéo, rap), peu d'humour ou de questions pièges drôles, qui font le sel d'une soirée. Avec 10 questions par partie, **20 parties** passent avant la première répétition : c'est largement suffisant pour une soirée, un peu juste sur plusieurs soirées avec le même groupe.

**Recommandations** : corriger les 4 difficultés et les 2 formulations ; ajouter au script de vérification une alerte « mots communs entre deux questions » pour repérer les paires ; créer une catégorie `maths-logique` ; ajouter environ 100 questions « pop et actuelles » ; tirer les 10 questions de façon **équilibrée** (voir F1).

### 2.9 Hébergement (Render gratuit)

| # | C/S | Fichier:ligne | Gravité | Problème | Correction proposée |
|---|---|---|---|---|---|
| H1 | C | `server/index.js:50, 164-169` | **important** | **Journal presque vide** : seulement « Serveur lancé » et les tirages. Aucune trace de création de salle, d'arrivée, de départ, de transfert d'hôte, de fin de partie ni d'erreur. Après une soirée ratée, impossible de comprendre ce qui s'est passé dans les logs Render. | Une ligne courte par événement important : `[KDZP] +joueur Paul (3 connectés)`, `[KDZP] hôte → Léa`, `[KDZP] partie quiz lancée`, `[KDZP] podium`, `[KDZP] fermée`. Plus `process.on('uncaughtException')` qui journalise l'erreur complète avant de quitter. Pas de dépendance nécessaire. |
| H2 | C | `public/tv/tv.js`, `docs/spec.md:251, 327` | important | **Pas de page de réveil** tant que la tranche 9 n'est pas faite. Serveur endormi : le navigateur de la TV attend environ 1 min sans rien afficher (S : Render renvoie peut-être sa propre page d'attente). Serveur tombé en cours de soirée : fond crème vide. | Écran TV « Connexion au serveur… » affiché tant que le socket n'est pas connecté (voir R6). Il sert aussi de filet si l'APK tarde. |
| H3 | S | `docs/spec.md:326-328` | important | **Mise en veille pendant un long lobby** : Render compte-t-il les pongs Socket.IO (toutes les 10 s) comme trafic entrant ? La spec note déjà « à vérifier ». | Test : lobby ouvert 20 min sans action, puis lancer une partie. Si le serveur s'endort, un `fetch('/sante')` toutes les 5 min depuis la TV suffit. |
| H4 | C | Render | important | **Un `git push` pendant la soirée redéploie et redémarre** le serveur : partie perdue pour tout le monde. | Règle d'or dans `CLAUDE.md` : pas de push vers `main` pendant une soirée. Ou désactiver le déploiement automatique sur Render et déployer à la main. |
| H5 | S | `server/index.js:18-22` | important | Sans la variable `URL_PUBLIQUE`, le QR code encode l'IP interne du conteneur Render, illisible pour les téléphones. | Vérifier que la variable est bien définie sur Render (probablement fait à la tranche 8). Ajouter un avertissement au démarrage quand `RENDER` est défini mais pas `URL_PUBLIQUE`. |
| H6 | C | `server/index.js:56` | mineur | `/sante` ne dit que `{ ok: true }`. | Ajouter `salles` et `joueursConnectes` (des nombres, rien de sensible), plus `demarreA` : on voit tout de suite si le serveur a redémarré. |
| H7 | C | voir R7 | important | Redémarrage : les joueurs voient « Salle introuvable » sans consigne claire. | Voir R7. |
| H8 | S | Render gratuit | mineur | 512 Mo de RAM, un seul process, redémarrages possibles à tout moment : c'est cohérent avec « tout en mémoire ». Environ 750 h par mois suffisent. | Rien. Passer à l'offre payante (environ 7 $/mois) seulement si H3 ou des redémarrages gênent en vraie soirée. |

### 2.10 Tests

**Ce qui est testé (C)** : calcul des points de chaque mode, classement avec ex æquo, médailles et grand gagnant, tirage sans répétition et mélange des réponses, normalisation des réponses libres, fin anticipée, arrivées en cours de manche, minuteurs en temps simulé (révélation à 20 s pile, enchaînements, resynchronisation), robustesse (reconnexion, retrait à 10 s, transfert d'hôte, fermeture à 30 min, jeton TV), absence de fuite de secrets dans les vues de chaque mode, formats des fichiers de données. **Bout en bout Socket.IO** : `/sante`, `/qr`, lancement et fin de chaque mode, seul l'hôte peut terminer, seul l'hôte peut choisir le mode.

**Manques par priorité** :

| # | Test manquant | Priorité |
|---|---|---|
| TE1 | Payloads malformés sur **chaque** événement (`null`, nombre, tableau, chaîne de 1 Mo) : le serveur survit. | P1, lié à R1 |
| TE2 | Chaque `hote:*` (`lancer`, `suivant`, `rejouer`, `configurer`, `changerFormat`) refusé depuis un non-hôte, au niveau socket. | P1 |
| TE3 | Double `joueur:rejoindre` depuis le même socket : pas de 2e joueur (R3). | P1 |
| TE4 | Double `hote:suivant` : le podium n'est pas sauté, ni la description Undercover (R2). | P1 |
| TE5 | Deux `tv:creer` sur le même socket, puis déconnexion : aucune salle orpheline (R5). | P2 |
| TE6 | `vueTv` : liste blanche des champs de salle (pas de `socketId`), si T5 est corrigé. | P2 |
| TE7 | Undercover à 2 participants : la manche se termine (R9). | P3 |
| TE8 | Script de vérification : longueur maximale des questions pour l'écran TV, paires de questions voisines. | P3 |
| TE9 | Côté client : aucun test (acceptable sans build). Une page `/tv?demo` qui rejoue des états figés permettrait une vérification visuelle rapide de chaque écran à 10 joueurs. | P3 |

---

## 3. Propositions d'amélioration

### 3.1 Les trois modes « prévus » (déjà en place) : évolutions

| Mode demandé | Existant | Évolutions proposées | Effort |
|---|---|---|---|
| **Fausses réponses** | **Le bluff** (`server/modes/bluff.js`) | (a) Une manche « **Bluff sur les joueurs** » : questions sur les personnes présentes, écrites par les joueurs en début de partie (« Le premier concert de Paul ? ») ; (b) le bouton « **J'aime** » sur un bluff drôle (+100 à son auteur) ; (c) une banque de questions « absurdes mais vraies » plus fournie. | M |
| **L'imposteur** | **Undercover** | (a) Variante « **L'intrus à la question** » : tout le monde reçoit la même question (« Ton plat préféré ? »), l'intrus une question voisine (« Un plat que tu détestes ? »), chacun répond sur son téléphone, les réponses s'affichent sur la TV, puis vote. Aucun tour de parole : idéal pour les groupes timides. Réutilise la saisie de Même réponse et le vote d'Undercover. (b) Un chrono optionnel par orateur, affiché sur la TV. | M |
| **Qui de nous… ?** | **Qui de nous ?** | (a) « **Je vote pour moi** » : chacun prédit s'il sera élu (bonus s'il a raison) ; (b) questions créées par les joueurs (voir F3) ; (c) paquets thématiques (gentil, piquant, travail). | S à M |

### 3.2 Nouveaux modes

| Mode | Règle (3 à 5 lignes) | TV / téléphone | Joueurs | Réutilise | Difficulté |
|---|---|---|---|---|---|
| **M1. Le sondage** (façon « Une famille en or ») | Question : « Citez un objet qu'on oublie en vacances ». Chacun tape jusqu'à 3 réponses. Les réponses du fichier sont classées par popularité (sondage préparé à l'avance). Points selon le rang de chaque réponse trouvée ; la TV dévoile le tableau case par case. | TV : tableau des 6 réponses qui se retournent. Téléphone : 3 champs de saisie. | 3 à 10 | `cleReponse` et variantes de Même réponse, révélation échelonnée du bluff | **M** (le gros du travail est le contenu) |
| **M2. Dans l'ordre** | Quatre éléments à remettre dans l'ordre (chronologique, taille, population…). Chacun les ordonne sur son téléphone. Points : 250 par élément bien placé, plus un bonus de rapidité si tout est juste. | TV : les 4 cartes, puis le bon ordre qui glisse en place. Téléphone : 4 boutons à toucher dans l'ordre (pas de glisser-déposer, plus fiable). | 2 à 10 | Tout le quiz (formes, couleurs, chrono, points dégressifs) | **S à M** |
| **M3. La réplique** (façon Quiplash) | Une amorce drôle (« Le pire nom pour un chat »). Chacun écrit une réplique. On vote pour la meilleure (jamais la sienne). Points par vote reçu, bonus à l'unanimité. | TV : répliques anonymes, puis auteurs et votes. Téléphone : saisie, puis vote. | 3 à 10 | Le bluff presque entièrement (saisie, fusion, vote, révélation), sans vraie réponse | **S** |
| **M4. Deux vérités, un mensonge** | En début de partie, chacun écrit 3 affirmations sur lui, dont une fausse. À chaque manche, la TV affiche celles d'un joueur, les autres votent pour le mensonge. Points pour avoir trouvé, et pour l'auteur par joueur trompé. | TV : les 3 affirmations, puis la révélation. Téléphone : saisie initiale, puis vote parmi 3. | 3 à 8 (une manche par joueur) | Vote et révélation du bluff, saisie de Même réponse | **M** (phase de saisie initiale et contenu produit par les joueurs) |
| **M5. Le mot interdit** (façon Taboo) | Un joueur voit sur son téléphone un mot et 3 mots interdits, et le fait deviner à voix haute en 45 s. Les autres crient. Il appuie « Trouvé » ou « Passer ». Tour suivant. Points pour le décrivant et, en variante équipe, pour son équipe. | TV : qui décrit, chrono, score, mots trouvés (révélés après le tour). Téléphone du décrivant : le mot et les boutons. Autres téléphones : « Devine ! ». | 4 à 10 | Tours d'Undercover, secret par téléphone, chrono serveur | **M** (plus un fichier de 300 mots) |
| **M6. Dessine !** (façon Pictionary) | Un joueur dessine au doigt sur son téléphone un mot secret. Le tracé s'affiche en direct sur la TV. Les autres tapent leurs propositions. Points dégressifs selon la rapidité, pour le devineur et le dessinateur. | TV : le dessin en direct, le chrono, qui a trouvé. Téléphone : un canvas (dessinateur) ou une saisie (les autres). | 3 à 10 | Saisie et `cleReponse`, rapidité du quiz | **L** : envoi des traits par Socket.IO (petits paquets de points, sans logique côté client), dessin en `<canvas>` sur la TV, **à tester sur le stick** |
| **M7. Vrai ou faux éclair** | 20 affirmations, 6 s chacune. On répond Vrai ou Faux. Les séries rapportent de plus en plus (x1, x2, x3). Une erreur remet la série à zéro. | TV : grosse affirmation et barre de temps. Téléphone : 2 énormes boutons. | 2 à 10 | Tout le quiz (2 choix au lieu de 4) | **S** (plus un fichier de 150 affirmations) |

### 3.3 Mécaniques

| # | Idée | Intérêt en soirée | Effort | Risques / contraintes |
|---|---|---|---|---|
| MEC1 | **Séries** : +100 par bonne réponse consécutive au quiz (plafond +300), « 🔥 3 » à côté du pseudo sur la TV | Récompense la régularité, crée des moments « il est en feu ! » | S | Augmente l'écart en tête (voir MEC5) |
| MEC2 | **Jokers**, un de chaque par partie : « 50/50 » (le téléphone grise 2 réponses) et « Double » (points x2 sur une question, annoncé avant) | Choix tactiques, on rit quand le « Double » rate | M | Le 50/50 impose d'envoyer 2 mauvaises réponses au téléphone : autorisé, puisque ce ne sont **pas** la bonne |
| MEC3 | **Manches à thème** : la partie annonce 3 catégories, 3 ou 4 questions chacune, avec un écran de transition | Rythme, et chacun a « sa » manche | S | Demande le tirage par catégorie (F1) |
| MEC4 | **Question finale à pari** : avant la dernière question, chacun mise 0 à 50 % de son score | Retournements de dernière minute | M | Le bluff avait écarté « valeurs doublées à la fin » ; ici c'est volontaire et borné |
| MEC5 | **Rattrapage** : le dernier du classement a 3 s de chrono en plus, ou +10 % de points | Garde les moins bons dans la partie | S | Ressenti comme injuste par certains : option de l'hôte, désactivée par défaut |
| MEC6 | **Équipes** (2 à 4, couleurs d'équipe) : score = moyenne des membres | Idéal à 8 à 10 joueurs, intègre les timides | L | Touche le code commun (classement, médailles) : à spécifier soigneusement |
| MEC7 | **Réponse la plus rapide** mise en avant à chaque révélation (« ⚡ Léa en 1,8 s ») | Petit défi supplémentaire, sans changer les points | S | Aucun |

### 3.4 Interface et ambiance

| # | Idée | Intérêt | Effort | Risques / contraintes |
|---|---|---|---|---|
| AMB1 | **Écran de transition** entre les manches ou modes : « Question 5 : Cinéma », 2 s, grand titre qui glisse | Rythme télé, annonce la catégorie | S | Deux secondes de plus par question : à inclure dans l'échéance serveur |
| AMB2 | **Podium échelonné** : 3e, puis 2e, puis 1er (1 s d'écart), le son « podium » calé sur le 1er | Suspense et moment de gloire | S | Déjà la technique des cartes du bluff (`animationDelay`) |
| AMB3 | **Compteur de score animé** au classement (le chiffre monte), avec flèches ▲▼ de changement de rang | Lisibilité des dépassements | S | `requestAnimationFrame` sur 10 nombres : léger, à vérifier sur le stick |
| AMB4 | **Avatars émoji** : chaque joueur choisit un émoji à l'arrivée (liste de 30), affiché dans sa pastille | Personnalisation, reconnaissance rapide, aide les daltoniens (A2) | S à M | Dépend de la police émoji du stick (P6). Sinon, initiales |
| AMB5 | **Réglage du volume** par l'hôte (musique / sons / muet) depuis son téléphone | Le lobby peut agacer à la longue | S | Nouvel événement `hote:volume`, état commun dans la salle |
| AMB6 | **Thèmes saisonniers** (Noël, Halloween) : un `theme-noel.css` choisi par l'hôte | Effet « waouh » pour 0 logique | S | La règle « tout dans `theme.css` » le permet déjà |
| AMB7 | **Lobby vivant** : les règles du mode choisi défilent, avec un exemple de question | Aide les nouveaux joueurs pendant l'attente | S | Aucun |
| AMB8 | **Retour haptique** au téléphone (`navigator.vibrate(30)`) à l'appui et au résultat | Retour immédiat (TEL1), sans son sur le téléphone | S | Non supporté sur iOS : c'est un bonus Android seulement |

### 3.5 Fonctionnalités

| # | Idée | Intérêt | Effort | Risques / contraintes |
|---|---|---|---|---|
| F1 | **Tirage équilibré** : 10 questions dont environ 4 faciles, 4 moyennes, 2 difficiles, et au plus 2 par catégorie | Parties plus régulières, pas de « 3 questions de sport d'affilée » | S | Fonction pure testable dans `commun.js`, compatible avec `questionsVues` |
| F2 | **Choix du thème et de la difficulté** par l'hôte en salle d'attente (les champs existent) | Adapter au groupe (enfants, cinéphiles) | M | Un nouvel écran de réglage sur le téléphone de l'hôte, comme le format |
| F3 | **Questions créées par les joueurs** pour la soirée (Qui de nous, Le bluff sur les joueurs, 2 vérités), gardées en mémoire dans la salle | Très drôle entre amis, contenu infini | M | Modération : l'hôte valide ou supprime. Rien n'est sauvegardé : **perdu au redémarrage**, c'est cohérent avec le projet |
| F4 | **Statistiques de fin de partie** : le plus rapide, la meilleure série, la question la plus ratée, « l'éternel second » | Moments de rire, relance la partie suivante | S à M | Calculées au podium à partir de `etatMode`, par chaque mode |
| F5 | **Résumé de la soirée** au grand gagnant : parties jouées, médailles, faits marquants | Clôture de la soirée | S | En mémoire seulement. Un historique entre soirées exigerait un stockage (**base de données ou fichier : hors périmètre** actuel) |
| F6 | **Nombre de questions réglable** (5, 10 ou 15) | Parties courtes en fin de soirée | S | Paramètre de format commun à passer aux modes |
| F7 | **Mode spectateur** : une personne suit sans jouer (téléphone en lecture seule) | Invités de passage, enfants | M | Hors périmètre de la spec actuelle (« spectateurs ») : à revalider |
| F8 | **Multi-langue** | Soirées avec des non-francophones | **L** | Tout le contenu est à traduire (700 entrées), plus l'interface. Faible intérêt pour ton usage |
| F9 | **Questions avec image** (drapeaux, affiches floutées) | Variété visuelle | L | Poids sur le stick, droits d'auteur, hors périmètre actuel. Les drapeaux en SVG simple restent envisageables |

---

## 4. Priorisation

### 4.1 Tableau récapitulatif

Impact : 1 (faible) à 3 (fort). Priorité : **P1** = avant la prochaine soirée, **P2** = prochaines tranches, **P3** = plus tard ou si l'envie se présente.

| # | Titre | Catégorie | Impact | Effort | Priorité |
|---|---|---|---|---|---|
| R1 / T1 | Plantage du serveur sur un payload `null` | Robustesse / sécurité | 3 | S | **P1** |
| R2 | Double « Suivant » qui saute le podium ou la description | Robustesse | 3 | S | **P1** |
| R3 | Joueur fantôme (double « Entrer ») | Robustesse | 3 | S | **P1** |
| TEL2 | Désactiver « Entrer » après l'envoi | Téléphone | 2 | S | **P1** |
| H1 | Journal des événements et des erreurs | Hébergement | 3 | S | **P1** |
| TV1 | Textes TV sous 40 px | TV | 3 | M | **P1** |
| TV2 | Pastilles seules du bluff illisibles | TV / accessibilité | 2 | S | **P1** |
| TV3 / A4 | Joueur grisé trop transparent | TV / accessibilité | 2 | S | **P1** |
| H4 | Pas de push pendant une soirée | Hébergement | 3 | S | **P1** |
| H5 | Vérifier `URL_PUBLIQUE` sur Render | Hébergement | 3 | S | **P1** |
| R6 / H2 | Bandeau et écran « Connexion au serveur… » sur la TV | Robustesse / hébergement | 2 | S | P2 |
| R7 / H7 | Message clair après un redémarrage | Robustesse | 2 | S | P2 |
| R4 | Points globaux gardés en salle d'attente | Robustesse | 2 | S | P2 |
| TEL1 | Retour immédiat à l'appui | Téléphone | 3 | S | P2 |
| H3 | Vérifier la mise en veille pendant un long lobby | Hébergement | 2 | S | P2 |
| R5 | Salles orphelines d'un même socket TV | Robustesse | 1 (3 à la tranche 9) | S | P2, avant la tranche 9 |
| T2 | Clé secrète de reconnexion | Sécurité | 2 | S | P2 |
| TE1-TE4 | Tests des payloads, des non-hôtes, des doublons | Tests | 2 | S | P2 (avec R1-R3) |
| A2 / TV4 | Couleurs de joueurs et daltonisme | Accessibilité | 2 | S | P2 |
| C1 | Corriger 4 difficultés et 2 formulations | Contenu | 1 | S | P2 |
| F1 | Tirage équilibré | Fonctionnalité | 3 | S | P2 |
| AMB2 | Podium échelonné | Ambiance | 2 | S | P2 |
| F4 | Statistiques de fin de partie | Fonctionnalité | 3 | S à M | P2 |
| AMB1 | Écran de transition et catégorie | Ambiance | 2 | S | P2 |
| MEC7 | Réponse la plus rapide mise en avant | Mécanique | 2 | S | P2 |
| TEL3 | « Pas de réponse » au lieu de « Raté » | Téléphone | 1 | S | P2 |
| TEL4 | Champ d'Estimation non vidé | Téléphone | 1 | S | P2 |
| H6 | `/sante` plus bavard | Hébergement | 1 | S | P2 |
| C2 | +100 questions « pop et actuelles » | Contenu | 3 | M | P2 |
| C3 | Alerte « paires voisines » dans le script de vérification | Contenu | 1 | S | P3 |
| F2 | Choix du thème et de la difficulté | Fonctionnalité | 2 | M | P2 |
| M3 | Mode « La réplique » | Mode | 3 | S | P2 |
| M7 | Mode « Vrai ou faux éclair » | Mode | 2 | S | P2 |
| M2 | Mode « Dans l'ordre » | Mode | 2 | S à M | P3 |
| M1 | Mode « Le sondage » | Mode | 3 | M | P3 |
| M4 | Mode « Deux vérités, un mensonge » | Mode | 3 | M | P3 |
| M5 | Mode « Le mot interdit » | Mode | 3 | M | P3 |
| M6 | Mode « Dessine ! » | Mode | 3 | L | P3 |
| EV1 | Le bluff : « J'aime » et bluff sur les joueurs | Mode (évolution) | 2 | M | P3 |
| EV2 | Undercover : variante « L'intrus à la question » | Mode (évolution) | 2 | M | P3 |
| EV3 | Qui de nous : « Je vote pour moi » et paquets | Mode (évolution) | 2 | S à M | P3 |
| MEC1 | Séries de bonnes réponses | Mécanique | 2 | S | P3 |
| MEC2 | Jokers 50/50 et Double | Mécanique | 2 | M | P3 |
| MEC3 | Manches à thème | Mécanique | 2 | S | P3 |
| MEC4 | Question finale à pari | Mécanique | 2 | M | P3 |
| MEC5 | Rattrapage du dernier | Mécanique | 1 | S | P3 |
| MEC6 | Équipes | Mécanique | 3 | L | P3 |
| AMB3 | Compteur de score animé | Ambiance | 2 | S | P3 |
| AMB4 | Avatars émoji | Ambiance | 2 | S à M | P3 |
| AMB5 | Volume réglable par l'hôte | Ambiance | 2 | S | P3 |
| AMB6 | Thèmes saisonniers | Ambiance | 1 | S | P3 |
| AMB7 | Lobby vivant (règles qui défilent) | Ambiance | 1 | S | P3 |
| AMB8 | Vibration au téléphone | Ambiance | 1 | S | P3 |
| F3 | Questions créées par les joueurs | Fonctionnalité | 3 | M | P3 |
| F5 | Résumé de la soirée | Fonctionnalité | 2 | S | P3 |
| F6 | Nombre de questions réglable | Fonctionnalité | 2 | S | P3 |
| F7 | Mode spectateur | Fonctionnalité | 1 | M | P3 |
| F8 | Multi-langue | Fonctionnalité | 1 | L | P3 |
| F9 | Questions avec image | Fonctionnalité | 2 | L | P3 |
| T5 | Vue TV construite champ par champ | Sécurité | 1 | S | P3 |
| T6 | Nettoyer les caractères invisibles des pseudos | Sécurité | 1 | S | P3 |
| T8 | Limite de débit | Sécurité | 1 | S | P3 |
| T9 | Mister White repérable à la longueur du texte | Triche | 1 | S | P3 |
| R8 | Libérer le pseudo d'un joueur déconnecté | Robustesse | 1 | S | P3 |
| R9 | Undercover bloqué à 2 participants | Robustesse | 1 | S | P3 |
| R11 | « Passer au vote » si l'hôte est absent | Robustesse | 1 | S | P3 |
| L1 | Aides communes aux modes à 2 phases | Lisibilité | 2 | M | P3 |
| L2 | Affichage commun « attente de réponses » (TV) | Lisibilité | 1 | S | P3 |
| L3 | Doublons et espace global côté client | Lisibilité | 1 | M | P3 |
| L4 | `tv.css` par mode et liste « Ajouter un mode » | Lisibilité | 2 | S | P3 |
| L5 | Garde-fous morts et commentaires trompeurs | Lisibilité | 1 | S | P3 |
| L7 | `server/vues.js` | Lisibilité | 1 | S | P3 |
| E3-E7 | Mises à jour de la spec | Documentation | 1 | S | P3 |
| P2 | Mesurer la mémoire audio sur 30 min | Performance | 2 | S | P2 (pendant la tranche 9) |
| P3 / TV7 | Clignotement permanent et trop pâle | Performance / TV | 1 | S | P3 |
| P4 / P6 | Netteté du texte et émojis sur le stick | Performance | 2 | S | P2 (pendant la tranche 9) |
| TV6 | Textes au masculin | TV | 1 | S | P3 |
| TEL6 | Tableau de l'hôte sur petit écran | Téléphone | 1 | S | P3 |
| TEL9 | Wake Lock sur un vieil iOS | Téléphone | 1 | S | P3 |
| TE5-TE9 | Tests secondaires | Tests | 1 | S | P3 |

### 4.2 Les 5 corrections à faire avant la prochaine soirée

1. **R1 : empêcher le plantage du serveur** (`donnees ?? {}`, plus `try/catch` autour des gestionnaires, plus un test). C'est la seule faille qui peut, en une ligne, effacer toute la soirée de tout le monde. *Effort S.*
2. **R2 : double appui sur « Suivant »** (étape envoyée avec l'action, ou bouton grisé au clic). Sinon, le podium peut disparaître à la dernière question et un tour d'Undercover peut être sauté. *Effort S.*
3. **R3 + TEL2 : joueur fantôme** (refuser un 2e joueur sur le même socket, désactiver « Entrer »). Sinon, toutes les manches attendent le chrono complet jusqu'à la fin de la soirée. *Effort S.*
4. **H1 + H4 + H5 : pouvoir comprendre et ne pas provoquer une panne** (journal d'une ligne par événement, pas de push pendant la soirée, `URL_PUBLIQUE` vérifiée). *Effort S.*
5. **TV1 + TV2 + TV3 : lisibilité à 3 mètres** (40 px minimum partout, initiales dans les pastilles seules, grisé moins transparent). C'est la règle n°1 de la spec, et les écrans concernés (bluff, Même réponse, Undercover) sont ceux qu'on lit le plus longtemps. *Effort M.*

### 4.3 Les 5 améliorations au meilleur rapport impact / effort

1. **F1, tirage équilibré** (S, impact 3) : une fonction pure, et chaque partie de quiz devient plus régulière.
2. **TEL1, retour immédiat à l'appui** (S, impact 3) : le jeu paraît plus réactif en 4G, et cela évite les doubles appuis.
3. **F4, statistiques de fin de partie** (S à M, impact 3) : les « prix » (le plus rapide, l'éternel second) font rire et relancent la partie suivante.
4. **M3, mode « La réplique »** (S, impact 3) : un nouveau mode de rire pour presque rien, puisqu'il recycle 80 % du bluff.
5. **AMB2, podium échelonné** (S, impact 2) : le moment le plus attendu gagne son suspense, avec 10 lignes de JS et de CSS.

### 4.4 Feuille de route proposée

Prochaine tranche libre : **18**. Les tranches 9 (APK) et 10 (soirée test) restent au programme ; je propose de les placer après les corrections, pour que la soirée test porte sur une version fiable.

Ordre proposé : **18 → 19 → 20 → 9 → 10 → 21 → 22 → 23 → 24 → 25 → 26**.

| Tranche | Contenu | Test de fin concret |
|---|---|---|
| **18. Robustesse, 2e passe** | R1, R2, R3, TEL2, R5, R9, plus les tests TE1 à TE5 et TE7. | `npm test` passe avec les nouveaux tests. Sur Render : depuis la console d'un onglet joueur, `socket.emit('joueur:rejoindre', null)` → les autres joueurs continuent de jouer. Double appui très rapide sur « Suivant » à la 10e révélation → le podium reste affiché 15 s. Double appui sur « Entrer » puis changement de pseudo → la TV ne montre qu'un seul joueur, et la manche suivante se termine dès que tout le monde a répondu. |
| **19. Journal et hébergement** | H1, H6, R6 / H2 (écran et bandeau « Connexion… » sur la TV), R7 (message joueur après un redémarrage), H3 (mesure de la mise en veille), règle H4 dans `CLAUDE.md`. | Sur Render : lobby ouvert 20 min sans action, puis lancer une partie (sans cold start). Pendant une partie, déclencher un redéploiement manuel : la TV affiche « Connexion au serveur… » puis une nouvelle salle ; les téléphones affichent « Cette partie n'existe plus, scanne le nouveau QR code » avec un champ code vide ; les logs Render montrent l'enchaînement complet (arrivées, partie, redémarrage). |
| **20. Lisibilité TV et accessibilité** | TV1, TV2, TV3, TV4, A2, TV7, TV6. | TV à 3 m, 10 onglets `?dev` : une partie de bluff et une de Même réponse ; chaque texte est lisible depuis le canapé, y compris les piégés. Dans Chrome DevTools, « Emulate vision deficiencies : deuteranopia » : les 10 joueurs restent distinguables grâce aux initiales. Vérification automatique : aucune règle `font-size` sous 40 px dans `tv.css`, hors planche de sons. |
| **9. APK Android TV** (existante) | Telle que prévue, plus les mesures P2, P4 et P6 sur le stick. | Celui de la spec, plus : mémoire stable après 30 min de lobby avec musique (`chrome://inspect`), texte net, émojis de médaille visibles. |
| **10. Soirée test** (existante) | Telle que prévue. | Celui de la spec. Les retours réordonnent les tranches suivantes. |
| **21. Téléphone plus réactif** | TEL1, TEL3, TEL4, R4 (points globaux gardés en lobby, décision de spec), AMB8. | En 4G : un appui sur une réponse marque le bouton immédiatement. Une question sans réponse affiche « Pas de réponse ». Après une aventure, « Changer de format », puis verrouillage d'un téléphone 1 min : au déverrouillage, le joueur est toujours là avec ses points globaux. |
| **22. Tirage équilibré, thème et difficulté** | F1, F2, C1 (corrections de contenu), C3. | Test automatique : sur 1 000 tirages, jamais plus de 2 questions de la même catégorie ni plus de 3 difficiles. En salle d'attente, l'hôte choisit « Cinéma, facile » : 10 questions de cinéma de difficulté 1 ou 2, et le script de vérification signale les paires voisines. |
| **23. Mise en scène** | AMB1 (transition et catégorie), AMB2 (podium échelonné), AMB3 (compteur animé), MEC7, F4 (statistiques). | Partie à 4 sur la vraie TV : chaque question est précédée de sa catégorie ; le podium révèle 3e, 2e puis 1er ; l'écran de fin montre au moins 3 « prix » justes (vérifiés à la main sur la partie jouée) ; aucune saccade visible sur le stick. |
| **24. Contenu** | C2 : +100 questions pop et actuelles, relues à la main, plus une catégorie `maths-logique`. | `node scripts/verifier-questions.js` passe. 3 parties d'affilée sans répétition. Au moins 30 % des questions tirées datent d'après 2010 (vérifié sur le journal des tirages). |
| **25. Mode « La réplique »** (M3) | Mini-spec `docs/modes/replique.md`, puis code. | Défini dans la mini-spec, au minimum : partie à 4 sur Render, votes anonymes jusqu'à la révélation, impossible de voter pour sa propre réplique, points égaux au nombre de votes reçus × barème. |
| **26. Mode « Le sondage »** (M1) | Mini-spec, puis environ 60 questions de sondage, puis code. | Défini dans la mini-spec, au minimum : « Fraises » et « fraise » comptent comme la même réponse du tableau, les cases se retournent une par une sur la TV, et une réponse absente du tableau rapporte 0. |

Tranches suivantes, selon les retours de la soirée test : M7 (Vrai ou faux éclair), MEC1 et MEC2 (séries et jokers), F3 (questions des joueurs), T2 (clé de reconnexion), L1 à L4 (dette de lisibilité, à faire **avant** d'ajouter un 8e mode), puis M4, M5 et M6.
