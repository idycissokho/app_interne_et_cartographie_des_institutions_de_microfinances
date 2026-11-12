"""
audit/views.py
==============
Vues DRF du module audit :
- JournalAuditListView  : liste paginée du journal (ADMIN uniquement)
- JournalAuditDetailView: détail d'une entrée (ADMIN uniquement)
Le journal est en lecture seule — aucune création/modification/suppression via l'API.
"""

from rest_framework import generics, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import JournalAudit
from .serializers import JournalAuditSerializer
from apps.authentication.permissions import IsAdmin


class JournalAuditListView(generics.ListAPIView):
    """GET /api/v1/audit/  — Liste paginée du journal d'audit (ADMIN uniquement)."""

    queryset = JournalAudit.objects.select_related("utilisateur")
    serializer_class = JournalAuditSerializer
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["action", "role", "utilisateur"]
    search_fields = ["action", "objet_concerne", "utilisateur__email"]
    ordering_fields = ["date_action"]


class JournalAuditDetailView(generics.RetrieveAPIView):
    """GET /api/v1/audit/<uuid>/  — Détail d'une entrée du journal (ADMIN uniquement)."""

    queryset = JournalAudit.objects.select_related("utilisateur")
    serializer_class = JournalAuditSerializer
    permission_classes = [IsAdmin]
