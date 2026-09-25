# Tranche 14 — Même réponse

Mini-spec de la tranche 14. Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes de la tranche 11 (`docs/modes/estimation.md`), sur `docs/modes/qui-de-nous.md` et sur `docs/sons.md`. Elle a été validée le 24/09/2026.

Ce mode diffère des précédents sur un point : **la réponse est un texte libre**, et le serveur doit décider si deux textes sont « la même réponse ». C'est le cœur de la mini-spec (voir « Même réponse ou pas ? »).

La tranche se code en deux temps, chacun testé avant de passer au suivant :

1. **Contenu** : `data/meme-reponse.json`, la fonction qui compare les réponses, le script de vérification et leurs tests. Paul peut relire les questions pendant que le mode se code.
2. **Mode Même réponse** : le mode côté serveur, ses écrans TV et téléphone, ses sons, ses tests. Il quitte `modesAVenir` pour entrer dans le registre.

## Règles

- Une partie compte **10 questions** ouvertes, du type « Cite un fruit rouge ». Le but n'est pas d'avoir raison mais de **penser comme les autres**.
- Chaque joueur a **30 s** pour taper sa réponse, en une seule réponse définitive (bouton « Valider »). La rapidité ne rapporte rien. 30 s comme à l'Estimation : il faut le temps de réfléchir et de taper.
- **Réponse** : texte libre, de 1 à 30 caractères une fois les espaces du bord retirés.
- À la fin de la saisie, le serveur **regroupe les réponses identiques** (au sens de « Même réponse ou pas ? ») et la TV affiche les groupes.
- **Joueurs** : les joueurs attendus de la manche (connectés au début de la question), comme dans les autres modes.
- Fin anticipée : identique au quiz (joueurs attendus encore connectés qui ont tous répondu).
- Classement général par score total, avec les ex æquo du quiz.

### Points

On marque selon la **taille de son groupe**, c'est-à-dire le nombre de joueurs (soi compris) qui ont donné la même réponse :

| Situation | Points |
|---|---|
| Seul avec sa réponse, ou pas de réponse | 0 |
| Groupe de *n* joueurs (*n* ≥ 2) | **100 × *n*** |
| Bonus : son groupe est **le plus grand** de la question (ex æquo compris, *n* ≥ 2) | **+ 300** |

Exemple à 6 joueurs : Fraise ×3, Cerise ×2, Tomate ×1 → chaque « Fraise » marque 300 + 300 = 600, chaque « Cerise » 200, « Tomate » 0.
Fraise ×2, Cerise ×2, Tomate ×1, Pomme ×1 → les deux groupes de 2 sont ex æquo en tête : 200 + 300 = 500 chacun.
Unanimité à 6 : 600 + 300 = 900 chacun.

Pourquoi ce barème :

- **Plus on est nombreux, plus on marque** : c'est l'esprit du jeu (viser la réponse évidente).
- **Le bonus** récompense la réponse la plus donnée même à 3 ou 4 joueurs, où les groupes sont petits : à 3 joueurs, une paire marque 200 + 300 = 500 et le joueur seul 0.
- Les montants restent dans l'ordre de grandeur des autres modes (quelques milliers de points par partie).

Alternatives écartées :

- *Points proportionnels à la part des joueurs* (1000 × (n − 1) / (attendus − 1)) : juste, mais des nombres peu lisibles (111, 222…).
- *Seule la réponse la plus donnée marque* : trop dur à 8-10 joueurs, beaucoup de manches à 0 pour presque tout le monde.

## Même réponse ou pas ?

C'est le choix le plus important du mode : trop strict, « fraises » et « Fraise » ne vont pas ensemble et le jeu paraît injuste ; trop tolérant, « canard » et « canari » sont confondus.

On décide en **deux étapes**, sans jamais demander d'arbitrage aux joueurs :

### 1. Une clé calculée pour chaque réponse

Le serveur transforme chaque réponse en une **clé**. Deux réponses de même clé sont la même réponse. La clé ignore :

| Différence ignorée | Exemple |
|---|---|
| Casse | « FRAISE » = « fraise » |
| Accents | « Pâté » = « pate » |
| Espaces au bord et espaces multiples | «  la   fraise » = « la fraise » |
| Ponctuation, tirets, apostrophes (remplacés par un espace) | « Coca-Cola » = « coca cola », « fraise ! » = « fraise » |
| Article en tête : le, la, les, l', un, une, des, du, de la, d' | « Les fraises » = « fraise », « l'ananas » = « ananas » |
| Pluriel simple : un `s` ou un `x` final, sur chaque mot de plus de 3 lettres | « Fraises » = « fraise », « Choux » = « chou » |

Les pluriels irréguliers (« cheval / chevaux ») et les autres formes passent par la liste de réponses connues (étape 2).

La normalisation d'Undercover (casse, accents, espaces) est réutilisée : `normaliser` quitte `server/modes/undercover.js` pour `server/modes/commun.js`, et la clé de Même réponse ajoute les trois dernières règles.

### 2. Les réponses connues de la question

Chaque question du fichier liste ses **réponses connues** : les réponses probables, chacune avec ses **variantes** (synonymes, formes courtes, pluriels irréguliers, orthographes alternatives).

```json
{ "reponse": "Coca-Cola", "variantes": ["Coca", "Coke"] }
```

Une réponse dont la clé correspond à celle d'une réponse connue ou d'une de ses variantes est **rattachée à cette réponse connue**. « coca », « Coke » et « COCA-COLA » tombent donc dans le même groupe, affiché « Coca-Cola ».

Une réponse inconnue (« Grenade ») n'est rattachée à rien : elle se regroupe avec les autres réponses de même clé, et le groupe est affiché avec **le texte tel que le premier joueur l'a tapé**. Une réponse originale peut donc marquer si deux joueurs y pensent.

### Ce qu'on ne tolère pas

- **Fautes de frappe** : pas de rapprochement automatique (distance entre mots). Les faux amis sont trop nombreux dans les réponses courtes (« canard / canari », « poule / moule », « pain / main ») et le correcteur du clavier du téléphone corrige déjà la plupart des fautes. Une faute fréquente peut être ajoutée comme variante dans le fichier.
- **Synonymes non listés** : seuls ceux du fichier comptent. C'est la relecture du contenu qui fait la qualité du mode.

Alternatives écartées pour l'instant, à rouvrir après la soirée test si le besoin se fait sentir :

- *Tolérance d'une faute* sur les mots de 6 lettres et plus, et seulement vers une réponse connue sans voisine proche.
- *Fusion par l'hôte* : aux résultats, l'hôte réunit deux groupes qu'il juge identiques. Juste mais plus long à jouer et à coder (nouvelle phase, nouvel événement).

## Phases et chronos

`etatMode.phase` vaut `saisie` ou `resultats`.

| Phase | Durée | Fin |
|---|---|---|
| `saisie` | 30 s | Tous les attendus ont répondu, ou fin du chrono |
| `resultats` | 12 s | Fin du chrono ou « Suivant » de l'hôte. Après la 10e : podium |

12 s comme Qui de nous ? : c'est le moment où l'on rit des réponses isolées.

## `etatMode` sur le serveur

```json
{
  "phase": "saisie",
  "questions": ["...10 questions tirées..."],
  "indexQuestion": 2,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d", "j_4d2e9f"],
  "reponses": { "j_8f3k2a": { "texte": "Les fraises", "recuA": 1758641195300 } }
}
```

- `reponses` garde ce nom pour réutiliser `tousOntRepondu` de `commun.js`. On garde le texte tel que tapé (bords retirés) : la clé et les groupes sont recalculés par une fonction pure à partir de lui.
- Les groupes ne sont pas stockés : `formerGroupes(reponses, question)` les calcule, comme `compterVotes` en Qui de nous ?.

Un groupe : `{ libelle, joueurs: [id…], taille, enTete, points }`. Tri : du plus grand au plus petit ; à taille égale, le groupe dont la première réponse est arrivée le plus tôt d'abord (ordre stable et prévisible pour les tests).

## Événements

Aucun nouvel événement : on réutilise ceux des autres modes.

| Événement | Contenu en Même réponse |
|---|---|
| `joueur:repondre` | Le texte saisi (chaîne). Refusé si ce n'est pas une chaîne, s'il est vide ou fait plus de 30 caractères une fois les bords retirés, si sa clé est vide (« !!! »), si ce n'est pas la phase `saisie`, si le joueur n'est pas attendu ou a déjà répondu. |
| `hote:suivant` | Pendant les résultats : passe à la question suivante (ou au podium) |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |

Le téléphone limite la saisie à 30 caractères et désactive « Valider » tant que le champ est vide. Le serveur valide à nouveau.

## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `saisie` | `phase`, `numero`, `total`, `question: { texte }`, `ontRepondu` (liste d'`id`), `tempsRestantMs` |
| `resultats` | Idem, plus `groupes: [{ libelle, joueurs, taille, enTete, points }]`, `sansReponse` (liste d'`id` des attendus sans réponse), `unanimite` (vrai si toutes les réponses données forment un seul groupe d'au moins 2 joueurs, même si certains n'ont pas répondu), puis `classement` |
| podium | `classement` |

**Jamais pendant la saisie** : le texte d'une réponse, ni le nombre de groupes, ni aucun indice de ressemblance. Sinon un joueur pourrait lire la TV (ou ses outils de développement) et se caler sur les autres.
**Jamais, à aucun moment** : la liste des réponses connues et de leurs variantes. Elle ne sert qu'au serveur.

Aux résultats, qui a répondu quoi est **public** : c'est tout le sel du jeu (« Qui a mis Tomate ?! »).

## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Données |
|---|---|
| `repondre` | `numero`, `total`, `question: { texte }` |
| `reponse_envoyee` | Son propre texte |
| `resultat` | `numero`, son texte (ou rien), `libelle` de son groupe, `taille` de son groupe, `enTete` (booléen), ses points, son rang général. Pour l'hôte : « Suivant » |
| `attente_question`, `fin` | Comme au quiz |

Le texte de la question est aussi sur le téléphone (à la différence de Qui de nous ?) : on tape en regardant son écran, pas la TV.

**Jamais** : la réponse d'un autre joueur pendant la saisie, ni les réponses connues. Aux résultats, le téléphone ne reçoit que son propre groupe : le détail est sur la TV.

## Écrans

| Où | Écran | Contenu |
|---|---|---|
| TV | Saisie | « Question 3/10 », la question en très gros, « Tapez votre réponse sur votre téléphone », chrono, pastilles des joueurs ayant répondu, petit QR code |
| TV | Résultats | La question en haut, avec à côté le verdict en gros : le ou les libellés en tête (« Fraise ! »), « Tous d'accord ! », « Chacun sa réponse » ou « Personne n'a répondu ». Les groupes de 2 et plus en grandes cartes, du plus grand au plus petit : libellé en gros, pastilles et pseudos des joueurs, « +600 ». Le ou les groupes en tête mis en avant (« Réponse la plus donnée »). Dessous, une ligne plus discrète « Seuls : » avec chaque réponse isolée (pastille, pseudo, texte). Puis « Pas de réponse : » avec les pastilles. Classement général à droite, avec les points gagnés |
| TV | Podium | Le podium commun, sans `completerPodium` |
| Téléphone | Répondre | « Question 3/10 », le texte de la question, un champ texte (30 caractères max, correcteur du clavier laissé actif), gros bouton « Valider » inactif tant que le champ est vide |
| Téléphone | Réponse envoyée | « Tu as répondu : Fraise, regarde la TV » |
| Téléphone | Résultat | « Même réponse que 2 autres, +600 » (avec « Réponse la plus donnée ! » si `enTete`), ou « Tu es seul avec : Tomate » ou « Pas de réponse ». Si la réponse a été rattachée : « Fraises → Fraise ». Rang général |

Le champ texte du téléphone suit le modèle de la devinette de Mister White (Undercover).

Contraintes du Mi TV Stick : apparition des cartes par opacité et déplacement, pas de flou. Au plus 10 cartes ou lignes : la mise en page tient dans 1920×1080 sans défilement.

## Sons

Comme Qui de nous ?, plus un son pour l'unanimité. Rien ne change dans `sons.js` ni côté serveur.

| Moment | Détection | Son |
|---|---|---|
| Nouvelle question | `nouvelleEtape` en phase `saisie` | `etape` |
| Un joueur répond | `ontRepondu` s'allonge | `reponse` |
| Résultats | `nouvelleEtape` en phase `resultats` | `revelation`, ou `victoire` si `unanimite` (au moins 2 joueurs) |
| Tic-tac, lancement, podium | Communs (`tv.js`) | Inchangés |

Pas de son `rate` pour les réponses isolées : il y en a presque à chaque question, ce serait lassant. À ajouter à la table « Quand jouer quoi » de `docs/sons.md`.

## Contenu

**Fichier `data/meme-reponse.json`** : **120 questions**, soit 12 parties sans répétition. Générées par Claude, relues par Paul.

```json
{
  "id": "m0001",
  "texte": "Cite un fruit rouge",
  "reponses": [
    { "reponse": "Fraise", "variantes": [] },
    { "reponse": "Cerise", "variantes": [] },
    { "reponse": "Framboise", "variantes": [] },
    { "reponse": "Groseille", "variantes": [] },
    { "reponse": "Pomme", "variantes": ["Pomme rouge"] },
    { "reponse": "Tomate", "variantes": [] }
  ]
}
```

- Préfixe d'id : **`m`**. `q`, `e`, `n` et `u` sont déjà pris, `b` restera au bluff.
- `reponses` : de **4 à 15** réponses connues par question. Le premier mot (`reponse`) est le libellé affiché sur la TV.
- `variantes` : les autres formes acceptées (synonyme, abréviation, pluriel irrégulier, orthographe alternative, faute très courante). Liste vide autorisée. Inutile d'y mettre casse, accents, articles et pluriels en `s`/`x` : la clé les ignore déjà.
- Pas de `categorie` ni de `difficulte`, comme Qui de nous ?.

Règles de rédaction :

- Des questions où **quelques réponses dominent** (« Cite un animal de la ferme », « Un pays où il fait chaud », « Ce qu'on met dans une valise ») : c'est ce qui crée des groupes. Ni question à réponse unique (« La capitale de la France »), ni question trop ouverte (« Cite un mot »).
- Réponses attendues **courtes** : un ou deux mots, faciles à taper.
- Forme : « Cite… » ou « Un… / Une… », sans point d'interrogation obligatoire.
- Mêmes interdits que Qui de nous ? : rien qui gêne ou blesse.
- Variété : cuisine, animaux, objets, lieux, métiers, sports, films et chansons connus, vie quotidienne, fêtes…

**Script `scripts/verifier-meme-reponse.js`**, sur le modèle de `verifier-undercover.js` :

- seuls les champs `id`, `texte` et `reponses` ; dans chaque réponse connue, seuls `reponse` et `variantes` ;
- `id` au format `m` + 4 chiffres, unique ;
- `texte` non vide, longueur maximale `LONGUEUR_MAX_TEXTE` du quiz ; pas deux textes identiques ;
- `reponses` : liste de 4 à 15 objets ;
- `reponse` et chaque variante : chaîne non vide, sans espace au bord, 30 caractères au plus, clé non vide ;
- dans une question, **aucune collision de clés** : deux formes (réponses ou variantes, toutes réponses connues confondues) ne doivent pas avoir la même clé. Sinon une réponse tapée pourrait appartenir à deux groupes. Cela détecte aussi une variante inutile (même clé que sa propre réponse) ;
- nombre total de questions affiché.

La fonction de clé (`cleReponse`) est exportée par `server/modes/meme-reponse.js` et utilisée aussi par le script, pour que les deux comparent de la même façon. Le fichier de données est lu au premier lancement seulement, comme `banqueUndercover()`, pour que le script puisse signaler lui-même un fichier illisible.

Le tirage réutilise `tirerQuestions` et `noterQuestionsVues` de `commun.js` : `questionsVues` reste une seule liste pour la salle.

## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant la saisie | Ne bloque pas la manche : on vérifie à nouveau la fin anticipée. S'il avait répondu, sa réponse compte ; sinon, pas de réponse, 0 point. |
| Joueur qui revient pendant la même question | S'il avait répondu : « Réponse envoyée » avec son texte. Sinon, s'il était attendu : il peut encore répondre. S'il n'était pas attendu : attente de la question suivante. |
| Arrivée en cours de partie | 0 point, joue à partir de la question suivante (comme au quiz). |
| Moins de 3 joueurs connectés en cours de partie | La partie continue. Seul « Rejouer » est désactivé tant que le compte n'y est pas (ou l'hôte choisit un autre mode). |
| Aucune réponse à une question | Résultats normaux : « Personne n'a répondu », personne ne marque. |
| Une seule réponse (les autres n'ont pas répondu) | Elle est seule : 0 point, pas de bonus (un groupe en tête compte au moins 2 joueurs). |
| Tout le monde est seul | Aucun groupe en tête, personne ne marque. |
| Saisie invalide (vide, trop longue, que de la ponctuation, pas une chaîne) | Bloquée sur le téléphone quand c'est possible. Si elle arrive quand même, le serveur l'ignore et le joueur reste sur « Répondre ». |
| Réponse grossière | Acceptée et affichée : c'est un jeu entre amis. Pas de filtre. |
| L'hôte termine pendant une saisie ou des résultats | Podium avec les scores actuels. La question en cours n'est pas comptée (les points ne sont ajoutés qu'aux résultats). |
| `MODE_DEV` à 1 joueur | Il est toujours seul : 0 point, mais tous les écrans sont parcourables. |
| Plus assez de questions inédites | On réautorise les plus anciennes, comme au quiz. |

## Modifications à reporter

Une fois les choix validés :

- `server/modes/commun.js` : reçoit `normaliser`, qui quitte `server/modes/undercover.js` ; `undercover.js` et `scripts/verifier-undercover.js` l'importent désormais de `commun.js` (aucun changement de comportement).
- `server/modes/index.js` : `meme-reponse` sort de `modesAVenir` et entre dans le registre, sous la clé `'meme-reponse'`.
- `docs/spec.md`, « Modes de jeu supplémentaires » : « (disponible, voir `docs/modes/meme-reponse.md`) », comme pour les autres modes.
- `docs/sons.md`, « Quand jouer quoi » : les lignes de Même réponse.
- `CLAUDE.md`, structure : `server/modes/meme-reponse.js`, `data/meme-reponse.json`, `scripts/verifier-meme-reponse.js`, et la commande `node scripts/verifier-meme-reponse.js`.

## Tests automatiques

Avec `node:test` et, pour les chronos, `mock.timers`.

**Contenu (temps 1)** :

- `normaliser` dans `commun.js` : les tests d'Undercover restent verts ;
- clé : casse, accents, espaces, ponctuation et tirets (« Coca-Cola » = « coca cola »), articles (« Les fraises », « l'ananas », « de la purée »), pluriel en `s` et `x` (« Choux » = « chou »), mot de 3 lettres gardé tel quel (« bus » ne devient pas « bu ») ; « canard » ≠ « canari » ; « !!! » donne une clé vide ;
- `verifier-meme-reponse.js` : détecte un id en double, un id au mauvais préfixe, un champ en trop, un texte en double, moins de 4 ou plus de 15 réponses, une réponse trop longue, deux réponses connues de même clé (« Fraise » et « Fraises »), une variante de même clé qu'une autre réponse connue, une variante de même clé que sa propre réponse ;
- le vrai fichier `data/meme-reponse.json` passe la vérification.

**Mode (temps 2)** :

- le registre contient `meme-reponse` avec tout le contrat, et il n'est plus dans `modesAVenir` ;
- `hote:choisirMode` refuse Même réponse à 2 joueurs, l'accepte à 3 ;
- groupes : deux formes d'une même réponse connue (« Coke » et « coca ») vont ensemble avec le libellé « Coca-Cola » ; deux réponses inconnues de même clé vont ensemble avec le texte du premier ; réponses différentes séparées ; tri par taille puis par ordre d'arrivée ;
- points : exemples de la section « Points » (3-2-1, 2-2-1-1, unanimité), joueur seul 0, pas de réponse 0, une seule réponse 0 sans bonus, tout le monde seul 0 ;
- validation de `joueur:repondre` : pas une chaîne, vide, espaces seuls, 31 caractères, que de la ponctuation, deuxième réponse, joueur non attendu, hors phase `saisie` ; 30 caractères acceptés ;
- fin anticipée quand tous ont répondu, et après la déconnexion du dernier attendu ;
- chronos : résultats à 30 s, question suivante 12 s après, podium après la 10e ;
- secret : `vueTv` en phase `saisie` ne contient aucun texte de réponse ; `vueTv` et `vueJoueur` ne contiennent jamais les réponses connues ni les variantes ; `vueJoueur` en saisie ne contient jamais la réponse d'un autre joueur ;
- points ajoutés aux résultats seulement, pas comptés si l'hôte termine pendant une saisie ;
- `questionsVues` : les `id` `m…` cohabitent avec `q…`, `e…`, `n…` et `u…`, pas de répétition sur 3 parties.

## Test de la tranche (à faire toi-même)

Sur Render, TV dans un onglet du PC en 1920×1080 avec le son, joueurs sur de vrais téléphones et des onglets `?dev` (il en faut 3, 5 ou plus pour voir plusieurs groupes).

**Temps 1 (contenu)**

1. `node scripts/verifier-meme-reponse.js` affiche « 120 questions OK ».
2. Relire `data/meme-reponse.json` : questions, réponses connues, variantes. Noter celles à corriger.

**Temps 2 (mode)**

1. **Choix du mode.** Rejoindre à 2 : Même réponse est grisé (« 3 joueurs min. »), sans « Bientôt ». Un 3e joueur arrive : il devient actif. L'hôte le choisit : la TV affiche « Même réponse » et sa règle.
2. **Saisie.** Lancer. La question s'affiche sur la TV et sur chaque téléphone. « Valider » est inactif tant que le champ est vide. Pendant la saisie, la TV montre qui a répondu, jamais quoi. « Ding » à la question, « tic » à chaque réponse, tic-tac sur les 5 dernières secondes.
3. **Regroupement.** Sur une question, taper « Les FRAISES », « fraise » et « Fraises ! » : un seul groupe « Fraise » de 3. Sur une autre, taper une réponse inconnue identique sur deux téléphones : elle forme un groupe et marque.
4. **Points.** Vérifier sur la TV un cas 3-2-1 à 6 joueurs (ou 2-1 à 3 joueurs : la paire marque 500, le joueur seul 0). Le téléphone affiche le bon message et les points.
5. **Unanimité.** Tout le monde tape la même réponse : « Tous d'accord ! » et l'arpège de victoire au lieu du « tadam ».
6. **Déconnexion.** Couper un joueur pendant la saisie (bouton `?dev` « Couper 15 s ») : la manche se termine dès que les autres ont répondu, il est dans « Pas de réponse ». À son retour, il joue la question suivante.
7. **Arrêt et podium.** L'hôte termine à la 4e question : podium avec les scores actuels. Avec 2 joueurs connectés, « Rejouer » est désactivé en Même réponse. L'hôte choisit Quiz : « Rejouer » lance un quiz qui marche comme avant.
