"""
imf/admin.py
============
Enregistrement du modèle IMF dans l'interface d'administration Django.
"""

from django.contrib.gis import admin

from .models import IMF, Bailleur


@admin.register(Bailleur)
class BailleurAdmin(admin.ModelAdmin):
    list_display = ("nom", "sigle", "is_active")
    search_fields = ("nom", "sigle")


@admin.register(IMF)
class IMFAdmin(admin.GISModelAdmin):
    """Interface d'administration pour les Institutions de Microfinance."""

    list_display = ("nom", "sigle", "type_imf", "statut_reglementaire", "is_active", "date_creation")
    list_filter = ("type_imf", "statut_reglementaire", "is_active")
    search_fields = ("nom", "sigle")
    readonly_fields = ("id", "date_creation", "date_modification")
    filter_horizontal = ("bailleurs",)
