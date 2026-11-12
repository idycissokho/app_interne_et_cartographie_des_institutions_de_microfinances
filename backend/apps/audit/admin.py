"""
audit/admin.py
==============
Enregistrement du modèle JournalAudit dans l'interface d'administration Django.
Toutes les entrées sont en lecture seule.
"""

from django.contrib import admin
from .models import JournalAudit


@admin.register(JournalAudit)
class JournalAuditAdmin(admin.ModelAdmin):
    """Interface d'administration pour le journal d'audit — lecture seule."""

    list_display = ("action", "objet_concerne", "utilisateur", "role", "date_action")
    list_filter = ("action", "role")
    search_fields = ("action", "objet_concerne", "utilisateur__email")
    readonly_fields = ("id", "utilisateur", "action", "objet_concerne", "role", "date_action", "details")

    def has_add_permission(self, request):
        """Désactive la création manuelle depuis l'admin."""
        return False

    def has_change_permission(self, request, obj=None):
        """Désactive la modification depuis l'admin."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Désactive la suppression depuis l'admin."""
        return False
