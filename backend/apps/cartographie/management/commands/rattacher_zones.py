"""
cartographie/management/commands/rattacher_zones.py
===================================================
Complète la région, le département et la commune des points de service (et la région du
siège des IMF) à partir de leur position GPS, quand le fichier source ne les donnait pas.

- Seuls les champs VIDES sont remplis : une valeur saisie ou importée n'est jamais remplacée.
- Les positions non fiables sont ignorées (sans GPS, position par défaut 14.75 / -17.33333,
  hors du Sénégal : voir cartographie/positions.py) : elles donneraient une zone fausse.
- Un niveau n'est rempli que si ses contours sont chargés (charger_regions, charger_departements).
- Cohérence : un département n'est rempli que s'il appartient à la région déjà connue du point
  (et une commune à son département). Sinon le point est compté comme « incohérent » :
  la région saisie et la position GPS se contredisent, à vérifier à la main.
Même règle qu'à l'enregistrement d'un point (ZoneGeographique.zones_a_completer).

Usage :
  python manage.py rattacher_zones --simulation   # affiche ce qui serait rempli, sans rien écrire
  python manage.py rattacher_zones                # remplit
Relançable sans risque. Les nouveaux points le sont déjà à l'enregistrement (PointService.save).
"""

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.cartographie.models import ZoneGeographique
from apps.cartographie.positions import raison_position_non_fiable
from apps.imf.models import IMF
from apps.points_service.models import PointService
from config.cache_donnees import invalider

NIVEAUX = ("region", "departement", "commune")


class Command(BaseCommand):
    help = "Complète région / département / commune des points de service d'après leur GPS (champs vides uniquement)."

    def add_arguments(self, parser):
        parser.add_argument("--simulation", action="store_true", help="Afficher le résultat sans rien enregistrer.")

    @transaction.atomic
    def handle(self, *args, simulation=False, **options):
        remplis, ignores, incoherents = Counter(), 0, []

        points = PointService.objects.filter(is_active=True, localisation__isnull=False).filter(
            Q(region__isnull=True) | Q(departement__isnull=True) | Q(commune__isnull=True)
        ).select_related("region", "imf")
        modifies = []
        for point in points:
            if raison_position_non_fiable(point.localisation):
                ignores += 1
                continue
            actuelles = {niveau: getattr(point, f"{niveau}_id") for niveau in NIVEAUX}
            zones, incoherent = ZoneGeographique.zones_a_completer(point.localisation, actuelles)
            if incoherent:
                incoherents.append(point)
            for niveau, zone in zones.items():
                setattr(point, niveau, zone)
                remplis[niveau] += 1
            change = bool(zones)
            if change:
                modifies.append(point)
        if not simulation:
            PointService.objects.bulk_update(modifies, list(NIVEAUX))

        imfs = []
        for imf in IMF.objects.filter(is_active=True, region__isnull=True, localisation_siege__isnull=False):
            if raison_position_non_fiable(imf.localisation_siege):
                continue
            region = ZoneGeographique.zones_a_completer(imf.localisation_siege, {})[0].get("region")
            if region is not None:
                imf.region = region
                imfs.append(imf)
        if not simulation:
            IMF.objects.bulk_update(imfs, ["region"])
            # bulk_update n'émet pas de signal : on périme nous-mêmes le cache (cartes, statistiques).
            invalider()

        verbe = "seraient complétés" if simulation else "complétés"
        self.stdout.write(self.style.SUCCESS(
            f"Points de service {verbe} : {len(modifies)} "
            f"(région : {remplis['region']}, département : {remplis['departement']}, commune : {remplis['commune']}). "
            f"Sièges d'IMF (région) : {len(imfs)}. Positions non fiables ignorées : {ignores}."
        ))
        if incoherents:
            self.stdout.write(self.style.WARNING(
                f"{len(incoherents)} point(s) dont la région enregistrée contredit la position GPS (non modifiés) :"
            ))
            for p in incoherents[:30]:
                self.stdout.write(f"  - {p.nom} ({p.imf}) : région enregistrée « {p.region} », GPS {p.localisation.y:.5f}, {p.localisation.x:.5f}")
            if len(incoherents) > 30:
                self.stdout.write(f"  … et {len(incoherents) - 30} autre(s).")
        if simulation:
            transaction.set_rollback(True)
