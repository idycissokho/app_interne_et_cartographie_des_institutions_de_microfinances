from rest_framework import serializers
from .models import IMF


class IMFListSerializer(serializers.ModelSerializer):
    nb_points_service = serializers.SerializerMethodField()

    class Meta:
        model = IMF
        fields = ["id", "nom", "sigle", "type_imf", "statut_reglementaire", "nb_points_service"]

    def get_nb_points_service(self, obj):
        return obj.compter_points_service()


class IMFDetailSerializer(serializers.ModelSerializer):
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
        return obj.compter_points_service()

    def get_statut_actif(self, obj):
        return obj.verifier_statut_actif()
