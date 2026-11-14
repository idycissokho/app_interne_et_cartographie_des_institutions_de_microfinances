"""
imf/views.py
============
Vues DRF du module IMF :
- IMFListCreateView     : liste paginée + filtres + création (ADMIN)
- IMFDetailView         : détail, modification et suppression logique (soft delete)
- BailleurListCreateView / BailleurDetailView : référentiel des bailleurs
"""

from django.db.models import Count, F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.permissions import IsAuthenticated

from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsAdmin, IsSuperviseurOrAdmin

from .models import IMF, Bailleur
from .serializers import BailleurSerializer, IMFDetailSerializer, IMFListSerializer

CREATION_SUPPRESSION = ("POST", "DELETE")
MODIFICATION = ("PUT", "PATCH")


class DroitsCasUtilisationMixin:
    """Droits du diagramme de cas d'utilisation (DIAGRAMME DE CAS UTILISATION.drawio).

    - Consulter (GET)               : tout utilisateur authentifié (CONSULTANT et au-dessus).
    - Modifier (PUT/PATCH)          : SUPERVISEUR ou ADMIN.
    - Créer / désactiver (POST/DEL) : ADMIN uniquement.
    """

    def get_permissions(self):
        if self.request.method in CREATION_SUPPRESSION:
            return [IsAdmin()]
        if self.request.method in MODIFICATION:
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


def _imf_queryset():
    from apps.points_service.models import PointService

    # Région du siège : celle de l'IMF, sinon celle de son point de service « Siège ».
    region_point_siege = PointService.objects.filter(
        imf=OuterRef("pk"), type_point="SIEGE", is_active=True, region__isnull=False
    ).values("region__nom")[:1]
    return (
        IMF.objects.filter(is_active=True)
        .annotate(
            nb_points_service_actifs=Count(
                "points_service", filter=Q(points_service__is_active=True), distinct=True
            ),
            nb_dirigeants_en_fonction=Count(
                "mandats",
                filter=Q(mandats__is_active=True, mandats__statut_mandat="EN_FONCTION"),
                distinct=True,
            ),
            region_siege=Coalesce(F("region__nom"), Subquery(region_point_siege)),
        )
        .prefetch_related("bailleurs")
        .order_by("nom")
    )


class IMFListCreateView(
    AuditMixin, DroitsCasUtilisationMixin, generics.ListCreateAPIView
):
    """GET  /api/v1/imf/  — Liste des IMF actives avec filtres, recherche et pagination.
    POST /api/v1/imf/  — Création d'une nouvelle IMF (ADMIN requis).
    """

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        "type_imf": ["exact"],
        "statut_reglementaire": ["exact"],
        "bailleurs": ["exact"],
        "date_creation": ["gte", "lte"],
    }
    search_fields = ["nom", "sigle", "numero_agrement"]
    ordering_fields = ["nom", "date_creation"]

    def get_queryset(self):
        return _imf_queryset()

    def get_serializer_class(self):
        """Utilise le sérialiseur détaillé pour la création, allégé pour la liste."""
        return IMFDetailSerializer if self.request.method == "POST" else IMFListSerializer


class IMFDetailView(
    AuditMixin, DroitsCasUtilisationMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET    /api/v1/imf/<uuid>/  — Détail d'une IMF.
    PUT/PATCH /api/v1/imf/<uuid>/  — Modification (SUPERVISEUR ou ADMIN requis).
    DELETE    /api/v1/imf/<uuid>/  — Suppression logique : is_active=False (ADMIN requis).
    """

    serializer_class = IMFDetailSerializer

    def get_queryset(self):
        return _imf_queryset()

    def perform_destroy(self, instance):
        """Soft delete : désactive l'IMF sans la supprimer physiquement."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class BailleurListCreateView(
    AuditMixin, DroitsCasUtilisationMixin, generics.ListCreateAPIView
):
    """GET/POST /api/v1/imf/bailleurs/"""

    queryset = Bailleur.objects.filter(is_active=True)
    serializer_class = BailleurSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["nom", "sigle"]
    ordering_fields = ["nom"]


class BailleurDetailView(
    AuditMixin, DroitsCasUtilisationMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PUT/PATCH/DELETE /api/v1/imf/bailleurs/<uuid>/"""

    queryset = Bailleur.objects.filter(is_active=True)
    serializer_class = BailleurSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])
