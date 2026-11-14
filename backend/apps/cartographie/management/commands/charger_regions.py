"""
cartographie/management/commands/charger_regions.py
===================================================
Charge les 14 régions du Sénégal (nom, code ISO 3166-2, contour) dans ZoneGeographique.

Les régions sont le référentiel géographique de l'application : rattachement des
points de service à partir de leur GPS, indicateurs par région, cartes.
Source des contours : donnees/regions_senegal.geojson (Gouvernement du Sénégal /
OCHA via geoBoundaries, CC BY 3.0 IGO).

Usage : python manage.py charger_regions
La commande peut être relancée sans créer de doublon (mise à jour par code).
"""

import json
from pathlib import Path

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.core.management.base import BaseCommand

from apps.cartographie.models import ZoneGeographique

FICHIER = Path(__file__).resolve().parents[2] / "donnees" / "regions_senegal.geojson"

# Nom dans le fichier de contours -> (code ISO 3166-2:SN, nom officiel)
REGIONS = {
    "Dakar": ("SN-DK", "Dakar"),
    "Diourbel": ("SN-DB", "Diourbel"),
    "Fatick": ("SN-FK", "Fatick"),
    "Kaffrine": ("SN-KA", "Kaffrine"),
    "Kaolack": ("SN-KL", "Kaolack"),
    "Kedougou": ("SN-KE", "Kédougou"),
    "Kolda": ("SN-KD", "Kolda"),
    "Louga": ("SN-LG", "Louga"),
    "Matam": ("SN-MT", "Matam"),
    "Saint Louis": ("SN-SL", "Saint-Louis"),
    "Sedhiou": ("SN-SE", "Sédhiou"),
    "Tambacounda": ("SN-TC", "Tambacounda"),
    "Thies": ("SN-TH", "Thiès"),
    "Ziguinchor": ("SN-ZG", "Ziguinchor"),
}


class Command(BaseCommand):
    help = "Charge les 14 régions du Sénégal et leurs contours."

    def handle(self, *args, **options):
        contours = json.loads(FICHIER.read_text(encoding="utf-8"))["features"]
        creees = 0
        for contour in contours:
            code, nom = REGIONS[contour["properties"]["nom"]]
            geometrie = GEOSGeometry(json.dumps(contour["geometry"]), srid=4326)
            if geometrie.geom_type == "Polygon":
                geometrie = MultiPolygon(geometrie, srid=4326)
            _, creee = ZoneGeographique.objects.update_or_create(
                code=code,
                defaults={
                    "nom": nom,
                    "type_zone": ZoneGeographique.TypeZone.REGION,
                    "geometrie": geometrie,
                    "is_active": True,
                },
            )
            creees += creee
        self.stdout.write(self.style.SUCCESS(
            f"Régions : {creees} créée(s), {len(contours) - creees} mise(s) à jour."
        ))
