"""Commande de premier démarrage : initialiser_donnees / charger_annuaire."""

import openpyxl
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.imf.models import IMF


@pytest.fixture(autouse=True)
def dossiers(settings, tmp_path):
    settings.BASE_DIR = tmp_path
    settings.MEDIA_ROOT = tmp_path / "mediafiles"
    (tmp_path / "donnees_initiales").mkdir()
    return tmp_path / "donnees_initiales"


def classeur(chemin, entetes, *lignes):
    wb = openpyxl.Workbook()
    wb.active.append(entetes)
    for ligne in lignes:
        wb.active.append(ligne)
    wb.save(chemin)
    return chemin


@pytest.mark.django_db
def test_sans_classeur_indique_ou_le_deposer(dossiers):
    with pytest.raises(CommandError, match="donnees_initiales"):
        call_command("initialiser_donnees")


@pytest.mark.django_db
def test_classeur_non_conforme_rien_enregistre(dossiers):
    classeur(dossiers / "faux.xlsx", ["colonne", "autre"], [1, 2])
    with pytest.raises(CommandError, match="non conforme"):
        call_command("initialiser_donnees")
    assert not IMF.objects.exists()


@pytest.mark.django_db
def test_base_deja_alimentee_refusee_sans_forcer(dossiers):
    IMF.objects.create(nom="IMF existante", type_imf="MUTUELLE", adresse_siege="Dakar")
    classeur(dossiers / "annuaire.xlsx", ["nom", "type_imf", "adresse_siege"], ["Autre", "Mutuelle", "Thiès"])
    with pytest.raises(CommandError, match="--forcer"):
        call_command("initialiser_donnees")


def test_format_non_excel_refuse(dossiers):
    fichier = dossiers / "donnees.csv"
    fichier.write_text("nom\nA\n")
    with pytest.raises(CommandError, match="xlsx"):
        call_command("charger_annuaire", str(fichier))
