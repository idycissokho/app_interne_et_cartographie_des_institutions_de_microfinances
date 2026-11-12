"""
cartographie/views.py
=====================
Vues DRF du module cartographie :
- ZoneGeographiqueListCreateView : liste + création
- ZoneGeographiqueDetailView     : détail, modification, soft delete
- ZoneGeographiqueGeoView        : export GeoJSON pour la carte frontend
"""

from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import ZoneGeographique
from .serializers import (
    ZoneGeographiqueListSerializer,
    ZoneGeographiqueDetailSerializer,
    ZoneGeographiqueGeoSerializer,
)
from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsAdmin


class ZoneGeographiqueListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/cartographie/zones/  — Liste des zones géographiques.
    POST /api/v1/cartographie/zones/  — Création (ADMIN uniquement).
    """

    queryset = ZoneGeographique.objects.filter(is_active=True)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_zone"]
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
    filterset_fields = ["type_zone"]

    def get_queryset(self):
        """Exclut les zones sans géométrie de l'export GeoJSON."""
        return ZoneGeographique.objects.filter(
            is_active=True, geometrie__isnull=False
        )
