"""
dirigeants/views.py
===================
Vues DRF des modules Dirigeant et Mandat :
- DirigeantListCreateView  : liste + création
- DirigeantDetailView      : détail, modification, soft delete
- MandatListCreateView     : liste des mandats d'un dirigeant + création
- MandatDetailView         : détail, modification, soft delete d'un mandat
"""

from django.db.models import Count, OuterRef, Prefetch, Q, Subquery
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics

from apps.audit.mixins import AuditMixin
from apps.imf.views import DroitsCasUtilisationMixin

from .models import Dirigeant, Mandat
from .serializers import DirigeantDetailSerializer, DirigeantListSerializer, MandatSerializer


class DirigeantListCreateView(AuditMixin, DroitsCasUtilisationMixin, generics.ListCreateAPIView):
    """GET  /api/v1/dirigeants/  — Liste des dirigeants actifs.
    POST /api/v1/dirigeants/  — Création (ADMIN requis).
    """

    queryset = Dirigeant.objects.filter(is_active=True).annotate(
        nb_mandats_actifs=Count("mandats", filter=Q(mandats__is_active=True), distinct=True)
    ).order_by("nom", "prenom").distinct()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        "mandats__fonction_mandat": ["exact"],
        "mandats__imf": ["exact"],
        "mandats__statut_mandat": ["exact"],
    }
    search_fields = ["nom", "prenom", "email_professionnel"]
    ordering_fields = ["nom", "prenom"]

    def get_serializer_class(self):
        """Détaillé pour la création, allégé pour la liste."""
        return DirigeantDetailSerializer if self.request.method == "POST" else DirigeantListSerializer


class DirigeantDetailView(AuditMixin, DroitsCasUtilisationMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/"""

    queryset = Dirigeant.objects.filter(is_active=True).prefetch_related(
        Prefetch("mandats", queryset=Mandat.objects.filter(is_active=True).select_related("imf"))
    )
    serializer_class = DirigeantDetailSerializer
    # OBJ-09 : traçabilité des consultations des fiches dirigeants
    audit_consultation = True

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class MandatListCreateView(AuditMixin, DroitsCasUtilisationMixin, generics.ListCreateAPIView):
    """GET  /api/v1/dirigeants/<uuid>/mandats/  — Mandats actifs d'un dirigeant.
    POST /api/v1/dirigeants/<uuid>/mandats/  — Création (ADMIN requis).
    """

    serializer_class = MandatSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["imf", "fonction_mandat", "statut_mandat"]
    ordering_fields = ["date_debut"]

    def get_queryset(self):
        """Filtre les mandats par dirigeant via l'UUID dans l'URL."""
        return Mandat.objects.filter(
            dirigeant_id=self.kwargs["dirigeant_pk"], is_active=True
        ).select_related("imf", "dirigeant")

    def perform_create(self, serializer):
        """Rattache automatiquement le mandat au dirigeant (actif) de l'URL."""
        dirigeant = get_object_or_404(Dirigeant, pk=self.kwargs["dirigeant_pk"], is_active=True)
        serializer.save(dirigeant=dirigeant)


class MandatDetailView(AuditMixin, DroitsCasUtilisationMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/mandats/<uuid>/"""

    serializer_class = MandatSerializer
    audit_consultation = True

    def get_queryset(self):
        return Mandat.objects.filter(
            dirigeant_id=self.kwargs["dirigeant_pk"], is_active=True
        ).select_related("imf", "dirigeant")

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class MandatsParIMFView(generics.ListAPIView):
    """GET /api/v1/imf/<uuid>/mandats/ — Onglet « Dirigeants » de la fiche IMF (DIR-08).

    Filtrable par fonction (DIR-09) : ?fonction_mandat=DG
    """

    serializer_class = MandatSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["fonction_mandat", "statut_mandat"]
    ordering_fields = ["date_debut", "fonction_mandat"]

    def get_queryset(self):
        return Mandat.objects.filter(
            imf_id=self.kwargs["imf_pk"], is_active=True, dirigeant__is_active=True
        ).select_related("imf", "dirigeant")

    def list(self, request, *args, **kwargs):
        """OBJ-09 : l'onglet « Dirigeants » d'une fiche IMF est une consultation journalisée."""
        from apps.audit.models import JournalAudit

        response = super().list(request, *args, **kwargs)
        JournalAudit.enregistrer(
            request.user,
            JournalAudit.Action.CONSULTATION,
            f"imf.IMF:{self.kwargs['imf_pk']}",
            {"libelle": "Dirigeants de l'IMF"},
        )
        return response


def _region_imf():
    from apps.points_service.models import PointService

    return Subquery(
        PointService.objects.filter(
            imf=OuterRef("imf"), type_point="SIEGE", is_active=True, region__isnull=False
        ).values("region__nom")[:1]
    )


class MandatListView(generics.ListAPIView):
    """GET /api/v1/dirigeants/mandats/ — Tous les mandats actifs (liste « Dirigeants et mandats »).

    Lecture seule, non journalisée (aucune fiche dirigeant n'est ouverte).
    Filtres : fonction_mandat, statut_mandat, imf, dirigeant, date_fin__gte / __lte (échéances),
    sans_justificatif=true. Recherche : nom, prénom, email du dirigeant, IMF.
    """

    serializer_class = MandatSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = None
    filterset_fields = {
        "fonction_mandat": ["exact", "in"],
        "statut_mandat": ["exact"],
        "imf": ["exact"],
        "dirigeant": ["exact"],
        "date_fin": ["gte", "lte", "isnull"],
    }
    search_fields = ["dirigeant__nom", "dirigeant__prenom", "dirigeant__email_professionnel", "imf__nom", "imf__sigle"]
    ordering_fields = ["date_fin", "date_debut", "dirigeant__nom"]

    def get_queryset(self):
        qs = (
            Mandat.objects.filter(is_active=True, dirigeant__is_active=True, imf__is_active=True)
            .select_related("imf", "dirigeant")
            .annotate(imf_region=_region_imf())
            .order_by("dirigeant__nom", "dirigeant__prenom", "-date_debut")
        )
        if self.request.query_params.get("sans_justificatif") in ("true", "1"):
            qs = qs.filter(fichier_justificatif="", documents_justificatifs="")
        return qs
