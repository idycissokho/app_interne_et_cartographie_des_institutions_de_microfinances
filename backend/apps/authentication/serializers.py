"""
authentication/serializers.py
=============================
Sérialiseurs du module authentification :
- LoginSerializer       : validation des identifiants email/password
- UtilisateurSerializer : représentation du profil utilisateur
- ChangePasswordSerializer : changement de mot de passe sécurisé
- RafraichissementSerializer : renouvellement du jeton (durée maximale, compte actif)
"""

import time

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings

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
            "role", "is_active", "doit_changer_mot_de_passe", "date_creation", "date_modification",
        ]
        read_only_fields = [
            "id", "email", "role", "is_active", "doit_changer_mot_de_passe", "date_creation", "date_modification",
        ]


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

    def validate_nouveau_mot_de_passe(self, value):
        if self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Le nouveau mot de passe doit être différent de l'actuel.")
        return value

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["nouveau_mot_de_passe"])
        user.doit_changer_mot_de_passe = False
        user.save(update_fields=["password", "doit_changer_mot_de_passe", "date_modification"])
        return user


class RafraichissementSerializer(TokenRefreshSerializer):
    """
    Renouvellement du jeton (POST /auth/token/refresh/) avec deux contrôles de sécurité :
    - durée maximale de session (SESSION_DUREE_MAX_HEURES depuis la connexion) ;
    - compte toujours actif (un compte désactivé ne peut plus prolonger sa session).
    """

    def validate(self, attrs):
        jeton = self.token_class(attrs["refresh"])  # signature et expiration vérifiées ici
        debut = jeton.get("debut_session")
        if debut and time.time() - float(debut) > settings.SESSION_DUREE_MAX_HEURES * 3600:
            raise InvalidToken("Session expirée : veuillez vous reconnecter.")
        id_utilisateur = jeton.get(api_settings.USER_ID_CLAIM)
        if not Utilisateur.objects.filter(pk=id_utilisateur, is_active=True).exists():
            raise InvalidToken("Ce compte n'est plus actif.")
        return super().validate(attrs)
