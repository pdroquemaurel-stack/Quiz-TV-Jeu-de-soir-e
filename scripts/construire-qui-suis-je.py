"""
Complète le catalogue du mode Qui suis-je ? avec la photo principale de l'article Wikipédia
de chaque personnage (docs/modes/qui-suis-je.md, « Contenu »). Jamais exécuté par le serveur.

Usage :
    pip install requests
    py scripts/construire-qui-suis-je.py

Pour chaque personnage sans photo : l'image principale de l'article Wikipédia en français
(toujours libre), sinon celle de l'article anglais, même non libre (affiches, dessins officiels).
Les personnages déjà illustrés ne sont pas touchés.

Résultat :
    data/qui-suis-je.json             -> réécrit, un personnage par ligne
    scripts/apercu-qui-suis-je.html   -> page de vignettes pour relire les photos (non commitée)

Pour changer une mauvaise photo : retirer image, auteur et licence du personnage et corriger
son titre Wikipédia, ou retirer le personnage.
"""

import html
import json
import os
import re
import sys
import time

import requests

# Largeur de la miniature, en pixels. Commons n'en sert que quelques-unes (… 1280, 1920…).
LARGEUR_PHOTO = 1280
LARGEUR_APERCU = 330    # vignettes de la page d'aperçu
PAUSE = 1.0             # secondes entre deux requêtes, pour rester poli
ESSAIS = 5

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGUE = os.path.join(RACINE, "data", "qui-suis-je.json")
APERCU = os.path.join(RACINE, "scripts", "apercu-qui-suis-je.html")

URL_WIKIPEDIA = "https://{langue}.wikipedia.org/w/api.php"

session = requests.Session()
# Wikimedia demande un User-Agent explicite. On peut y ajouter une adresse de contact.
session.headers["User-Agent"] = "QuizTV-QuiSuisJe/1.0 (jeu de soiree entre amis, usage perso)"

# Licences libres : CC BY, CC BY-SA, CC0, domaine public, « No restrictions »
# (archives sans restriction connue) et OGL (licence ouverte du gouvernement britannique).
# Les autres images sont créditées « Droits réservés ».
LICENCE_LIBRE = re.compile(r"^(cc[ -]by|cc0|cc[ -]zero|public domain|pd\b|domaine public|no restrictions|ogl)", re.I)
HOTE_IMAGES = re.compile(r"^https://(upload|thumb)\.wikimedia\.org/")


def demander(url, params):
    """GET avec quelques essais : une erreur réseau persistante arrête le script."""
    for essai in range(1, ESSAIS + 1):
        attente = 15 * essai
        try:
            reponse = session.get(url, params=params, timeout=60)
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


def article(langue, titre, licence):
    """L'article (redirections suivies), avec son image principale et son lien vers l'anglais.
    licence : « free » (images libres seulement) ou « any ». Renvoie (page, raison d'un échec)."""
    donnees = demander(URL_WIKIPEDIA.format(langue=langue), {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "titles": titre,
        "redirects": "1",
        "prop": "pageimages|pageprops|langlinks",
        "piprop": "name",
        "pilicense": licence,
        "ppprop": "disambiguation",
        "lllang": "en",
    })
    pages = donnees.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") or pages[0].get("invalid"):
        return None, "article introuvable"
    if "disambiguation" in pages[0].get("pageprops", {}):
        return None, "page d'homonymie"
    return pages[0], None


def fichier_photo(titre):
    """(langue, fichier) de l'image principale : article français, sinon anglais. Ou (None, None, raison)."""
    page, raison = article("fr", titre, "free")
    if raison:
        return None, None, raison
    # Une image SVG est souvent un logo (« S » de Superman) : on tente plutôt l'article anglais.
    if page.get("pageimage") and not page["pageimage"].lower().endswith(".svg"):
        return "fr", page["pageimage"], None
    liens = page.get("langlinks", [])
    if not liens:
        return None, None, "pas d'image sur l'article français, et pas d'article anglais"
    page_en, raison = article("en", liens[0]["title"], "any")
    if raison:
        return None, None, f"article anglais « {liens[0]['title']} » : {raison}"
    if page_en.get("pageimage"):
        return "en", page_en["pageimage"], None
    return None, None, "pas d'image principale, ni en français ni en anglais"


def texte_brut(valeur):
    """Les métadonnées des images sont en HTML : on garde le texte seul."""
    sans_balises = re.sub(r"<[^>]+>", " ", valeur or "")
    return re.sub(r"\s+", " ", html.unescape(sans_balises)).strip()


def nettoyer_auteur(auteur):
    """« No machine-readable author provided. Preslav~commonswiki assumed (…) » -> « Preslav »."""
    match = re.match(r"No machine-readable author provided\. (.+?) assumed", auteur)
    if match:
        auteur = match.group(1)
    return auteur.replace("~commonswiki", "").strip()


def sans_parametres(url):
    """Wikimedia ajoute « ?utm_source=… » aux liens : inutile pour afficher l'image."""
    return url.split("?", 1)[0]


def infos_photo(langue, fichier):
    """{image, auteur, licence} du fichier, ou (None, raison). Le Wikipédia de la langue
    connaît aussi bien ses propres fichiers que ceux de Commons."""
    if fichier.lower().endswith(".svg"):
        return None, f"image principale en SVG, sans doute un logo ({fichier})"
    donnees = demander(URL_WIKIPEDIA.format(langue=langue), {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "titles": f"File:{fichier}",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": LARGEUR_PHOTO,
        "iiextmetadatafilter": "Artist|LicenseShortName",
    })
    pages = donnees.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None, f"fichier introuvable ({fichier})"
    info = pages[0]["imageinfo"][0]
    # Sans métadonnées, l'API renvoie une liste vide au lieu d'un objet.
    meta = info.get("extmetadata") or {}
    photo = {
        "image": sans_parametres(info.get("thumburl") or info.get("url")),
        "auteur": nettoyer_auteur(texte_brut(meta.get("Artist", {}).get("value"))),
        "licence": texte_brut(meta.get("LicenseShortName", {}).get("value")),
    }
    if not HOTE_IMAGES.match(photo["image"]):
        return None, "image hors de Wikimedia"
    if not LICENCE_LIBRE.match(photo["licence"]):
        photo["licence"] = "Droits réservés"
        photo["auteur"] = photo["auteur"] or "Wikipédia"
    # Une œuvre ancienne du domaine public n'a souvent pas d'auteur connu.
    photo["auteur"] = photo["auteur"] or "Auteur inconnu"
    return photo, None


def illustrer(personnage):
    """Ajoute image, auteur et licence au personnage. Renvoie la raison d'un échec, ou None."""
    langue, fichier, raison = fichier_photo(personnage["wikipedia"])
    if raison:
        return raison
    photo, raison = infos_photo(langue, fichier)
    if raison:
        return raison
    personnage.update(photo)
    return None


def lire_catalogue():
    with open(CATALOGUE, encoding="utf-8") as f:
        return json.load(f)


def ecrire_catalogue(catalogue):
    # Un personnage par ligne : les différences restent lisibles dans git.
    lignes = ",\n".join("  " + json.dumps(personnage, ensure_ascii=False) for personnage in catalogue)
    with open(CATALOGUE, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"[\n{lignes}\n]\n")


def vignette(image):
    """La miniature de 1 280 px devient une vignette de 330 px (même adresse, autre largeur)."""
    return image.replace(f"/{LARGEUR_PHOTO}px-", f"/{LARGEUR_APERCU}px-")


def ecrire_apercu(catalogue):
    """Page de vignettes, pour relire les photos d'un coup."""
    cartes = []
    for personnage in catalogue:
        if personnage.get("image"):
            visuel = f'<img loading="lazy" src="{html.escape(vignette(personnage["image"]))}" alt="">'
            credit = f'<br><small>{html.escape(personnage["auteur"])}, {html.escape(personnage["licence"])}</small>'
        else:
            visuel = '<div class="vide">sans photo</div>'
            credit = ""
        niveau = "facile" if personnage["niveau"] == 1 else "difficile"
        cartes.append(
            f'<div class="carte">{visuel}<span><b>{html.escape(personnage["nom"])}</b><br>'
            f'{html.escape(personnage["categorie"])} · {niveau} · {personnage["id"]}{credit}</span></div>'
        )
    avec_photo = sum(1 for personnage in catalogue if personnage.get("image"))
    page = (PAGE_APERCU
            .replace("{{NOMBRE}}", str(len(catalogue)))
            .replace("{{AVEC_PHOTO}}", str(avec_photo))
            .replace("{{CARTES}}", "\n".join(cartes)))
    with open(APERCU, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)


PAGE_APERCU = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Qui suis-je ? : aperçu des photos</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; background: #f4f4f4; }
  .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .carte { background: white; border-radius: 8px; overflow: hidden; }
  .carte img, .vide { width: 100%; height: 260px; object-fit: contain; display: block; background: #222; }
  .vide { color: #aaa; display: flex; align-items: center; justify-content: center; }
  .carte span { display: block; padding: 8px; font-size: 14px; }
</style>
</head>
<body>
<p><b>{{NOMBRE}} personnages, {{AVEC_PHOTO}} avec photo.</b>
  Repère les photos à changer (mauvaise personne, photo floue, logo au lieu du personnage…).</p>
<div class="grille">
{{CARTES}}
</div>
</body>
</html>
"""


def main():
    catalogue = lire_catalogue()
    a_illustrer = [p for p in catalogue if not p.get("image")]
    print(f"{len(a_illustrer)} personnages à illustrer.")
    echecs = []
    for numero, personnage in enumerate(a_illustrer, 1):
        print(f"[{numero}/{len(a_illustrer)}] {personnage['nom']}…")
        raison = illustrer(personnage)
        if raison:
            echecs.append((personnage, raison))
        else:
            # Écrit à chaque photo : un arrêt en cours de route ne perd rien.
            ecrire_catalogue(catalogue)
    ecrire_catalogue(catalogue)
    ecrire_apercu(catalogue)

    avec_photo = sum(1 for personnage in catalogue if personnage.get("image"))
    non_libres = sum(1 for personnage in catalogue if personnage.get("licence") == "Droits réservés")
    print(f"\n{len(a_illustrer) - len(echecs)} photos ajoutées, {avec_photo} personnages illustrés "
          f"sur {len(catalogue)} (dont {non_libres} images non libres).")
    if echecs:
        print("Restés sans photo :")
        for personnage, raison in echecs:
            print(f"  {personnage['id']} ({personnage['wikipedia']}) : {raison}")
    print("Aperçu : scripts/apercu-qui-suis-je.html")


if __name__ == "__main__":
    main()
