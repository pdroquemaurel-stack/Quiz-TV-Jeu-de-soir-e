# Tranche 32 — Nuancier

Mini-spec de la tranche 32, à faire avant la tranche 31 (Menteur). Elle a été validée le 30/09/2026. Elle complète `docs/spec.md` et s'appuie sur le socle multi-modes (`docs/modes/estimation.md`), sur le GéoQuiz (brouillon envoyé en continu, `docs/modes/geoquiz.md`) et sur `docs/sons.md`.

La TV montre le logo d'une marque connue dont une zone de couleur a été retirée. Chacun recrée la couleur sur son téléphone avec deux curseurs ; le plus ressemblant marque le plus.

La tranche se code en trois temps, chacun testé (et commité avec ton accord) avant de passer au suivant :

1. **Outil de préparation** : `scripts/prep-nuancier.html`, page autonome ouverte dans le navigateur du PC, hors du jeu.
2. **Affichage d'un logo et serveur** :
   - `public/commun/nuancier.js` (charger un SVG, masquer ou recolorer ses zones), `data/nuancier.json` avec 3 exemples, `scripts/verifier-nuancier.js`, et la planche `/tv?nuancier` (`public/tv/planche-nuancier.js`) qui montre tous les logos masqués puis recolorés ;
   - `server/modes/nuancier.js` (couleurs, ΔE, points, manches, chrono) et ses tests. Hors registre : invisible en jeu.
3. **Téléphone, TV, sons et doc** : le mode entre dans le registre. Téléphone : curseurs, aperçu en direct, validation, résultat. TV : manche, révélation, classement. Sons, mise à jour de `spec.md`, `sons.md` et `CLAUDE.md`.


## Règles

- **2 à 10 joueurs.**
- Une partie compte **7 manches** (5, 7 ou 10, option de l'hôte), tirées au hasard dans le catalogue, sans répétition dans la partie. Entre les parties, d'abord les logos jamais vus (`tirerQuestions` de `commun.js`). S'il y a moins de logos que de manches, la partie est plus courte.
- **Manche** : la TV affiche le logo avec sa zone grisée à contour pointillé, le nom de la marque, la question (« Quel est le bleu d'IKEA ? ») et un chrono de **20 s** (15, 20 ou 30 s, option de l'hôte).
- **Curseurs** : teinte (0 à 359) et luminosité (5 à 95), en couleur TSL (HSL). La **saturation est fixée sur celle de la cible**, sinon certaines couleurs seraient inatteignables. Le fond de chaque curseur montre son dégradé (la teinte à la luminosité choisie, la luminosité à la teinte choisie).
- **Position de départ** : tirée au hasard par le serveur pour la manche (teinte au hasard, luminosité 50), la même pour tous.
- **Valider** : la couleur ne bouge plus, le téléphone affiche « En attente des autres joueurs… (x/n) ».
- **Fin du chrono** : la couleur en cours de chaque joueur qui a touché un curseur est validée automatiquement par le serveur. Un joueur qui n'a touché à rien n'a pas de réponse (0 point) : sinon la position de départ, tirée au hasard, rapporterait des points sans jouer.
- **Fin de manche** : quand tous les joueurs attendus encore connectés ont validé, ou à 0 s.
- **Révélation** : **15 s**, puis manche suivante. L'hôte peut passer plus tôt (« Suivant »). Après la dernière : podium commun, médailles et points globaux.

### Points

Calculés **par le serveur** :

1. La couleur du joueur (teinte, saturation de la cible, luminosité) et la cible sont converties de sRGB en CIE Lab (blanc D65).
2. `ΔE` = distance euclidienne dans Lab (CIE76).
3. `ressemblance = max(0, arrondi(100 − ΔE × 1,5))` %.
4. `points = ressemblance × 10` (1 000 au plus).

| ΔE | Ressemblance | Points |
|---|---|---|
| 0 | 100 % | 1 000 |
| 2 (à peine visible) | 97 % | 970 |
| 10 | 85 % | 850 |
| 30 | 55 % | 550 |
| 66,7 et plus | 0 % | 0 |

- Pas de réponse : 0 point.
- Classement avec ex æquo comme partout (1, 1, 3).
- Les curseurs ne vont que par pas entiers : la cible exacte donne en général une ressemblance de 99 ou 100 %.


## Les logos

### Fichiers

Paul télécharge les logos en SVG sur Wikimedia Commons, les passe dans l'outil de préparation et dépose le SVG exporté dans `public/logos/nuancier/`. Claude ne télécharge ni ne dessine aucun logo.

### Catalogue `data/nuancier.json`

```json
{
  "id": "n-ikea",
  "nom": "IKEA",
  "fichier": "ikea.svg",
  "question": "Quel est le bleu d'IKEA ?",
  "cible": "#0058A3",
  "zones": ["path12", "path14"]
}
```

- `id` : `n-` suivi de minuscules, chiffres et tirets, unique. Le préfixe évite toute collision dans `questionsVues`, commune à tous les modes.
- `cible` : `#` et 6 chiffres hexadécimaux.
- `zones` : au moins un `id` de forme du SVG.

### Affichage (`public/commun/nuancier.js`, partagé par la TV et le téléphone)

- Le SVG est chargé (`fetch`, une fois par fichier) et inséré dans la page, pour pouvoir toucher à ses formes. Il vit dans un **Shadow DOM** : ses `<style>` et ses `id` ne touchent ni la page ni les autres logos, et plusieurs logos peuvent s'afficher sur la même page.
- Chaque forme de `zones` est soit **masquée** (gris clair, contour en pointillés), soit **recolorée**. La couleur passe par le style en ligne avec `!important` (`style.setProperty('fill', …, 'important')`) : il l'emporte sur l'attribut `fill`, l'attribut `style` d'origine et la balise `<style>` du SVG.
- Logo introuvable : le nom de la marque s'affiche en gros à sa place.

### Planche `/tv?nuancier`

Tous les logos du catalogue, chacun deux fois : zone masquée, puis zone à la couleur cible, avec une alerte si le fichier ou une zone est introuvable. Pour vérifier les fichiers sur le PC et sur le stick. Elle lit le catalogue par la route `/nuancier/planche`, qui contient les cibles : rien de plus que ce que montre déjà le dépôt GitHub public.

### Le secret dans le fichier SVG

Un téléphone ne reçoit jamais la bonne réponse avant la révélation. Or le SVG d'origine contient la couleur de la zone, lisible dans les outils du navigateur. L'outil de préparation **neutralise donc la zone** dans le SVG exporté : attribut `fill` retiré et `style="fill:#9e9e9e"` sur chaque forme de la zone. La TV applique la vraie couleur à la révélation, à partir de `cible` reçue à ce moment-là.

Si la couleur cible apparaît encore ailleurs dans le fichier (dans une balise `<style>`, un dégradé, une autre forme), l'outil prévient : soit la couleur est visible ailleurs sur le logo (le logo ne convient pas), soit elle traîne dans le code et il faut la retirer à la main.


## Outil de préparation (`scripts/prep-nuancier.html`)

Page autonome, ouverte en double-cliquant dessus : ni serveur ni dépendance. Elle n'est pas servie par Render.

1. **Importer** un fichier SVG de l'ordinateur.
2. Le logo s'affiche en grand. Au survol, la forme sous la souris est surlignée. Un clic ajoute ou retire une forme de la zone.
3. La couleur d'origine de chaque forme est lue avec `getComputedStyle` et proposée comme cible (modifiable). Si les formes choisies n'ont pas la même couleur, la page le signale. Une forme sans `id` en reçoit un (`zone-1`, `zone-2`…). Avertissements aussi pour une cible sans teinte (gris, noir, blanc : la teinte ne sert à rien) et une cible de luminosité hors de 5 à 95 (inatteignable).
4. Paul saisit le nom de la marque et la question. L'`id` et le nom du fichier sont proposés à partir du nom (`IKEA` → `n-ikea`, `ikea.svg`).
5. La page donne l'entrée JSON prête à copier et un bouton pour télécharger le SVG modifié (`id` ajoutés, zone neutralisée).


## Phases et chronos

`etatMode.phase` vaut `choix` ou `revelation`.

| Phase | Durée | Fin |
|---|---|---|
| `choix` | 20 s | Tous les attendus ont validé, ou fin du chrono (les brouillons sont alors validés) |
| `revelation` | 15 s | Fin du chrono ou « Suivant » de l'hôte. Après la dernière manche : podium |


## `etatMode` sur le serveur

```json
{
  "phase": "choix",
  "questions": ["...7 logos tirés..."],
  "indexQuestion": 1,
  "debutPhaseA": 1758641190000,
  "attendus": ["j_8f3k2a", "j_1b9c7d"],
  "depart": { "teinte": 212, "luminosite": 50 },
  "brouillons": { "j_1b9c7d": { "teinte": 30, "luminosite": 41 } },
  "reponses": { "j_8f3k2a": { "teinte": 208, "luminosite": 33, "recuA": 1758641201000 } }
}
```

- Mêmes noms que les autres modes pour réutiliser les aides de `commun.js`. Une « question » est ici un logo du catalogue.
- `brouillons` : la dernière couleur **non validée** de chaque joueur qui a touché un curseur.
- Ressemblances et points ne sont pas stockés : `calculerResultats(reponses, logo)` les calcule (fonction pure).


## Événements

Aucun nouvel événement.

| Événement | Contenu en Nuancier |
|---|---|
| `joueur:repondre` | En `choix` : `{ teinte, luminosite, valide }`. `valide: false` quand un curseur bouge (au plus un envoi toutes les 250 ms, plus un au lâcher), `valide: true` avec « Valider ». Refusé si `teinte` n'est pas un entier de 0 à 359, `luminosite` un entier de 5 à 95, si le joueur n'est pas attendu ou a déjà validé. Un brouillon n'est pas diffusé (comme au GéoQuiz). |
| `hote:suivant` | Pendant la révélation : manche suivante (ou podium) |
| `hote:reglerMode` | En salle d'attente : `{ longueur: 5 | 7 | 10, temps: 15 | 20 | 30 }` |
| `hote:terminer`, `hote:rejouer` | Comme au quiz |


## Le secret

| Information | Qui la reçoit, et quand |
|---|---|
| Couleur cible (`cible`) | **Personne avant la révélation**, ni la TV ni les téléphones. Le fichier SVG ne la contient pas (zone neutralisée). |
| Saturation de la cible | Les téléphones, dès la manche : elle est nécessaire à l'aperçu. C'est une petite partie de la réponse, assumée. |
| Couleur d'un joueur (brouillon ou validée) | Personne avant la révélation, sauf le joueur lui-même. La TV sait seulement qui a validé. |
| Ressemblances, points | À la révélation. |


## Ce que reçoit la TV (`etatMode` de `salle:etat`)

| Phase | Contenu |
|---|---|
| `choix` | `phase`, `numero`, `total`, `logo: { nom, fichier, question, zones }`, `ontRepondu`, `tempsRestantMs` |
| `revelation` | Idem, plus `cible`, `resultats: [{ id, couleur, ressemblance, points }]` triés par ressemblance (`couleur` en `#RRGGBB`), `sansReponse`, puis `classement` |
| podium | `classement` |


## Ce que reçoit un téléphone (`joueur:etat`)

| Écran | Contenu |
|---|---|
| `nuancier` | `numero`, `total`, `logo: { nom, fichier, question, zones }`, `saturation`, `curseurs: { teinte, luminosite }` (son brouillon, sinon le départ) : la position revient après un rechargement. Pas `couleur`, déjà pris par la couleur du joueur dans `joueur:etat` |
| `couleur_validee` | `logo`, `saturation`, `curseurs`, `nbValides`, `nbAttendus` |
| `resultat` | `ressemblance` (ou `null`), `points`, `score`, `rang` ; « Suivant » pour l'hôte |
| `attente_question` | Joueur arrivé en cours de manche |


## Écrans

### Téléphone (portrait)

- **Nuancier** : en haut « Manche 2/7 », la question. Au milieu, le logo recoloré en direct avec la couleur choisie. En bas, les deux curseurs (poignée large pour le pouce, dégradé en fond) et le gros bouton « Valider ».
- **Couleur validée** : le logo dans la couleur choisie, curseurs retirés, « En attente des autres joueurs… (x/n) ».
- **Résultat** : pas de couleur (les écrans de téléphone ne rendent pas les couleurs comme la TV) : « 87 % de ressemblance », « +870 », score et rang, « Regarde la TV ». Sans réponse : « Pas de réponse, 0 point ».

### TV (1920×1080)

- **Manche** : « Manche 2/7 », le logo en grand avec la zone masquée, le nom de la marque, la question, le chrono, les pastilles des joueurs qui ont validé, le petit QR code.
- **Révélation** : à gauche, le vrai logo (zone à la couleur cible). À droite, une ligne par joueur, du plus ressemblant au moins ressemblant : pastille et pseudo, sa couleur à côté de la vraie (deux carrés collés), le pourcentage, les points. Les lignes arrivent l'une après l'autre (opacité et déplacement, pas de flou). Les joueurs sans réponse en bas, « pas de réponse ». Puis le classement général, comme au GéoQuiz.


## Sons

| Moment | Son |
|---|---|
| Nouvelle manche | `etape` |
| Un joueur valide (`ontRepondu` s'allonge) | `reponse` |
| Révélation | `revelation`, ou `victoire` si un joueur atteint 100 % |


## Cas limites

| Situation | Comportement |
|---|---|
| Joueur déconnecté pendant une manche | Ne bloque pas la manche. Son brouillon est validé à la fin du chrono. |
| Joueur qui revient pendant la même manche | Retrouve sa couleur (brouillon ou validée). |
| Arrivée en cours de partie | 0 point, joue à partir de la manche suivante. |
| Personne ne répond | Révélation normale : le vrai logo, « pas de réponse » pour tous. |
| SVG introuvable | Le logo est remplacé par le nom de la marque en gros ; sur le téléphone, c'est ce nom qui prend la couleur choisie. La manche se joue quand même (la question suffit). Le journal serveur n'est pas concerné : c'est `verifier-nuancier.js` qui détecte un fichier manquant. |
| L'hôte termine pendant une manche | Podium avec les scores actuels, la manche en cours n'est pas comptée. |


## Script `scripts/verifier-nuancier.js`

- `id` au format `n-…`, unique ; `nom`, `question` non vides, la question finit par « ? » ;
- `fichier` présent dans `public/logos/nuancier/` ;
- `cible` au format `#RRGGBB`, avec une luminosité TSL de 5 à 95 ;
- chaque `id` de `zones` existe dans le SVG ;
- la couleur cible n'apparaît plus dans le SVG (zone bien neutralisée) ;
- nombre de logos affiché, avertissement s'il y en a moins de 10 (une partie de 10 manches serait plus courte).


## Tests automatiques

- Couleurs : conversions TSL → RGB → Lab sur des valeurs connues, ΔE, ressemblance (bornes 0 et 100), points.
- Validation de `joueur:repondre` : teinte décimale, hors bornes, luminosité hors bornes, texte, deuxième validation, joueur non attendu, hors phase `choix`.
- Fin anticipée, fin du chrono avec brouillon validé, sans brouillon (pas de réponse).
- Tirage : 7 logos distincts, moins de logos que de manches.
- Secret : `vueTv` et `vueJoueur` en phase `choix` ne contiennent ni `cible` ni la couleur des autres.
- `verifier-nuancier.js` : id en double, cible mal formée, zone absente du SVG, cible encore présente dans le SVG.


## Test de la tranche (à faire toi-même)

Défini à la fin de chaque temps. Le dernier : une partie sur Render avec de vrais téléphones, et l'affichage des logos (zone masquée, révélation) sur le vrai stick.
