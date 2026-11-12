"""
authentication/serializers.py
=============================
Sérialiseurs du module authentification :
- LoginSerializer       : validation des identifiants email/password
- UtilisateurSerializer : représentation du profil utilisateur
- ChangePasswordSerializer : changement de mot de passe sécurisé
"""

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Utilisateur


class LoginSerializer(serializers.Serializer):
    """Valide les identifiants et retourne l'objet utilisateur authentifié."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["email"],
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError("Email ou mot de passe incorrect.")
        if not user.is_active:
            raise serializers.ValidationError("Ce compte est désactivé.")
        attrs["user"] = user
        return attrs


class UtilisateurSerializer(serializers.ModelSerializer):
    """Sérialise le profil utilisateur — lecture et mise à jour partielle (nom/prénom)."""

    nom_complet = serializers.CharField(read_only=True)

    class Meta:
        model = Utilisateur
        fields = [
            "id", "email", "nom", "prenom", "nom_complet",
            "role", "is_active", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "email", "role", "is_active", "date_creation", "date_modification"]


class ChangePasswordSerializer(serializers.Serializer):
    """Valide et applique le changement de mot de passe de l'utilisateur connecté."""

    ancien_mot_de_passe = serializers.CharField(write_only=True)
    nouveau_mot_de_passe = serializers.CharField(write_only=True)
    confirmation = serializers.CharField(write_only=True)

    def validate_ancien_mot_de_passe(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate(self, attrs):
        if attrs["nouveau_mot_de_passe"] != attrs["confirmation"]:
            raise serializers.ValidationError(
                {"confirmation": "Les mots de passe ne correspondent pas."}
            )
        validate_password(attrs["nouveau_mot_de_passe"], self.context["request"].user)
        return attrs

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["nouveau_mot_de_passe"])
        user.save(update_fields=["password", "date_modification"])
        return user
