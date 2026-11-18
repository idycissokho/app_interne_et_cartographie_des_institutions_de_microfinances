"""
importation/management/commands/charger_annuaire.py
===================================================
Charge en base un classeur Excel de la DRS-SFD : régions, départements, institutions, puis,
s'il en contient, points de service et dirigeants avec mandats.

Classeurs pris en charge :
- la liste officielle des IMF (une feuille « LISTE IMF », dirigeants en colonnes) : l'import
  des institutions enregistre en une fois les IMF, leurs sièges et leurs dirigeants ;
- l'export de l'annuaire (feuilles « IMF » et « Points de service »).

La commande enchaîne les imports dans l'ordre imposé par leurs dépendances (les points de
service et les dirigeants sont rattachés aux IMF) avec les mêmes processors que l'import
par l'interface ; un import sans objet est sauté (pas de feuille de points de service,
dirigeants déjà traités avec les institutions) :
- chaque ligne est contrôlée (colonnes, valeurs autorisées, formats, références) ;
- les lignes conformes sont enregistrées, les autres sont écartées et listées ;
- un fichier non conforme (illisible, colonnes obligatoires absentes) arrête tout,
  sans rien enregistrer des imports suivants.
Chaque import est tracé dans ImportationFichier, et un rapport CSV des lignes écartées
est écrit à côté du classeur.

Usage :
  python manage.py charger_annuaire                       # classeur trouvé dans donnees_initiales/
  python manage.py charger_annuaire chemin/annuaire.xlsx  # classeur précis
  python manage.py initialiser_donnees                    # même commande, nom pour un premier démarrage
"""

import csv
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.imf.models import IMF
from apps.importation.models import ImportationFichier
from apps.importation.processors import PROCESSORS, _feuille_voulue, cle, lancer_importation

ORDRE = (
    ImportationFichier.TypeImport.IMF,
    ImportationFichier.TypeImport.POINTS_SERVICE,
    ImportationFichier.TypeImport.DIRIGEANTS,
)
EXTENSIONS = (".xlsx", ".xlsm")


def dossiers_par_defaut() -> list[Path]:
    """Où chercher le classeur quand aucun chemin n'est donné, dans cet ordre.

    backend/donnees_initiales/ d'abord : avec Docker Compose, backend/mediafiles/ du poste est
    masqué par le volume des médias, alors que backend/ est visible tel quel dans le conteneur.
    """
    return [Path(settings.BASE_DIR) / "donnees_initiales", Path(settings.MEDIA_ROOT) / "donnees_initiales"]


def trouver_classeur() -> Path:
    candidats = [
        f for dossier in dossiers_par_defaut() if dossier.is_dir()
        for f in dossier.iterdir() if f.suffix.lower() in EXTENSIONS and not f.name.startswith(("~$", "."))
    ]
    if not candidats:
        dossiers = "\n".join(f"  - {d}" for d in dossiers_par_defaut())
        raise CommandError(
            "Aucun classeur Excel trouvé. Déposez la liste officielle des IMF (.xlsx) dans l'un de ces dossiers :\n"
            f"{dossiers}\nou indiquez son chemin : python manage.py charger_annuaire chemin/annuaire.xlsx"
        )
    return max(candidats, key=lambda f: f.stat().st_mtime)  # le plus récent


class Command(BaseCommand):
    help = (
        "Vérifie et charge la liste officielle des IMF (ou l'export de l'annuaire) : institutions, sièges, "
        "dirigeants et, si le classeur en contient, points de service — "
        "lignes conformes enregistrées, lignes non conformes écartées et listées dans un rapport."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "fichier", type=Path, nargs="?",
            help="Classeur Excel (.xlsx). Par défaut : le plus récent de backend/donnees_initiales/.",
        )
        parser.add_argument(
            "--forcer", action="store_true",
            help="Charger même si la base contient déjà des institutions (risque de doublons de dirigeants).",
        )

    def handle(self, *args, fichier: Path | None, forcer: bool, **options):
        fichier = fichier or trouver_classeur()
        if not fichier.is_file():
            raise CommandError(f"Fichier introuvable : {fichier}")
        if fichier.suffix.lower() not in EXTENSIONS:
            raise CommandError(f"Format non pris en charge ({fichier.suffix}) : un classeur Excel .xlsx est attendu.")
        if IMF.objects.exists() and not forcer:
            raise CommandError(
                f"La base contient déjà {IMF.objects.count()} institution(s) : chargement annulé pour ne pas "
                "créer de doublons. Relancez avec --forcer pour mettre à jour la base à partir du classeur."
            )
        self.stdout.write(self.style.MIGRATE_HEADING(f"Classeur : {fichier}"))

        # Les régions et départements doivent exister avant l'import : chaque point de service
        # y est rattaché d'après son GPS à l'enregistrement (ZoneGeographique.zones_a_completer).
        call_command("charger_regions", stdout=self.stdout)
        call_command("charger_departements", stdout=self.stdout)

        rapport: list[list] = []
        total_importees = total_ecartees = 0
        dirigeants_traites = False
        for type_import in ORDRE:
            libelle = ImportationFichier.TypeImport(type_import).label
            if type_import == ImportationFichier.TypeImport.POINTS_SERVICE and not self._a_feuille(fichier, type_import):
                self.stdout.write(f"{libelle} : aucune feuille de points de service dans le classeur, import sauté.")
                continue
            if type_import == ImportationFichier.TypeImport.DIRIGEANTS and dirigeants_traites:
                self.stdout.write(f"{libelle} : déjà enregistrés avec les institutions.")
                continue
            with fichier.open("rb") as contenu:
                importation = ImportationFichier.objects.create(
                    type_import=type_import, fichier=File(contenu, name=fichier.name)
                )
            bilan = lancer_importation(importation)
            importation.refresh_from_db()
            if importation.statut == ImportationFichier.StatutImport.ECHEC:
                motif = bilan.erreurs[0]["message"] if bilan.erreurs else "fichier non conforme"
                raise CommandError(
                    f"{libelle} : fichier non conforme, rien n'a été enregistré pour cet import ni les suivants.\n"
                    f"  {motif}"
                )
            self.stdout.write(
                f"{libelle} : {importation.nb_lignes_total} ligne(s) lue(s) — {bilan.lignes_creees} créée(s), "
                f"{bilan.lignes_mises_a_jour} mise(s) à jour, {len(bilan.erreurs)} écartée(s), "
                f"{len(bilan.avertissements)} enregistrée(s) avec une valeur écartée"
            )
            if bilan.avec_dirigeants:
                dirigeants_traites = True
                self.stdout.write(f"  dont {bilan.dirigeants_enregistres} dirigeant(s) et mandat(s) enregistré(s)")
            total_importees += bilan.lignes_importees
            total_ecartees += len(bilan.erreurs)
            for entree in bilan.erreurs + bilan.avertissements:
                rapport.append([
                    libelle, entree["ligne"] or "",
                    "valeur écartée, ligne enregistrée" if entree.get("avertissement") else "ligne écartée",
                    entree["message"],
                ])

        chemin_rapport = self._ecrire_rapport(fichier, rapport)
        self.stdout.write(self.style.SUCCESS(
            f"Terminé : {total_importees} ligne(s) enregistrée(s), {total_ecartees} ligne(s) écartée(s)."
        ))
        if chemin_rapport:
            self.stdout.write(f"Rapport des lignes écartées : {chemin_rapport}")

    @staticmethod
    def _a_feuille(fichier: Path, type_import: str) -> bool:
        """Le classeur contient-il une feuille propre à ce type d'import ?"""
        from openpyxl import load_workbook

        classeur = load_workbook(fichier, read_only=True)
        try:
            feuilles = PROCESSORS[type_import].feuilles
            return any(_feuille_voulue(cle(nom), feuilles) is not None for nom in classeur.sheetnames)
        finally:
            classeur.close()

    def _ecrire_rapport(self, fichier: Path, rapport: list[list]) -> Path | None:
        """CSV (séparateur « ; », lisible dans Excel) des lignes écartées, à côté du classeur."""
        if not rapport:
            return None
        chemin = fichier.with_name(f"rapport_import_{datetime.now():%Y%m%d_%H%M%S}.csv")
        try:
            with chemin.open("w", newline="", encoding="utf-8-sig") as sortie:
                ecrivain = csv.writer(sortie, delimiter=";")
                ecrivain.writerow(["Import", "Ligne du classeur", "Décision", "Détail"])
                ecrivain.writerows(rapport)
        except OSError as exc:  # dossier en lecture seule : le détail reste dans l'historique des imports
            self.stdout.write(self.style.WARNING(f"Rapport non écrit ({exc}) : voir l'historique des imports."))
            return None
        return chemin
