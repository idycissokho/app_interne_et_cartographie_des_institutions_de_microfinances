"""
cartographie/admin.py
=====================
Enregistrement du modèle ZoneGeographique dans l'interface d'administration Django.
Utilise GISModelAdmin pour afficher la géométrie sur une carte OpenLayers.
"""

from django.contrib.gis import admin
from .models import ZoneGeographique


@admin.register(ZoneGeographique)
class ZoneGeographiqueAdmin(admin.GISModelAdmin):
    """Interface d'administration pour les zones géographiques."""

    list_display = ("nom", "code", "type_zone", "parent", "is_active")
    raw_id_fields = ("parent",)
    list_filter = ("type_zone", "is_active")
    search_fields = ("nom", "code")
    readonly_fields = ("id", "date_creation", "date_modification")
