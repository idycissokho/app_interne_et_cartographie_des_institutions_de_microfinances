"""
Départements officiels et rattachement des points à leur région / département d'après le GPS
(commandes charger_departements et rattacher_zones).
"""

from io import StringIO

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.core.management import CommandError, call_command

from apps.cartographie.models import ZoneGeographique
from apps.cartographie.positions import raison_position_non_fiable
from apps.imf.models import IMF
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db


def _carre(x0, y0, x1, y1):
    return MultiPolygon(Polygon(((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))), srid=4326)


def _lancer(*args) -> str:
    sortie = StringIO()
    call_command(*args, stdout=sortie)
    return sortie.getvalue()


# ── Chargement des 46 départements ──────────────────────────────────────────
def test_charger_departements_exige_les_regions():
    with pytest.raises(CommandError, match="charger_regions"):
        call_command("charger_departements")


def test_charger_departements_rattache_aux_regions():
    call_command("charger_regions", stdout=StringIO())
    assert "46 créé(s)" in _lancer("charger_departements")
    assert "46 mis à jour" in _lancer("charger_departements")  # relançable sans doublon
    departements = ZoneGeographique.objects.filter(type_zone="DEPARTEMENT")
    assert departements.count() == 46
    assert departements.filter(parent__isnull=True).count() == 0
    assert departements.get(nom="Keur Massar").parent.nom == "Dakar"
    assert departements.get(nom="Saint-Louis").parent.nom == "Saint-Louis"
    # Un point de Bambey (GPS réel) tombe dans le département de Bambey, région de Diourbel.
    zones = ZoneGeographique.localiser(Point(-16.4613, 14.6987, srid=4326))
    assert (zones["region"].nom, zones["departement"].nom) == ("Diourbel", "Bambey")


# ── Rattachement d'après le GPS ─────────────────────────────────────────────
@pytest.fixture
def zones():
    dakar = ZoneGeographique.objects.create(code="R1", nom="Dakar", type_zone="REGION", geometrie=_carre(-17.6, 14.6, -17.1, 14.9))
    thies = ZoneGeographique.objects.create(code="R2", nom="Thiès", type_zone="REGION", geometrie=_carre(-17.1, 14.6, -16.5, 15.0))
    pikine = ZoneGeographique.objects.create(code="D1", nom="Pikine", type_zone="DEPARTEMENT", parent=dakar, geometrie=_carre(-17.6, 14.6, -17.1, 14.9))
    mbour = ZoneGeographique.objects.create(code="D2", nom="Mbour", type_zone="DEPARTEMENT", parent=thies, geometrie=_carre(-17.1, 14.6, -16.5, 15.0))
    return {"dakar": dakar, "thies": thies, "pikine": pikine, "mbour": mbour}


@pytest.fixture
def imf():
    return IMF.objects.create(nom="IMF", sigle="I", type_imf="MUTUELLE", adresse_siege="Dakar")


def _point_sans_zones(imf, nom, lon, lat, **champs):
    """Point créé puis vidé de ses zones (comme après un import sans département)."""
    point = PointService.objects.create(imf=imf, nom=nom, localisation=Point(lon, lat, srid=4326))
    PointService.objects.filter(pk=point.pk).update(**{"region": None, "departement": None, "commune": None, **champs})
    return point


def test_rattacher_remplit_les_champs_vides(zones, imf):
    point = _point_sans_zones(imf, "Agence Thiaroye", -17.38, 14.75)
    sortie = _lancer("rattacher_zones")
    point.refresh_from_db()
    assert (point.region, point.departement) == (zones["dakar"], zones["pikine"])
    assert "complétés : 1" in sortie


def test_rattacher_ne_remplace_pas_une_valeur_saisie(zones, imf):
    point = _point_sans_zones(imf, "Agence", -17.38, 14.75, departement=zones["pikine"], region=zones["dakar"])
    _lancer("rattacher_zones")
    point.refresh_from_db()
    assert point.departement == zones["pikine"]


def test_rattacher_signale_une_region_contredite_par_le_gps(zones, imf):
    """Région saisie « Thiès » mais GPS à Dakar : rien n'est rempli, le point est signalé."""
    point = _point_sans_zones(imf, "Agence douteuse", -17.38, 14.75, region=zones["thies"])
    sortie = _lancer("rattacher_zones")
    point.refresh_from_db()
    assert point.departement is None
    assert "Agence douteuse" in sortie and "contredit la position GPS" in sortie


def test_rattacher_ignore_les_positions_non_fiables(zones, imf):
    point = _point_sans_zones(imf, "Agence défaut", -17.33333, 14.75)
    sortie = _lancer("rattacher_zones")
    point.refresh_from_db()
    assert point.region is None and point.departement is None
    assert "non fiables ignorées : 1" in sortie


def test_rattacher_simulation_ne_modifie_rien(zones, imf):
    point = _point_sans_zones(imf, "Agence", -17.38, 14.75)
    sortie = _lancer("rattacher_zones", "--simulation")
    point.refresh_from_db()
    assert point.departement is None
    assert "seraient complétés : 1" in sortie


def test_rattacher_region_du_siege_des_imf(zones, imf):
    IMF.objects.filter(pk=imf.pk).update(localisation_siege=Point(-16.9, 14.8, srid=4326), region=None)
    _lancer("rattacher_zones")
    imf.refresh_from_db()
    assert imf.region == zones["thies"]


def test_enregistrement_d_un_point_complete_le_departement(zones, imf):
    point = PointService.objects.create(imf=imf, nom="Agence", localisation=Point(-16.9, 14.8, srid=4326))
    assert (point.region, point.departement) == (zones["thies"], zones["mbour"])


def test_enregistrement_ignore_la_position_par_defaut(zones, imf):
    """14.75 / -17.33333 est la position « inconnue » des fichiers sources : aucune zone n'en est déduite."""
    point = PointService.objects.create(imf=imf, nom="Agence", localisation=Point(-17.33333, 14.75, srid=4326))
    assert point.region is None and point.departement is None
    siege = IMF.objects.create(nom="IMF 2", type_imf="SA", adresse_siege="?", localisation_siege=Point(-17.33333, 14.75, srid=4326))
    assert siege.region is None


def test_enregistrement_respecte_la_region_saisie(zones, imf):
    """Région saisie Thiès, GPS à Dakar : le département de Dakar n'est pas ajouté."""
    point = PointService.objects.create(imf=imf, nom="Agence", region=zones["thies"], localisation=Point(-17.38, 14.75, srid=4326))
    assert point.region == zones["thies"] and point.departement is None


@pytest.mark.parametrize("point, fiable", [
    (None, False), (Point(-17.33333, 14.75), False), (Point(2.35, 48.85), False), (Point(-17.44, 14.69), True),
])
def test_position_fiable(point, fiable):
    assert (raison_position_non_fiable(point) is None) == fiable
