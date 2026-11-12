from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Utilisateur


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display = ("email", "nom", "prenom", "role", "is_active", "date_creation")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email", "nom", "prenom")
    ordering = ("nom", "prenom")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Informations personnelles", {"fields": ("nom", "prenom", "role")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Métadonnées", {"fields": ("date_creation", "date_modification", "derniere_connexion_ip")}),
    )
    readonly_fields = ("date_creation", "date_modification", "derniere_connexion_ip")

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "nom", "prenom", "role", "password1", "password2"),
        }),
    )
