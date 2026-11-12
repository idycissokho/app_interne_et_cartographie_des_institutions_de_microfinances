"""
importation/views.py
====================
Vues DRF du module importation :
- ImportationListCreateView : liste des imports + upload et traitement d'un fichier
- ImportationDetailView     : détail et rapport d'erreurs d'un import
- ModeleImportView          : canevas CSV vide (en-têtes attendus) par type
- ExportView                : export CSV d'un référentiel (même format que l'import)
"""

import csv

from django.http import Http404, StreamingHttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.mixins import AuditMixin
from apps.audit.models import JournalAudit
from apps.authentication.permissions import IsSuperviseurOrAdmin

from .models import ImportationFichier
from .serializers import ImportationFichierSerializer
from .services import COLONNES, lignes_export, traiter_importation


class ImportationListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/importation/  — Liste des imports (ADMIN : tous, SUPERVISEUR : les siens).
    POST /api/v1/importation/  — Upload d'un fichier CSV/Excel, traité immédiatement.
    """

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsSuperviseurOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["type_import", "statut"]
    ordering_fields = ["date_creation"]

    def get_queryset(self):
        """Filtre les imports selon le rôle : ADMIN voit tout, SUPERVISEUR voit les siens."""
        user = self.request.user
        qs = ImportationFichier.objects.select_related("utilisateur")
        return qs if user.is_admin else qs.filter(utilisateur=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        importation = serializer.save(utilisateur=request.user)
        traiter_importation(importation)
        self._journaliser(
            JournalAudit.Action.IMPORTATION,
            importation,
            {
                "type_import": importation.type_import,
                "statut": importation.statut,
                "lignes_creees": getattr(importation, "lignes_creees", 0),
                "lignes_mises_a_jour": getattr(importation, "lignes_mises_a_jour", 0),
                "lignes_erreur": importation.nb_lignes_erreur,
            },
        )
        return Response(self.get_serializer(importation).data, status=status.HTTP_201_CREATED)


class ImportationDetailView(generics.RetrieveAPIView):
    """GET /api/v1/importation/<uuid>/  — Détail et rapport d'un import."""

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsSuperviseurOrAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = ImportationFichier.objects.select_related("utilisateur")
        return qs if user.is_admin else qs.filter(utilisateur=user)


def _type_ou_404(type_import: str) -> str:
    type_import = type_import.upper()
    if type_import not in ImportationFichier.TypeImport.values:
        raise Http404("Type inconnu : IMF, POINTS_SERVICE ou DIRIGEANTS.")
    return type_import


class _Echo:
    def write(self, value):
        return value


def _reponse_csv(nom_fichier: str, lignes):
    """CSV ; + BOM UTF-8 : s'ouvre correctement dans Excel en français."""
    writer = csv.writer(_Echo(), delimiter=";")

    def flux():
        yield "﻿"
        for ligne in lignes:
            yield writer.writerow(ligne)

    reponse = StreamingHttpResponse(flux(), content_type="text/csv; charset=utf-8")
    reponse["Content-Disposition"] = f'attachment; filename="{nom_fichier}"'
    return reponse


class ModeleImportView(APIView):
    """GET /api/v1/importation/modeles/<type>/ — Canevas CSV vide à remplir."""

    permission_classes = [IsAuthenticated]

    def get(self, request, type_import):
        type_import = _type_ou_404(type_import)
        return _reponse_csv(f"modele_{type_import.lower()}.csv", [COLONNES[type_import]])


class ExportView(APIView):
    """GET /api/v1/importation/export/<type>/ — Export CSV (SUPERVISEUR/ADMIN, journalisé)."""

    permission_classes = [IsSuperviseurOrAdmin]

    def get(self, request, type_import):
        type_import = _type_ou_404(type_import)
        JournalAudit.enregistrer(
            request.user, JournalAudit.Action.EXPORTATION, f"export:{type_import}"
        )
        horodatage = timezone.localtime().strftime("%Y%m%d_%H%M")
        lignes = [COLONNES[type_import], *lignes_export(type_import)]
        return _reponse_csv(f"export_{type_import.lower()}_{horodatage}.csv", lignes)
