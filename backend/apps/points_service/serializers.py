"""
points_service/serializers.py
==============================
Sérialiseurs du module points de service :
- PointServiceListSerializer  : liste allégée
- PointServiceDetailSerializer: détail complet
"""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import PointService


class PointServiceListSerializer(serializers.ModelSerializer):
    """Sérialiseur allégé pour les listes."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)

    class Meta:
        model = PointService
        fields = ["id", "nom", "imf", "imf_nom", "type_point", "statut_point", "statut_reglementaire", "is_active"]


class PointServiceDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet pour le détail, la création et la modification."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)

    class Meta:
        model = PointService
        fields = [
            "id", "imf", "imf_nom", "nom", "type_point", "statut_point", "statut_reglementaire",
            "adresse", "telephone", "email", "localisation", "encours",
            "is_active", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]


class PointServiceGeoSerializer(GeoFeatureModelSerializer):
    """Sérialiseur GeoJSON pour l'affichage cartographique."""

    class Meta:
        model = PointService
        geo_field = "localisation"
        fields = ["id", "nom", "imf", "type_point", "statut_point"]
