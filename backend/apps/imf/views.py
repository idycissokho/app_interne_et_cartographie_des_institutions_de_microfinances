"""
imf/views.py
============
Vues DRF du module IMF :
- IMFListCreateView : liste paginée + filtres + création (SUPERVISEUR/ADMIN)
- IMFDetailView     : détail, modification et suppression logique (soft delete)
"""

from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import IMF
from .serializers import IMFListSerializer, IMFDetailSerializer
from apps.authentication.permissions import IsSuperviseurOrAdmin


class IMFListCreateView(generics.ListCreateAPIView):
    """GET  /api/v1/imf/  — Liste des IMF actives avec filtres, recherche et pagination.
    POST /api/v1/imf/  — Création d'une nouvelle IMF (SUPERVISEUR ou ADMIN requis).
    """
    queryset = IMF.objects.filter(is_active=True)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_imf", "statut_reglementaire"]
    search_fields = ["nom", "sigle"]
    ordering_fields = ["nom", "date_creation"]

    def get_serializer_class(self):
        """Utilise le sérialiseur détaillé pour la création, allégé pour la liste."""
        return IMFDetailSerializer if self.request.method == "POST" else IMFListSerializer

    def get_permissions(self):
        """Écriture réservée aux SUPERVISEUR/ADMIN, lecture ouverte à tout utilisateur authentifié."""
        if self.request.method == "POST":
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


class IMFDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET    /api/v1/imf/<uuid>/  — Détail d'une IMF.
    PUT/PATCH /api/v1/imf/<uuid>/  — Modification (SUPERVISEUR ou ADMIN requis).
    DELETE    /api/v1/imf/<uuid>/  — Suppression logique : is_active=False.
    """
    queryset = IMF.objects.filter(is_active=True)
    serializer_class = IMFDetailSerializer
    lookup_field = "pk"

    def get_permissions(self):
        """Écriture réservée aux SUPERVISEUR/ADMIN, lecture ouverte à tout utilisateur authentifié."""
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        """Soft delete : désactive l'IMF sans la supprimer physiquement."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])
