# Tranche 33 — Le défi des enchères

Mini-spec de la tranche 33, premier des 8 nouveaux jeux (tranches 33 à 40, prioritaires). Choix validés par Paul le 06/10/2026 (voir « Choix validés » à la fin). Elle complète `docs/spec.md` et s'appuie sur le Blind test (`docs/modes/blind-test.md`) pour le rôle à part (l'arbitre) et le jeu à l'oral.

La TV affiche un défi (« En 1 minute, combien de départements français peux-tu citer ? »). Les joueurs surenchérissent avec un gros bouton « +1 ». Quand plus personne ne surenchérit, le dernier enchérisseur doit citer à voix haute autant de réponses qu'il l'a annoncé, pendant qu'un arbitre les compte sur son téléphone.

La tranche se code en **un seul temps** : serveur, écrans TV et téléphone, contenu, sons, doc et tests.


## Règles

- **3 à 10 joueurs** : le relevant, l'arbitre, et au moins un autre joueur.
- Une partie compte **8 manches** (5, 8 ou 12, option de l'hôte), un défi par manche, tiré au hasard sans répétition (`tirerQuestions` de `commun.js` : d'abord les défis jamais vus). S'il y a moins de défis que de manches, la partie est plus courte.
- **Enchères** :
  - La manche s'ouvre sur la **mise de départ** du défi (par exemple 5), attribuée à un joueur **tiré au sort** parmi les joueurs attendus et connectés. Il y a donc toujours un enchérisseur, même si personne n'appuie.
  - Chaque joueur attendu, sauf l'auteur de l'enchère en cours, peut appuyer sur **« +1 »** : l'enchère monte de 1 et il en devient l'auteur.
  - On ne peut pas surenchérir sur sa propre enchère : le bouton est grisé pour l'auteur.
  - **7 s sans surenchère** : l'enchère est adjugée, son auteur devient le **relevant**.
  - Enchère maximale : 99.
- **Arbitre** : à l'adjudication, le serveur tire l'arbitre parmi les joueurs attendus connectés, sauf le relevant. Le moins souvent arbitre de la partie d'abord, au hasard entre ex æquo. L'arbitre peut avoir enchéri pendant la manche : il ne connaît pas son rôle avant l'adjudication.
- **Annonce** (5 s) : la TV annonce « Léa doit citer 12 départements français ! Arbitre : Sam ». Le relevant se prépare, l'arbitre prend son téléphone.
- **Défi** (60 s, fixe) : le relevant cite ses réponses à voix haute. L'arbitre compte les bonnes avec **▲** (+1) et **▼** (−1, pour corriger) ; le compteur ne descend pas sous 0. La TV affiche le compteur en direct. L'arbitre juge seul ce qui compte (doublons, réponses douteuses), comme le maître du Blind test.
- **Fin du défi** :
  - dès que le compteur **atteint l'enchère** : « Défi relevé ! », révélation immédiate ;
  - à la fin des 60 s sans l'atteindre : « Raté ! ».
- **Révélation** (10 s, l'hôte peut passer plus tôt avec « Suivant ») : le résultat et le classement. Puis manche suivante, et après la dernière : podium commun, médailles et points globaux.

### Points

| Situation | Points |
|---|---|
| Défi relevé | Le relevant marque **autant de points que son enchère** (enchère de 12 → +12) |
| Défi raté | **+1** pour chaque autre joueur de la manche, sauf l'arbitre |
| Arbitre | 0 dans tous les cas (il aurait intérêt à mal compter) |

- « Les autres joueurs de la manche » : les joueurs attendus au début de la manche, sauf le relevant et l'arbitre, connectés ou non.
- Classement avec ex æquo comme partout (1, 1, 3).
- Les points sont ajoutés à la révélation : si l'hôte termine pendant une manche, elle n'est pas comptée.


## Phases et chronos

`etatMode.phase` vaut `encheres`, `annonce`, `defi` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `encheres` | 7 s après la dernière enchère (le chrono repart à chaque « +1 ») | Fin du chrono : adjudication, tirage de l'arbitre → `annonce` |
| `annonce` | 5 s | Fin du chrono → `defi` |
| `defi` | 60 s | Compteur = enchère (relevé), ou fin du chrono (raté) → `revelation` |
| `revelation` | 10 s | Fin du chrono ou « Suivant » de l'hôte : manche suivante, ou podium |

Une manche dure environ 1 min 30. Une partie de 8 manches dure une douzaine de minutes.

Le chrono des enchères n'a rien de nouveau : `echeance` vaut `debutPhaseA + 7 s`, et chaque « +1 » remet `debutPhaseA` à l'heure du serveur. Le minuteur de `salles.js` est réarmé à chaque changement d'état.


## `etatMode` sur le serveur

```json
{
  "phase": "defi",
  "questions": ["...8 défis tirés..."],
  "indexQuestion": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_4d2e9f", "j_8f3k2a", "j_1b9c7d", "j_7a1c3e"],
  "enchere": 12,
  "auteur": "j_8f3k2a",
  "arbitre": "j_1b9c7d",
  "compteur": 7,
  "arbitrages": { "j_1b9c7d": 1, "j_4d2e9f": 1 }
}
```

- Une « question » est ici un défi du catalogue. Mêmes noms que les autres modes pour réutiliser `questionCourante`, `questionSuivanteOuPodium`, `echeanceDePhase`, `tempsRestantMs`, `listerAttendus` et `participe`.
- `auteur` : l'auteur de l'enchère en cours, puis le relevant une fois adjugée.
- `arbitre` : `null` pendant `encheres`.
- `arbitrages` : combien de fois chaque joueur a été arbitre dans la partie, pour faire tourner le rôle.
- Le résultat (relevé ou raté) n'est pas stocké : `compteur >= enchere` le donne. Les points sont calculés par une fonction pure `pointsDeLaManche(etatMode, joueurId)`.


## Événements

Aucun nouvel événement : tout passe par `joueur:repondre`.

| Événement | Contenu au Défi des enchères |
|---|---|
| `joueur:repondre` (enchère) | En `encheres` : `{ encherir: n }`, où `n` doit valoir l'enchère en cours + 1. Refusé si le joueur n'est pas attendu, s'il est l'auteur de l'enchère en cours, si `n` ne vaut pas enchère + 1 (deux joueurs qui appuient en même temps : seul le premier arrivé passe, l'autre voit la nouvelle enchère et peut réappuyer), ou si `n` dépasse 99 |
| `joueur:repondre` (arbitre) | En `defi` : `{ compter: 1 }` ou `{ compter: -1 }`, de l'arbitre seulement. Le compteur ne descend pas sous 0. Refusé hors `defi` ou d'un autre joueur |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:reglerMode` | En salle d'attente : `{ longueur: 5 \| 8 \| 12 }` (pas de réglage de temps : le défi dure toujours 1 min) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

Envoyer la valeur attendue (`encherir: 13`) plutôt qu'un simple « +1 » évite qu'un double appui simultané fasse monter l'enchère de 2 sans que personne l'ait voulu.


## Le secret

Rien n'est caché dans ce mode : le défi, les enchères et le compteur sont publics. Les réponses du relevant sont dites à voix haute et ne passent jamais par le serveur.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `encheres` | `phase`, `numero`, `total`, `defi: { sujet, texte }` (`texte` : la phrase complète, avec « de » ou « d' » selon le sujet), `enchere`, `auteur` (id), `tempsRestantMs` (des 7 s) |
| `annonce` | Idem, plus `arbitre` (id) |
| `defi` | Idem, plus `compteur` et le `tempsRestantMs` du défi |
| `revelation` | Idem, plus `releve` (booléen) et `classement` (avec les points de la manche) |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Pour qui | Données |
|---|---|---|
| `encheres` | Joueurs attendus | `numero`, `total`, `defi`, `enchere`, `auteur` (pseudo), `estAuteur`, `enchereMax` (99), `tempsRestantMs` |
| `releve` | Le relevant (`annonce` et `defi`) | `defi`, `enchere`, `compteur`, `arbitre` (pseudo), `phase`, `tempsRestantMs` |
| `arbitre` | L'arbitre (`annonce` et `defi`) | `defi`, `enchere`, `compteur`, `releveur` (pseudo), `phase`, `tempsRestantMs` |
| `ecouter_defi` | Les autres (`annonce` et `defi`) | `defi`, `enchere`, `compteur`, `releveur`, `arbitre` (pseudos), `phase`, `tempsRestantMs` |
| `resultat` | Tous | `releve`, `enchere`, `releveur`, `role` (`releveur`, `arbitre` ou `joueur`), `points`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche | Comme au quiz |


## Écrans

### TV (1920×1080)

- **Enchères** : « Manche 3/8 », le défi en grand (« En 1 minute, combien de **départements français** peux-tu citer ? »). Au centre, l'enchère en très grand (« 12 ») avec la pastille et le pseudo de son auteur ; à chaque surenchère, le nombre grossit brièvement (déplacement et échelle, pas de flou). En dessous, une jauge de 7 s qui se vide et repart à chaque « +1 ». Petit QR code.
- **Annonce** : « Adjugé ! », « Léa doit citer **12** départements français », « Arbitre : Sam » avec les deux pastilles.
- **Défi** : le sujet en haut, le compteur en très grand (« 7 / 12 ») avec une barre de progression, le chrono de 60 s, « Arbitre : Sam ».
- **Révélation** : « Défi relevé ! Léa +12 », ou « Raté ! +1 pour tous les autres (sauf l'arbitre) », le compteur final, puis le classement.

### Téléphone (portrait)

- **Enchères** : le défi, « Enchère : 12 (Léa) », et un **gros bouton « +1 → 13 »** qui occupe le bas de l'écran. Pour l'auteur de l'enchère : bouton grisé, « Tu as la main ! ». Un appui marque le bouton tout de suite (et vibre sur Android), comme les réponses du quiz.
- **Relevant** : « À toi ! Cite 12 départements français à voix haute », le compteur en direct, « Arbitre : Sam ». Pendant l'annonce : « Prépare-toi… ».
- **Arbitre** : « Tu es l'arbitre : compte les bonnes réponses de Léa », le compteur et l'objectif (« 7 / 12 »), deux très grands boutons **▲** et **▼** (▲ bien plus grand). Pendant l'annonce, les boutons sont visibles mais inactifs.
- **Autres** : « Écoute Léa et vérifie ! », le compteur en direct.
- **Résultat** : « Défi relevé ! +12 », « Raté… +1 pour toi », « Tu étais l'arbitre » ; score et rang ; « Suivant » pour l'hôte.


## Sons

| Moment | Détection | Son |
|---|---|---|
| Nouvelle manche | `nouvelleEtape` en phase `encheres` | `etape` |
| Surenchère | `enchere` augmente pendant `encheres` | `reponse` |
| Adjudication | `nouvelleEtape` en phase `annonce` | `lancement` |
| Compteur +1 | `compteur` augmente pendant `defi` | `reponse` |
| Révélation | `nouvelleEtape` en phase `revelation` | `victoire` si relevé, `rate` sinon |
| Tic-tac, podium | Communs (`tv.js`) | Inchangés |

Rien ne change dans `sons.js`. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.


## Cas limites

| Situation | Comportement |
|---|---|
| Personne n'appuie sur « +1 » | Au bout de 7 s, le joueur tiré au sort relève le défi à la mise de départ. |
| L'auteur de l'enchère se déconnecte pendant les enchères | Rien ne change : il reste l'auteur et peut être adjugé (le défi se joue à voix haute, pas sur le téléphone). |
| Le relevant se déconnecte pendant l'annonce ou le défi | Le défi continue : son téléphone ne sert à rien pendant qu'il parle. |
| L'arbitre se déconnecte pendant l'annonce ou le défi | Le serveur tire un nouvel arbitre (même règle) parmi les attendus connectés, sauf le relevant ; le compteur est gardé. S'il n'y a plus personne : le compteur est figé, et le serveur réessaie à chaque déconnexion ou action suivante. |
| Adjudication sans arbitre possible (le relevant est le seul connecté) | Pas d'arbitre : le défi se joue quand même, le compteur reste à 0, donc « Raté ! ». |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante (enchères, arbitrage). |
| Moins de 3 joueurs connectés en cours de partie | La partie continue. « Rejouer » est désactivé tant que le compte n'y est pas. |
| L'hôte termine pendant une manche | Podium avec les scores actuels, la manche en cours n'est pas comptée. |
| Plus assez de défis inédits | On réautorise les plus anciens, comme au quiz. |


## Contenu

### Catalogue `data/defi-encheres.json`

```json
{ "id": "de-departements", "sujet": "départements français", "miseDepart": 5 }
```

- `id` : `de-` suivi de minuscules, chiffres et tirets, unique (préfixe propre au mode dans `questionsVues`, commune à tous les modes).
- `sujet` : ce qui complète « En 1 minute, combien de … peux-tu citer ? ». Au pluriel, sans majuscule initiale (sauf nom propre), sans article : « départements français », « rappeurs français », « films de Disney ».
- `miseDepart` : entier de 1 à 20, l'enchère d'ouverture, choisie selon la difficulté du sujet (assez basse pour qu'elle soit facile à relever).
- Une **trentaine de défis variés**, rédigés par Claude et relus par Paul : géographie, musique, cinéma et séries, sport, marques, cuisine, vie quotidienne… Des sujets où l'arbitre peut juger facilement (« capitales européennes » plutôt que « mots en -tion »).

### Script `scripts/verifier-defi-encheres.js`

- `id` au format `de-…`, unique ; seuls les champs `id`, `sujet`, `miseDepart` ;
- `sujet` : chaîne non vide, sans espace au bord, ne commençant pas par un article (« les », « des »…) ;
- `miseDepart` : entier de 1 à 20 ;
- pas deux sujets identiques (sans accents ni majuscules) ;
- au moins 12 défis (une partie de 12 manches) ;
- affichage : le nombre de défis.


## Tests automatiques

- Le registre contient `defi-encheres` avec tout le contrat ; refusé à 2 joueurs, accepté à 3.
- `hote:reglerMode` : 5, 8 et 12 acceptés, autre valeur refusée.
- Ouverture : enchère = mise de départ, auteur parmi les attendus connectés.
- Enchères : `+1` accepté (enchère et auteur mis à jour, chrono relancé) ; refusé de l'auteur, d'un joueur non attendu, avec une valeur qui n'est pas enchère + 1, au-delà de 99, hors `encheres`.
- Adjudication après 7 s sans surenchère ; arbitre différent du relevant, le moins souvent arbitre d'abord.
- Défi : `compter` refusé d'un autre joueur que l'arbitre et hors `defi` ; compteur jamais négatif ; relevé dès que le compteur atteint l'enchère ; raté à la fin des 60 s.
- Points : relevé → enchère au relevant, rien aux autres ; raté → +1 à chaque autre attendu sauf l'arbitre, 0 au relevant et à l'arbitre.
- Arbitre déconnecté pendant le défi : remplacé, compteur gardé ; personne pour le remplacer : compteur figé.
- Chronos : 7 s → `annonce`, 5 s → `defi`, 60 s → `revelation`, 10 s → manche suivante, podium après la dernière.
- Tirage : défis distincts, moins de défis que de manches.
- `verifier-defi-encheres.js` : id en double ou mal formé, champ en trop, sujet vide ou avec article, mise hors bornes, sujet en double ; le vrai catalogue passe.


## Modifications à reporter

- `server/modes/defi-encheres.js` et ses tests ; `server/modes/index.js` : le mode entre dans le registre.
- `public/tv/index.html`, `public/tv/modes/defi-encheres.js` et `.css` ; `public/joueur/index.html`, `public/joueur/modes/defi-encheres.js`, styles dans `joueur.css`.
- `data/defi-encheres.json`, `scripts/verifier-defi-encheres.js` et ses tests.
- `docs/sons.md` : les lignes du mode. `docs/spec.md` : « Modes de jeu supplémentaires », tableau des options, tranche 33. `CLAUDE.md` : structure et commandes. `admin.html` : la fiche du mode (liste `JEUX`).


## Test de la tranche (à faire toi-même)

Sur Render (les téléphones ne joignent pas le serveur local depuis le PC d'entreprise), TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev`.

1. **Choix.** À 2 joueurs, « Le défi des enchères » est grisé ; à 3, il s'active. Options : 5, 8 ou 12 manches, et pas de « Temps pour répondre ».
2. **Enchères.** Lancer. La TV affiche le défi, la mise de départ en grand et son auteur (tiré au sort), la jauge de 7 s. L'auteur voit son bouton grisé « Tu as la main » ; les autres « +1 → 6 ». Un « +1 » fait grossir l'enchère sur la TV (son `reponse`) et relance la jauge.
3. **Appui simultané.** Deux téléphones appuient en même temps : l'enchère ne monte que de 1.
4. **Adjudication.** Plus personne n'appuie : au bout de 7 s, « Adjugé ! », le relevant et l'arbitre (pas le relevant). Le relevant voit « Prépare-toi », l'arbitre ses flèches inactives.
5. **Défi relevé.** L'arbitre appuie sur ▲ jusqu'à l'enchère : le compteur monte en direct sur la TV, et « Défi relevé ! » arrive aussitôt, le relevant marque son enchère.
6. **Défi raté.** Manche suivante : l'arbitre compte moins que l'enchère (▼ corrige une erreur), on laisse finir la minute : « Raté ! », +1 pour chacun sauf le relevant et l'arbitre.
7. **Rotation.** Sur plusieurs manches, l'arbitre change.
8. **Arbitre parti.** Pendant un défi, couper l'arbitre (« Couper 15 s ») : un autre joueur devient arbitre, le compteur est gardé.
9. **Fin.** Après la dernière manche (ou « Terminer »), podium, médailles et points globaux comme d'habitude.


## Choix validés

Proposés par Claude, validés par Paul le 06/10/2026 :

1. **Points** : relevé → le relevant marque son enchère ; raté → +1 pour chaque autre joueur de la manche.
2. **Ouverture** : un joueur tiré au sort ouvre à la mise de départ du défi, pour qu'il y ait toujours un enchérisseur.
3. **Arbitre** : tiré au sort parmi les autres, différent à chaque manche autant que possible ; il ne marque rien pendant sa manche. D'où **3 joueurs minimum**.
4. **Relevé immédiat** dès que le compteur atteint l'enchère.
5. **Pas de surenchère sur sa propre enchère.**
6. **Longueur** : 5, 8 ou 12 manches (8 par défaut) ; le défi dure toujours 1 min.

Précisés par la mini-spec (à valider avec elle) :

7. **Annonce de 5 s** entre l'adjudication et le défi, pour que le relevant se prépare et que l'arbitre prenne son téléphone.
8. **Révélation de 10 s**, l'hôte peut passer plus tôt.
9. **Enchère envoyée avec sa valeur** (`encherir: 13`) : deux appuis simultanés ne font monter que de 1.
10. **Enchère maximale de 99**, mise de départ de 1 à 20 selon le défi.
11. **Arbitre remplacé** s'il se déconnecte pendant le défi.
