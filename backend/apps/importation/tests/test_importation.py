"""
importation/tests/test_importation.py
=====================================
Import CSV/Excel (création, mise à jour idempotente, rapport d'erreurs) et export CSV.
"""

import io

import pytest
from django.contrib.gis.geos import MultiPolygon, Polygon
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from apps.audit.models import JournalAudit
from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.importation.models import ImportationFichier
from apps.importation.processors import (
    PROCESSORS,
    BaseImportProcessor,
    ImportDirigeantProcessor,
    ImportIMFProcessor,
    ImportPointServiceProcessor,
    lancer_importation,
    scinder_nom_complet,
)
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


def test_import_imf_csv_puis_mise_a_jour_sans_doublon(client_admin):
    contenu = (
        "nom;sigle;type_imf;adresse_siege;latitude;longitude\n"
        "Crédit Mutuel du Sénégal;CMS;MUTUELLE;Dakar;14,69;-17,44\n"
        "Mauvaise IMF;MAU;BANQUE;Thiès;;\n"
    )
    resp = _importer(client_admin, "IMF", _csv(contenu))
    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == "TERMINE"
    assert resp.data["nb_lignes_importees"] == 1
    assert resp.data["nb_lignes_erreur"] == 1
    assert resp.data["rapport_erreurs"][0]["ligne"] == 3
    assert "type_imf" in resp.data["rapport_erreurs"][0]["erreurs"]

    cms = IMF.objects.get(sigle="CMS")
    assert round(cms.localisation_siege.y, 2) == 14.69

    # Réimport : mise à jour de l'existant, cellule vide = valeur conservée
    _importer(client_admin, "IMF", _csv("sigle;nom;type_imf;adresse_siege;telephone\nCMS;Crédit Mutuel du Sénégal;MUTUELLE;Dakar Plateau;\n"))
    assert IMF.objects.count() == 1
    cms.refresh_from_db()
    assert cms.adresse_siege == "Dakar Plateau"
    assert cms.localisation_siege is not None

    entree = JournalAudit.objects.filter(action="IMPORTATION").first()
    assert entree.details["lignes_creees"] == 0 and entree.details["lignes_mises_a_jour"] == 1


def test_import_points_service_excel_resout_imf_et_zones(client_admin):
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

    resp = _importer(client_admin, "POINTS_SERVICE", fichier)
    assert resp.data["nb_lignes_importees"] == 1, resp.data["rapport_erreurs"]
    assert "imf_sigle" in resp.data["rapport_erreurs"][0]["erreurs"]
    ps = PointService.objects.get()
    assert ps.imf == imf and ps.region == region
    assert str(ps.encours) == "1500000.50"


def test_import_dirigeants_avec_mandat(client_admin):
    IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    contenu = (
        "nom,prenom,email,imf_sigle,fonction_mandat,date_debut,date_fin\n"
        "Diop,Awa,awa@imfa.sn,IMFA,DG,2024-01-01,\n"
        "Diop,Awa,awa@imfa.sn,IMFA,DG,2024-01-01,\n"
        "Sow,Ali,,IMFA,PCA,2024-01-01,2023-01-01\n"
    )
    resp = _importer(client_admin, "DIRIGEANTS", _csv(contenu))
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
def test_fichier_refuse(client_admin, fichier, message):
    resp = _importer(client_admin, "IMF", fichier)
    assert resp.status_code == 400
    assert message in str(resp.data["fichier"])


def test_colonnes_obligatoires_absentes_echec(client_admin):
    resp = _importer(client_admin, "IMF", _csv("nom;sigle\nA;B\n"))
    assert resp.data["statut"] == "ECHEC"
    assert "adresse_siege" in resp.data["rapport_erreurs"][0]["erreurs"]["fichier"]


def test_consultant_ne_peut_pas_importer(client_consultant):
    resp = _importer(client_consultant, "IMF", _csv("nom\nA\n"))
    assert resp.status_code == 403


def test_export_reimportable(client_admin):
    IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    resp = client_admin.get("/api/v1/importation/export/imf/")
    assert resp.status_code == 200
    contenu = b"".join(resp.streaming_content).decode("utf-8-sig")
    assert contenu.splitlines()[0].startswith("nom;sigle;type_imf")
    assert JournalAudit.objects.filter(action="EXPORTATION").exists()

    retour = _importer(client_admin, "IMF", _csv(contenu))
    assert retour.data["nb_lignes_erreur"] == 0, retour.data["rapport_erreurs"]
    assert IMF.objects.count() == 1


def test_modele_et_type_inconnu(client_admin):
    assert client_admin.get("/api/v1/importation/modeles/dirigeants/").status_code == 200
    assert client_admin.get("/api/v1/importation/modeles/inconnu/").status_code == 404


# ---------------------------------------------------------------------------
# Processors
# ---------------------------------------------------------------------------

def _xlsx(feuilles: dict[str, list[list]], nom="classeur.xlsx"):
    """Classeur Excel en mémoire : { nom de feuille: lignes }."""
    wb = Workbook()
    wb.remove(wb.active)
    for titre, lignes in feuilles.items():
        ws = wb.create_sheet(titre)
        for ligne in lignes:
            ws.append(ligne)
    buffer = io.BytesIO()
    wb.save(buffer)
    return SimpleUploadedFile(nom, buffer.getvalue())


def _importation(type_import, contenu: bytes, nom="donnees.csv"):
    return ImportationFichier.objects.create(type_import=type_import, fichier=ContentFile(contenu, name=nom))


def test_un_processor_par_type_heritant_de_la_base():
    assert PROCESSORS == {
        "IMF": ImportIMFProcessor,
        "POINTS_SERVICE": ImportPointServiceProcessor,
        "DIRIGEANTS": ImportDirigeantProcessor,
    }
    assert all(issubclass(p, BaseImportProcessor) for p in PROCESSORS.values())
    assert set(PROCESSORS) == set(ImportationFichier.TypeImport.values)


def test_colonnes_du_cahier_des_charges_acceptees(client_admin):
    """Les trois jeux de colonnes demandés s'importent tels quels."""
    imf = "nom;sigle;type_imf;statut_reglementaire;adresse_siege;telephone;email\n" \
          "Mutuelle du Fleuve;MDF;Mutuelle;Agréée;Podor;33 965 00 00;contact@mdf.sn\n"
    points = "imf_sigle;nom;type_point;adresse;latitude;longitude;encours\n" \
             "MDF;Agence Podor;Agence;Quartier Lao Demba;16,65;-14,96;2 500 000\n"
    dirigeants = "nom;prenom;telephone;email;imf_sigle;fonction_mandat;date_debut\n" \
                 "Sy;Aminata;77 000 00 00;a.sy@mdf.sn;MDF;DG;01/03/2022\n"
    for type_import, contenu in (("IMF", imf), ("POINTS_SERVICE", points), ("DIRIGEANTS", dirigeants)):
        resp = _importer(client_admin, type_import, _csv(contenu))
        assert resp.data["statut"] == "TERMINE", resp.data["rapport_erreurs"]
        assert resp.data["nb_lignes_erreur"] == 0

    mdf = IMF.objects.get(sigle="MDF")
    assert (mdf.type_imf, mdf.statut_reglementaire) == ("MUTUELLE", "AGREE")
    assert str(PointService.objects.get(type_point="AGENCE").encours) == "2500000.00"
    # L'IMF importée reçoit son point de service « Siège ».
    assert PointService.objects.get(type_point="SIEGE").nom == "Siège — MDF"
    mandat = Mandat.objects.get()
    assert mandat.imf == mdf and mandat.date_debut.isoformat() == "2022-03-01"
    assert mandat.dirigeant.email_professionnel == "a.sy@mdf.sn"


def test_statuts_successifs_et_rapport_explicite():
    importation = _importation("IMF", "nom;type_imf;adresse_siege\nIMF A;SA;Dakar\n;SA;Thiès\n".encode())
    assert importation.statut == "EN_ATTENTE"
    bilan = lancer_importation(importation)
    importation.refresh_from_db()
    assert importation.statut == "TERMINE"
    assert (bilan.lignes_creees, importation.nb_lignes_total, importation.nb_lignes_erreur) == (1, 2, 1)
    erreur = importation.rapport_erreurs[0]
    assert erreur["ligne"] == 3 and erreur["erreurs"] == {"nom": "Valeur obligatoire."}
    assert erreur["message"] == "Ligne 3 — nom : Valeur obligatoire."


def test_aucune_ligne_importee_donne_echec(client_admin):
    resp = _importer(client_admin, "IMF", _csv("nom;type_imf;adresse_siege\nA;BANQUE;Dakar\n"))
    assert resp.data["statut"] == "ECHEC"
    assert "Valeurs acceptées" in resp.data["rapport_erreurs"][0]["erreurs"]["type_imf"]
    assert not IMF.objects.exists()


def test_fichier_sans_donnees_echec(client_admin):
    resp = _importer(client_admin, "IMF", _csv("nom;type_imf;adresse_siege\n"))
    assert resp.data["statut"] == "ECHEC"
    assert "aucune ligne" in resp.data["rapport_erreurs"][0]["erreurs"]["fichier"]


def test_panne_inattendue_annule_tout(monkeypatch):
    """Une exception hors validation annule l'ensemble de l'import (transaction atomique)."""
    def lecture_puis_panne(self):
        IMF.objects.create(nom="Fantôme", type_imf="SA", adresse_siege="Dakar")
        raise RuntimeError("base indisponible")

    importation = _importation("IMF", b"nom;type_imf;adresse_siege\nA;SA;Dakar\n")
    monkeypatch.setattr(ImportIMFProcessor, "_importer_ligne", lambda self, ligne: lecture_puis_panne(self))
    lancer_importation(importation)
    importation.refresh_from_db()
    assert importation.statut == "ECHEC"
    assert "base indisponible" in importation.rapport_erreurs[0]["erreurs"]["fichier"]
    assert not IMF.objects.exists()


def test_meme_sigle_agrements_differents_deux_imf(client_admin):
    contenu = (
        "nom;sigle;numero_agrement;type_imf;adresse_siege\n"
        "MEC des femmes de Ouakam;MECFO;DK1-00-00215;MUTUELLE;Ouakam\n"
        "MEC des femmes de Grand Yoff;MECFO;DK1-00-00187;MUTUELLE;Grand Yoff\n"
        "Autre nom même agrément;AUTRE;DK1-00-00215;MUTUELLE;Dakar\n"
    )
    resp = _importer(client_admin, "IMF", _csv(contenu))
    assert resp.data["nb_lignes_importees"] == 2
    assert "ligne 2" in resp.data["rapport_erreurs"][0]["erreurs"]["numero_agrement"]
    assert IMF.objects.filter(sigle="MECFO").count() == 2
    # Sigle ambigu : le point de service doit préciser l'agrément.
    points = "imf_sigle;imf_agrement;nom\nMECFO;;Guichet A\nMECFO;DK1-00-00187;Guichet B\n"
    resp = _importer(client_admin, "POINTS_SERVICE", _csv(points))
    assert resp.data["nb_lignes_importees"] == 1
    assert "ambiguë" in resp.data["rapport_erreurs"][0]["erreurs"]["imf_sigle"]
    assert PointService.objects.get(nom="Guichet B").imf.numero_agrement == "DK1-00-00187"


ENTETES_IMF_ANNUAIRE = [
    "Identifiant WordPress", "Nom de l'IMF", "Sigle", "Numéro d'agrément", "Région", "Type SFD",
    "E-mail SFD", "Téléphone SFD", "Adresse SFD", "Président du CA", "E-mail du PCA", "Téléphone du PCA",
    "Président du CS", "Directeur général / Gérant", "E-mail DG", "Téléphone DG", "Forme juridique",
    "Localisation (carte)", "Latitude", "Longitude", "Date de création fiche",
]
ENTETES_POINTS_ANNUAIRE = [
    "Identifiant WordPress", "Titre", "Nom du point de service", "Typologie",
    "Nom IMF de rattachement", "Agrément IMF de rattachement", "Adresse", "Latitude", "Longitude",
]


def _annuaire():
    return {
        "IMF": [
            ENTETES_IMF_ANNUAIRE,
            [217, "Alliance de Crédit de Dakar", "ACEP DAKAR", "DK1-93-00008", "DAKAR", "Affilié",
             "acep@acep.sn", "33 869 69 65 / 33 800 00 00", "Avenue Bourguiba", "Ndeye Sanou FAYE", None, "ND",
             "Mamadou POUYE", "El H. Cheikh GOUMBALA", "acep@acep.sn", "77 000 00 01", "IMCEC",
             "Amitié 1", "14.683399", "-17.447568", "2019-07-11 12:43:17"],
            [280, "Baobab SA", "BAOBAB", "DK1-11-00598", "DAKAR", "Société Commerciale",
             "contact@baobab.sn", None, None, "MBENGUE Alioune", "acep@acep.sn", None,
             None, "Mme Awa DIOP (Directrice générale)", None, None, "SA",
             None, None, None, "2020-01-05 09:00:00"],
        ],
        "Points de service": [
            ENTETES_POINTS_ANNUAIRE,
            [226, "MEC ACEP DAKAR", "Guichet HLM5", "Guichet", "Alliance de Crédit de Dakar", "DK1-93-00008",
             "Marché HLM", "14.707772", "-17.444615"],
            [747, "Agence Tivaouane", "Agence Tivaouane", "Agence", "Baobab SA", "DK1-11-00598", "PAMBAL", None, None],
            [749, "Agence Tivaouane", "Agence Tivaouane", "Agence", "Baobab SA", "DK1-11-00598", "KEUR SAMBA", None, None],
            [1218, "Test", None, None, None, None, None, None, None],
        ],
        "Contrôles": [["Contrôle", "Résultat"], ["Généré le", "20261113"]],
    }


def test_annuaire_drs_sfd_les_trois_imports_depuis_le_meme_classeur(client_admin):
    """Le classeur de l'annuaire s'importe trois fois : IMF, points de service, dirigeants."""
    resp = _importer(client_admin, "IMF", _xlsx(_annuaire()))
    assert resp.data["nb_lignes_importees"] == 2, resp.data["rapport_erreurs"]
    acep = IMF.objects.get(numero_agrement="DK1-93-00008")
    assert (acep.type_imf, acep.statut_reglementaire, acep.telephone) == ("MUTUELLE", "AGREE", "33 869 69 65 / 33 800 00 00")
    assert round(acep.localisation_siege.y, 3) == 14.683
    baobab = IMF.objects.get(sigle="BAOBAB")
    assert baobab.type_imf == "SA" and baobab.adresse_siege == "DAKAR"  # adresse absente : région

    resp = _importer(client_admin, "POINTS_SERVICE", _xlsx(_annuaire()))
    assert resp.data["nb_lignes_importees"] == 3
    assert resp.data["rapport_erreurs"][0]["ligne"] == 5  # fiche « Test » sans IMF
    assert PointService.objects.get(reference_externe="226").nom == "MEC ACEP DAKAR — Guichet HLM5"
    # Deux points de même nom dans la même IMF restent distincts grâce à leur référence.
    assert PointService.objects.filter(imf=baobab, nom="Agence Tivaouane").count() == 2
    assert PointService.objects.get(reference_externe="747").statut_reglementaire == "AGREE"

    resp = _importer(client_admin, "DIRIGEANTS", _xlsx(_annuaire()))
    assert resp.data["nb_lignes_total"] == 5 and resp.data["nb_lignes_erreur"] == 0, resp.data["rapport_erreurs"]
    assert set(Mandat.objects.filter(imf=acep).values_list("fonction_mandat", "dirigeant__nom")) == {
        ("PCA", "FAYE"), ("PRESIDENT_CONSEIL_SURVEILLANCE", "POUYE"), ("GERANT", "GOUMBALA"),
    }
    dg = Mandat.objects.get(imf=baobab, fonction_mandat="DG")
    assert (dg.dirigeant.nom, dg.dirigeant.prenom) == ("DIOP", "Awa")
    assert dg.date_debut.isoformat() == "2020-01-05"  # date de la fiche, faute de date de prise de fonction
    # Même email (adresse de l'institution) mais personnes différentes : pas de fusion.
    assert Dirigeant.objects.filter(email_professionnel="acep@acep.sn").count() == 2

    # Réimport complet : aucun doublon.
    for type_import in ("IMF", "POINTS_SERVICE", "DIRIGEANTS"):
        _importer(client_admin, type_import, _xlsx(_annuaire()))
    assert (IMF.objects.count(), PointService.objects.count(), Dirigeant.objects.count(), Mandat.objects.count()) == (2, 5, 5, 5)


@pytest.mark.parametrize(
    "nom_complet,attendu",
    [
        ("Ndeye Sanou FAYE", ("FAYE", "Ndeye Sanou")),
        ("MBENGUE Alioune", ("MBENGUE", "Alioune")),
        ("El H. Cheikh GOUMBALA", ("GOUMBALA", "El H. Cheikh")),
        ("M. ISSA TOURE", ("TOURE", "ISSA")),
        ("Mamadou M seck", ("seck", "Mamadou M")),
        ("Awa DIOP SARR", ("DIOP SARR", "Awa")),
    ],
)
def test_scinder_nom_complet(nom_complet, attendu):
    assert scinder_nom_complet(nom_complet) == attendu


def test_dirigeant_sans_prenom_identifiable_est_rejete(client_admin):
    IMF.objects.create(nom="IMF A", sigle="IMFA", type_imf="SA", adresse_siege="Dakar")
    feuilles = {"IMF": [
        ["Nom de l'IMF", "Sigle", "Président du CA", "Date de création fiche"],
        ["IMF A", "IMFA", "Gueye", "2020-01-01"],
    ]}
    resp = _importer(client_admin, "DIRIGEANTS", _xlsx(feuilles))
    assert resp.data["statut"] == "ECHEC"
    assert "Gueye" in resp.data["rapport_erreurs"][0]["erreurs"]["nom"]


def _region(code, nom, ouest, est):
    return ZoneGeographique.objects.create(
        code=code, nom=nom, type_zone="REGION",
        geometrie=MultiPolygon(Polygon(((ouest, 12.5), (est, 12.5), (est, 16.5), (ouest, 16.5), (ouest, 12.5))), srid=4326),
    )


def test_valeurs_facultatives_incoherentes_ecartees_sans_rejeter_la_ligne(client_admin):
    """Email mal formé, téléphone qui n'en est pas un, GPS hors du Sénégal : la ligne est
    importée sans ces valeurs, qui sont signalées dans le rapport."""
    contenu = (
        "nom;sigle;type_imf;adresse_siege;telephone;email;latitude;longitude;annee_creation\n"
        "Mutuelle A;MA;MUTUELLE;Dakar;RUE THIONG;contact@;48,85;2,35;deux mille\n"
    )
    resp = _importer(client_admin, "IMF", _csv(contenu))
    assert (resp.data["statut"], resp.data["nb_lignes_importees"], resp.data["nb_lignes_erreur"]) == ("TERMINE", 1, 0)
    imf = IMF.objects.get()
    assert (imf.telephone, imf.email, imf.localisation_siege, imf.annee_creation) == ("", "", None, None)
    avertissement = resp.data["rapport_erreurs"][0]
    assert avertissement["avertissement"] is True and avertissement["ligne"] == 2
    assert set(avertissement["erreurs"]) == {"telephone", "email", "latitude", "annee_creation"}


def test_attributs_annuaire_et_regions(client_admin):
    """Les colonnes propres à l'annuaire sont enregistrées ; la région vient du fichier,
    du GPS, de l'intitulé du point ou, pour une caisse de base, de son IMF."""
    dakar, thies = _region("SN-DK", "Dakar", -17.6, -17.1), _region("SN-TH", "Thiès", -17.1, -16.2)
    entetes = ENTETES_IMF_ANNUAIRE + ["Affiliation", "Année de création", "NINEA", "Capital",
                                      "Nombre de bénéficiaires", "Situation", "Nombre de membres du CA",
                                      "Vice-président du CA", "Adresse DG", "URL de la fiche"]
    imf_ligne = _annuaire()["IMF"][1] + ["UM-ACEP", 1993, "0012345", 54959000, 22849, "ATTENDU", 6,
                                         "Modou Matar MBAYE", "Khar Yalla", "https://drs-sfd.gouv.sn/annuaire/acep/"]
    reseau = [300, "Réseau National SA", "RNSA", "DK1-20-00700", "DAKAR", "Société Commerciale", "r@rn.sn",
              None, "Dakar", None, None, None, None, None, None, None, "SA", None, None, None, "2021-01-01"]
    points = [
        ENTETES_POINTS_ANNUAIRE + ["Localisation (carte)"],
        [1, "Guichet Thiès Nord", "Guichet Thiès Nord", "Guichet", None, "DK1-93-00008", None, "14.79", "-16.93", None],
        [2, "Agence de Thies", "Agence de Thies", "Agence", None, "DK1-20-00700", None, None, None, None],
        [3, "Guichet Marché", "Guichet Marché", "Guichet", None, "DK1-93-00008", None, None, None, "HLM"],
        [4, "Agence Centrale", "Agence Centrale", "Agence", None, "DK1-20-00700", None, None, None, None],
    ]
    classeur = {"IMF": [entetes, imf_ligne, reseau], "Points de service": points}
    for type_import in ("IMF", "POINTS_SERVICE", "DIRIGEANTS"):
        resp = _importer(client_admin, type_import, _xlsx(classeur))
        assert resp.data["nb_lignes_erreur"] == 0, resp.data["rapport_erreurs"]

    acep = IMF.objects.get(numero_agrement="DK1-93-00008")
    assert (acep.region, acep.reference_externe, acep.type_sfd, acep.affiliation) == (dakar, "217", "Affilié", "UM-ACEP")
    assert (acep.annee_creation, acep.ninea, acep.nb_beneficiaires, acep.nb_membres_ca) == (1993, "0012345", 22849, 6)
    assert (str(acep.capital), acep.situation, acep.lieu_dit) == ("54959000.00", "ATTENDU", "Amitié 1")
    assert acep.date_fiche.isoformat() == "2019-07-11" and acep.url_fiche.endswith("/acep/")
    siege = PointService.objects.get(imf=acep, type_point="SIEGE")
    assert (siege.region, siege.nombre_membres, siege.localisation is not None) == (dakar, 22849, True)

    # Réseau : ses bénéficiaires ne sont pas recomptés sur son siège.
    acep.type_sfd, acep.nb_beneficiaires = "Réseau", 500
    acep.save()
    ImportIMFProcessor._synchroniser_siege(acep)
    siege.refresh_from_db()
    assert siege.nombre_membres is None

    region_de = lambda reference: PointService.objects.get(reference_externe=reference).region  # noqa: E731
    assert region_de("1") == thies   # GPS
    assert region_de("2") == thies   # nom de région dans l'intitulé
    assert region_de("3") == dakar   # caisse de base : région de l'IMF
    assert region_de("4") is None    # société nationale : pas de supposition
    assert PointService.objects.get(reference_externe="3").lieu_dit == "HLM"

    assert Mandat.objects.filter(imf=acep, fonction_mandat="VICE_PRESIDENT_CA", dirigeant__nom="MBAYE").exists()
    assert Mandat.objects.get(imf=acep, fonction_mandat="GERANT").dirigeant.adresse == "Khar Yalla"
