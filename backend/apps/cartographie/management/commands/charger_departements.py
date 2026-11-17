"""
cartographie/management/commands/charger_departements.py
========================================================
Charge les 46 départements du Sénégal (nom, code, contour) dans ZoneGeographique, rattachés
à leur région. À lancer après charger_regions.

Source : donnees/departements_senegal.geojson, tiré des limites administratives officielles
publiées par l'OCHA avec le Gouvernement du Sénégal (version v02, valides au 20 mai 2024,
Keur Massar compris ; CC BY-IGO, https://data.humdata.org/dataset/cod-ab-sen).
Contours simplifiés à ≈ 20 m, coordonnées arrondies à 5 décimales.

Usage : python manage.py charger_departements
Relançable sans doublon (mise à jour par code « SN0101 »…).
Ensuite : python manage.py rattacher_zones (département des points d'après leur GPS).
"""

import json
from pathlib import Path

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.cartographie.models import ZoneGeographique

FICHIER = Path(__file__).resolve().parents[2] / "donnees" / "departements_senegal.geojson"

# Graphies du fichier source remplacées par la forme officielle.
NOMS = {"Saint Louis": "Saint-Louis"}


class Command(BaseCommand):
    help = "Charge les 46 départements du Sénégal et leurs contours (après charger_regions)."

    @transaction.atomic
    def handle(self, *args, **options):
        regions = {
            z.nom: z for z in ZoneGeographique.objects.filter(type_zone=ZoneGeographique.TypeZone.REGION)
        }
        contours = json.loads(FICHIER.read_text(encoding="utf-8"))["features"]
        manquantes = sorted({c["properties"]["region"] for c in contours} - regions.keys())
        if manquantes:
            raise CommandError(
                f"Régions absentes de la base : {', '.join(manquantes)}. Lancez d'abord « charger_regions »."
            )
        creees = 0
        for contour in contours:
            p = contour["properties"]
            geometrie = GEOSGeometry(json.dumps(contour["geometry"]), srid=4326)
            if geometrie.geom_type == "Polygon":
                geometrie = MultiPolygon(geometrie, srid=4326)
            _, creee = ZoneGeographique.objects.update_or_create(
                code=p["code"],
                defaults={
                    "nom": NOMS.get(p["nom"], p["nom"]),
                    "type_zone": ZoneGeographique.TypeZone.DEPARTEMENT,
                    "parent": regions[p["region"]],
                    "geometrie": geometrie,
                    "is_active": True,
                },
            )
            creees += creee
        self.stdout.write(self.style.SUCCESS(
            f"Départements : {creees} créé(s), {len(contours) - creees} mis à jour."
        ))
