"""
importation/views.py
====================
Vues DRF du module importation :
- ImportationListCreateView : liste des imports + upload d'un fichier, traité en tâche de fond
  par son processor (taches.py, processors.py) ; l'écran suit la progression par le détail
- ImportationDetailView     : détail et rapport d'erreurs d'un import
- ModeleImportView          : canevas vide par type ; institutions : liste officielle des IMF (.xlsx)
- ExportView                : export d'un référentiel au format de son import ; institutions :
                              liste officielle des IMF remplie (.xlsx), points de service et dirigeants : CSV
"""

import csv

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.text import slugify
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.mixins import AuditMixin
from apps.audit.models import JournalAudit
from apps.authentication.permissions import IsAdmin

from . import canevas, taches
from .models import ImportationFichier
from .serializers import ImportationFichierSerializer
from .services import COLONNES, lignes_export


class ImportationListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/importation/  — Liste des imports (ADMIN uniquement : cas « Import / Export Excel »).
    POST /api/v1/importation/  — Upload d'un fichier CSV/Excel : réponse immédiate (statut « En attente »),
                                 traitement en tâche de fond, progression lue sur le détail.
    """

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["type_import", "statut"]
    ordering_fields = ["date_creation"]

    def get_queryset(self):
        """ADMIN voit tous les imports (filtre conservé par défense en profondeur)."""
        taches.marquer_imports_interrompus()
        user = self.request.user
        qs = ImportationFichier.objects.select_related("utilisateur")
        return qs if user.is_admin else qs.filter(utilisateur=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        importation = serializer.save(utilisateur=request.user)
        # Traitement par le processor du type choisi, en tâche de fond ; journal d'audit à la fin.
        taches.lancer(importation, request.user)
        importation.refresh_from_db()
        return Response(self.get_serializer(importation).data, status=status.HTTP_201_CREATED)


class ImportationDetailView(generics.RetrieveAPIView):
    """GET /api/v1/importation/<uuid>/  — Détail et rapport d'un import (suivi de la progression)."""

    serializer_class = ImportationFichierSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        taches.marquer_imports_interrompus()
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


TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _reponse_xlsx(nom_fichier: str, contenu: bytes):
    reponse = HttpResponse(contenu, content_type=TYPE_XLSX)
    reponse["Content-Disposition"] = f'attachment; filename="{nom_fichier}"'
    return reponse


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
    """GET /api/v1/importation/modeles/<type>/ — Canevas vide à remplir (ADMIN).
    Institutions : en-têtes de la liste officielle des IMF (.xlsx) ; autres : CSV."""

    permission_classes = [IsAdmin]

    def get(self, request, type_import):
        type_import = _type_ou_404(type_import)
        if type_import == ImportationFichier.TypeImport.IMF:
            return _reponse_xlsx("modele_liste_imf.xlsx", canevas.classeur(avec_donnees=False))
        return _reponse_csv(f"modele_{type_import.lower()}.csv", [COLONNES[type_import]])


def _region_ou_400(identifiant: str | None):
    """Zone de type région désignée par ?region= (identifiant ou code), ou None pour tout le Sénégal."""
    if not identifiant:
        return None
    from apps.cartographie.models import ZoneGeographique

    regions = ZoneGeographique.objects.filter(type_zone="REGION")
    try:
        return regions.get(pk=identifiant)
    except (ZoneGeographique.DoesNotExist, ValueError, DjangoValidationError):
        region = regions.filter(code__iexact=identifiant).first()
        if region is None:
            raise ValidationError({"region": "Région inconnue."}) from None
        return region


class ExportView(APIView):
    """GET /api/v1/importation/export/<type>/[?region=<id ou code>] — Export (ADMIN, journalisé).
    Institutions : liste officielle des IMF (.xlsx, réimportable) ; autres : CSV.
    ?region= limite l'export à une région (institutions, points de service, mandats de ses IMF)."""

    permission_classes = [IsAdmin]

    def get(self, request, type_import):
        type_import = _type_ou_404(type_import)
        region = _region_ou_400(request.query_params.get("region"))
        JournalAudit.enregistrer(
            request.user, JournalAudit.Action.EXPORTATION,
            f"export:{type_import}" + (f":{region.code or region.nom}" if region else ""),
        )
        horodatage = timezone.localtime().strftime("%Y%m%d_%H%M")
        suffixe = f"_{slugify(region.nom)}" if region else ""
        if type_import == ImportationFichier.TypeImport.IMF:
            return _reponse_xlsx(f"liste_imf{suffixe}_{horodatage}.xlsx", canevas.classeur(avec_donnees=True, region=region))
        lignes = [COLONNES[type_import], *lignes_export(type_import, region)]
        return _reponse_csv(f"export_{type_import.lower()}{suffixe}_{horodatage}.csv", lignes)
