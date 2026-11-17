"""
cartographie/positions.py
=========================
Fiabilité d'une position GPS, règle commune à toute l'application (itinéraires, rattachement
automatique aux zones administratives).

Une position n'est pas fiable si elle est absente, si c'est la position attribuée par défaut
dans les fichiers sources quand le GPS est inconnu (14.75 / -17.33333), ou si elle est hors du
Sénégal. Une telle position ne doit servir ni à calculer un trajet ni à déduire une région,
un département ou une commune.
"""

#: Emprise du Sénégal (longitude min, latitude min, longitude max, latitude max),
#: identique à dansLeSenegal() du frontend (data/projection.ts).
EMPRISE_SENEGAL = (-17.56, 12.28, -11.34, 16.71)
#: Position attribuée par défaut dans les fichiers sources quand le GPS est inconnu.
POSITION_PAR_DEFAUT = (14.75, -17.33333)
TOLERANCE_DEFAUT = 0.0001


def dans_le_senegal(lat: float, lon: float, marge: float = 0) -> bool:
    lon_min, lat_min, lon_max, lat_max = EMPRISE_SENEGAL
    return (lat_min - marge) <= lat <= (lat_max + marge) and (lon_min - marge) <= lon <= (lon_max + marge)


def raison_position_non_fiable(point) -> str | None:
    """None si la position (Point GEOS, x = longitude) est fiable, sinon la raison (texte affichable)."""
    if point is None:
        return "aucune coordonnée GPS n'est enregistrée"
    lat, lon = point.y, point.x
    if abs(lat - POSITION_PAR_DEFAUT[0]) < TOLERANCE_DEFAUT and abs(lon - POSITION_PAR_DEFAUT[1]) < TOLERANCE_DEFAUT:
        return "les coordonnées enregistrées sont la position par défaut du fichier source"
    if not dans_le_senegal(lat, lon):
        return "les coordonnées enregistrées sont hors du Sénégal"
    return None
