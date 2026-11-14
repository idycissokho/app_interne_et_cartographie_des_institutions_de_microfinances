"""
importation/management/commands/charger_annuaire.py
===================================================
Charge en base l'export Excel de l'annuaire DRS-SFD : régions, institutions,
points de service, puis dirigeants et mandats.

La commande enchaîne les trois imports dans l'ordre imposé par leurs dépendances
(les points de service et les dirigeants sont rattachés aux IMF) en utilisant les
mêmes processors que l'import par l'interface. Chaque import est tracé dans
ImportationFichier, avec son rapport des lignes rejetées et des valeurs écartées.

Usage : python manage.py charger_annuaire chemin/vers/annuaire.xlsx
La commande peut être relancée : les enregistrements existants sont mis à jour.
"""

from pathlib import Path

from django.core.files import File
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.importation.models import ImportationFichier
from apps.importation.processors import lancer_importation

ORDRE = (
    ImportationFichier.TypeImport.IMF,
    ImportationFichier.TypeImport.POINTS_SERVICE,
    ImportationFichier.TypeImport.DIRIGEANTS,
)


class Command(BaseCommand):
    help = "Charge l'export Excel de l'annuaire DRS-SFD (IMF, points de service, dirigeants)."

    def add_arguments(self, parser):
        parser.add_argument("fichier", type=Path, help="Classeur Excel (.xlsx) de l'annuaire")

    def handle(self, *args, fichier: Path, **options):
        if not fichier.is_file():
            raise CommandError(f"Fichier introuvable : {fichier}")

        # Les régions doivent exister avant l'import : elles servent au rattachement géographique.
        call_command("charger_regions", stdout=self.stdout)

        for type_import in ORDRE:
            with fichier.open("rb") as contenu:
                importation = ImportationFichier.objects.create(
                    type_import=type_import, fichier=File(contenu, name=fichier.name)
                )
            bilan = lancer_importation(importation)
            importation.refresh_from_db()
            self.stdout.write(
                f"{importation.get_type_import_display()} : {importation.statut} — "
                f"{importation.nb_lignes_total} ligne(s), {bilan.lignes_creees} créée(s), "
                f"{bilan.lignes_mises_a_jour} mise(s) à jour, {len(bilan.erreurs)} rejetée(s), "
                f"{len(bilan.avertissements)} avec valeur(s) écartée(s)"
            )
            for entree in bilan.erreurs:
                self.stdout.write(self.style.WARNING(f"  rejetée — {entree['message']}"))
