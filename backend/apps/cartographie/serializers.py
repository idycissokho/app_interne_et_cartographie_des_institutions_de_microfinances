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
        fields = ["id", "code", "nom", "type_zone", "parent"]


class ZoneGeographiqueDetailSerializer(serializers.ModelSerializer):
    """Sérialiseur complet avec agrégats calculés."""

    agregats = serializers.SerializerMethodField()

    class Meta:
        model = ZoneGeographique
        fields = [
            "id", "code", "nom", "type_zone", "parent", "geometrie",
            "is_active", "agregats", "date_creation", "date_modification",
        ]
        extra_kwargs = {"geometrie": {"write_only": True}}
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_agregats(self, obj):
        """Agrégats macro : nb points de service, nb IMF, encours total."""
        return obj.calculer_agregats_macro()

    def validate(self, attrs):
        type_zone = attrs.get("type_zone", getattr(self.instance, "type_zone", None))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        attendu = {"REGION": None, "DEPARTEMENT": "REGION", "COMMUNE": "DEPARTEMENT"}[type_zone]
        if attendu is None and parent is not None:
            raise serializers.ValidationError({"parent": "Une région n'a pas de zone parente."})
        if attendu is not None and parent is not None and parent.type_zone != attendu:
            raise serializers.ValidationError(
                {"parent": f"Le parent d'une zone {type_zone} doit être de type {attendu}."}
            )
        return attrs


class ZoneAgregatsSerializer(serializers.ModelSerializer):
    """Zone + indicateurs annotés, pour la carte macro (sans géométrie)."""

    nb_points_service = serializers.IntegerField(read_only=True)
    nb_imf = serializers.IntegerField(read_only=True)
    encours_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    depots_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    nb_membres_total = serializers.IntegerField(read_only=True)

    class Meta:
        model = ZoneGeographique
        fields = [
            "id", "code", "nom", "type_zone", "parent",
            "nb_points_service", "nb_imf", "encours_total", "depots_total", "nb_membres_total",
        ]


class ZoneGeographiqueGeoSerializer(GeoFeatureModelSerializer):
    """Sérialiseur GeoJSON pour l'affichage cartographique."""

    class Meta:
        model = ZoneGeographique
        geo_field = "geometrie"
        fields = ["id", "code", "nom", "type_zone", "parent"]
