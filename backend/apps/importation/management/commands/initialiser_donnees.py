"""
importation/management/commands/initialiser_donnees.py
======================================================
Premier démarrage après un clonage : charge les données de référence à partir du classeur
Excel de l'annuaire DRS-SFD déposé dans backend/donnees_initiales/.

À lancer une fois, après « migrate » :
  python manage.py initialiser_donnees

Même fonctionnement que charger_annuaire (vérification, lignes conformes enregistrées,
lignes non conformes écartées, rapport CSV) ; voir cette commande pour le détail.
"""

from .charger_annuaire import Command as ChargerAnnuaire


class Command(ChargerAnnuaire):
    help = (
        "Premier démarrage : vérifie et charge le classeur de l'annuaire déposé dans backend/donnees_initiales/ "
        "(lignes conformes enregistrées, lignes non conformes écartées, rapport CSV)."
    )
