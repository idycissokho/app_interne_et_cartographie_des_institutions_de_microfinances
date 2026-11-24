"""
Imports sans doublon (rapport des lignes déjà en base ou répétées dans le fichier) et export
filtré par région.
"""

import io

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook

from apps.cartographie.models import ZoneGeographique
from apps.imf.models import IMF
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db
URL = "/api/v1/importation/"


@pytest.fixture(autouse=True)
def media_temporaire(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _importer(client, type_import, contenu: str):
    fichier = SimpleUploadedFile("donnees.csv", contenu.encode("utf-8"), content_type="text/csv")
    return client.post(URL, {"type_import": type_import, "fichier": fichier}, format="multipart")


def _region(code, nom, ouest, est):
    return ZoneGeographique.objects.create(
        code=code, nom=nom, type_zone="REGION",
        geometrie=MultiPolygon(Polygon(((ouest, 12.0), (est, 12.0), (est, 17.0), (ouest, 17.0), (ouest, 12.0))), srid=4326),
    )


class TestDoublons:
    def test_lignes_deja_en_base_et_repetees_dans_le_fichier(self, client_admin):
        IMF.objects.create(nom="Crédit Mutuel", sigle="CMS", numero_agrement="DK1-93-00001", type_imf="MUTUELLE", adresse_siege="Dakar")
        contenu = (
            "nom;sigle;numero_agrement;type_imf;adresse_siege\n"
            "Crédit Mutuel;CMS;DK1-93-00001;MUTUELLE;Dakar Plateau\n"   # ligne 2 : déjà en base
            "Nouvelle Caisse;NC;DK1-24-00002;MUTUELLE;Thiès\n"         # ligne 3 : nouvelle
            "Nouvelle Caisse;NC;DK1-24-00002;MUTUELLE;Thiès\n"         # ligne 4 : répète la ligne 3
        )
        r = _importer(client_admin, "IMF", contenu)
        assert r.status_code == 201, r.data
        assert IMF.objects.count() == 2  # aucun doublon créé
        assert (r.data["nb_lignes_creees"], r.data["nb_lignes_mises_a_jour"]) == (1, 2)
        doublons = {(d["ligne"], d["nature"]) for d in r.data["doublons"]}
        assert doublons == {(2, "base"), (4, "fichier")}
        repete = next(d for d in r.data["doublons"] if d["nature"] == "fichier")
        assert repete["ligne_precedente"] == 3 and "DK1-24-00002" in repete["libelle"]

    def test_points_de_service_repetes(self, client_admin):
        IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
        contenu = "imf_sigle;nom;type_point\nIMFA;Agence Plateau;AGENCE\nIMFA;Agence Plateau;AGENCE\n"
        r = _importer(client_admin, "POINTS_SERVICE", contenu)
        assert PointService.objects.count() == 1
        assert [(d["ligne"], d["nature"]) for d in r.data["doublons"]] == [(3, "fichier")]


class TestExportParRegion:
    @pytest.fixture
    def donnees(self):
        dakar, thies = _region("SN-DK", "Dakar", -17.6, -17.1), _region("SN-TH", "Thiès", -17.1, -16.2)
        a = IMF.objects.create(nom="Caisse Dakar", sigle="CD", type_imf="SA", adresse_siege="Dakar", region=dakar)
        b = IMF.objects.create(nom="Caisse Thiès", sigle="CT", type_imf="SA", adresse_siege="Thiès", region=thies)
        PointService.objects.create(imf=a, nom="Agence Dakar", localisation=Point(-17.44, 14.69, srid=4326))
        PointService.objects.create(imf=b, nom="Agence Thiès", localisation=Point(-16.9, 14.8, srid=4326))
        return dakar, thies

    def test_institutions_d_une_region(self, client_admin, donnees):
        dakar, _ = donnees
        r = client_admin.get(f"{URL}export/IMF/", {"region": str(dakar.pk)})
        assert r.status_code == 200
        assert "dakar" in r["Content-Disposition"]
        feuille = load_workbook(io.BytesIO(r.content)).active
        noms = [ligne[1] for ligne in feuille.iter_rows(min_row=2, values_only=True)]
        assert noms == ["Caisse Dakar"]

    def test_points_de_service_par_code_de_region(self, client_admin, donnees):
        r = client_admin.get(f"{URL}export/POINTS_SERVICE/", {"region": "SN-TH"})
        contenu = b"".join(r.streaming_content).decode("utf-8")
        assert "Agence Thiès" in contenu and "Agence Dakar" not in contenu

    def test_sans_region_tout_le_referentiel_et_region_inconnue(self, client_admin, donnees):
        r = client_admin.get(f"{URL}export/POINTS_SERVICE/")
        contenu = b"".join(r.streaming_content).decode("utf-8")
        assert "Agence Thiès" in contenu and "Agence Dakar" in contenu
        assert client_admin.get(f"{URL}export/IMF/", {"region": "inconnue"}).status_code == 400
