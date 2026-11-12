"""
points_service/serializers.py
==============================
Sérialiseurs du module points de service :
- PointServiceListSerializer   : liste allégée
- PointServiceDetailSerializer : détail complet
- PointServiceGeoSerializer    : GeoJSON pour la carte micro (popup)
"""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from apps.cartographie.models import ZoneGeographique

from .models import PointService


def _zone_field(type_zone):
    return serializers.PrimaryKeyRelatedField(
        queryset=ZoneGeographique.objects.filter(type_zone=type_zone, is_active=True),
        required=False,
        allow_null=True,
    )


class PointServiceListSerializer(serializers.ModelSerializer):
    """Sérialiseur allégé pour les listes."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)
    region_nom = serializers.CharField(source="region.nom", read_only=True, default=None)

    class Meta:
        model = PointService
        fields = [
            "id", "nom", "imf", "imf_nom", "type_point", "statut_point",
            "statut_reglementaire", "region", "region_nom", "is_active",
        ]


class PointServiceDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet pour le détail, la création et la modification."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)
    region = _zone_field(ZoneGeographique.TypeZone.REGION)
    departement = _zone_field(ZoneGeographique.TypeZone.DEPARTEMENT)
    commune = _zone_field(ZoneGeographique.TypeZone.COMMUNE)

    class Meta:
        model = PointService
        fields = [
            "id", "imf", "imf_nom", "nom", "type_point", "statut_point", "statut_reglementaire",
            "adresse", "region", "departement", "commune", "telephone", "email",
            "localisation", "date_ouverture", "encours", "depots", "nombre_membres",
            "is_active", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def validate_imf(self, imf):
        if not imf.is_active:
            raise serializers.ValidationError("Cette IMF est désactivée.")
        return imf


class PointServiceGeoSerializer(GeoFeatureModelSerializer):
    """Sérialiseur GeoJSON pour l'affichage cartographique (contenu du popup CAR-MIC-03)."""

    imf_nom = serializers.CharField(source="imf.nom", read_only=True)
    region_nom = serializers.CharField(source="region.nom", read_only=True, default=None)
    departement_nom = serializers.CharField(source="departement.nom", read_only=True, default=None)
    commune_nom = serializers.CharField(source="commune.nom", read_only=True, default=None)

    class Meta:
        model = PointService
        geo_field = "localisation"
        fields = [
            "id", "nom", "imf", "imf_nom", "type_point", "statut_point",
            "region_nom", "departement_nom", "commune_nom", "telephone", "email",
        ]
