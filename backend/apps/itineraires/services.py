"""
itineraires/services.py
=======================
Règles métier de la section « Itinéraire » :
  - fiabilité d'une position (GPS présent, pas la position par défaut, dans le Sénégal) ;
  - destination relue en base à partir de son identifiant (jamais de coordonnées du client) ;
  - recherche des destinations géolocalisées de façon fiable ;
  - calcul des modes en parallèle, avec cache (config/cache_donnees.py).

Confidentialité : la position de l'utilisateur n'est ni enregistrée en base ni journalisée.
Elle est arrondie à environ 50 m avant d'être transmise au moteur et d'entrer dans le cache.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass

from django.db.models import Q
from django.http import Http404

from apps.imf.models import IMF
from apps.points_service.models import PointService
from config.cache_donnees import en_cache

from .fournisseurs import MODES, ErreurFournisseur, ResultatMode, obtenir_fournisseur

#: Emprise du Sénégal (longitude min, latitude min, longitude max, latitude max),
#: identique à dansLeSenegal() du frontend (data/projection.ts).
EMPRISE_SENEGAL = (-17.56, 12.28, -11.34, 16.71)
#: Marge autour du Sénégal tolérée pour le point de départ, en degrés (≈ 55 km).
MARGE_ORIGINE = 0.5
#: Position attribuée par défaut dans les fichiers sources quand le GPS est inconnu.
POSITION_PAR_DEFAUT = (14.75, -17.33333)
TOLERANCE_DEFAUT = 0.0001
#: Pas d'arrondi de l'origine : 0,0005° ≈ 55 m.
PAS_ORIGINE = 0.0005
DUREE_CACHE = 600
TYPES = ("institution", "point_service")


class DestinationSansPosition(Exception):
    """La destination existe mais n'a pas de position GPS fiable."""


def dans_le_senegal(lat: float, lon: float, marge: float = 0) -> bool:
    lon_min, lat_min, lon_max, lat_max = EMPRISE_SENEGAL
    return (lat_min - marge) <= lat <= (lat_max + marge) and (lon_min - marge) <= lon <= (lon_max + marge)


def raison_position_non_fiable(point) -> str | None:
    """None si la position est fiable, sinon la raison (texte affichable)."""
    if point is None:
        return "aucune coordonnée GPS n'est enregistrée"
    lat, lon = point.y, point.x
    if abs(lat - POSITION_PAR_DEFAUT[0]) < TOLERANCE_DEFAUT and abs(lon - POSITION_PAR_DEFAUT[1]) < TOLERANCE_DEFAUT:
        return "les coordonnées enregistrées sont la position par défaut du fichier source"
    if not dans_le_senegal(lat, lon):
        return "les coordonnées enregistrées sont hors du Sénégal"
    return None


def arrondir_origine(lat: float, lon: float) -> tuple[float, float]:
    return (round(round(lat / PAS_ORIGINE) * PAS_ORIGINE, 4), round(round(lon / PAS_ORIGINE) * PAS_ORIGINE, 4))


# ---------------------------------------------------------------------------
# Destinations
# ---------------------------------------------------------------------------

@dataclass
class Destination:
    type: str
    id: str
    nom: str
    sous_titre: str
    adresse: str
    telephone: str
    region: str | None
    lat: float
    lon: float

    def en_dict(self) -> dict:
        return asdict(self)


def _depuis_imf(imf: IMF) -> Destination:
    return Destination(
        type="institution", id=str(imf.pk), nom=imf.nom,
        sous_titre=f"Institution · {imf.sigle}" if imf.sigle else "Institution (siège)",
        adresse=imf.adresse_siege or imf.lieu_dit, telephone=imf.telephone,
        region=imf.region.nom if imf.region_id else None,
        lat=round(imf.localisation_siege.y, 6), lon=round(imf.localisation_siege.x, 6),
    )


def _depuis_point(point: PointService) -> Destination:
    return Destination(
        type="point_service", id=str(point.pk), nom=point.nom,
        sous_titre=f"{point.get_type_point_display()} · {point.imf.sigle or point.imf.nom}",
        adresse=point.adresse or point.lieu_dit, telephone=point.telephone,
        region=point.region.nom if point.region_id else None,
        lat=round(point.localisation.y, 6), lon=round(point.localisation.x, 6),
    )


def obtenir_destination(type_destination: str, identifiant) -> Destination:
    """Destination relue en base. Http404 si inconnue ou désactivée, DestinationSansPosition si GPS non fiable."""
    if type_destination == "institution":
        imf = IMF.objects.filter(pk=identifiant, is_active=True).select_related("region").first()
        if imf is None:
            raise Http404("Institution introuvable.")
        raison = raison_position_non_fiable(imf.localisation_siege)
        if raison:
            raise DestinationSansPosition(f"La position de cette institution n'est pas valide : {raison}.")
        return _depuis_imf(imf)
    if type_destination == "point_service":
        point = (
            PointService.objects.filter(pk=identifiant, is_active=True, imf__is_active=True)
            .select_related("imf", "region")
            .first()
        )
        if point is None:
            raise Http404("Point de service introuvable.")
        raison = raison_position_non_fiable(point.localisation)
        if raison:
            raise DestinationSansPosition(f"La position de ce point de service n'est pas valide : {raison}.")
        return _depuis_point(point)
    raise Http404("Type de destination inconnu.")


def rechercher_destinations(texte: str, nb_imf: int = 8, nb_points: int = 12) -> list[Destination]:
    """IMF (nom, sigle, agrément) et points de service (nom, localité, IMF), positions fiables uniquement."""
    texte = texte.strip()
    if len(texte) < 2:
        return []
    imfs = (
        IMF.objects.filter(is_active=True, localisation_siege__isnull=False)
        .filter(Q(nom__icontains=texte) | Q(sigle__icontains=texte) | Q(numero_agrement__icontains=texte))
        .select_related("region")
        .order_by("nom")[: nb_imf * 5]
    )
    points = (
        PointService.objects.filter(is_active=True, imf__is_active=True, localisation__isnull=False)
        .filter(
            Q(nom__icontains=texte) | Q(lieu_dit__icontains=texte) | Q(imf__nom__icontains=texte)
            | Q(imf__sigle__icontains=texte) | Q(imf__numero_agrement__icontains=texte)
        )
        .select_related("imf", "region")
        .order_by("nom")[: nb_points * 5]
    )
    fiables_imf = [_depuis_imf(i) for i in imfs if raison_position_non_fiable(i.localisation_siege) is None]
    fiables_pts = [_depuis_point(p) for p in points if raison_position_non_fiable(p.localisation) is None]
    return fiables_imf[:nb_imf] + fiables_pts[:nb_points]


def destinations_carte() -> list[dict]:
    """Toutes les structures à la position fiable, pour les épingles de la carte (version courte, en cache).

    Sièges des IMF actives et points de service actifs ; deux requêtes SQL, aucun objet modèle.
    """

    def calcul() -> list[dict]:
        imfs = IMF.objects.filter(is_active=True, localisation_siege__isnull=False).values_list(
            "id", "nom", "sigle", "localisation_siege"
        )
        points = PointService.objects.filter(
            is_active=True, imf__is_active=True, localisation__isnull=False
        ).values_list("id", "nom", "type_point", "statut_point", "imf__nom", "imf__sigle", "localisation")
        resultat = [
            {"type": "institution", "id": str(i), "nom": nom, "sous_titre": sigle or "Institution",
             "type_point": "IMF", "statut": "", "lat": round(pos.y, 5), "lon": round(pos.x, 5)}
            for i, nom, sigle, pos in imfs
            if raison_position_non_fiable(pos) is None
        ]
        resultat += [
            {"type": "point_service", "id": str(i), "nom": nom, "sous_titre": imf_sigle or imf_nom,
             "type_point": type_point, "statut": statut, "lat": round(pos.y, 5), "lon": round(pos.x, 5)}
            for i, nom, type_point, statut, imf_nom, imf_sigle, pos in points
            if raison_position_non_fiable(pos) is None
        ]
        return resultat

    return en_cache("itineraire_carte", calcul)


# ---------------------------------------------------------------------------
# Calcul
# ---------------------------------------------------------------------------

class _ResultatPartiel(Exception):
    """Un mode a échoué pour une raison technique : le résultat est rendu mais pas mis en cache."""

    def __init__(self, resultat: dict):
        super().__init__()
        self.resultat = resultat


def calculer_itineraire(origine: tuple[float, float], destination: Destination, modes: list[str]) -> dict:
    """Calcule les modes demandés en parallèle.

    Lève ErreurFournisseur si aucun mode n'a pu être calculé pour une raison technique
    (moteur injoignable, délai dépassé…). Un résultat incomplet n'est pas mis en cache.
    """
    fournisseur = obtenir_fournisseur()  # FournisseurNonConfigure avant tout calcul
    depart = arrondir_origine(*origine)
    arrivee = (destination.lat, destination.lon)

    def un_mode(mode: str) -> ResultatMode:
        try:
            return fournisseur.calculer(depart, arrivee, mode)
        except ErreurFournisseur as erreur:
            return ResultatMode(statut="erreur", message=str(erreur))

    def calcul() -> dict:
        with ThreadPoolExecutor(max_workers=len(modes)) as groupe:
            resultats = dict(zip(modes, groupe.map(un_mode, modes), strict=True))
        erreurs = [r for r in resultats.values() if r.statut == "erreur"]
        if len(erreurs) == len(resultats):
            raise ErreurFournisseur(erreurs[0].message)
        reussis = {m: r for m, r in resultats.items() if r.statut == "ok"}
        resultat = {
            "fournisseur": fournisseur.nom,
            "modes": {m: asdict(r) for m, r in resultats.items()},
            "plus_rapide": min(reussis, key=lambda m: reussis[m].duree_min) if reussis else None,
        }
        if erreurs:
            raise _ResultatPartiel(resultat)
        return resultat

    parametres = (fournisseur.nom, depart, destination.type, destination.id, arrivee, tuple(sorted(modes)))
    try:
        return en_cache("itineraire", calcul, *parametres, duree=DUREE_CACHE)
    except _ResultatPartiel as partiel:
        return partiel.resultat


def modes_valides(modes: list[str] | None) -> list[str]:
    """Modes demandés, sans doublon, dans l'ordre de MODES (tous par défaut)."""
    return [m for m in MODES if not modes or m in modes]
