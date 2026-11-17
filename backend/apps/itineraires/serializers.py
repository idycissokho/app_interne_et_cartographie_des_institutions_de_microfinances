"""
itineraires/serializers.py
==========================
Entrée du calcul (origine, destination, modes) et formats de réponse (documentation OpenAPI).
"""

from rest_framework import serializers

from .fournisseurs import MODES
from .services import MARGE_ORIGINE, TYPES, dans_le_senegal, modes_valides


class PositionSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)

    def validate(self, donnees):
        if not dans_le_senegal(donnees["lat"], donnees["lon"], marge=MARGE_ORIGINE):
            raise serializers.ValidationError(
                "Le point de départ est hors du Sénégal ou invalide. Placez-le sur la carte."
            )
        return donnees


class DestinationRefSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=TYPES)
    id = serializers.UUIDField()


class CalculItineraireSerializer(serializers.Serializer):
    """Corps de POST /itineraires/calculer/. Les coordonnées de la destination sont relues en base."""

    origine = PositionSerializer()
    destination = DestinationRefSerializer()
    modes = serializers.ListField(
        child=serializers.ChoiceField(choices=MODES), required=False, allow_empty=False,
        help_text="Modes à calculer (les trois par défaut).",
    )

    def validate(self, donnees):
        donnees["modes"] = modes_valides(donnees.get("modes"))
        return donnees


# ---------------------------------------------------------------------------
# Réponses (documentation)
# ---------------------------------------------------------------------------

class DestinationSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=TYPES)
    id = serializers.UUIDField()
    nom = serializers.CharField()
    sous_titre = serializers.CharField()
    adresse = serializers.CharField()
    telephone = serializers.CharField()
    region = serializers.CharField(allow_null=True)
    lat = serializers.FloatField()
    lon = serializers.FloatField()


class EtapeSerializer(serializers.Serializer):
    instruction = serializers.CharField(help_text="Consigne en français.")
    distance_km = serializers.FloatField()
    duree_min = serializers.FloatField()


class ResultatModeSerializer(serializers.Serializer):
    statut = serializers.ChoiceField(choices=["ok", "aucun_itineraire", "indisponible", "erreur"])
    distance_km = serializers.FloatField(allow_null=True)
    duree_min = serializers.FloatField(allow_null=True)
    geometrie = serializers.JSONField(allow_null=True, help_text="LineString GeoJSON [longitude, latitude].")
    etapes = EtapeSerializer(many=True)
    message = serializers.CharField(allow_blank=True)


class CalculReponseSerializer(serializers.Serializer):
    destination = DestinationSerializer()
    fournisseur = serializers.CharField()
    modes = serializers.DictField(child=ResultatModeSerializer(), help_text="Clés : pied, moto, voiture.")
    plus_rapide = serializers.ChoiceField(choices=MODES, allow_null=True)


class RechercheReponseSerializer(serializers.Serializer):
    results = DestinationSerializer(many=True)


class ErreurSerializer(serializers.Serializer):
    code = serializers.CharField()
    detail = serializers.CharField()
