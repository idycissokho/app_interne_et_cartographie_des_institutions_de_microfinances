"""
imf/serializers.py
==================
Sérialiseurs du module IMF :
- IMFListSerializer   : représentation allégée pour les listes (GET /imf/)
- IMFDetailSerializer : représentation complète pour création/modification/détail
"""

from rest_framework import serializers
from .models import IMF


class IMFListSerializer(serializers.ModelSerializer):
    """Sérialiseur allégé utilisé pour les réponses de liste."""

    nb_points_service = serializers.SerializerMethodField()

    class Meta:
        model = IMF
        fields = ["id", "nom", "sigle", "type_imf", "statut_reglementaire", "nb_points_service"]

    def get_nb_points_service(self, obj):
        """Nombre de points de service actifs rattachés à l'IMF."""
        return obj.compter_points_service()


class IMFDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet utilisé pour le détail, la création et la modification."""

    nb_points_service = serializers.SerializerMethodField()
    statut_actif = serializers.SerializerMethodField()

    class Meta:
        model = IMF
        fields = [
            "id", "nom", "sigle", "type_imf", "statut_reglementaire",
            "adresse_siege", "telephone", "email", "site_web",
            "is_active", "nb_points_service", "statut_actif",
            "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_nb_points_service(self, obj):
        """Nombre de points de service actifs rattachés à l'IMF."""
        return obj.compter_points_service()

    def get_statut_actif(self, obj):
        """True si l'IMF est agréée et non désactivée."""
        return obj.verifier_statut_actif()
