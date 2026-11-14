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
    """Sérialiseur allégé utilisé pour les réponses de liste (référentiel, annuaire)."""

    nb_points_service = serializers.SerializerMethodField()
    nb_dirigeants_en_fonction = serializers.IntegerField(read_only=True, default=0)
    region_siege = serializers.CharField(read_only=True, default=None)
    a_gps = serializers.SerializerMethodField()
    bailleurs_noms = serializers.SerializerMethodField()

    class Meta:
        model = IMF
        fields = [
            "id", "nom", "sigle", "numero_agrement", "type_imf", "statut_reglementaire", "nb_points_service",
            "email", "telephone", "adresse_siege", "a_gps", "bailleurs_noms",
            "type_sfd", "affiliation", "annee_creation", "nb_beneficiaires", "capital", "situation",
            "nb_dirigeants_en_fonction", "region_siege", "date_creation",
        ]

    def get_a_gps(self, obj):
        return obj.localisation_siege is not None

    def get_bailleurs_noms(self, obj):
        return [b.sigle or b.nom for b in obj.bailleurs.all()]


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
            "id", "nom", "sigle", "numero_agrement", "type_imf", "statut_reglementaire",
            "adresse_siege", "localisation_siege", "telephone", "email", "site_web",
            "reference_externe", "region", "lieu_dit", "type_sfd", "affiliation", "forme_juridique",
            "type_union", "annee_creation", "ninea", "nb_unions_affiliees", "nb_institutions_base",
            "nb_beneficiaires", "capital", "situation", "nb_membres_ca", "nb_membres_cs", "nb_membres_cc",
            "url_fiche", "date_fiche",
            "bailleurs", "bailleurs_detail",
            "is_active", "nb_points_service", "statut_actif",
            "nb_dirigeants_en_fonction", "region_siege", "nb_regions_couvertes", "nb_membres_total",
            "date_creation", "date_modification",
        ]
        read_only_fields = ["id", "date_creation", "date_modification"]

    nb_dirigeants_en_fonction = serializers.IntegerField(read_only=True, default=0)
    region_siege = serializers.CharField(read_only=True, default=None)
    nb_regions_couvertes = serializers.SerializerMethodField()
    nb_membres_total = serializers.SerializerMethodField()

    def _points_actifs(self, obj):
        return obj.points_service.filter(is_active=True)

    def get_nb_regions_couvertes(self, obj):
        return self._points_actifs(obj).exclude(region=None).values("region").distinct().count()

    def get_nb_membres_total(self, obj):
        from django.db.models import Sum

        return self._points_actifs(obj).aggregate(t=Sum("nombre_membres"))["t"]

    def get_statut_actif(self, obj):
        """True si l'IMF est agréée et non désactivée."""
        return obj.verifier_statut_actif()
