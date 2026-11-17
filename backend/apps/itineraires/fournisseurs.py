"""
itineraires/fournisseurs.py
===========================
Moteurs de calcul d'itinéraire, derrière une interface commune.

Le moteur est choisi par la variable d'environnement ROUTING_PROVIDER (défaut : « valhalla »)
et joint à l'adresse ROUTING_URL :
  - démonstration : une instance publique de Valhalla (usage modéré, voir docs/itineraire.md) ;
  - intranet : un Valhalla installé sur le serveur, avec la carte OpenStreetMap du Sénégal.

Un fournisseur calcule UN mode à la fois et renvoie un ResultatMode :
  - « ok »               : trajet trouvé ;
  - « aucun_itineraire » : le moteur répond, mais aucun chemin ne relie les deux points ;
  - « indisponible »     : le moteur ne propose pas ce mode pour ce trajet (profil absent,
                           distance au-delà de sa limite…) ; aucune estimation n'est inventée ;
  - une ErreurFournisseur est levée si le moteur est injoignable, trop lent ou en erreur.

Confidentialité : les coordonnées ne sont jamais écrites dans les journaux.
"""

import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from django.conf import settings

MODES = ("pied", "moto", "voiture")


class ErreurFournisseur(Exception):
    """Le moteur d'itinéraire est injoignable, trop lent ou renvoie une réponse inexploitable."""


class FournisseurNonConfigure(ErreurFournisseur):
    """Aucun moteur n'est configuré sur ce serveur (ROUTING_URL vide ou ROUTING_PROVIDER inconnu)."""


@dataclass
class ResultatMode:
    """Résultat du calcul pour un mode de déplacement."""

    statut: str
    distance_km: float | None = None
    duree_min: float | None = None
    #: LineString GeoJSON, coordonnées [longitude, latitude].
    geometrie: dict | None = None
    #: [{"instruction", "distance_km", "duree_min"}], instructions en français.
    etapes: list[dict] = field(default_factory=list)
    message: str = ""


class FournisseurItineraire(ABC):
    """Interface commune des moteurs d'itinéraire."""

    nom: str = ""

    @abstractmethod
    def calculer(self, origine: tuple[float, float], destination: tuple[float, float], mode: str) -> ResultatMode:
        """Itinéraire de `origine` à `destination`, chacun en (latitude, longitude), pour `mode` (voir MODES)."""


# ---------------------------------------------------------------------------
# Valhalla
# ---------------------------------------------------------------------------

def decoder_polyline(texte: str, precision: int = 6) -> list[list[float]]:
    """Décode une polyline encodée (Valhalla : précision 6) en [[longitude, latitude], …]."""
    coordonnees, index, lat, lon = [], 0, 0, 0
    facteur = 10 ** precision
    while index < len(texte):
        valeurs = []
        for _ in range(2):
            resultat, decalage = 0, 0
            while True:
                octet = ord(texte[index]) - 63
                index += 1
                resultat |= (octet & 0x1F) << decalage
                decalage += 5
                if octet < 0x20:
                    break
            valeurs.append(~(resultat >> 1) if resultat & 1 else resultat >> 1)
        lat += valeurs[0]
        lon += valeurs[1]
        coordonnees.append([round(lon / facteur, 6), round(lat / facteur, 6)])
    return coordonnees


class ValhallaFournisseur(FournisseurItineraire):
    """Valhalla (https://github.com/valhalla/valhalla) : profils piéton, moto et voiture, consignes en français."""

    nom = "valhalla"
    PROFILS = {"pied": "pedestrian", "moto": "motorcycle", "voiture": "auto"}
    #: Codes d'erreur Valhalla : aucun chemin entre les points, ou aucune route près d'un point.
    SANS_CHEMIN = {442, 443, 171, 170}
    #: Distance au-delà de la limite du serveur pour ce profil.
    TROP_LOIN = {154, 155, 156, 157}

    def __init__(self, url: str, timeout: float = 10, user_agent: str = "cartographie-imf/1.0"):
        if not url:
            raise FournisseurNonConfigure(
                "Le calcul d'itinéraire n'est pas configuré sur ce serveur (variable ROUTING_URL)."
            )
        self.url = url.rstrip("/")
        self.timeout = timeout
        self.user_agent = user_agent

    def calculer(self, origine, destination, mode) -> ResultatMode:
        profil = self.PROFILS.get(mode)
        if profil is None:
            return ResultatMode(statut="indisponible", message="Ce mode de déplacement n'est pas proposé.")
        corps = {
            "locations": [{"lat": origine[0], "lon": origine[1]}, {"lat": destination[0], "lon": destination[1]}],
            "costing": profil,
            "units": "kilometers",
            "language": "fr-FR",
            "directions_options": {"units": "kilometers", "language": "fr-FR"},
        }
        statut_http, reponse = self._envoyer(corps)
        if statut_http == 200:
            return self._lire_trajet(reponse)
        return self._lire_refus(statut_http, reponse)

    def _envoyer(self, corps: dict) -> tuple[int, dict]:
        requete = urllib.request.Request(
            f"{self.url}/route",
            data=json.dumps(corps).encode(),
            headers={"Content-Type": "application/json", "User-Agent": self.user_agent},
            method="POST",
        )
        try:
            with urllib.request.urlopen(requete, timeout=self.timeout) as reponse:
                return reponse.status, json.load(reponse)
        except urllib.error.HTTPError as erreur:
            if erreur.code == 429 or erreur.code >= 500:
                raise ErreurFournisseur("Le service d'itinéraire est momentanément indisponible.") from None
            try:
                return erreur.code, json.load(erreur)
            except ValueError:
                return erreur.code, {}
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            raise ErreurFournisseur("Le service d'itinéraire ne répond pas.") from None
        except ValueError:
            raise ErreurFournisseur("Réponse illisible du service d'itinéraire.") from None

    @staticmethod
    def _lire_trajet(reponse: dict) -> ResultatMode:
        try:
            trajet = reponse["trip"]
            resume = trajet["summary"]
            coordonnees = [c for etape in trajet["legs"] for c in decoder_polyline(etape["shape"])]
            etapes = [
                {
                    "instruction": m.get("instruction", ""),
                    "distance_km": round(float(m.get("length", 0)), 2),
                    "duree_min": round(float(m.get("time", 0)) / 60, 1),
                }
                for etape in trajet["legs"]
                for m in etape.get("maneuvers", [])
            ]
            return ResultatMode(
                statut="ok",
                distance_km=round(float(resume["length"]), 2),
                duree_min=round(float(resume["time"]) / 60, 1),
                geometrie={"type": "LineString", "coordinates": coordonnees},
                etapes=etapes,
            )
        except (KeyError, TypeError, ValueError, IndexError):
            raise ErreurFournisseur("Réponse illisible du service d'itinéraire.") from None

    def _lire_refus(self, statut_http: int, reponse: dict) -> ResultatMode:
        code = reponse.get("error_code") if isinstance(reponse, dict) else None
        if code in self.SANS_CHEMIN:
            return ResultatMode(
                statut="aucun_itineraire",
                message="Aucun itinéraire trouvé : le départ ou l'arrivée est peut-être trop loin d'une route.",
            )
        if code in self.TROP_LOIN:
            return ResultatMode(statut="indisponible", message="Trajet trop long pour ce mode chez le fournisseur.")
        return ResultatMode(statut="indisponible", message="Ce mode n'est pas disponible chez le fournisseur.")


FOURNISSEURS: dict[str, type[FournisseurItineraire]] = {"valhalla": ValhallaFournisseur}


def obtenir_fournisseur() -> FournisseurItineraire:
    """Fournisseur configuré par ROUTING_PROVIDER / ROUTING_URL / ROUTING_TIMEOUT."""
    nom = (settings.ROUTING_PROVIDER or "").strip().lower()
    classe = FOURNISSEURS.get(nom)
    if classe is None:
        raise FournisseurNonConfigure(f"Fournisseur d'itinéraire inconnu : « {nom} » (ROUTING_PROVIDER).")
    return classe(settings.ROUTING_URL, settings.ROUTING_TIMEOUT, settings.ROUTING_USER_AGENT)
