"""
points_service/views.py
========================
Vues DRF du module points de service :
- PointServiceListCreateView : liste + création
- PointServiceDetailView     : détail, modification, soft delete
- PointServiceGeoView        : export GeoJSON pour la carte micro
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.permissions import IsAuthenticated

from apps.audit.mixins import AuditMixin
from apps.imf.views import LectureAuthentifieeEcritureSuperviseurMixin

from .filters import PointServiceFilter
from .models import PointService
from .serializers import (
    PointServiceDetailSerializer,
    PointServiceGeoSerializer,
    PointServiceListSerializer,
)

RELATIONS = ("imf", "region", "departement", "commune")


class PointServiceListCreateView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.ListCreateAPIView
):
    queryset = PointService.objects.filter(is_active=True).select_related(*RELATIONS)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PointServiceFilter
    search_fields = ["nom", "adresse"]
    ordering_fields = ["nom", "date_ouverture", "encours"]

    def get_serializer_class(self):
        return PointServiceDetailSerializer if self.request.method == "POST" else PointServiceListSerializer


class PointServiceDetailView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.RetrieveUpdateDestroyAPIView
):
    queryset = PointService.objects.filter(is_active=True).select_related(*RELATIONS)
    serializer_class = PointServiceDetailSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class PointServiceGeoView(generics.ListAPIView):
    """GET /api/v1/points-service/geojson/ — Export GeoJSON pour la carte (non paginé)."""

    serializer_class = PointServiceGeoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = PointServiceFilter
    # La carte doit recevoir tous les points : une FeatureCollection paginée serait incomplète.
    pagination_class = None

    def get_queryset(self):
        return PointService.objects.filter(
            is_active=True, localisation__isnull=False
        ).select_related(*RELATIONS)
