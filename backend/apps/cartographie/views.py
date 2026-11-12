"""
cartographie/views.py
=====================
Vues DRF du module cartographie :
- ZoneGeographiqueListCreateView : liste + création
- ZoneGeographiqueDetailView     : détail, modification, soft delete
- ZoneGeographiqueGeoView        : export GeoJSON pour la carte frontend
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated

from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsAdmin

from .models import ZoneGeographique
from .serializers import (
    ZoneAgregatsSerializer,
    ZoneGeographiqueDetailSerializer,
    ZoneGeographiqueGeoSerializer,
    ZoneGeographiqueListSerializer,
)


class ZoneGeographiqueListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/cartographie/zones/  — Liste des zones géographiques.
    POST /api/v1/cartographie/zones/  — Création (ADMIN uniquement).
    """

    queryset = ZoneGeographique.objects.filter(is_active=True)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_zone", "parent"]
    search_fields = ["nom", "code"]
    ordering_fields = ["nom", "type_zone"]

    def get_serializer_class(self):
        """Détaillé pour la création, allégé pour la liste."""
        return ZoneGeographiqueDetailSerializer if self.request.method == "POST" else ZoneGeographiqueListSerializer

    def get_permissions(self):
        """Création réservée aux ADMIN, lecture ouverte à tout utilisateur authentifié."""
        if self.request.method == "POST":
            return [IsAdmin()]
        return [IsAuthenticated()]


class ZoneGeographiqueDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/cartographie/zones/<uuid>/"""

    queryset = ZoneGeographique.objects.filter(is_active=True)
    serializer_class = ZoneGeographiqueDetailSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class ZoneGeographiqueGeoView(generics.ListAPIView):
    """GET /api/v1/cartographie/zones/geojson/  — Export GeoJSON pour la carte.
    Filtrable par type_zone pour charger uniquement le niveau souhaité.
    """

    serializer_class = ZoneGeographiqueGeoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["type_zone", "parent"]
    # La carte doit recevoir toutes les zones du niveau demandé.
    pagination_class = None

    def get_queryset(self):
        """Exclut les zones sans géométrie de l'export GeoJSON."""
        return ZoneGeographique.objects.filter(
            is_active=True, geometrie__isnull=False
        )


class ZoneAgregatsView(generics.ListAPIView):
    """GET /api/v1/cartographie/zones/agregats/?type_zone=REGION — Carte macro.

    Retourne, pour chaque zone du niveau demandé, le nombre d'IMF, de points de
    service, l'encours, les dépôts et le nombre de membres, en une seule requête.
    """

    serializer_class = ZoneAgregatsSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["parent"]

    def get_queryset(self):
        type_zone = self.request.query_params.get("type_zone", ZoneGeographique.TypeZone.REGION)
        if type_zone not in ZoneGeographique.TypeZone.values:
            raise ValidationError({"type_zone": f"Valeurs possibles : {ZoneGeographique.TypeZone.values}"})
        return ZoneGeographique.objects.filter(is_active=True, type_zone=type_zone).annotate(
            **ZoneGeographique.annotations_agregats(type_zone)
        ).order_by("nom")
