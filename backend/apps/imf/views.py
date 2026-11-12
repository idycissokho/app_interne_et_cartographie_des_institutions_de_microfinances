"""
imf/views.py
============
Vues DRF du module IMF :
- IMFListCreateView     : liste paginée + filtres + création (SUPERVISEUR/ADMIN)
- IMFDetailView         : détail, modification et suppression logique (soft delete)
- BailleurListCreateView / BailleurDetailView : référentiel des bailleurs
"""

from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.permissions import IsAuthenticated

from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsSuperviseurOrAdmin

from .models import IMF, Bailleur
from .serializers import BailleurSerializer, IMFDetailSerializer, IMFListSerializer

ECRITURE = ("POST", "PUT", "PATCH", "DELETE")


class LectureAuthentifieeEcritureSuperviseurMixin:
    """Lecture : tout utilisateur authentifié. Écriture : SUPERVISEUR ou ADMIN."""

    def get_permissions(self):
        if self.request.method in ECRITURE:
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


def _imf_queryset():
    return (
        IMF.objects.filter(is_active=True)
        .annotate(
            nb_points_service_actifs=Count(
                "points_service", filter=Q(points_service__is_active=True), distinct=True
            )
        )
        .prefetch_related("bailleurs")
        .order_by("nom")
    )


class IMFListCreateView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.ListCreateAPIView
):
    """GET  /api/v1/imf/  — Liste des IMF actives avec filtres, recherche et pagination.
    POST /api/v1/imf/  — Création d'une nouvelle IMF (SUPERVISEUR ou ADMIN requis).
    """

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_imf", "statut_reglementaire", "bailleurs"]
    search_fields = ["nom", "sigle"]
    ordering_fields = ["nom", "date_creation"]

    def get_queryset(self):
        return _imf_queryset()

    def get_serializer_class(self):
        """Utilise le sérialiseur détaillé pour la création, allégé pour la liste."""
        return IMFDetailSerializer if self.request.method == "POST" else IMFListSerializer


class IMFDetailView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET    /api/v1/imf/<uuid>/  — Détail d'une IMF.
    PUT/PATCH /api/v1/imf/<uuid>/  — Modification (SUPERVISEUR ou ADMIN requis).
    DELETE    /api/v1/imf/<uuid>/  — Suppression logique : is_active=False.
    """

    serializer_class = IMFDetailSerializer

    def get_queryset(self):
        return _imf_queryset()

    def perform_destroy(self, instance):
        """Soft delete : désactive l'IMF sans la supprimer physiquement."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class BailleurListCreateView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.ListCreateAPIView
):
    """GET/POST /api/v1/imf/bailleurs/"""

    queryset = Bailleur.objects.filter(is_active=True)
    serializer_class = BailleurSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["nom", "sigle"]
    ordering_fields = ["nom"]


class BailleurDetailView(
    AuditMixin, LectureAuthentifieeEcritureSuperviseurMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PUT/PATCH/DELETE /api/v1/imf/bailleurs/<uuid>/"""

    queryset = Bailleur.objects.filter(is_active=True)
    serializer_class = BailleurSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])
