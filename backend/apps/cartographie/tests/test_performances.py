"""
cartographie/tests/test_performances.py
=======================================
Garde-fous de performance : nombre maximal de requêtes SQL par endpoint de liste,
absence de requêtes « N+1 », cache des statistiques et de la carte, et cohérence
des compteurs agrégés avec les listes qu'ils remplacent.

Si l'un de ces tests échoue après une modification, un endpoint s'est remis à
exécuter des requêtes en boucle : corriger le queryset (select_related,
prefetch_related, annotation) plutôt que relever le plafond.
"""

from datetime import date, timedelta

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF, Bailleur
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db

# Endpoint -> nombre maximal de requêtes SQL (hors authentification).
PLAFONDS = {
    "/api/v1/imf/": 3,                                    # comptage + page + bailleurs
    "/api/v1/imf/options/": 1,
    "/api/v1/points-service/": 2,                         # comptage + page
    "/api/v1/points-service/geojson/": 1,
    "/api/v1/dirigeants/": 2,
    "/api/v1/dirigeants/mandats/": 2,
    "/api/v1/cartographie/zones/agregats/": 2,            # zones + bailleurs de toutes les zones
    "/api/v1/cartographie/zones/geojson/": 1,
    "/api/v1/cartographie/statistiques/": 9,
}


def _jeu_de_donnees(nombre: int) -> None:
    """`nombre` IMF, chacune avec un bailleur, deux points géolocalisés et deux mandats."""
    region, _ = ZoneGeographique.objects.get_or_create(
        code="SN-DK",
        defaults={
            "nom": "Dakar", "type_zone": "REGION",
            "geometrie": MultiPolygon(
                Polygon(((-17.6, 14.5), (-17.0, 14.5), (-17.0, 15.0), (-17.6, 15.0), (-17.6, 14.5))), srid=4326
            ),
        },
    )
    depart = IMF.objects.count()
    for i in range(depart, depart + nombre):
        imf = IMF.objects.create(
            nom=f"IMF {i}", sigle=f"I{i}", type_imf="MUTUELLE", statut_reglementaire="EN_ACTIVITE",
            adresse_siege="Dakar", region=region,
        )
        imf.bailleurs.add(Bailleur.objects.create(nom=f"Bailleur {i}", sigle=f"B{i}"))
        for j in range(2):
            PointService.objects.create(
                imf=imf, nom=f"Point {i}-{j}", type_point="AGENCE", region=region,
                localisation=Point(-17.4, 14.7, srid=4326),
            )
            dirigeant = Dirigeant.objects.create(nom=f"Nom{i}{j}", prenom="Awa")
            Mandat.objects.create(dirigeant=dirigeant, imf=imf, fonction_mandat="DG", date_debut=date(2024, 1, 1))


def _nombre_de_requetes(client, url: str) -> int:
    with CaptureQueriesContext(connection) as contexte:
        reponse = client.get(url)
    assert reponse.status_code == 200, (url, reponse.status_code)
    # La lecture de l'utilisateur par l'authentification JWT n'est pas imputée à l'endpoint.
    return sum("authentication_utilisateur" not in requete["sql"] for requete in contexte.captured_queries)


@pytest.mark.parametrize("url,plafond", PLAFONDS.items())
def test_nombre_de_requetes_plafonne_et_independant_du_volume(client_admin, url, plafond):
    """Le nombre de requêtes ne dépasse pas le plafond et ne grandit pas avec les données (pas de N+1)."""
    _jeu_de_donnees(3)
    avec_peu = _nombre_de_requetes(client_admin, url)
    _jeu_de_donnees(9)  # toute écriture invalide le cache : la mesure suivante est bien « à froid »
    avec_plus = _nombre_de_requetes(client_admin, url)
    assert avec_peu <= plafond, f"{url} : {avec_peu} requêtes SQL (plafond {plafond})"
    assert avec_plus == avec_peu, f"{url} : {avec_peu} requêtes pour 3 IMF, {avec_plus} pour 12 (requêtes en boucle)"


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/cartographie/statistiques/",
        "/api/v1/cartographie/zones/agregats/",
        "/api/v1/cartographie/zones/geojson/",
        "/api/v1/points-service/geojson/",
        "/api/v1/imf/options/",
    ],
)
def test_reponse_en_cache_puis_invalidee_par_une_ecriture(client_admin, url):
    _jeu_de_donnees(2)
    premiere = client_admin.get(url).json()
    assert _nombre_de_requetes(client_admin, url) == 0  # servie par le cache
    assert client_admin.get(url).json() == premiere

    _jeu_de_donnees(1)  # une écriture périme le cache
    assert _nombre_de_requetes(client_admin, url) > 0
    if url.endswith("geojson/") and "zones" in url:
        return  # les contours ne dépendent pas des IMF
    assert client_admin.get(url).json() != premiere


def test_statistiques_identiques_aux_compteurs_des_listes(client_admin):
    """Chaque compteur agrégé vaut le « count » de la liste filtrée qu'il remplace."""
    _jeu_de_donnees(4)
    IMF.objects.filter(sigle="I0").update(statut_reglementaire="OPR", type_imf="SA", telephone="33 800 00 00")
    IMF.objects.filter(sigle="I1").update(statut_reglementaire="RETRAIT_AGREMENT", is_active=False)
    PointService.objects.filter(nom="Point 2-0").update(localisation=None, type_point="GUICHET")
    Mandat.objects.filter(dirigeant__nom="Nom20").update(date_fin=date.today() + timedelta(days=10))
    Mandat.objects.filter(dirigeant__nom="Nom21").update(documents_justificatifs="https://exemple.sn/pv.pdf")
    Mandat.objects.filter(dirigeant__nom="Nom30").update(statut_mandat="SUSPENDU")
    from django.core.cache import cache
    cache.clear()  # les update() ci-dessus ne déclenchent pas les signaux

    def compte(url):
        return client_admin.get(f"/api/v1{url}").json()["count"]

    stats = client_admin.get("/api/v1/cartographie/statistiques/").json()
    dans_30_jours = (date.today() + timedelta(days=30)).isoformat()
    assert stats["imf"]["total"] == compte("/imf/?page_size=1") == 3
    assert stats["imf"]["en_activite"] == compte("/imf/?statut_reglementaire=EN_ACTIVITE&page_size=1")
    assert stats["imf"]["opr"] == compte("/imf/?statut_reglementaire=OPR&page_size=1") == 1
    assert stats["imf"]["retrait_agrement"] == compte("/imf/?statut_reglementaire=RETRAIT_AGREMENT&page_size=1") == 0
    assert stats["imf"]["en_activite_depuis_janvier"] == compte(
        f"/imf/?statut_reglementaire=EN_ACTIVITE&date_creation__gte={date.today().year}-01-01&page_size=1"
    )
    for type_imf in ("MUTUELLE", "COOPERATIVE", "SA"):
        assert stats["imf"]["par_type"][type_imf] == compte(f"/imf/?type_imf={type_imf}&page_size=1")
    assert stats["imf"]["avec_bailleur"] == 3
    assert stats["imf"]["incompletes"] == 3  # aucune n'a d'email ni de GPS de siège

    assert stats["points"]["total"] == compte("/points-service/?page_size=1")
    assert stats["points"]["sans_gps"] == compte("/points-service/?sans_gps=true&page_size=1") == 1
    for type_point in ("AGENCE", "GUICHET"):
        assert stats["points"]["par_type"][type_point] == compte(f"/points-service/?type_point={type_point}&page_size=1")

    assert stats["mandats"]["total"] == compte("/dirigeants/mandats/?page_size=1")
    assert stats["mandats"]["sans_justificatif"] == compte("/dirigeants/mandats/?sans_justificatif=true&page_size=1")
    assert stats["mandats"]["echeance_30j"] == compte(f"/dirigeants/mandats/?date_fin__lte={dans_30_jours}&page_size=1") == 1
    assert stats["dirigeants"]["en_fonction"] == compte("/dirigeants/?mandats__statut_mandat=EN_FONCTION&page_size=1")


def test_options_et_liste_imf_donnent_les_memes_valeurs(client_admin):
    _jeu_de_donnees(3)
    liste = {i["id"]: i for i in client_admin.get("/api/v1/imf/?page_size=1000").json()["results"]}
    options = client_admin.get("/api/v1/imf/options/").json()
    assert len(options) == len(liste) == 3
    for option in options:
        complet = liste[option["id"]]
        for champ in ("nom", "sigle", "type_imf", "statut_reglementaire", "region_siege", "nb_points_service"):
            assert option[champ] == complet[champ], champ
    assert options[0]["nb_points_service"] == 2 and options[0]["region_siege"] == "Dakar"


def test_geojson_des_points_format_et_filtres(client_admin):
    _jeu_de_donnees(2)
    PointService.objects.filter(nom="Point 0-1").update(localisation=None)
    from django.core.cache import cache
    cache.clear()
    collection = client_admin.get("/api/v1/points-service/geojson/").json()
    assert collection["type"] == "FeatureCollection" and len(collection["features"]) == 3
    point = collection["features"][0]
    assert point["type"] == "Feature" and point["geometry"] == {"type": "Point", "coordinates": [-17.4, 14.7]}
    assert set(point["properties"]) == {
        "nom", "imf", "imf_nom", "type_point", "est_siege", "statut_point",
        "region_nom", "departement_nom", "commune_nom", "telephone", "email",
    }
    assert point["properties"]["region_nom"] == "Dakar" and point["properties"]["imf_nom"].startswith("IMF ")
    imf = IMF.objects.get(sigle="I1")
    filtre = client_admin.get(f"/api/v1/points-service/geojson/?imf={imf.pk}").json()
    assert len(filtre["features"]) == 2 and all(f["properties"]["imf"] == str(imf.pk) for f in filtre["features"])


def test_agregats_par_region_avec_principaux_bailleurs(client_admin):
    _jeu_de_donnees(3)
    (zone,) = client_admin.get("/api/v1/cartographie/zones/agregats/?type_zone=REGION").json()
    assert (zone["nom"], zone["nb_imf"], zone["nb_points_service"]) == ("Dakar", 3, 6)
    assert zone["principaux_bailleurs"] == ["B0", "B1"]  # à égalité : ordre alphabétique, 2 au plus


def test_reponses_compressees(client_admin):
    _jeu_de_donnees(3)
    reponse = client_admin.get("/api/v1/points-service/geojson/", HTTP_ACCEPT_ENCODING="gzip")
    assert reponse["Content-Encoding"] == "gzip"
