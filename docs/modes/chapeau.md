# Tranche 36 — Le chapeau

Mini-spec de la tranche 36, quatrième des 8 nouveaux jeux (tranches 33 à 40, prioritaires). Écrite le 01/11/2026 ; Paul a demandé de faire toutes les étapes d'un coup : les choix ci-dessous sont ceux de Claude (voir « Choix faits » à la fin), à revoir après son test. Elle complète `docs/spec.md`.

La demande s'appelait « Time's Up », qui est le nom déposé d'un jeu du commerce. Le mode reprend le jeu de soirée traditionnel dont il s'inspire, le **jeu du chapeau** : chacun met des mots dans un chapeau, deux équipes les font deviner en trois manches, avec les mêmes mots à chaque manche.

1. **Manche 1, décris** : tout est permis sauf le mot lui-même (et ses dérivés).
2. **Manche 2, un seul mot** : un seul mot d'indice par mot à deviner.
3. **Manche 3, mime** : sans un bruit.


## Règles

- **4 à 10 joueurs**, en **deux équipes** tirées au sort au lancement parmi les joueurs connectés : les Rouges et les Bleus, une de plus d'un côté si le nombre est impair. Les équipes restent les mêmes pendant toute la partie.
- **Les mots** (option de l'hôte) : **écrits par les joueurs** (par défaut) ou **tous au hasard**, tirés de `data/chapeau.json`.
  - Écrits : phase de **saisie** (90 s). Chacun écrit **3 mots** (un nom, une célébrité, un objet, un film…), 1 à 30 caractères chacun, ou touche « Piocher au hasard ». Il peut changer ses mots jusqu'à la fin de la saisie. La saisie s'arrête quand tous les joueurs connectés ont donné leurs 3 mots, ou au bout de 90 s. Ceux qui n'ont rien donné reçoivent des mots au hasard.
  - Deux mots identiques (même clé que Même réponse : accents, majuscules, article et pluriel ignorés) : le doublon est remplacé par un mot au hasard.
  - Au hasard : pas de saisie, 3 mots par joueur tirés du catalogue, sans répétition, les jamais vus d'abord.
- **Le chapeau** : tous les mots, mélangés au début de chaque manche.
- **Les tours** : les équipes alternent (Rouge, Bleu, Rouge…), et dans chaque équipe les joueurs passent chacun leur tour, dans l'ordre tiré au lancement. L'ordre continue d'une manche à l'autre : on ne repart pas du premier joueur.
- **Préparation** (sans chrono) : « Au tour de Léa (Rouges) ! » sur la TV et les téléphones. Léa appuie sur **« C'est parti ! »**.
- **Jeu** (**30 s**, ou 45 ou 60 s, option de l'hôte) : le téléphone de Léa montre un mot du chapeau. Ses coéquipiers crient leurs propositions.
  - **« Trouvé ! »** : +1 point pour l'équipe, le mot sort du chapeau pour cette manche, mot suivant.
  - **« Passer »** : le mot retourne au fond du chapeau, mot suivant. Pas de pénalité.
  - Fin du chrono : le mot en cours reste dans le chapeau, en haut.
  - C'est Léa qui juge : l'équipe adverse voit le mot sur ses téléphones et peut protester à voix haute (jeu entre amis, comme le vrai jeu du chapeau).
- **Bilan du tour** (6 s, l'hôte peut passer plus tôt) : les mots trouvés pendant le tour, les scores des équipes. Puis la préparation du joueur suivant.
- **Fin de manche** : dès que le chapeau est vide, même au milieu d'un tour (le temps restant est perdu). Écran de fin de manche (12 s, « Suivant » de l'hôte) : les mots trouvés pendant le dernier tour, les scores. Puis l'annonce de la manche suivante, ou le podium après la manche 3.
- **Annonce d'une manche** (8 s, « Suivant » de l'hôte) : « Manche 2 : un seul mot », la règle en une phrase.

### Points

| Situation | Points |
|---|---|
| Mot trouvé | **+1** pour l'équipe du joueur actif |
| Score de chaque joueur (médailles, points globaux) | **100 × points de son équipe** : toute l'équipe gagnante a l'or, ex æquo |

- Les points du tour sont ajoutés aux joueurs au bilan du tour (ou à la fin de manche) : si l'hôte termine pendant un tour, ce tour n'est pas compté.
- Égalité entre équipes : ex æquo, médailles d'or pour tout le monde.


## Phases et chronos

`etatMode.phase` vaut `saisie`, `annonce`, `preparation`, `jeu`, `bilan` ou `finManche`.

| Phase | Durée | Fin |
|---|---|---|
| `saisie` | 90 s | Tous les joueurs connectés de la partie ont 3 mots, ou fin du chrono → `annonce` de la manche 1 |
| `annonce` | 8 s | Fin du chrono ou « Suivant » → `preparation` |
| `preparation` | aucune | « C'est parti ! » du joueur actif → `jeu`. Joueur actif absent : tour sauté |
| `jeu` | 30 s (30, 45 ou 60) | Fin du chrono → `bilan` ; chapeau vide → `finManche` |
| `bilan` | 6 s | Fin du chrono ou « Suivant » → `preparation` du suivant |
| `finManche` | 12 s | Fin du chrono ou « Suivant » → `annonce` de la manche suivante, ou podium |

Avec 15 mots (5 joueurs) et des tours de 30 s, une manche dure 5 à 10 minutes ; la partie, une vingtaine de minutes.


## `etatMode` sur le serveur

```json
{
  "phase": "jeu",
  "duree": 30000,
  "equipes": [["j_a", "j_c", "j_e"], ["j_b", "j_d"]],
  "scores": [7, 5],
  "prochains": [1, 0],
  "equipeActive": 0,
  "actif": "j_c",
  "manche": 2,
  "mots": [{ "id": "m1", "texte": "Napoléon", "auteur": "j_a" }],
  "saisies": { "j_a": ["Napoléon", "Tour Eiffel", "Pizza"] },
  "chapeau": ["m4", "m9", "m1"],
  "trouvesDuTour": ["m7"],
  "debutPhaseA": 1758641190000
}
```

- `equipes` : ids des joueurs, tirés au lancement. `prochains[e]` : l'index du prochain joueur de l'équipe `e`.
- `mots` : tous les mots de la partie, fixés à la fin de la saisie. `chapeau` : les ids des mots restants dans la manche, le premier est le mot en cours.
- `saisies` : pendant la saisie seulement.


## Événements

Aucun nouvel événement : tout passe par `joueur:repondre`.

| Événement | Contenu au chapeau |
|---|---|
| `joueur:repondre` (saisie) | En `saisie` : `{ mots: ["…", "…", "…"] }` (exactement 3 textes de 1 à 30 caractères) ou `{ piocher: true }` |
| `joueur:repondre` (départ) | En `preparation` : `{ partir: true }` du joueur actif |
| `joueur:repondre` (jeu) | En `jeu` : `{ trouve: true }` ou `{ passer: true }` du joueur actif |
| `hote:suivant` | Pendant `annonce`, `bilan` et `finManche` : passer à la suite |
| `hote:reglerMode` | En salle d'attente : `{ mots: "joueurs" \| "hasard", temps: 30 \| 45 \| 60 }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

- Pendant le jeu, **ni la TV ni les coéquipiers du joueur actif** ne reçoivent le mot en cours. Seuls le joueur actif et l'équipe adverse (qui surveille) le reçoivent.
- La TV ne reçoit jamais la liste des mots avant qu'ils soient trouvés ; au bilan, seulement ceux trouvés pendant le tour.
- Pendant la saisie, chaque téléphone ne reçoit que ses propres mots ; la TV, le nombre de joueurs qui ont fini.


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| toutes | `phase`, `manche`, `equipes: [{ nom, joueurs: [id], score }]` |
| `saisie` | `tempsRestantMs`, `ontFini: [id]` |
| `annonce` | `tempsRestantMs`, `consigne` |
| `preparation` | `actif`, `equipeActive`, `consigne`, `motsRestants` |
| `jeu` | Idem, plus `tempsRestantMs`, `nbTrouvesDuTour` |
| `bilan`, `finManche` | `actif`, `equipeActive`, `trouvesDuTour: [texte]`, `tempsRestantMs`, `classement` (`finManche`) |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Pour qui | Données |
|---|---|---|
| `saisie` | Joueurs de la partie | `mesMots` (ses 3 mots, ou vide), `tempsRestantMs`, `nbFinis`, `nbJoueurs` |
| `annonce` | Tous | `manche`, `consigne`, `monEquipe` |
| `preparation_actif` | Le joueur actif | `manche`, `consigne` |
| `preparation` | Les autres | `actif` (pseudo), `memeEquipe` |
| `faire_deviner` | Le joueur actif en `jeu` | `mot`, `nbTrouvesDuTour`, `motsRestants`, `tempsRestantMs`, `consigne` |
| `deviner` | Coéquipiers en `jeu` | `actif`, `nbTrouvesDuTour`, `tempsRestantMs`, `consigne` (jamais le mot) |
| `surveiller` | Équipe adverse en `jeu` | `actif`, `mot`, `nbTrouvesDuTour`, `tempsRestantMs`, `consigne` |
| `bilan` | Tous | `trouvesDuTour`, `scores`, `monEquipe`, `score`, `rang`, `finManche` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de partie, sans équipe | Comme au quiz |


## Écrans

### TV (1920×1080)

- **Saisie** : « Écrivez 3 mots sur vos téléphones », le chrono, les pastilles des joueurs qui ont fini.
- **Annonce** : « Manche 2/3 », « Un seul mot » en très grand, la règle en une phrase, les deux équipes et leurs scores.
- **Préparation et jeu** : en haut, la manche et sa règle courte, le chrono (en jeu). Au centre, « Léa fait deviner aux Rouges », « 3 trouvés », « 9 mots dans le chapeau ». De chaque côté, les deux équipes (pastilles, pseudos, score). **Jamais le mot.**
- **Bilan et fin de manche** : les mots trouvés pendant le tour, les scores des équipes ; à la fin de manche, « Fin de la manche 1 » et le classement.

### Téléphone (portrait)

- **Saisie** : trois champs (30 caractères), « Valider », et « Piocher au hasard ». Une fois validé : « C'est dans le chapeau ! », ses mots, et « Modifier ».
- **Joueur actif** : le mot en très grand, un très grand bouton « Trouvé ! » et « Passer » plus petit, le chrono, la règle de la manche.
- **Coéquipiers** : « Devine ! Léa fait deviner », le chrono, le nombre de trouvés.
- **Adversaires** : « Léa fait deviner : », le mot, « Surveille : un seul mot ! ».
- **Bilan** : les mots trouvés, les scores, son équipe ; « Suivant » pour l'hôte.


## Sons

| Moment | Détection | Son |
|---|---|---|
| Saisie, annonce, préparation | `nouvelleEtape` en phase `saisie`, `annonce`, `preparation` | `etape` |
| Début du jeu | `nouvelleEtape` en phase `jeu` | `lancement` |
| Mot trouvé | `nbTrouvesDuTour` augmente | `reponse` |
| Bilan du tour | `nouvelleEtape` en phase `bilan` | `etape` |
| Fin de manche | `nouvelleEtape` en phase `finManche` | `victoire` |
| Tic-tac, podium | Communs (`tv.js`) | Inchangés |


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur actif absent à sa préparation, ou déconnecté pendant | Préparation : son tour est sauté (joueur suivant de la même équipe, puis de l'autre). Pendant le jeu : le chrono continue, il retrouve son écran s'il revient. |
| Toute une équipe absente | Ses tours sont sautés ; l'autre équipe joue seule. Plus personne : podium. |
| Arrivée en cours de partie | Pas d'équipe : `attente_question` jusqu'à la fin, 0 point. |
| Moins de 4 joueurs connectés en cours de partie | La partie continue. |
| L'hôte termine | Podium avec les scores actuels ; le tour en cours n'est pas compté. |
| Un seul mot dans le chapeau et « Passer » | Le même mot revient. |
| Plus assez de mots inédits au catalogue | On réautorise les plus anciens, comme au quiz. |


## Contenu

### Catalogue `data/chapeau.json`

```json
{ "id": "ch-tour-eiffel", "mot": "Tour Eiffel" }
```

- `id` : `ch-` suivi de minuscules, chiffres et tirets, unique. `mot` : 1 à 30 caractères, sans espace au bord, pas deux fois le même (même clé que Même réponse).
- Environ **150 mots** faciles à faire deviner et à mimer, connus en France : célébrités, personnages de fiction, objets, animaux, lieux, films, métiers.

### Script `scripts/verifier-chapeau.js`

Format ci-dessus ; au moins 60 mots (10 joueurs × 3 mots, deux fois) ; affichage du nombre de mots.


## Tests automatiques

- Registre : `chapeau` avec tout le contrat, refusé à 3 joueurs, accepté à 4.
- Réglages : `mots` et `temps` valides, le reste refusé.
- Équipes : tous les joueurs connectés, deux équipes d'écart au plus 1.
- Saisie : 3 mots valides acceptés, autres formes refusées ; « Piocher » ; fin quand tous ont fini ; fin du chrono → mots au hasard pour les autres ; doublons remplacés ; option « hasard » : pas de saisie.
- Tours : alternance des équipes, rotation dans l'équipe, continuité entre manches, joueur absent sauté.
- Jeu : « Trouvé ! » +1 et mot retiré, « Passer » au fond, refusés d'un autre que l'actif ; chapeau vide → `finManche` ; fin du chrono → `bilan` avec le mot en cours gardé.
- Manches : les mêmes mots à chaque manche, podium après la 3e. Points : 100 × score d'équipe, ajoutés au bilan.
- Secret : la TV et les coéquipiers ne reçoivent jamais le mot en cours ; les adversaires et l'actif oui.
- `verifier-chapeau.js` : id en double ou mal formé, mot vide, trop long ou en double, champ en trop ; le vrai catalogue passe.


## Test de la partie (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080 avec le son, au moins 4 joueurs (vrais téléphones et onglets `?dev`) :

1. **Choix.** À 3 joueurs « Le chapeau » est grisé ; à 4, il s'active. Options : mots écrits ou au hasard, 30, 45 ou 60 s.
2. **Saisie.** Chacun écrit 3 mots ou pioche ; la TV montre qui a fini ; quand tout le monde a fini, la manche 1 est annoncée.
3. **Tour.** Le joueur actif voit le mot ; ses coéquipiers ne le voient pas, les adversaires si ; la TV jamais. « Trouvé ! » ajoute un point, « Passer » change de mot.
4. **Bilan.** À la fin des 30 s, les mots trouvés et les scores ; puis un joueur de l'autre équipe.
5. **Manches.** Quand le chapeau est vide, fin de manche, puis « Manche 2 : un seul mot » avec les mêmes mots ; puis la manche 3 (mime) ; puis le podium, toute l'équipe gagnante en or.


## Choix faits

Par Claude, le 01/11/2026, sur demande de Paul de tout faire d'un coup (à revoir après son test) :

1. **Nom « Le chapeau »** : Time's Up est une marque ; le mode reprend le jeu traditionnel.
2. **Équipes tirées au sort**, fixes pour la partie, une de plus d'un côté si impair. **4 joueurs minimum.**
3. **3 mots par joueur**, écrits ou piochés, et une option « tous au hasard ».
4. **« Passer » sans pénalité**, le mot retourne au fond du chapeau.
5. **Le joueur actif juge** ses « Trouvé ! », l'équipe adverse voit le mot pour surveiller.
6. **Chapeau vide** : la manche s'arrête tout de suite, le temps restant est perdu.
7. **30 s par tour** (30, 45 ou 60).
8. **Médailles par équipe** : chaque joueur marque 100 × les points de son équipe.
9. **Arrivée en cours de partie** : pas d'équipe, le joueur regarde.
