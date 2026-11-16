"""
Préparation du déploiement : route de santé, protection de l'API, compte administrateur
créé depuis l'environnement, données fictives des dirigeants.
"""

import pytest
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.urls import reverse

from apps.audit.models import JournalAudit
from apps.authentication.models import Utilisateur
from apps.dirigeants.anonymisation import LIBELLE_MASQUE, identite_fictive
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.importation.models import ImportationFichier

pytestmark = pytest.mark.django_db
MOT_DE_PASSE = "Demo-Carto-IMF-2026!"


@pytest.fixture(autouse=True)
def medias_temporaires(settings, tmp_path):
    """Les fichiers déposés par ces tests vont dans un dossier jetable, pas dans mediafiles/."""
    settings.MEDIA_ROOT = tmp_path


def test_sante_sans_connexion_et_sans_donnees(client):
    reponse = client.get("/api/v1/sante/")
    assert reponse.status_code == 200
    assert reponse.json() == {"statut": "ok"}


@pytest.mark.parametrize("url", [
    "/api/v1/imf/", "/api/v1/points-service/", "/api/v1/points-service/geojson/",
    "/api/v1/dirigeants/", "/api/v1/dirigeants/mandats/", "/api/v1/cartographie/statistiques/",
    "/api/v1/cartographie/zones/agregats/?type_zone=REGION", "/api/v1/importation/", "/api/v1/audit/",
])
def test_api_de_donnees_fermee_sans_connexion(client, url):
    assert client.get(url).status_code == 401


def test_medias_non_servis_par_defaut(client):
    assert client.get("/media/importations/x.csv").status_code == 404


def test_creer_admin_depuis_environnement(monkeypatch):
    monkeypatch.setenv("DJANGO_ADMIN_EMAIL", "admin@demo.sn")
    monkeypatch.setenv("DJANGO_ADMIN_PASSWORD", MOT_DE_PASSE)
    call_command("creer_admin")
    admin = Utilisateur.objects.get(email="admin@demo.sn")
    assert admin.role == "ADMIN" and admin.is_superuser and admin.check_password(MOT_DE_PASSE)

    # Relancée (à chaque démarrage) : le compte existant n'est pas touché.
    monkeypatch.setenv("DJANGO_ADMIN_PASSWORD", "Autre-Mot-De-Passe-2026!")
    call_command("creer_admin")
    admin.refresh_from_db()
    assert admin.check_password(MOT_DE_PASSE)
    call_command("creer_admin", reinitialiser_mot_de_passe=True)
    admin.refresh_from_db()
    assert admin.check_password("Autre-Mot-De-Passe-2026!")


def test_creer_admin_variables_absentes_ou_mot_de_passe_faible(monkeypatch):
    monkeypatch.delenv("DJANGO_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("DJANGO_ADMIN_PASSWORD", raising=False)
    call_command("creer_admin", si_configure=True)  # au démarrage : sans erreur
    with pytest.raises(CommandError):
        call_command("creer_admin")
    monkeypatch.setenv("DJANGO_ADMIN_EMAIL", "admin@demo.sn")
    monkeypatch.setenv("DJANGO_ADMIN_PASSWORD", "123")
    with pytest.raises(CommandError, match="Mot de passe refusé"):
        call_command("creer_admin")
    assert not Utilisateur.objects.exists()


@pytest.fixture
def dirigeant_reel():
    imf = IMF.objects.create(nom="IMF A", sigle="IA", type_imf="SA", adresse_siege="Dakar")
    d = Dirigeant.objects.create(nom="NDOYE", prenom="Rama", telephone="77 123 45 67",
                                 email_professionnel="rama@ia.sn", adresse="Sicap Baobab")
    m = Mandat.objects.create(dirigeant=d, imf=imf, fonction_mandat="DG", date_debut="2022-01-01")
    JournalAudit.enregistrer(None, "CONSULTATION", f"dirigeants.Dirigeant:{d.pk}", {"libelle": str(d)})
    imp = ImportationFichier.objects.create(
        type_import="DIRIGEANTS", fichier=ContentFile(b"nom;prenom\nNDOYE;Rama", name="dirigeants.csv"),
        rapport_erreurs=[{"ligne": 3, "erreurs": {"email": "invalide"}, "valeurs": {"email": "rama@@ia"},
                          "message": "Ligne 3 — email : invalide (rama@@ia)", "avertissement": True}],
    )
    return d, m, imp


def test_anonymiser_exige_confirmation(dirigeant_reel):
    with pytest.raises(CommandError, match="--confirmer"):
        call_command("anonymiser_dirigeants")
    assert Dirigeant.objects.get().nom == "NDOYE"


def test_anonymiser_remplace_toutes_les_copies(dirigeant_reel):
    d, m, imp = dirigeant_reel
    call_command("anonymiser_dirigeants", confirmer=True)
    d.refresh_from_db()
    attendu = identite_fictive(d.pk)
    assert (d.nom, d.prenom, d.telephone, d.email_professionnel, d.adresse) == (
        attendu["nom"], attendu["prenom"], attendu["telephone"], attendu["email_professionnel"], attendu["adresse"])
    assert "NDOYE" not in d.nom and d.email_professionnel.endswith("@example.com")
    # Le mandat (fonction, IMF, dates) est conservé.
    m.refresh_from_db()
    assert m.fonction_mandat == "DG" and m.dirigeant_id == d.pk
    # Plus aucune copie du nom réel dans le journal ni dans le rapport d'import.
    assert JournalAudit.objects.get().details["libelle"] == LIBELLE_MASQUE
    imp.refresh_from_db()
    assert "rama" not in str(imp.rapport_erreurs).lower()
    assert imp.rapport_erreurs[0]["ligne"] == 3 and "email" in imp.rapport_erreurs[0]["erreurs"]
    assert not imp.fichier


def test_import_de_dirigeants_anonymise_avec_l_option(settings, client_admin):
    settings.DONNEES_FICTIVES = True
    IMF.objects.create(nom="IMF A", sigle="IA", type_imf="SA", adresse_siege="Dakar")
    contenu = "nom;prenom;telephone;email_professionnel;imf;fonction_mandat;date_debut\nNDOYE;Rama;771234567;rama@ia.sn;IA;DG;2022-01-01\n"
    reponse = client_admin.post(reverse("importation:importation-list"), {
        "type_import": "DIRIGEANTS", "fichier": ContentFile(contenu.encode(), name="dirigeants.csv"),
    }, format="multipart")
    assert reponse.status_code == 201, reponse.data
    assert reponse.data["nb_lignes_importees"] == 1
    d = Dirigeant.objects.get()
    assert d.nom != "NDOYE" and d.email_professionnel.endswith("@example.com")
    assert "rama" not in str(reponse.data).lower()
