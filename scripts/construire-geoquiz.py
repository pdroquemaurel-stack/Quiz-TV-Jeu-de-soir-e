"""
Construit le pack de lieux du mode GéoQuiz depuis Wikidata et Wikimedia Commons
(docs/modes/geoquiz.md, « Contenu »). Jamais exécuté par le serveur.

Usage :
    pip install requests
    py scripts/construire-geoquiz.py

Résultat :
    data/geoquiz.json            -> les lieux, réécrit en entier à chaque lancement
    scripts/apercu-geoquiz.html  -> page de vignettes pour repérer les photos inutilisables
    data/geoquiz-exclus.json     -> créé vide s'il n'existe pas, jamais modifié ensuite

Après chaque lancement : ouvrir l'aperçu, cocher les photos à exclure, coller la liste
dans data/geoquiz-exclus.json, puis node scripts/verifier-geoquiz.js
"""

import html
import json
import os
import re
import sys
import time
from collections import Counter
from urllib.parse import unquote

import requests

# Difficulté selon la notoriété (nombre de sitelinks) : bornes de sitelinks et nombre de lieux.
# Les 500 lieux les plus connus ont tous plus de 80 sitelinks : on remplit donc un quota par
# difficulté. Le plafond de 12 lieux par pays est réparti au prorata : 6, 4 et 2.
DIFFICULTES = {
    1: {"nom": "faciles", "filtre": "?liens > 80", "quota": 250, "max_par_pays": 6},
    2: {"nom": "moyens", "filtre": "?liens >= 30 && ?liens <= 80", "quota": 150, "max_par_pays": 4},
    # En dessous de 10 sitelinks, le lieu est trop obscur pour être deviné.
    3: {"nom": "difficiles", "filtre": "?liens >= 10 && ?liens < 30", "quota": 100, "max_par_pays": 2},
}
LIMITE_PAR_TYPE = 400   # lieux demandés à Wikidata pour chaque type et chaque difficulté
# Largeur de la miniature, en pixels. Commons n'en sert que quelques-unes (… 1280, 1920…)
# et arrondit au-dessus : 1920 est aussi la largeur de la TV.
LARGEUR_PHOTO = 1920
LARGEUR_APERCU = 330    # vignettes de la page d'aperçu
PAUSE = 2.0             # secondes entre deux requêtes, pour rester poli
ESSAIS = 5

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(RACINE, "data", "geoquiz.json")
EXCLUS = os.path.join(RACINE, "data", "geoquiz-exclus.json")
APERCU = os.path.join(RACINE, "scripts", "apercu-geoquiz.html")

URL_SPARQL = "https://query.wikidata.org/sparql"
URL_COMMONS = "https://commons.wikimedia.org/w/api.php"

session = requests.Session()
# Wikimedia demande un User-Agent explicite. On peut y ajouter une adresse de contact.
session.headers["User-Agent"] = "QuizTV-GeoQuiz/1.0 (jeu de soiree entre amis, usage perso)"

# Types « jouables » : le triplet SPARQL qui sélectionne les lieux de chaque type.
TYPES = {
    "patrimoine mondial": "?lieu wdt:P1435 wd:Q9259 .",
    "monument": "?lieu wdt:P31 wd:Q4989906 .",
    "attraction touristique": "?lieu wdt:P31 wd:Q570116 .",
    "montagne": "?lieu wdt:P31 wd:Q8502 .",
    "volcan": "?lieu wdt:P31 wd:Q8072 .",
    "lac": "?lieu wdt:P31 wd:Q23397 .",
    "chute d'eau": "?lieu wdt:P31 wd:Q34038 .",
    "ville": "VALUES ?type { wd:Q515 wd:Q1637706 wd:Q200250 wd:Q5119 } ?lieu wdt:P31 ?type .",
    "pont": "?lieu wdt:P31 wd:Q12280 .",
    "lieu de culte": (
        "VALUES ?type { wd:Q16970 wd:Q2977 wd:Q32815 wd:Q44539 wd:Q160742 wd:Q842402 wd:Q5393308 } "
        "?lieu wdt:P31 ?type ."
    ),
    "château": "VALUES ?type { wd:Q23413 wd:Q751876 wd:Q53536964 } ?lieu wdt:P31 ?type .",
    "île": "?lieu wdt:P31 wd:Q23442 .",
}

REQUETE = """
SELECT ?lieu ?nom ?paysNom ?coord ?image ?liens WHERE {{
  {selection}
  ?lieu wdt:P625 ?coord ;
        wdt:P18 ?image ;
        wdt:P17 ?pays ;
        wikibase:sitelinks ?liens .
  FILTER({filtre})
  ?lieu rdfs:label ?nom . FILTER(LANG(?nom) = "fr")
  ?pays rdfs:label ?paysNom . FILTER(LANG(?paysNom) = "fr")
}}
ORDER BY DESC(?liens)
LIMIT {limite}
"""

# Licences libres acceptées : CC BY, CC BY-SA, CC0, domaine public.
LICENCE_LIBRE = re.compile(r"^(cc[ -]by|cc0|cc[ -]zero|public domain|pd\b|domaine public)", re.I)
# Pas de PNG ni de SVG : ce sont presque toujours des cartes, des plans ou des logos.
EXTENSIONS = (".jpg", ".jpeg", ".webp", ".tif", ".tiff")

HOTE_IMAGES = re.compile(r"^https://(upload|thumb)\.wikimedia\.org/")


def demander(url, params):
    """GET avec quelques essais : une erreur réseau persistante arrête le script."""
    for essai in range(1, ESSAIS + 1):
        attente = 15 * essai
        try:
            reponse = session.get(url, params=params, timeout=90)
            if reponse.status_code == 429:
                # Trop de requêtes : le serveur dit combien de temps attendre.
                attente = int(reponse.headers.get("Retry-After", attente))
            reponse.raise_for_status()
            time.sleep(PAUSE)
            return reponse.json()
        except (requests.RequestException, ValueError) as erreur:
            message = f"HTTP {erreur.response.status_code}" if getattr(erreur, "response", None) is not None else erreur
            print(f"  essai {essai}/{ESSAIS} raté ({message}), nouvel essai dans {attente} s")
            time.sleep(attente)
    sys.exit(f"Erreur réseau persistante sur {url} : rien n'est écrit.")


def lire_coordonnees(litteral):
    """« Point(2.29 48.85) » -> (48.85, 2.29). None pour un autre astre que la Terre."""
    match = re.fullmatch(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", litteral)
    if not match:
        return None
    lng, lat = float(match.group(1)), float(match.group(2))
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def chercher_candidats(difficulte):
    """Les lieux jouables d'une difficulté, un par id, les plus connus d'abord."""
    candidats = {}
    filtre = DIFFICULTES[difficulte]["filtre"]
    for nom_type, selection in TYPES.items():
        print(f"Wikidata, {DIFFICULTES[difficulte]['nom']} : {nom_type}…")
        requete = REQUETE.format(selection=selection, filtre=filtre, limite=LIMITE_PAR_TYPE)
        donnees = demander(URL_SPARQL, {"query": requete, "format": "json"})
        lignes = donnees["results"]["bindings"]
        for ligne in lignes:
            qid = ligne["lieu"]["value"].rsplit("/", 1)[-1]
            if qid in candidats:
                continue  # plusieurs images ou pays : on garde la première ligne
            coordonnees = lire_coordonnees(ligne["coord"]["value"])
            fichier = unquote(ligne["image"]["value"].rsplit("/", 1)[-1])
            if not coordonnees or not fichier.lower().endswith(EXTENSIONS):
                continue
            candidats[qid] = {
                "qid": qid,
                "nom": ligne["nom"]["value"].strip(),
                "pays": ligne["paysNom"]["value"].strip(),
                "lat": round(coordonnees[0], 4),
                "lng": round(coordonnees[1], 4),
                "fichier": fichier,
                "liens": int(ligne["liens"]["value"]),
                "difficulte": difficulte,
            }
        print(f"  {len(lignes)} lignes, {len(candidats)} lieux au total")
    return sorted(candidats.values(), key=lambda lieu: -lieu["liens"])


def texte_brut(valeur):
    """Les métadonnées de Commons sont en HTML : on garde le texte seul."""
    sans_balises = re.sub(r"<[^>]+>", " ", valeur or "")
    return re.sub(r"\s+", " ", html.unescape(sans_balises)).strip()


def nettoyer_auteur(auteur):
    """« No machine-readable author provided. Preslav~commonswiki assumed (…) » -> « Preslav »."""
    match = re.match(r"No machine-readable author provided\. (.+?) assumed", auteur)
    if match:
        auteur = match.group(1)
    return auteur.replace("~commonswiki", "").strip()


def sans_parametres(url):
    """Commons ajoute « ?utm_source=… » aux liens : inutile pour afficher l'image."""
    return url.split("?", 1)[0]


def infos_photos(fichiers):
    """Pour un lot de 50 fichiers au plus : { fichier: {image, apercu, auteur, licence} }."""
    donnees = demander(URL_COMMONS, {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "titles": "|".join(f"File:{fichier}" for fichier in fichiers),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": LARGEUR_PHOTO,
        "iiextmetadatafilter": "Artist|LicenseShortName",
    })
    # Commons normalise les titres (« _ » -> espace…) : on retrouve le fichier demandé.
    vers_demande = {f"File:{fichier}": fichier for fichier in fichiers}
    for normalise in donnees["query"].get("normalized", []):
        vers_demande[normalise["to"]] = vers_demande.get(normalise["from"])

    infos = {}
    for page in donnees["query"]["pages"]:
        fichier = vers_demande.get(page["title"])
        if not fichier or "imageinfo" not in page:
            continue
        info = page["imageinfo"][0]
        meta = info.get("extmetadata", {})
        image = sans_parametres(info.get("thumburl") or info.get("url"))
        infos[fichier] = {
            "image": image,
            "apercu": image.replace(f"/{LARGEUR_PHOTO}px-", f"/{LARGEUR_APERCU}px-"),
            "auteur": nettoyer_auteur(texte_brut(meta.get("Artist", {}).get("value"))),
            "licence": texte_brut(meta.get("LicenseShortName", {}).get("value")),
        }
    return infos


def photo_utilisable(info):
    return (
        info is not None
        and HOTE_IMAGES.match(info["image"])
        and info["auteur"] != ""
        and LICENCE_LIBRE.match(info["licence"])
    )


def choisir_lieux(candidats, quota, max_par_pays):
    """Les plus connus d'abord, max_par_pays par pays, photos libres seulement."""
    gardes = []
    par_pays = Counter()
    rejets = Counter()
    index = 0
    while len(gardes) < quota and index < len(candidats):
        # Un lot de 50 candidats qui tiennent encore dans le plafond de leur pays.
        lot = []
        en_attente = Counter()
        while len(lot) < 50 and index < len(candidats):
            lieu = candidats[index]
            index += 1
            if par_pays[lieu["pays"]] + en_attente[lieu["pays"]] < max_par_pays:
                lot.append(lieu)
                en_attente[lieu["pays"]] += 1
        if not lot:
            break
        infos = infos_photos(list(dict.fromkeys(lieu["fichier"] for lieu in lot)))
        for lieu in lot:
            info = infos.get(lieu["fichier"])
            if not photo_utilisable(info):
                rejets["photo sans licence libre ou sans auteur"] += 1
                continue
            if len(gardes) >= quota or par_pays[lieu["pays"]] >= max_par_pays:
                continue
            par_pays[lieu["pays"]] += 1
            gardes.append({**lieu, **info})
        print(f"Commons : {len(gardes)}/{quota} lieux gardés")
    for raison, nombre in rejets.items():
        print(f"  écartés : {nombre} ({raison})")
    return gardes


def majuscule_initiale(texte):
    """Wikidata écrit « parc national de… » : on affiche « Parc national de… »."""
    return texte[:1].upper() + texte[1:]


def vers_pack(lieu):
    return {
        "id": "l" + lieu["qid"][1:],
        "nom": majuscule_initiale(lieu["nom"]),
        "pays": majuscule_initiale(lieu["pays"]),
        "lat": lieu["lat"],
        "lng": lieu["lng"],
        "image": lieu["image"],
        "auteur": lieu["auteur"],
        "licence": lieu["licence"],
        "difficulte": lieu["difficulte"],
    }


def lire_exclus():
    if not os.path.exists(EXCLUS):
        with open(EXCLUS, "w", encoding="utf-8", newline="\n") as f:
            f.write("[]\n")
        return []
    with open(EXCLUS, encoding="utf-8") as f:
        return json.load(f)


def ecrire_pack(pack):
    # Un lieu par ligne : les différences restent lisibles dans git.
    lignes = ",\n".join("  " + json.dumps(lieu, ensure_ascii=False) for lieu in pack)
    with open(PACK, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"[\n{lignes}\n]\n")


def ecrire_apercu(lieux, exclus):
    """Page de vignettes : cocher les photos inutilisables, puis copier la liste des exclus."""
    cartes = []
    for lieu in lieux:
        identifiant = "l" + lieu["qid"][1:]
        coche = " checked" if identifiant in exclus else ""
        cartes.append(
            f'<label class="carte"><img loading="lazy" src="{html.escape(lieu["apercu"])}" alt="">'
            f'<span><input type="checkbox" value="{identifiant}"{coche}> '
            f'<b>{html.escape(lieu["nom"])}</b><br>{html.escape(lieu["pays"])} · '
            f'difficulté {lieu["difficulte"]} · {lieu["liens"]} liens · {identifiant}</span></label>'
        )
    page = PAGE_APERCU.replace("{{NOMBRE}}", str(len(lieux))).replace("{{CARTES}}", "\n".join(cartes))
    with open(APERCU, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)


PAGE_APERCU = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>GéoQuiz : aperçu des photos</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; background: #f4f4f4; }
  header { position: sticky; top: 0; background: #f4f4f4; padding: 8px 0; z-index: 1; }
  .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .carte { display: block; background: white; border-radius: 8px; overflow: hidden; cursor: pointer; }
  .carte img { width: 100%; height: 180px; object-fit: cover; display: block; background: #ddd; }
  .carte span { display: block; padding: 8px; font-size: 14px; }
  .carte:has(input:checked) { outline: 4px solid #d33; opacity: .5; }
  textarea { width: 100%; height: 80px; }
</style>
</head>
<body>
<header>
  <b>{{NOMBRE}} lieux.</b> Coche les photos inutilisables (plan, logo, intérieur anonyme, nom écrit sur la photo…).
  <button id="liste">Liste des exclus (<span id="compte">0</span>)</button>
  <textarea id="sortie" hidden readonly></textarea>
</header>
<div class="grille">
{{CARTES}}
</div>
<script>
  const cases = [...document.querySelectorAll('input[type=checkbox]')];
  const coches = () => cases.filter((c) => c.checked).map((c) => c.value);
  const compter = () => { document.getElementById('compte').textContent = coches().length; };
  cases.forEach((c) => c.addEventListener('change', compter));
  compter();
  // À coller dans data/geoquiz-exclus.json.
  document.getElementById('liste').addEventListener('click', () => {
    const sortie = document.getElementById('sortie');
    sortie.hidden = false;
    sortie.value = JSON.stringify(coches());
    sortie.select();
  });
</script>
</body>
</html>
"""


def main():
    exclus = lire_exclus()
    lieux = []
    for difficulte, reglage in DIFFICULTES.items():
        candidats = chercher_candidats(difficulte)
        gardes = choisir_lieux(candidats, reglage["quota"], reglage["max_par_pays"])
        if len(gardes) < reglage["quota"]:
            print(f"Attention : seulement {len(gardes)} lieux {reglage['nom']} sur {reglage['quota']}.")
        lieux += gardes
    ecrire_pack([vers_pack(lieu) for lieu in lieux])
    ecrire_apercu(lieux, exclus)
    par_difficulte = Counter(lieu["difficulte"] for lieu in lieux)
    pays = len({lieu["pays"] for lieu in lieux})
    print(f"{len(lieux)} lieux écrits dans data/geoquiz.json ({pays} pays ; "
          f"faciles {par_difficulte[1]}, moyens {par_difficulte[2]}, difficiles {par_difficulte[3]}).")
    print("Aperçu : scripts/apercu-geoquiz.html")


if __name__ == "__main__":
    main()
