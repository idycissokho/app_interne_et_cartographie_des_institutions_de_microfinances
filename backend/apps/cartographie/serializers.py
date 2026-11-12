"""
cartographie/serializers.py
============================
Sérialiseurs du module cartographie :
- ZoneGeographiqueListSerializer  : liste allégée sans géométrie
- ZoneGeographiqueDetailSerializer: détail complet avec agrégats
- ZoneGeographiqueGeoSerializer   : export GeoJSON pour la carte
"""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from .models import ZoneGeographique


class ZoneGeographiqueListSerializer(serializers.ModelSerializer):
    """Sérialiseur allégé pour les listes — sans géométrie pour alléger les réponses."""

    class Meta:
        model = ZoneGeographique
        fields = ["id", "code", "nom", "type_zone"]


class ZoneGeographiqueDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet avec agrégats calculés."""

    agregats = serializers.SerializerMethodField()

    class Meta:
        model = ZoneGeographique
        fields = [
            "id", "code", "nom", "type_zone",
            "is_active", "agregats", "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_agregats(self, obj):
        """Agrégats macro : nb points de service, nb IMF, encours total."""
        return obj.calculer_agregats_macro()


class ZoneGeographiqueGeoSerializer(GeoFeatureModelSerializer):
    """Sérialiseur GeoJSON pour l'affichage cartographique."""

    class Meta:
        model = ZoneGeographique
        geo_field = "geometrie"
        fields = ["id", "code", "nom", "type_zone"]
