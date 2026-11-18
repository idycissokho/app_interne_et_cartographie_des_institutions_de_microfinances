"""
importation/tests/test_liste_officielle.py
==========================================
Liste officielle des IMF de la DRS-SFD (canevas de référence) : un seul import « Institutions »
enregistre les IMF, leurs sièges et leurs dirigeants ; modèle et export au même format.
"""

import io

import pytest
from django.contrib.gis.geos import MultiPolygon, Polygon
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from openpyxl import Workbook, load_workbook

from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.importation.canevas import ENTETES
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db
URL = "/api/v1/importation/"


@pytest.fixture(autouse=True)
def media_temporaire(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def zones():
    carre = MultiPolygon(Polygon(((-17.6, 14.5), (-17.1, 14.5), (-17.1, 15.0), (-17.6, 15.0), (-17.6, 14.5))), srid=4326)
    dakar = ZoneGeographique.objects.create(code="SN-DK", nom="Dakar", type_zone="REGION", geometrie=carre)
    thies = ZoneGeographique.objects.create(code="SN-TH", nom="Thiès", type_zone="REGION")
    departements = {
        nom: ZoneGeographique.objects.create(code=code, nom=nom, type_zone="DEPARTEMENT", parent=parent)
        for code, nom, parent in (
            ("SN-DK-DK", "Dakar", dakar), ("SN-DK-GW", "Guédiawaye", dakar), ("SN-TH-TH", "Thiès", thies),
        )
    }
    return {"Dakar": dakar, "Thiès": thies, **{f"dep:{n}": z for n, z in departements.items()}}


def _ligne(**valeurs):
    """Ligne de la liste officielle : « 0 » partout (convention du classeur), sauf `valeurs`."""
    ligne = dict.fromkeys(ENTETES, 0)
    ligne.update(valeurs)
    return [ligne[entete] for entete in ENTETES]


def _acep(**surcharges):
    valeurs = {
        "N°AGREMENT": "DK1-93-00008", "STRUCTURES": "ALLIANCE DE CREDIT ET D'EPARGNE  POUR LA PROMOTION ",
        "SIGLE": "ACEP DAKAR", "REGIONS": "DAKAR", "DEPARTEMENT": "GUEDIAWAYES", "AFFILIATION": "UM-ACEP",
        "ANNEE": 1993, "FORME": "IMCEC", "TYPE": "AFFILIE", "TAILLE": "Art 70", "SITUATION 2025": None,
        "E-mail SFD": "acepdakar@acepsenegal.com", "Téléphone SFD": "338696965",
        "Adresse SFD": "Avenue Bourguiba – Amitié I",
        "Président du CA": "Ndeye Sanou FAYE", "Vice-président du CA": "Modou Matar MBAYE",
        "Secrétaire général du CA": "ND", "Nombre de membres du CA": 6, "Téléphone du PCA": "77 118 95 17",
        "Président du CS": "Mamadou POUYE", "Nombre de membres du CS": 4,
        "Président du CC": "Seynabou DIANE", "Nombre de membres du CC": 5, "Adresse du PCC": "Grand-Yoff",
        "Directeur général / Gérant": "El H. Cheikh GOUMBALA", "E-mail DG": "acepdakar@acepsenegal.com",
        "Année de création": 1994, "Forme juridique": "IMCEC", "Type d'union": "aucun",
        "Situation": "ATTENDU", "Localisation (carte)": "Amitié 1",
        "Latitude": "14.683399", "Longitude": "-17.447568",
    }
    return _ligne(**{**valeurs, **surcharges})


def _coris(**surcharges):
    valeurs = {
        "N°AGREMENT": "DK1-25-00613", "STRUCTURES": "CORIS MICROFINANCE SENEGAL", "SIGLE": "CORIS MF SA",
        "REGIONS": "THIES", "DEPARTEMENT": "THIES", "ANNEE": 2025, "FORME": "SA", "TYPE": "SOCIETE COMMERCIALE",
        "TAILLE": "Autres", "E-mail SFD": "nd@nd.sn", "Téléphone SFD": "+221 33 829 66 10",
        "Président du CA": "Ibrahima Mar FALL", "E-mail du PCA": "ibfall@coris-bank.com",
        "Directeur général / Gérant": "Mor NIASS", "Forme juridique": "Non défini", "Situation": "OPR",
    }
    return _ligne(**{**valeurs, **surcharges})


def _classeur(*lignes, titre="LISTE IMF 2025"):
    wb = Workbook()
    wb.active.title = titre
    wb.active.append(ENTETES)
    for ligne in lignes:
        wb.active.append(ligne)
    buffer = io.BytesIO()
    wb.save(buffer)
    return SimpleUploadedFile("LISTE IMF 2025 ok.xlsx", buffer.getvalue())


def _importer(client, fichier, type_import="IMF"):
    return client.post(URL, {"type_import": type_import, "fichier": fichier}, format="multipart")


def test_un_import_alimente_institutions_sieges_et_dirigeants(client_admin, zones):
    resp = _importer(client_admin, _classeur(_acep(), _coris()))
    assert (resp.data["statut"], resp.data["nb_lignes_importees"], resp.data["nb_lignes_erreur"]) == ("TERMINE", 2, 0)

    acep = IMF.objects.get(numero_agrement="DK1-93-00008")
    assert acep.nom == "ALLIANCE DE CREDIT ET D'EPARGNE POUR LA PROMOTION"  # espaces superflus retirés
    assert (acep.type_imf, acep.statut_reglementaire, acep.type_sfd, acep.taille) == ("MUTUELLE", "EN_ACTIVITE", "AFFILIE", "Art 70")
    assert (acep.region, acep.departement) == (zones["Dakar"], zones["dep:Guédiawaye"])  # graphie « GUEDIAWAYES »
    assert (acep.annee_creation, acep.forme_juridique, acep.situation) == (1993, "IMCEC", "ATTENDU")  # « ANNEE » prioritaire
    assert (acep.nb_membres_ca, acep.nb_membres_cs, acep.nb_membres_cc) == (6, 4, 5)
    assert (acep.nb_unions_affiliees, acep.nb_institutions_base) == (None, None)  # « 0 » = non renseigné
    assert round(acep.localisation_siege.y, 3) == 14.683

    siege = PointService.objects.get(imf=acep, est_siege=True)
    assert (siege.region, siege.departement, siege.localisation is not None) == (zones["Dakar"], zones["dep:Guédiawaye"], True)

    assert set(Mandat.objects.filter(imf=acep).values_list("fonction_mandat", "dirigeant__nom")) == {
        ("PCA", "FAYE"), ("VICE_PRESIDENT_CA", "MBAYE"), ("PRESIDENT_CONSEIL_SURVEILLANCE", "POUYE"),
        ("PRESIDENT_COMITE_CREDIT", "DIANE"), ("GERANT", "GOUMBALA"),
    }  # « ND » au secrétariat général : pas de dirigeant
    assert Mandat.objects.get(imf=acep, fonction_mandat="PCA").dirigeant.telephone == "77 118 95 17"
    assert Mandat.objects.get(imf=acep, fonction_mandat="PRESIDENT_COMITE_CREDIT").dirigeant.adresse == "Grand-Yoff"

    coris = IMF.objects.get(numero_agrement="DK1-25-00613")
    assert (coris.type_imf, coris.statut_reglementaire, coris.email, coris.forme_juridique) == ("SA", "OPR", "", "SA")
    assert coris.adresse_siege == "THIES"  # adresse absente : département
    dg = Mandat.objects.get(imf=coris, fonction_mandat="DG")  # société anonyme : directeur général
    assert (dg.dirigeant.nom, dg.dirigeant.prenom, dg.statut_mandat) == ("NIASS", "Mor", "EN_FONCTION")
    assert PointService.objects.get(imf=coris).statut_reglementaire == "OPR"


def test_reimport_met_a_jour_sans_doublon_et_remplace_le_titulaire(client_admin, zones):
    _importer(client_admin, _classeur(_acep(), _coris()))
    compte = (IMF.objects.count(), PointService.objects.count(), Dirigeant.objects.count(), Mandat.objects.count())

    resp = _importer(client_admin, _classeur(_acep(), _coris()))
    assert (resp.data["nb_lignes_importees"], resp.data["nb_lignes_erreur"]) == (2, 0)
    assert (IMF.objects.count(), PointService.objects.count(), Dirigeant.objects.count(), Mandat.objects.count()) == compte

    # Nouvelle liste : le PCA de l'ACEP a changé, son prédécesseur termine son mandat.
    _importer(client_admin, _classeur(_acep(**{"Président du CA": "Awa NDIAYE"})))
    pca = Mandat.objects.filter(imf__sigle="ACEP DAKAR", fonction_mandat="PCA")
    assert pca.get(date_fin=None).dirigeant.nom == "NDIAYE"
    assert pca.exclude(date_fin=None).get().dirigeant.nom == "FAYE"


def test_valeurs_incoherentes_signalees_sans_rejeter_l_institution(client_admin, zones):
    ligne = _acep(**{"DEPARTEMENT": "THIES", "Président du CS": "POUYE", "REGIONS": "DAKAR"})
    resp = _importer(client_admin, _classeur(ligne))
    assert (resp.data["statut"], resp.data["nb_lignes_importees"]) == ("TERMINE", 1)
    avertissements = resp.data["rapport_erreurs"][0]["erreurs"]
    assert "departement" in avertissements  # Thiès n'est pas dans la région de Dakar
    assert "POUYE" in avertissements["president_du_cs"]  # nom sans prénom : dirigeant écarté
    assert IMF.objects.get().departement is None
    assert not Mandat.objects.filter(fonction_mandat="PRESIDENT_CONSEIL_SURVEILLANCE").exists()


def test_liste_officielle_refusee_comme_points_de_service(client_admin, zones):
    resp = _importer(client_admin, _classeur(_acep()), type_import="POINTS_SERVICE")
    assert resp.data["statut"] == "ECHEC"
    assert "Institutions" in resp.data["rapport_erreurs"][0]["message"]


def test_modele_et_export_au_format_de_la_liste_reimportables(client_admin, zones):
    modele = client_admin.get(f"{URL}modeles/imf/")
    assert modele.status_code == 200 and modele["Content-Disposition"].endswith('.xlsx"')
    assert [c.value for c in load_workbook(io.BytesIO(modele.content)).active[1]] == ENTETES

    _importer(client_admin, _classeur(_acep(), _coris()))
    export = client_admin.get(f"{URL}export/imf/")
    feuille = load_workbook(io.BytesIO(export.content)).active
    lignes = [dict(zip(ENTETES, (c.value for c in rangee), strict=True)) for rangee in feuille.iter_rows(min_row=2)]
    acep = next(ligne for ligne in lignes if ligne["SIGLE"] == "ACEP DAKAR")
    assert (acep["REGIONS"], acep["DEPARTEMENT"], acep["TAILLE"]) == ("DAKAR", "GUEDIAWAYE", "Art 70")
    assert (acep["Président du CA"], acep["Directeur général / Gérant"]) == ("Ndeye Sanou FAYE", "El H. Cheikh GOUMBALA")

    compte = (IMF.objects.count(), Dirigeant.objects.count(), Mandat.objects.count())
    resp = _importer(client_admin, SimpleUploadedFile("export.xlsx", export.content))
    assert (resp.data["nb_lignes_importees"], resp.data["nb_lignes_erreur"]) == (2, 0), resp.data["rapport_erreurs"]
    assert (IMF.objects.count(), Dirigeant.objects.count(), Mandat.objects.count()) == compte


def test_commande_de_chargement_avec_la_liste_officielle(settings, tmp_path):
    settings.BASE_DIR = tmp_path
    (tmp_path / "donnees_initiales").mkdir()
    fichier = _classeur(_acep(), _coris())
    (tmp_path / "donnees_initiales" / "liste.xlsx").write_bytes(fichier.read())
    sortie = io.StringIO()
    call_command("initialiser_donnees", stdout=sortie)
    texte = sortie.getvalue()
    assert "import sauté" in texte and "déjà enregistrés avec les institutions" in texte
    assert (IMF.objects.count(), Mandat.objects.filter(imf__sigle="CORIS MF SA").count()) == (2, 2)


def test_demonstration_dirigeants_anonymises_et_fichier_efface(client_admin, zones, settings):
    """Démo (DONNEES_FICTIVES) : noms réels absents de la base et du rapport, fichier d'origine
    supprimé ; l'historique renvoie alors fichier = null (l'écran doit le supporter)."""
    settings.DONNEES_FICTIVES = True
    ligne = _acep(**{"Président du CS": "POUYE", "Latitude": "48.85", "Longitude": "2.35"})
    resp = _importer(client_admin, _classeur(ligne))
    assert (resp.data["statut"], resp.data["nb_lignes_importees"]) == ("TERMINE", 1)
    # Identité réelle absente (le nom seul ne suffit pas : « FAYE » peut être tiré comme nom fictif).
    assert not Dirigeant.objects.filter(prenom="Ndeye Sanou").exists()
    rapport = resp.data["rapport_erreurs"][0]["erreurs"]
    assert "POUYE" not in str(resp.data["rapport_erreurs"])        # dirigeant écarté : masqué
    assert "hors du Sénégal" in rapport["latitude"]                  # GPS écarté : lisible
    assert client_admin.get(URL).data["results"][0]["fichier"] is None
