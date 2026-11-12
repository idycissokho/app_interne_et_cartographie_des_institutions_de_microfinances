"""
dirigeants/admin.py
===================
Enregistrement des modèles Dirigeant et Mandat dans l'interface d'administration Django.
"""

from django.contrib import admin
from .models import Dirigeant, Mandat


@admin.register(Dirigeant)
class DirigeantAdmin(admin.ModelAdmin):
    """Interface d'administration pour les dirigeants."""

    list_display = ("nom", "prenom", "telephone", "email_professionnel", "is_active")
    list_filter = ("is_active",)
    search_fields = ("nom", "prenom", "email_professionnel")
    readonly_fields = ("id", "date_creation", "date_modification")


@admin.register(Mandat)
class MandatAdmin(admin.ModelAdmin):
    """Interface d'administration pour les mandats."""

    list_display = ("dirigeant", "imf", "fonction_mandat", "statut_mandat", "date_debut", "date_fin", "is_active")
    list_filter = ("fonction_mandat", "statut_mandat", "is_active")
    search_fields = ("dirigeant__nom", "dirigeant__prenom", "imf__nom")
    readonly_fields = ("id", "date_creation", "date_modification")
    raw_id_fields = ("dirigeant", "imf")
