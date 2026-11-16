"""
dirigeants/management/commands/anonymiser_dirigeants.py
=======================================================
Remplace les données personnelles des dirigeants par des données fictives
(voir apps/dirigeants/anonymisation.py). Destiné à la base de DÉMONSTRATION uniquement.

Usage : python manage.py anonymiser_dirigeants --confirmer

IRRÉVERSIBLE : ne jamais lancer sur la base de l'intranet.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.dirigeants.anonymisation import anonymiser_dirigeants


class Command(BaseCommand):
    help = "Remplace noms, téléphones, e-mails et adresses des dirigeants par des données fictives (irréversible)."

    def add_arguments(self, parser):
        parser.add_argument("--confirmer", action="store_true", help="Obligatoire : confirme l'opération irréversible.")

    def handle(self, *args, confirmer=False, **options):
        cible = f"{connection.settings_dict.get('NAME')} sur {connection.settings_dict.get('HOST') or 'localhost'}"
        if not confirmer:
            raise CommandError(
                f"Base visée : {cible}. Opération irréversible : relancez avec --confirmer "
                "uniquement s'il s'agit de la base de démonstration."
            )
        bilan = anonymiser_dirigeants()
        self.stdout.write(self.style.SUCCESS(
            f"Base {cible} : {bilan['dirigeants']} dirigeant(s) anonymisé(s), "
            f"{bilan['entrees_audit']} entrée(s) du journal masquée(s), {bilan['imports']} import(s) nettoyé(s)."
        ))
