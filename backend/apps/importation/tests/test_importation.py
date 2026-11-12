"""
importation/tests/test_importation.py
=====================================
Import CSV/Excel (création, mise à jour idempotente, rapport d'erreurs) et export CSV.
"""

import io

import pytest
from django.contrib.gis.geos import MultiPolygon, Polygon
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from apps.audit.models import JournalAudit
from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db
URL = "/api/v1/importation/"


@pytest.fixture(autouse=True)
def media_temporaire(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _csv(contenu: str, nom="donnees.csv"):
    return SimpleUploadedFile(nom, contenu.encode("utf-8"), content_type="text/csv")


def _importer(client, type_import, fichier):
    return client.post(URL, {"type_import": type_import, "fichier": fichier}, format="multipart")


def test_import_imf_csv_puis_mise_a_jour_sans_doublon(client_superviseur):
    contenu = (
        "nom;sigle;type_imf;adresse_siege;latitude;longitude\n"
        "Crédit Mutuel du Sénégal;CMS;MUTUELLE;Dakar;14,69;-17,44\n"
        "Mauvaise IMF;MAU;BANQUE;Thiès;;\n"
    )
    resp = _importer(client_superviseur, "IMF", _csv(contenu))
    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == "TERMINE"
    assert resp.data["nb_lignes_importees"] == 1
    assert resp.data["nb_lignes_erreur"] == 1
    assert resp.data["rapport_erreurs"][0]["ligne"] == 3
    assert "type_imf" in resp.data["rapport_erreurs"][0]["erreurs"]

    cms = IMF.objects.get(sigle="CMS")
    assert round(cms.localisation_siege.y, 2) == 14.69

    # Réimport : mise à jour de l'existant, cellule vide = valeur conservée
    _importer(client_superviseur, "IMF", _csv("sigle;nom;type_imf;adresse_siege;telephone\nCMS;Crédit Mutuel du Sénégal;MUTUELLE;Dakar Plateau;\n"))
    assert IMF.objects.count() == 1
    cms.refresh_from_db()
    assert cms.adresse_siege == "Dakar Plateau"
    assert cms.localisation_siege is not None

    entree = JournalAudit.objects.filter(action="IMPORTATION").first()
    assert entree.details["lignes_creees"] == 0 and entree.details["lignes_mises_a_jour"] == 1


def test_import_points_service_excel_resout_imf_et_zones(client_superviseur):
    imf = IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    region = ZoneGeographique.objects.create(
        code="DK", nom="Dakar", type_zone="REGION",
        geometrie=MultiPolygon(Polygon(((-17.6, 14.6), (-17.1, 14.6), (-17.1, 14.9), (-17.6, 14.9), (-17.6, 14.6))), srid=4326),
    )
    wb = Workbook()
    ws = wb.active
    ws.append(["IMF", "Nom", "type_point", "latitude", "longitude", "encours", "date_ouverture"])
    ws.append(["imfa", "Agence Plateau", "AGENCE", 14.69, -17.44, "1 500 000,50", None])
    ws.append(["INCONNUE", "Agence X", "AGENCE", None, None, None, None])
    buffer = io.BytesIO()
    wb.save(buffer)
    fichier = SimpleUploadedFile("points.xlsx", buffer.getvalue())

    resp = _importer(client_superviseur, "POINTS_SERVICE", fichier)
    assert resp.data["nb_lignes_importees"] == 1, resp.data["rapport_erreurs"]
    assert "imf" in resp.data["rapport_erreurs"][0]["erreurs"]
    ps = PointService.objects.get()
    assert ps.imf == imf and ps.region == region
    assert str(ps.encours) == "1500000.50"


def test_import_dirigeants_avec_mandat(client_superviseur):
    IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    contenu = (
        "nom,prenom,email_professionnel,imf,fonction_mandat,date_debut,date_fin\n"
        "Diop,Awa,awa@imfa.sn,IMFA,DG,2024-01-01,\n"
        "Diop,Awa,awa@imfa.sn,IMFA,DG,2024-01-01,\n"
        "Sow,Ali,,IMFA,PCA,2024-01-01,2023-01-01\n"
    )
    resp = _importer(client_superviseur, "DIRIGEANTS", _csv(contenu))
    assert resp.data["nb_lignes_importees"] == 2
    assert resp.data["rapport_erreurs"][0]["ligne"] == 4
    assert Dirigeant.objects.filter(nom="Diop").count() == 1
    assert Mandat.objects.count() == 1
    # La ligne en erreur est entièrement annulée (pas de dirigeant orphelin).
    assert not Dirigeant.objects.filter(nom="Sow").exists()


@pytest.mark.parametrize(
    "fichier,message",
    [
        (SimpleUploadedFile("x.txt", b"abc"), "Format"),
    ],
)
def test_fichier_refuse(client_superviseur, fichier, message):
    resp = _importer(client_superviseur, "IMF", fichier)
    assert resp.status_code == 400
    assert message in str(resp.data["fichier"])


def test_colonnes_obligatoires_absentes_echec(client_superviseur):
    resp = _importer(client_superviseur, "IMF", _csv("nom;sigle\nA;B\n"))
    assert resp.data["statut"] == "ECHEC"
    assert "adresse_siege" in resp.data["rapport_erreurs"][0]["erreurs"]["fichier"]


def test_consultant_ne_peut_pas_importer(client_consultant):
    resp = _importer(client_consultant, "IMF", _csv("nom\nA\n"))
    assert resp.status_code == 403


def test_export_reimportable(client_superviseur):
    IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    resp = client_superviseur.get("/api/v1/importation/export/imf/")
    assert resp.status_code == 200
    contenu = b"".join(resp.streaming_content).decode("utf-8-sig")
    assert contenu.splitlines()[0].startswith("nom;sigle;type_imf")
    assert JournalAudit.objects.filter(action="EXPORTATION").exists()

    retour = _importer(client_superviseur, "IMF", _csv(contenu))
    assert retour.data["nb_lignes_erreur"] == 0, retour.data["rapport_erreurs"]
    assert IMF.objects.count() == 1


def test_modele_et_type_inconnu(client_consultant):
    assert client_consultant.get("/api/v1/importation/modeles/dirigeants/").status_code == 200
    assert client_consultant.get("/api/v1/importation/modeles/inconnu/").status_code == 404
