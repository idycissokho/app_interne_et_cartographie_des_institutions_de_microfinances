from django.contrib.gis import admin
from .models import PointService


@admin.register(PointService)
class PointServiceAdmin(admin.GISModelAdmin):
    list_display = ("nom", "imf", "type_point", "statut_point", "statut_reglementaire", "is_active")
    list_filter = ("type_point", "statut_point", "statut_reglementaire", "is_active")
    search_fields = ("nom", "adresse", "imf__nom")
    readonly_fields = ("id", "date_creation", "date_modification")
    raw_id_fields = ("imf", "region", "departement", "commune")
