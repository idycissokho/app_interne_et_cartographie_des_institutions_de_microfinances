"""
importation/admin.py
====================
Enregistrement du modèle ImportationFichier dans l'interface d'administration Django.
"""

from django.contrib import admin
from .models import ImportationFichier


@admin.register(ImportationFichier)
class ImportationFichierAdmin(admin.ModelAdmin):
    """Interface d'administration pour les imports de fichiers."""

    list_display = ("type_import", "utilisateur", "statut", "nb_lignes_total", "nb_lignes_importees", "date_creation")
    list_filter = ("type_import", "statut")
    search_fields = ("utilisateur__email",)
    readonly_fields = (
        "id", "utilisateur", "statut", "nb_lignes_total",
        "nb_lignes_importees", "nb_lignes_erreur", "rapport_erreurs",
        "date_creation", "date_modification",
    )

    def has_add_permission(self, request):
        """Les imports se font uniquement via l'API."""
        return False
