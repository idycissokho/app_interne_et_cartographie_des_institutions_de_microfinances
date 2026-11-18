"""
Import en tâche de fond : réponse immédiate, progression publiée, imports interrompus.
(Les tests traitent l'import pendant la requête, IMPORT_ASYNCHRONE=False : voir settings/test.py.)
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from apps.audit.models import JournalAudit
from apps.importation import taches
from apps.importation.models import ImportationFichier
from apps.importation.processors import ImportIMFProcessor

pytestmark = pytest.mark.django_db

URL = "/api/v1/importation/"
CSV_IMF = "nom;sigle;numero_agrement;type_imf;statut_reglementaire;adresse_siege\nMutuelle A;MA;DK-1;MUTUELLE;EN_ACTIVITE;Dakar\n"


def _fichier():
    return SimpleUploadedFile("imf.csv", CSV_IMF.encode(), content_type="text/csv")


def test_tache_de_fond_repond_avant_le_traitement(client_admin):
    """En mode asynchrone, l'upload répond « en attente » et le traitement part dans un fil à part."""
    with override_settings(IMPORT_ASYNCHRONE=True), mock.patch("apps.importation.taches.threading.Thread") as fil:
        reponse = client_admin.post(URL, {"type_import": "IMF", "fichier": _fichier()}, format="multipart")
    assert reponse.status_code == 201
    assert reponse.data["statut"] == "EN_ATTENTE"
    fil.return_value.start.assert_called_once()
    assert fil.call_args.kwargs["daemon"] is True


def test_traitement_complet_et_journal(client_admin):
    reponse = client_admin.post(URL, {"type_import": "IMF", "fichier": _fichier()}, format="multipart")
    assert reponse.data["statut"] == "TERMINE" and reponse.data["nb_lignes_importees"] == 1
    assert JournalAudit.objects.filter(action="IMPORTATION").count() == 1
    # Le détail sert au suivi de la progression.
    detail = client_admin.get(f"{URL}{reponse.data['id']}/")
    assert detail.status_code == 200 and detail.data["statut"] == "TERMINE"


def test_progression_publiee_pendant_l_import(admin_import):
    processor = ImportIMFProcessor(admin_import)
    processor.bilan.lignes_creees, processor.bilan.erreurs = 7, [{"ligne": 3}]
    processor._publier_progression(intervalle=0)
    admin_import.refresh_from_db()
    assert (admin_import.nb_lignes_importees, admin_import.nb_lignes_erreur) == (7, 1)


def test_panne_du_suivi_sans_effet_sur_l_import(admin_import):
    processor = ImportIMFProcessor(admin_import)
    with mock.patch.object(ImportationFichier.objects, "using", side_effect=RuntimeError("base injoignable")):
        processor._publier_progression(intervalle=0)  # ne lève rien


def test_erreur_inattendue_declare_l_echec(admin_import, client_admin):
    with mock.patch("apps.importation.taches.lancer_importation", side_effect=RuntimeError("panne")):
        taches.lancer(admin_import, client_admin.user)
    admin_import.refresh_from_db()
    assert admin_import.statut == "ECHEC"
    assert "aucune ligne importée" in admin_import.rapport_erreurs[0]["message"]


def test_import_interrompu_par_un_redemarrage(admin_import, client_admin):
    ImportationFichier.objects.filter(pk=admin_import.pk).update(
        statut="EN_COURS", date_modification=timezone.now() - timedelta(minutes=30)
    )
    recent = ImportationFichier.objects.create(type_import="IMF", fichier="x.csv", statut="EN_COURS")
    reponse = client_admin.get(f"{URL}{admin_import.pk}/")
    assert reponse.data["statut"] == "ECHEC"
    assert "interrompu" in reponse.data["rapport_erreurs"][0]["message"]
    recent.refresh_from_db()
    assert recent.statut == "EN_COURS"  # un import qui avance n'est pas touché


@pytest.fixture
def admin_import():
    return ImportationFichier.objects.create(type_import="IMF", fichier=_fichier())


def test_statut_final_differe_jusqu_a_l_anonymisation(admin_import):
    """En démonstration, le rapport n'est déclaré « terminé » qu'une fois les noms masqués."""
    processor = ImportIMFProcessor(admin_import)
    processor.differer_statut = True
    processor.bilan.lignes_creees = 1
    processor._terminer()
    admin_import.refresh_from_db()
    assert admin_import.statut == "EN_COURS" and processor.statut_final == "TERMINE"


@override_settings(DONNEES_FICTIVES=True)
def test_import_dirigeants_demo_termine_apres_anonymisation(client_admin):
    from apps.imf.models import IMF

    IMF.objects.create(nom="Mutuelle A", sigle="MA", numero_agrement="DK-1", type_imf="MUTUELLE", adresse_siege="Dakar")
    csv = "nom;prenom;imf_sigle;fonction_mandat;date_debut\nDIOP;Awa;MA;DG;2022-01-01\n"
    fichier = SimpleUploadedFile("d.csv", csv.encode(), content_type="text/csv")
    reponse = client_admin.post(URL, {"type_import": "DIRIGEANTS", "fichier": fichier}, format="multipart")
    assert reponse.data["statut"] == "TERMINE"
    from apps.dirigeants.models import Dirigeant

    assert not Dirigeant.objects.filter(nom="DIOP", prenom="Awa").exists()  # déjà anonymisé
