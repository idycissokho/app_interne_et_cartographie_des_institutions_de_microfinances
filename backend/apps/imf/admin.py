from django.contrib import admin
from .models import IMF


@admin.register(IMF)
class IMFAdmin(admin.ModelAdmin):
    list_display = ("nom", "sigle", "type_imf", "statut_reglementaire", "is_active", "date_creation")
    list_filter = ("type_imf", "statut_reglementaire", "is_active")
    search_fields = ("nom", "sigle")
    readonly_fields = ("id", "date_creation", "date_modification")
