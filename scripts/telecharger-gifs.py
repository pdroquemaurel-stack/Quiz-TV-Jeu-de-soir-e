"""
Complète le catalogue des GIF du mode La légende avec les "GIF templates" d'Imgflip
(docs/modes/legende.md).

Usage :
    pip install requests
    python scripts/telecharger-gifs.py

Résultat :
    public/gifs/        -> les vidéos .mp4, nommées <id Imgflip>.mp4
    data/legende.json   -> le catalogue, un GIF par ligne, à relire à la main

On peut relancer le script : les GIF déjà au catalogue sont ignorés, et une entrée
existante n'est jamais modifiée (les "garder": false de la relecture restent).
Un nouveau GIF arrive en "garder": true. Une vidéo de plus de 1 Mo est supprimée
aussitôt et inscrite en "garder": false.
Après chaque lancement : relire, puis node scripts/verifier-legende.js
"""

import json
import os
import re
import time

import requests

NB_PAGES = 5          # environ 40 templates par page
MAX_GIFS = 100        # nombre total d'entrées voulues dans le catalogue (None = pas de limite)
PAUSE = 1.0           # secondes entre deux requêtes, pour rester poli avec le site
TAILLE_MAX_OCTETS = 1000000   # même limite que scripts/verifier-legende.js

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_PUBLIC = os.path.join(RACINE, "public")
DOSSIER = os.path.join(DOSSIER_PUBLIC, "gifs")
CATALOGUE = os.path.join(RACINE, "data", "legende.json")

session = requests.Session()
session.headers["User-Agent"] = "QuizTV-catalogue/1.0 (usage perso)"


def lire_page(url):
    reponse = session.get(url, timeout=20)
    reponse.raise_for_status()
    time.sleep(PAUSE)
    return reponse.text


def lister_templates(page):
    """Renvoie la liste des (id, slug) présents sur une page de liste."""
    html = lire_page(f"https://imgflip.com/gif-templates?page={page}")
    trouves = re.findall(r'/memetemplate/(\d+)/([^"\s?#]+)', html)
    # Chaque template apparaît plusieurs fois (titre + image) : on dédoublonne
    return list(dict.fromkeys(trouves))


def trouver_video(template_id, slug):
    """Ouvre la page du template et renvoie l'URL de la vidéo .mp4, ou None."""
    html = lire_page(f"https://imgflip.com/memetemplate/{template_id}/{slug}")
    # Seulement les .mp4 : un .gif ne se lit pas dans la balise <video> de la TV
    match = re.search(r'//i\.imgflip\.com/([a-z0-9]+)\.mp4', html)
    if not match:
        return None
    return f"https://i.imgflip.com/{match.group(1)}.mp4"


def telecharger(url, chemin):
    reponse = session.get(url, timeout=60)
    reponse.raise_for_status()
    with open(chemin, "wb") as f:
        f.write(reponse.content)
    time.sleep(PAUSE)


def charger_catalogue():
    if os.path.exists(CATALOGUE):
        with open(CATALOGUE, encoding="utf-8") as f:
            return json.load(f)
    return []


def sauver_catalogue(catalogue):
    """Un GIF par ligne, comme les autres fichiers de data/ : plus simple à relire."""
    lignes = [json.dumps(gif, ensure_ascii=False, separators=(",", ":")) for gif in catalogue]
    with open(CATALOGUE, "w", encoding="utf-8", newline="\n") as f:
        f.write("[\n  " + ",\n  ".join(lignes) + "\n]\n")


def main():
    os.makedirs(DOSSIER, exist_ok=True)
    catalogue = charger_catalogue()
    deja_faits = {gif["id"] for gif in catalogue}

    for page in range(1, NB_PAGES + 1):
        print(f"--- Page {page} ---")
        for template_id, slug in lister_templates(page):
            gif_id = f"g{template_id}"
            if gif_id in deja_faits:
                continue
            if MAX_GIFS is not None and len(catalogue) >= MAX_GIFS:
                print(f"\nLimite de {MAX_GIFS} GIF atteinte.")
                return

            fichier = f"gifs/{template_id}.mp4"   # relatif à public/, c'est aussi l'URL servie
            chemin = os.path.join(DOSSIER_PUBLIC, fichier)
            try:
                url = trouver_video(template_id, slug)
                if url is None:
                    print(f"  pas de vidéo .mp4 : {slug}")
                    continue
                telecharger(url, chemin)
            except requests.RequestException as erreur:
                print(f"  erreur sur {slug} : {erreur}")
                continue

            garder = os.path.getsize(chemin) <= TAILLE_MAX_OCTETS
            if not garder:
                os.remove(chemin)
                print(f"  trop lourd, exclu : {slug}")

            catalogue.append({
                "id": gif_id,
                "nom": slug.replace("-", " ").strip(),
                "fichier": fichier,
                "garder": garder,   # passe à false pour exclure un GIF du jeu (et supprime sa vidéo)
            })
            deja_faits.add(gif_id)
            sauver_catalogue(catalogue)   # sauvegarde au fil de l'eau
            if garder:
                print(f"  ok : {slug}")

    print(f"\nTerminé : {len(catalogue)} GIF dans data/legende.json")


if __name__ == "__main__":
    main()
