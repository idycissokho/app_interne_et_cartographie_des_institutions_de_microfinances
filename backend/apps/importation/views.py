"""
importation/views.py
====================
Vues DRF du module importation :
- ImportationListCreateView : liste des imports + upload d'un nouveau fichier
- ImportationDetailView     : détail et suivi du statut d'un import
"""

from rest_framework import generics, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import ImportationFichier
from .serializers import ImportationFichierSerializer
from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsSuperviseurOrAdmin


class ImportationListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/importation/  — Liste des imports de l'utilisateur connecté.
    POST /api/v1/importation/  — Upload d'un fichier CSV/Excel (SUPERVISEUR/ADMIN requis).
    """

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsSuperviseurOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["type_import", "statut"]
    ordering_fields = ["date_creation"]

    def get_queryset(self):
        """Filtre les imports selon le rôle : ADMIN voit tout, SUPERVISEUR voit les siens."""
        user = self.request.user
        if user.is_admin:
            return ImportationFichier.objects.select_related("utilisateur")
        return ImportationFichier.objects.filter(utilisateur=user).select_related("utilisateur")

    def perform_create(self, serializer):
        """Rattache automatiquement l'import à l'utilisateur connecté."""
        serializer.save(utilisateur=self.request.user)


class ImportationDetailView(generics.RetrieveAPIView):
    """GET /api/v1/importation/<uuid>/  — Détail et rapport d'un import."""

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsSuperviseurOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return ImportationFichier.objects.select_related("utilisateur")
        return ImportationFichier.objects.filter(utilisateur=user)
