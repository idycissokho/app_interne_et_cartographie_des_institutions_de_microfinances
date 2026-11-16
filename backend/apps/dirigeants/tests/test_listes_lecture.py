"""
Champs de liste et endpoints en lecture ajoutés pour le frontend « Or & Nuit ».
"""

from datetime import date, timedelta

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon

from apps.audit.models import JournalAudit
from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF, Bailleur
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db


@pytest.fixture
def jeu():
    dakar = ZoneGeographique.objects.create(
        code="DK", nom="Dakar", type_zone="REGION",
        geometrie=MultiPolygon(Polygon(((-17.6, 14.6), (-17.1, 14.6), (-17.1, 14.9), (-17.6, 14.9), (-17.6, 14.6))), srid=4326),
    )
    fongip = Bailleur.objects.create(nom="FONGIP")
    imf = IMF.objects.create(nom="IMF A", sigle="IA", type_imf="SA", adresse_siege="Dakar",
                             email="a@imf.sn", localisation_siege=Point(-17.44, 14.69))
    imf.bailleurs.add(fongip)
    PointService.objects.create(imf=imf, nom="Siège", type_point="SIEGE", localisation=Point(-17.44, 14.69), nombre_membres=100)
    PointService.objects.create(imf=imf, nom="Guichet", type_point="GUICHET", nombre_membres=50)
    d1 = Dirigeant.objects.create(nom="Diop", prenom="Awa", email_professionnel="awa@ia.sn")
    d2 = Dirigeant.objects.create(nom="Fall", prenom="Ali")
    bientot = date.today() + timedelta(days=20)
    Mandat.objects.create(dirigeant=d1, imf=imf, fonction_mandat="DG", date_debut="2022-01-01", date_fin=bientot)
    Mandat.objects.create(dirigeant=d1, imf=imf, fonction_mandat="PCA", date_debut="2020-01-01", statut_mandat="SUSPENDU")
    Mandat.objects.create(dirigeant=d2, imf=imf, fonction_mandat="DG", date_debut="2023-01-01",
                          documents_justificatifs="https://doc.sn/pv")
    return {"imf": imf, "dakar": dakar, "d1": d1, "bientot": bientot}


def test_liste_imf_enrichie(jeu, client_consultant):
    ligne = client_consultant.get("/api/v1/imf/").data["results"][0]
    assert ligne["email"] == "a@imf.sn"
    assert ligne["a_gps"] is True
    assert ligne["bailleurs_noms"] == ["FONGIP"]
    assert ligne["nb_dirigeants_en_fonction"] == 2
    assert ligne["region_siege"] == "Dakar"
    assert ligne["nb_points_service"] == 2


def test_fiche_imf_agregats(jeu, client_consultant):
    fiche = client_consultant.get(f"/api/v1/imf/{jeu['imf'].pk}/").data
    assert fiche["nb_regions_couvertes"] == 1
    assert fiche["nb_membres_total"] == 150


def test_liste_points_enrichie_et_filtre_sans_gps(jeu, client_consultant):
    res = client_consultant.get("/api/v1/points-service/?ordering=nom").data["results"]
    assert {r["nom"]: r["a_gps"] for r in res} == {"Guichet": False, "Siège": True}
    assert res[1]["nombre_membres"] == 100 and res[1]["imf_sigle"] == "IA"
    assert client_consultant.get("/api/v1/points-service/?sans_gps=true").data["count"] == 1


def test_points_recherche_tri_et_fiche(jeu, client_consultant):
    url = "/api/v1/points-service/"
    PointService.objects.filter(nom="Guichet").update(lieu_dit="Marché Sandaga", telephone="33 800 00 00")
    # Recherche : localité, téléphone, institution.
    assert client_consultant.get(f"{url}?search=sandaga").data["count"] == 1
    assert client_consultant.get(f"{url}?search=33 800").data["count"] == 1
    assert client_consultant.get(f"{url}?search=IA").data["count"] == 2
    # Tri : les valeurs vides restent en dernier, dans les deux sens.
    autre = PointService.objects.create(imf=jeu["imf"], nom="Bureau", type_point="BUREAU")
    for sens in ("nombre_membres", "-nombre_membres"):
        noms = [p["nom"] for p in client_consultant.get(f"{url}?ordering={sens}").data["results"]]
        assert noms[-1] == "Bureau"
    assert [p["nom"] for p in client_consultant.get(f"{url}?ordering=-nombre_membres").data["results"]][0] == "Siège"
    assert client_consultant.get(f"{url}?ordering=region__nom,nom").data["results"][0]["nom"] == "Siège"
    # Sans tri demandé : ordre par défaut inchangé, sans erreur.
    assert client_consultant.get(url).data["count"] == 3
    # Liste et fiche portent les libellés de localisation.
    ligne = client_consultant.get(f"{url}?search=sandaga").data["results"][0]
    assert ligne["lieu_dit"] == "Marché Sandaga" and "departement_nom" in ligne
    fiche = client_consultant.get(f"{url}{autre.pk}/").data
    assert fiche["imf_sigle"] == "IA" and fiche["region_nom"] is None


def test_mandats_globaux_filtres_et_non_journalises(jeu, client_consultant):
    url = "/api/v1/dirigeants/mandats/"
    tous = client_consultant.get(url).data
    assert tous["count"] == 3
    assert tous["results"][0]["imf_region"] == "Dakar"
    assert tous["results"][0]["dirigeant_email"] == "awa@ia.sn"

    limite = (date.today() + timedelta(days=30)).isoformat()
    proches = client_consultant.get(f"{url}?date_fin__lte={limite}").data
    assert [m["fonction_mandat"] for m in proches["results"]] == ["DG"]
    assert client_consultant.get(f"{url}?statut_mandat=EN_FONCTION").data["count"] == 2
    assert client_consultant.get(f"{url}?sans_justificatif=true").data["count"] == 2
    assert not JournalAudit.objects.filter(action="CONSULTATION").exists()


def test_mandats_globaux_recherche_tri_et_region(jeu, client_consultant):
    url = "/api/v1/dirigeants/mandats/"
    autre = IMF.objects.create(nom="Autre IMF", sigle="AU", type_imf="SA", adresse_siege="Thiès",
                               numero_agrement="TH1-20-00001")
    Mandat.objects.create(dirigeant=jeu["d1"], imf=autre, fonction_mandat="GERANT", date_debut="2021-01-01")

    # Recherche : chaque mot doit se retrouver (dirigeant ou institution).
    assert client_consultant.get(f"{url}?search=awa diop").data["count"] == 3
    assert client_consultant.get(f"{url}?search=TH1-20").data["count"] == 1
    # Tous les dirigeants d'une institution, d'une région.
    assert client_consultant.get(f"{url}?imf={autre.pk}").data["count"] == 1
    assert client_consultant.get(f"{url}?imf__region={jeu['dakar'].pk}").data["count"] == 3
    # Tri par institution puis fonction.
    tries = client_consultant.get(f"{url}?ordering=imf__nom,imf,fonction_mandat").data["results"]
    assert [m["imf_nom"] for m in tries] == ["Autre IMF", "IMF A", "IMF A", "IMF A"]
    assert [m["fonction_mandat"] for m in tries[1:]] == ["DG", "DG", "PCA"]
    assert "dirigeant_telephone" in tries[0]


def test_compteur_mandats_juste_avec_filtre_fonction(jeu, client_consultant):
    res = client_consultant.get("/api/v1/dirigeants/?mandats__fonction_mandat=DG").data["results"]
    awa = next(d for d in res if d["nom_complet"] == "Awa Diop")
    assert len(res) == 2
    assert awa["nb_mandats"] == 2


def test_principaux_bailleurs_par_region(jeu, client_consultant):
    zones = client_consultant.get("/api/v1/cartographie/zones/agregats/?type_zone=REGION").data
    assert zones[0]["principaux_bailleurs"] == ["FONGIP"]


def test_filtre_imf_par_date_de_creation(jeu, client_consultant):
    demain = (date.today() + timedelta(days=1)).isoformat()
    assert client_consultant.get(f"/api/v1/imf/?date_creation__gte={demain}").data["count"] == 0
    assert client_consultant.get("/api/v1/imf/?date_creation__gte=2000-01-01").data["count"] == 1
