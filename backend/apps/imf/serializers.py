"""
imf/serializers.py
==================
Sérialiseurs du module IMF :
- BailleurSerializer  : référentiel des bailleurs
- IMFListSerializer   : représentation allégée pour les listes (GET /imf/)
- IMFDetailSerializer : représentation complète pour création/modification/détail
"""

from rest_framework import serializers

from .models import IMF, Bailleur


class BailleurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bailleur
        fields = ["id", "nom", "sigle", "is_active", "date_creation", "date_modification"]
        read_only_fields = ["id", "date_creation", "date_modification"]


class _NbPointsServiceMixin:
    def get_nb_points_service(self, obj):
        """Utilise l'annotation de la vue si présente (évite une requête par IMF)."""
        annote = getattr(obj, "nb_points_service_actifs", None)
        return annote if annote is not None else obj.compter_points_service()


class IMFListSerializer(_NbPointsServiceMixin, serializers.ModelSerializer):
    """Sérialiseur allégé utilisé pour les réponses de liste."""

    nb_points_service = serializers.SerializerMethodField()

    class Meta:
        model = IMF
        fields = ["id", "nom", "sigle", "type_imf", "statut_reglementaire", "nb_points_service"]


class IMFDetailSerializer(_NbPointsServiceMixin, serializers.ModelSerializer):
    """Sérialiseur complet utilisé pour le détail, la création et la modification."""

    nb_points_service = serializers.SerializerMethodField()
    statut_actif = serializers.SerializerMethodField()
    bailleurs = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Bailleur.objects.filter(is_active=True)
    )
    bailleurs_detail = BailleurSerializer(source="bailleurs", many=True, read_only=True)

    class Meta:
        model = IMF
        fields = [
            "id", "nom", "sigle", "type_imf", "statut_reglementaire",
            "adresse_siege", "localisation_siege", "telephone", "email", "site_web",
            "bailleurs", "bailleurs_detail",
            "is_active", "nb_points_service", "statut_actif",
            "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    def get_statut_actif(self, obj):
        """True si l'IMF est agréée et non désactivée."""
        return obj.verifier_statut_actif()
