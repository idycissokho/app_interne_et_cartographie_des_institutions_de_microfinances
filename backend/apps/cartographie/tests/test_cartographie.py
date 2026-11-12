"""
cartographie/tests/test_cartographie.py
=======================================
Rattachement automatique des points aux zones (PostGIS) et agrégats carte macro / micro.
"""

from decimal import Decimal

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon

from apps.cartographie.models import ZoneGeographique
from apps.imf.models import IMF, Bailleur
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db


def _carre(x0, y0, x1, y1):
    return MultiPolygon(Polygon(((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))), srid=4326)


@pytest.fixture
def zones():
    dakar = ZoneGeographique.objects.create(
        code="DK", nom="Dakar", type_zone="REGION", geometrie=_carre(-17.6, 14.6, -17.1, 14.9)
    )
    thies = ZoneGeographique.objects.create(
        code="TH", nom="Thiès", type_zone="REGION", geometrie=_carre(-17.1, 14.6, -16.5, 15.0)
    )
    dept = ZoneGeographique.objects.create(
        code="DK-DK", nom="Dakar (dépt)", type_zone="DEPARTEMENT", parent=dakar,
        geometrie=_carre(-17.6, 14.6, -17.3, 14.9),
    )
    return {"dakar": dakar, "thies": thies, "dept": dept}


@pytest.fixture
def imfs():
    return (
        IMF.objects.create(nom="IMF A", type_imf="MUTUELLE", adresse_siege="Dakar"),
        IMF.objects.create(nom="IMF B", type_imf="SA", adresse_siege="Thiès"),
    )


def test_point_rattache_automatiquement_aux_zones(zones, imfs):
    ps = PointService.objects.create(imf=imfs[0], nom="Agence Plateau", localisation=Point(-17.44, 14.69))
    assert ps.region == zones["dakar"]
    assert ps.departement == zones["dept"]
    assert ps.commune is None


def test_agregats_zone_detail_et_macro(zones, imfs, client_consultant):
    a, b = imfs
    PointService.objects.create(imf=a, nom="P1", localisation=Point(-17.44, 14.69), encours=100, depots=50, nombre_membres=10)
    PointService.objects.create(imf=a, nom="P2", localisation=Point(-17.40, 14.75), encours=200)
    PointService.objects.create(imf=b, nom="P3", localisation=Point(-17.45, 14.70), encours=300, is_active=False)
    PointService.objects.create(imf=b, nom="P4", localisation=Point(-16.9, 14.8), encours=400)

    detail = client_consultant.get(f"/api/v1/cartographie/zones/{zones['dakar'].pk}/").data["agregats"]
    assert detail["nb_points_service"] == 2
    assert detail["nb_imf"] == 1
    assert detail["encours_total"] == Decimal("300")
    assert detail["nb_membres_total"] == 10

    resp = client_consultant.get("/api/v1/cartographie/zones/agregats/?type_zone=REGION")
    assert resp.status_code == 200
    par_code = {z["code"]: z for z in resp.data}
    assert par_code["DK"]["nb_points_service"] == 2
    assert par_code["TH"]["nb_points_service"] == 1
    assert Decimal(par_code["TH"]["encours_total"]) == Decimal("400")


def test_agregats_type_zone_invalide(client_consultant):
    resp = client_consultant.get("/api/v1/cartographie/zones/agregats/?type_zone=PAYS")
    assert resp.status_code == 400


def test_geojson_points_non_pagine_et_filtrable(zones, imfs, client_consultant):
    bailleur = Bailleur.objects.create(nom="FONGIP")
    imfs[1].bailleurs.add(bailleur)
    for i in range(25):
        PointService.objects.create(imf=imfs[0], nom=f"P{i}", localisation=Point(-17.44, 14.69))
    PointService.objects.create(imf=imfs[1], nom="Thiès 1", localisation=Point(-16.9, 14.8))

    resp = client_consultant.get("/api/v1/points-service/geojson/")
    assert resp.data["type"] == "FeatureCollection"
    assert len(resp.data["features"]) == 26
    props = resp.data["features"][0]["properties"]
    assert {"imf_nom", "region_nom", "statut_point"} <= props.keys()

    par_region = client_consultant.get(f"/api/v1/points-service/geojson/?region={zones['thies'].pk}")
    assert len(par_region.data["features"]) == 1
    par_bailleur = client_consultant.get(f"/api/v1/points-service/geojson/?bailleur={bailleur.pk}")
    assert [f["properties"]["nom"] for f in par_bailleur.data["features"]] == ["Thiès 1"]


def test_parent_de_zone_doit_etre_coherent(zones, client_admin):
    resp = client_admin.post(
        "/api/v1/cartographie/zones/",
        {"code": "X", "nom": "X", "type_zone": "COMMUNE", "parent": str(zones["dakar"].pk)},
        format="json",
    )
    assert resp.status_code == 400
    assert "parent" in resp.data
