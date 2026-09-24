# Tranche 12 — Qui de nous ?

Mini-spec de la tranche 12. Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes de la tranche 11 (`docs/modes/estimation.md`). Elle a été validée le 24/09/2026.

La tranche se code en deux temps, chacun testé avant de passer au suivant :

1. **Contenu** : `data/qui-de-nous.json`, son script de vérification et ses tests. Paul peut relire les questions pendant que le mode se code.
2. **Mode Qui de nous ?** : le mode côté serveur, ses écrans TV et téléphone, ses tests. Il quitte `modesAVenir` pour entrer dans le registre.

## Règles

- Une partie compte **10 questions**, toutes du type « Qui de nous est le plus susceptible de rater son avion ? ».
- Chaque joueur a **20 s** pour voter pour un joueur, en un seul vote définitif (un appui, comme au quiz). La rapidité ne rapporte rien.
- **Candidats** : les joueurs attendus de la manche, c'est-à-dire connectés au début de la question (même règle que `attendus`). La liste est figée pour toute la manche.
- **Voter pour soi est interdit**, sauf si l'on est le seul candidat (cas `MODE_DEV` à 1 joueur). Le téléphone n'affiche pas son propre pseudo, et le serveur refuse ce vote.
- **Élu(s)** : le ou les candidats qui ont reçu le plus de votes, avec au moins 1 vote. En cas d'égalité en tête, tous les ex æquo sont élus ensemble (« Paul et Léa ! »), sans départage.
- **Points** : on marque **1000 points** si l'on a voté pour un élu, c'est-à-dire « comme le groupe ». Être désigné ne rapporte rien et ne coûte rien. Pas de vote ou vote pour un non-élu : 0 point.

  Exemple à 5 joueurs : votes Paul 3, Léa 2 → Paul est élu, ses 3 votants marquent 1000. Votes Paul 2, Léa 2, Sam 1 → Paul et Léa sont élus, leurs 4 votants marquent 1000.

  Alternative écartée pour l'instant : pas de points du tout, podium remplacé par un palmarès des titres. Elle oblige à écrire un podium entièrement propre au mode, sans classement.
- Si tout le monde a reçu le même nombre de votes (par exemple 4 joueurs, 1 vote chacun), tous sont élus et tous les votants marquent. C'est rare et on l'accepte pour garder la règle simple.
- Fin anticipée : identique au quiz (joueurs attendus encore connectés qui ont tous voté).
- Classement général par score total, avec les ex æquo du quiz.

### Anonymat

**Le vote est anonyme** : la TV montre combien de votes chaque joueur a reçus, jamais qui a voté pour qui. C'est ce qui permet de voter franchement sans froisser personne.

Seul le serveur connaît les votes individuels. Chaque téléphone ne connaît que son propre vote.

L'anonymat protège ceux qui n'ont pas voté comme le groupe : aux résultats, le classement général montre les points gagnés (« +1000 »), donc qui a voté pour un élu. C'est voulu (validé le 24/09/2026).

## Phases et chronos

`etatMode.phase` vaut `vote` ou `resultats`.

| Phase | Durée | Fin |
|---|---|---|
| `vote` | 20 s | Tous les attendus ont voté, ou fin du chrono |
| `resultats` | 12 s | Fin du chrono ou « Suivant » de l'hôte. Après la 10e : podium |

Les résultats durent un peu plus qu'à l'Estimation : c'est le moment où l'on rit et où l'on se défend. L'hôte peut toujours enchaîner avec « Suivant ».

## `etatMode` sur le serveur

```json
{
  "phase": "vote",
  "questions": ["...10 questions tirées..."],
  "indexQuestion": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d", "j_4d2e9f", "j_7a1c3b"],
  "reponses": { "j_8f3k2a": { "vote": "j_1b9c7d", "recuA": 1758641195300 } },
  "votesRecus": { "j_1b9c7d": 7, "j_4d2e9f": 3 }
}
```

- `attendus` sert aussi de liste des candidats : pas de nouveau champ.
- `reponses` garde ce nom pour réutiliser `tousOntRepondu` de `commun.js`.
- `votesRecus` cumule les votes reçus sur toute la partie, ajoutés aux résultats comme les points. Il sert uniquement au podium.

## Événements

Aucun nouvel événement : on réutilise ceux du quiz.

| Événement | Contenu en Qui de nous ? |
|---|---|
| `joueur:repondre` | L'`id` du joueur choisi (chaîne). Refusé si ce n'est pas un candidat de la manche, si c'est soi-même (sauf seul candidat), si ce n'est pas la phase `vote`, si le votant n'est pas attendu ou a déjà voté. |
| `hote:suivant` | Pendant les résultats : passe à la question suivante (ou au podium) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `vote` | `phase`, `numero`, `total`, `question: { texte }`, `ontVote` (liste d'`id`), `tempsRestantMs` |
| `resultats` | Idem, plus `resultats: [{ id, votes }]` (tous les candidats, triés par votes décroissants), `elus` (liste d'`id`, vide si aucun vote), `nombreVotes`, puis `classement` |
| podium | `classement`, `plusDesignes: [{ id, votes }]` |

**Jamais**, à aucun moment : qui a voté pour qui. **Jamais pendant le vote** : le décompte, même partiel. Sinon on pourrait suivre les votes arriver un par un et deviner qui a voté quoi.

## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Données |
|---|---|
| `voter` | `numero`, `candidats: [{ id, pseudo, couleur, connecte }]` sans soi-même (sauf seul candidat). Le texte de la question est sur la TV. |
| `vote_envoye` | Le pseudo et la couleur du joueur choisi |
| `resultat` | Son vote (ou rien), `elus` (pseudos), `commeLeGroupe` (booléen), ses points, `votesRecus` (le nombre de votes qu'il a reçus à cette question), son rang général. Pour l'hôte : « Suivant » |
| `attente_question`, `fin` | Comme au quiz |

**Jamais** : le vote d'un autre joueur, ni pendant ni après.

## Écrans

| Où | Écran | Contenu |
|---|---|---|
| TV | Vote | « Question 3/10 », « Qui de nous… » et la question en très gros, chrono, pastilles des joueurs ayant voté, petit QR code |
| TV | Résultats | L'élu (ou les élus) en très gros avec sa pastille : « Paul ! ». Dessous, une barre horizontale par candidat, triée par votes : pastille, pseudo, barre proportionnelle, nombre de votes. Les candidats à 0 vote en bas, barre vide. « Personne n'a voté » s'il n'y a aucun vote. Classement général à droite, avec les points gagnés à cette question |
| TV | Podium | Le podium commun, plus une ligne sous le titre : « Le plus désigné de la partie : Paul (7 votes) », ou « Les plus désignés… » en cas d'égalité. Le podium rétrécit un peu pour qu'un classement de 10 joueurs tienne |
| Téléphone | Voter | Une grille de gros boutons, un par candidat : pastille de couleur + pseudo. Un joueur déconnecté reste votable, son bouton est simplement estompé. Un appui = vote définitif |
| Téléphone | Vote envoyé | « Tu as voté pour Paul, regarde la TV » |
| Téléphone | Résultat | « Comme le groupe, +1000 » ou « Pas comme le groupe » ou « Pas de vote ». Puis « Élu : Paul », « Tu as reçu 2 votes », rang général |

Le podium de la TV est aujourd'hui entièrement commun (`afficherPodium` dans `tv.js`). Pour afficher « Le plus désigné », `public/tv/modes/qui-de-nous.js` fournit une fonction facultative `completerPodium(salle)`, appelée par `tv.js` si elle existe. Les autres modes n'en ont pas : leur podium ne change pas.

Contraintes du Mi TV Stick : les barres des résultats grandissent par `transform: scaleX` (pas d'animation de `width`), apparition par opacité et déplacement, pas de flou.

## Contenu

**Fichier `data/qui-de-nous.json`** : **120 questions**, soit 12 parties sans répétition. Générées par Claude, relues par Paul.

```json
{
  "id": "n0001",
  "texte": "Qui de nous est le plus susceptible de rater son avion ?"
}
```

- Préfixe d'id : **`n`**, pour « nous ». `q` (quiz), `e` (estimation) et `u` (réservé à Undercover) sont déjà pris.
- Pas de `categorie` ni de `difficulte` : elles n'ont pas de sens ici, et le tirage se fait au hasard comme pour les autres modes.

Règles de rédaction :

- Toujours la forme complète « Qui de nous… ? » : la TV l'affiche telle quelle.
- Taquin mais jamais blessant : pas de physique, de poids, de santé, d'argent, de religion, de politique, de sexualité. Entre amis adultes, sans gêner un invité qu'on connaît peu.
- Variété : voyages, cuisine, travail, fêtes, téléphone, sport, maladresses, super-pouvoirs, survie…
- Questions courtes : lisibles d'un coup d'œil à 3 mètres (même limite de longueur que le quiz).

**Script `scripts/verifier-qui-de-nous.js`**, sur le modèle de `verifier-estimation.js` :

- seuls les champs `id` et `texte` ;
- `id` au format `n` + 4 chiffres, unique ;
- `texte` non vide, commence par « Qui de nous », finit par « ? », longueur maximale `LONGUEUR_MAX_TEXTE` du quiz ;
- pas deux textes identiques ;
- nombre total de questions affiché.

Le tirage réutilise `tirerQuestions` et `noterQuestionsVues` de `commun.js` : `questionsVues` reste une seule liste pour la salle.

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant le vote | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. S'il n'a pas voté : pas de vote, 0 point. Il reste candidat. |
| Vote pour un joueur déconnecté | Accepté : il reste candidat pour toute la manche, et il peut être élu. |
| Joueur qui revient pendant la même question | S'il avait voté : « Vote envoyé » avec son choix. Sinon, s'il était attendu : il peut encore voter. S'il n'était pas attendu : attente de la question suivante. |
| Arrivée en cours de partie | 0 point, ni votant ni candidat pour la question en cours. Joue à partir de la question suivante (comme au quiz). |
| Moins de 4 joueurs connectés en cours de partie | La partie continue. Seul « Rejouer » est désactivé tant que le compte n'y est pas (ou l'hôte choisit un autre mode). |
| Un seul candidat (tous les autres étaient déconnectés au début de la manche, ou `MODE_DEV` à 1 joueur) | Il peut voter pour lui-même, pour que la manche reste jouable. |
| Aucun vote à une question | Résultats normaux : « Personne n'a voté », aucun élu, personne ne marque. |
| Vote invalide (id inconnu, soi-même, joueur arrivé en cours de manche, pas une chaîne) | Le serveur l'ignore et le joueur reste sur « Voter ». |
| L'hôte termine pendant un vote ou des résultats | Podium avec les scores actuels. La question en cours n'est pas comptée (points et `votesRecus` ne sont ajoutés qu'aux résultats). |
| Plus assez de questions inédites | On réautorise les plus anciennes, comme au quiz. |

## Modifications à reporter

Une fois les choix validés :

- `server/modes/index.js` : `qui-de-nous` sort de `modesAVenir` et entre dans le registre, sous la clé `'qui-de-nous'` (l'`id` contient un tiret).
- `docs/spec.md`, « Modes de jeu supplémentaires » : « (disponible, voir `docs/modes/qui-de-nous.md`) », comme pour l'Estimation.
- `CLAUDE.md`, structure : `server/modes/qui-de-nous.js`, `data/qui-de-nous.json`, `scripts/verifier-qui-de-nous.js`, et la commande `node scripts/verifier-qui-de-nous.js`.

## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Contenu (temps 1)** :

- `verifier-qui-de-nous.js` : détecte un id en double, un id au mauvais préfixe, un texte qui ne commence pas par « Qui de nous », un texte sans « ? », un champ en trop, deux textes identiques ;
- le vrai fichier `data/qui-de-nous.json` passe la vérification.

**Mode (temps 2)** :

- le registre contient `qui-de-nous` avec tout le contrat, et il n'est plus dans `modesAVenir` ;
- `hote:choisirMode` refuse Qui de nous ? à 3 joueurs, l'accepte à 4 ;
- élus et points : un élu net, deux ex æquo en tête (leurs votants marquent tous), aucun vote (aucun élu, 0 point), un joueur sans vote (0 point) ;
- validation de `joueur:repondre` : vote pour soi (refusé, sauf seul candidat), id inconnu, joueur arrivé en cours de manche, pas une chaîne, deuxième vote, votant non attendu, hors phase `vote` ; vote pour un candidat déconnecté accepté ;
- fin anticipée quand tous ont voté, et après la déconnexion du dernier attendu ;
- chronos : résultats à 20 s, question suivante 12 s après, podium après la 10e ;
- secret : `vueTv` en phase `vote` ne contient aucun décompte ; `vueTv` ne contient jamais de lien votant → vote, dans aucune phase ; `vueJoueur` ne contient jamais le vote d'un autre joueur ;
- `votesRecus` : cumulé aux résultats seulement, pas compté si l'hôte termine pendant un vote ;
- `questionsVues` : les `id` `n…` cohabitent avec `q…` et `e…`, pas de répétition sur 3 parties.

## Test de la tranche (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080, joueurs sur de vrais téléphones et des onglets `?dev` (il en faut 4).

1. **Choix du mode.** Rejoindre à 3 : Qui de nous ? est grisé (« 4 joueurs min. »), sans « Bientôt ». Un 4e joueur arrive : il devient actif. L'hôte le choisit : la TV affiche « Qui de nous ? » et sa règle.
2. **Vote.** Lancer. Sur chaque téléphone, son propre pseudo n'apparaît pas dans les candidats. Pendant le vote, la TV montre qui a voté, jamais pour qui ni combien.
3. **Résultats.** Faire voter 2 joueurs pour le même : il est élu, ses 2 votants marquent 1000, les autres rien. Sur une autre question, créer une égalité 2-2 : deux élus, les 4 votants marquent. Nulle part on ne voit qui a voté pour qui.
4. **Déconnexion.** Couper un joueur pendant un vote (bouton `?dev` « Couper 15 s ») : les autres peuvent encore voter pour lui, et la manche se termine dès qu'ils ont tous voté.
5. **Arrêt et podium.** L'hôte termine à la 4e question : podium (avec « Le plus désigné » si retenu). Avec 3 joueurs connectés, « Rejouer » est désactivé en Qui de nous ?. L'hôte choisit Quiz : « Rejouer » lance un quiz qui marche comme avant.
