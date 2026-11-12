"""
dirigeants/views.py
===================
Vues DRF des modules Dirigeant et Mandat :
- DirigeantListCreateView  : liste + création
- DirigeantDetailView      : détail, modification, soft delete
- MandatListCreateView     : liste des mandats d'un dirigeant + création
- MandatDetailView         : détail, modification, soft delete d'un mandat
"""

from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Dirigeant, Mandat
from .serializers import DirigeantListSerializer, DirigeantDetailSerializer, MandatSerializer
from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsSuperviseurOrAdmin


class DirigeantListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/dirigeants/  — Liste des dirigeants actifs.
    POST /api/v1/dirigeants/  — Création (SUPERVISEUR/ADMIN requis).
    """

    queryset = Dirigeant.objects.filter(is_active=True)
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["nom", "prenom", "email_professionnel"]
    ordering_fields = ["nom", "prenom"]

    def get_serializer_class(self):
        """Détaillé pour la création, allégé pour la liste."""
        return DirigeantDetailSerializer if self.request.method == "POST" else DirigeantListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


class DirigeantDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/"""

    queryset = Dirigeant.objects.filter(is_active=True)
    serializer_class = DirigeantDetailSerializer
    # OBJ-09 : traçabilité des consultations des fiches dirigeants
    audit_consultation = True

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class MandatListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/dirigeants/<uuid>/mandats/  — Mandats actifs d'un dirigeant.
    POST /api/v1/dirigeants/<uuid>/mandats/  — Création (SUPERVISEUR/ADMIN requis).
    """

    serializer_class = MandatSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["imf", "fonction_mandat", "statut_mandat"]
    ordering_fields = ["date_debut"]

    def get_queryset(self):
        """Filtre les mandats par dirigeant via l'UUID dans l'URL."""
        return Mandat.objects.filter(
            dirigeant_id=self.kwargs["dirigeant_pk"], is_active=True
        ).select_related("imf")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        """Rattache automatiquement le mandat au dirigeant de l'URL."""
        serializer.save(dirigeant_id=self.kwargs["dirigeant_pk"])


class MandatDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/mandats/<uuid>/"""

    serializer_class = MandatSerializer
    audit_consultation = True

    def get_queryset(self):
        return Mandat.objects.filter(
            dirigeant_id=self.kwargs["dirigeant_pk"], is_active=True
        )

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])
