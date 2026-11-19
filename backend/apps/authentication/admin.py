"""
authentication/admin.py
=======================
Enregistrement du modèle Utilisateur dans l'interface d'administration Django.
Hérite de UserAdmin pour conserver la gestion native des mots de passe.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import AdminPasswordChangeForm

from .models import Utilisateur


class MotDePasseProvisoireForm(AdminPasswordChangeForm):
    """Mot de passe fixé par un administrateur : provisoire, l'utilisateur devra le changer."""

    def save(self, commit=True):
        self.user.doit_changer_mot_de_passe = True
        return super().save(commit=commit)


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    """Interface d'administration pour le modèle Utilisateur custom."""

    list_display = ("email", "nom", "prenom", "role", "is_active", "doit_changer_mot_de_passe", "date_creation")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email", "nom", "prenom")
    ordering = ("nom", "prenom")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Informations personnelles", {"fields": ("nom", "prenom", "role")}),
        ("Permissions", {"fields": ("is_active", "doit_changer_mot_de_passe", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Métadonnées", {"fields": ("date_creation", "date_modification", "derniere_connexion_ip")}),
    )
    readonly_fields = ("date_creation", "date_modification", "derniere_connexion_ip")

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "nom", "prenom", "role", "password1", "password2"),
        }),
    )

    change_password_form = MotDePasseProvisoireForm

    # Nécessaire car notre modèle n'a pas de champ username
    USERNAME_FIELD = "email"

    def save_model(self, request, obj, form, change):
        # Compte créé par un administrateur : le mot de passe saisi est provisoire.
        if not change:
            obj.doit_changer_mot_de_passe = True
        super().save_model(request, obj, form, change)
