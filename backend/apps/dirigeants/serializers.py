"""
dirigeants/serializers.py
=========================
Sérialiseurs des modules Dirigeant et Mandat :
- DirigeantListSerializer  : liste allégée
- DirigeantDetailSerializer: détail complet avec historique mandats
- MandatSerializer         : création/modification/détail d'un mandat
"""

from rest_framework import serializers
from .models import Dirigeant, Mandat


class MandatSerializer(serializers.ModelSerializer):
    """Sérialiseur complet pour un mandat."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)
    est_en_cours = serializers.SerializerMethodField()

    class Meta:
        model = Mandat
        fields = [
            "id", "imf", "imf_nom", "fonction_mandat", "date_debut", "date_fin",
            "statut_mandat", "documents_justificatifs", "est_en_cours",
            "is_active", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_est_en_cours(self, obj):
        """True si le mandat est actif sans date de fin."""
        return obj.est_en_cours()


class DirigeantListSerializer(serializers.ModelSerializer):
    """Sérialiseur allégé pour les listes."""

    nom_complet = serializers.SerializerMethodField()
    nb_mandats = serializers.SerializerMethodField()

    class Meta:
        model = Dirigeant
        fields = ["id", "nom_complet", "telephone", "email_professionnel", "nb_mandats"]

    def get_nom_complet(self, obj):
        return obj.get_nom_complet()

    def get_nb_mandats(self, obj):
        """Nombre total de mandats du dirigeant."""
        return obj.mandats.filter(is_active=True).count()


class DirigeantDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet avec historique des mandats."""

    nom_complet = serializers.SerializerMethodField()
    mandats = MandatSerializer(many=True, read_only=True)

    class Meta:
        model = Dirigeant
        fields = [
            "id", "nom", "prenom", "nom_complet", "telephone",
            "email_professionnel", "email_secondaire",
            "is_active", "mandats", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_nom_complet(self, obj):
        return obj.get_nom_complet()
