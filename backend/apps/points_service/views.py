"""
points_service/views.py
========================
Vues DRF du module points de service :
- PointServiceListCreateView : liste + création
- PointServiceDetailView     : détail, modification, soft delete
- PointServiceGeoView        : export GeoJSON pour la carte
"""

from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import PointService
from .serializers import PointServiceListSerializer, PointServiceDetailSerializer, PointServiceGeoSerializer
from apps.authentication.permissions import IsSuperviseurOrAdmin


class PointServiceListCreateView(generics.ListCreateAPIView):
    queryset = PointService.objects.filter(is_active=True).select_related("imf")
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["imf", "type_point", "statut_point", "statut_reglementaire"]
    search_fields = ["nom", "adresse"]
    ordering_fields = ["nom", "encours"]

    def get_serializer_class(self):
        return PointServiceDetailSerializer if self.request.method == "POST" else PointServiceListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


class PointServiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PointService.objects.filter(is_active=True).select_related("imf")
    serializer_class = PointServiceDetailSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class PointServiceGeoView(generics.ListAPIView):
    """GET /api/v1/points-service/geojson/ — Export GeoJSON pour la carte."""

    serializer_class = PointServiceGeoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["imf", "type_point", "statut_point"]

    def get_queryset(self):
        return PointService.objects.filter(is_active=True, localisation__isnull=False).select_related("imf")
