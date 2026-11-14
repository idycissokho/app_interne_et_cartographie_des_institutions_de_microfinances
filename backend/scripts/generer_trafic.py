#!/usr/bin/env python
"""
scripts/generer_trafic.py
=========================
Génère du trafic sur l'API pour alimenter les tableaux de bord de l'APM
(New Relic) : latence par endpoint, taux d'erreur, débit, traces.

Le script se connecte avec un compte existant, puis appelle en boucle les
endpoints de lecture depuis plusieurs « utilisateurs » simultanés. Une petite
part des appels vise volontairement une ressource inexistante (404) ou omet le
jeton (401) afin de faire apparaître des erreurs dans l'APM.

Aucune donnée n'est créée, modifiée ou supprimée (requêtes GET uniquement,
hormis la connexion).

Usage (depuis la racine du projet) :
  docker compose exec backend python scripts/generer_trafic.py \
      --email admin@exemple.sn --duree 120 --utilisateurs 5

Le mot de passe est demandé au clavier, ou lu dans la variable APM_PASSWORD.
Dépendances : bibliothèque standard uniquement.
"""

import argparse
import getpass
import json
import os
import random
import statistics
import threading
import time
import urllib.error
import urllib.request

# (chemin, poids) — les endpoints cartographiques sont les plus sollicités,
# comme dans l'usage réel de l'application.
ENDPOINTS = [
    ("cartographie/zones/agregats/", 5),
    ("cartographie/zones/geojson/", 4),
    ("points-service/geojson/", 4),
    ("imf/", 4),
    ("points-service/", 3),
    ("dirigeants/", 2),
    ("dirigeants/mandats/", 1),
    ("imf/bailleurs/", 1),
    ("auth/profil/", 1),
    # Erreurs volontaires : ressource inexistante -> 404.
    ("imf/00000000-0000-0000-0000-000000000000/", 1),
]


def appeler(url: str, jeton: str | None = None, donnees: dict | None = None) -> tuple[int, float, bytes]:
    """Exécute une requête et retourne (code HTTP, durée en ms, corps)."""
    entetes = {"Accept": "application/json"}
    corps = None
    if jeton:
        entetes["Authorization"] = f"Bearer {jeton}"
    if donnees is not None:
        corps = json.dumps(donnees).encode()
        entetes["Content-Type"] = "application/json"

    requete = urllib.request.Request(url, data=corps, headers=entetes)
    debut = time.perf_counter()
    try:
        with urllib.request.urlopen(requete, timeout=60) as reponse:
            contenu = reponse.read()
            code = reponse.status
    except urllib.error.HTTPError as erreur:
        contenu = erreur.read()
        code = erreur.code
    except (urllib.error.URLError, TimeoutError):
        contenu = b""
        code = 0  # serveur injoignable ou délai dépassé
    return code, (time.perf_counter() - debut) * 1000, contenu


def utilisateur_virtuel(base: str, jeton: str, fin: float, pause: float, resultats: list, verrou: threading.Lock) -> None:
    chemins = [chemin for chemin, _ in ENDPOINTS]
    poids = [p for _, p in ENDPOINTS]
    while time.time() < fin:
        chemin = random.choices(chemins, weights=poids)[0]
        # ~3 % des appels sans jeton -> 401.
        jeton_utilise = None if random.random() < 0.03 else jeton
        code, duree, _ = appeler(base + chemin, jeton_utilise)
        with verrou:
            resultats.append((chemin, code, duree))
        time.sleep(random.uniform(0, pause * 2))


def main() -> int:
    analyseur = argparse.ArgumentParser(description="Génère du trafic sur l'API pour l'APM.")
    analyseur.add_argument("--url", default="http://localhost:8000/api/v1/", help="racine de l'API")
    analyseur.add_argument("--email", default=os.environ.get("APM_EMAIL"), help="compte utilisé (ou APM_EMAIL)")
    analyseur.add_argument("--duree", type=int, default=60, help="durée en secondes (défaut : 60)")
    analyseur.add_argument("--utilisateurs", type=int, default=3, help="utilisateurs simultanés (défaut : 3)")
    analyseur.add_argument("--pause", type=float, default=0.5, help="pause moyenne entre deux appels, en s")
    args = analyseur.parse_args()

    if not args.email:
        analyseur.error("--email est requis (ou la variable APM_EMAIL)")
    mot_de_passe = os.environ.get("APM_PASSWORD") or getpass.getpass(f"Mot de passe de {args.email} : ")
    base = args.url.rstrip("/") + "/"

    code, _, contenu = appeler(base + "auth/login/", donnees={"email": args.email, "password": mot_de_passe})
    if code != 200:
        print(f"Connexion impossible (HTTP {code}) : {contenu.decode(errors='replace')[:200]}")
        return 1
    jeton = json.loads(contenu)["access"]

    print(f"{args.utilisateurs} utilisateur(s) pendant {args.duree} s sur {base} … (Ctrl+C pour arrêter)")
    resultats: list[tuple[str, int, float]] = []
    verrou = threading.Lock()
    fin = time.time() + args.duree
    fils = [
        threading.Thread(target=utilisateur_virtuel, args=(base, jeton, fin, args.pause, resultats, verrou), daemon=True)
        for _ in range(args.utilisateurs)
    ]
    for fil in fils:
        fil.start()
    try:
        while any(fil.is_alive() for fil in fils):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nArrêt demandé.")

    with verrou:
        mesures = list(resultats)
    if not mesures:
        print("Aucune requête effectuée.")
        return 1

    print(f"\n{'Endpoint':<48}{'Appels':>7}{'Erreurs':>9}{'Moy. ms':>9}{'P95 ms':>9}")
    for chemin, _ in ENDPOINTS:
        lignes = [(c, d) for ch, c, d in mesures if ch == chemin]
        if not lignes:
            continue
        durees = sorted(d for _, d in lignes)
        erreurs = sum(1 for c, _ in lignes if c == 0 or c >= 400)
        p95 = durees[min(len(durees) - 1, int(len(durees) * 0.95))]
        print(f"{chemin:<48}{len(lignes):>7}{erreurs:>9}{statistics.mean(durees):>9.0f}{p95:>9.0f}")

    total_erreurs = sum(1 for _, c, _ in mesures if c == 0 or c >= 400)
    print(f"\nTotal : {len(mesures)} requêtes, {total_erreurs} en erreur ({total_erreurs / len(mesures):.1%}).")
    print("Les mêmes chiffres apparaissent dans New Relic sous 1 à 2 minutes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
