"""
points_service/views.py
========================
Vues DRF du module points de service :
- PointServiceListCreateView : liste + création
- PointServiceDetailView     : détail, modification, soft delete
- PointServiceGeoView        : export GeoJSON pour la carte micro
"""

from django.db.models import F
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.mixins import AuditMixin
from apps.imf.views import DroitsCasUtilisationMixin
from config.cache_donnees import en_cache

from .filters import PointServiceFilter
from .models import PointService
from .serializers import PointServiceDetailSerializer, PointServiceListSerializer

RELATIONS = ("imf", "region", "departement", "commune")


class TriVidesEnDernier(filters.OrderingFilter):
    """Tri de ?ordering= qui place toujours les valeurs vides à la fin (membres, dépôts, région…).

    Par défaut PostgreSQL met les NULL en tête d'un tri décroissant : « les plus gros
    encours d'abord » commencerait par les points sans valeur.
    """

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset
        return queryset.order_by(*[
            F(champ[1:]).desc(nulls_last=True) if champ.startswith("-") else F(champ).asc(nulls_last=True)
            for champ in ordering
        ])


class PointServiceListCreateView(
    AuditMixin, DroitsCasUtilisationMixin, generics.ListCreateAPIView
):
    """GET  /api/v1/points-service/ — Liste des points actifs.
    POST /api/v1/points-service/ — Création (ADMIN requis).

    Filtres : voir PointServiceFilter. Recherche : nom, adresse, localité, téléphone, email,
    référence du point ; nom, sigle, agrément de l'IMF ; commune, département.
    Tri : ?ordering=imf__nom,nom — valeurs vides toujours en dernier.
    """

    queryset = PointService.objects.filter(is_active=True).select_related(*RELATIONS)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, TriVidesEnDernier]
    filterset_class = PointServiceFilter
    search_fields = [
        "nom", "adresse", "lieu_dit", "telephone", "email", "reference_externe",
        "imf__nom", "imf__sigle", "imf__numero_agrement", "commune__nom", "departement__nom",
    ]
    ordering_fields = [
        "nom", "date_ouverture", "encours", "depots", "nombre_membres", "type_point", "statut_point",
        "imf__nom", "imf", "region__nom", "departement__nom", "commune__nom",
    ]

    def get_serializer_class(self):
        return PointServiceDetailSerializer if self.request.method == "POST" else PointServiceListSerializer


class PointServiceDetailView(
    AuditMixin, DroitsCasUtilisationMixin, generics.RetrieveUpdateDestroyAPIView
):
    queryset = PointService.objects.filter(is_active=True).select_related(*RELATIONS)
    serializer_class = PointServiceDetailSerializer

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class PointServiceGeoView(generics.GenericAPIView):
    """GET /api/v1/points-service/geojson/ — Points géolocalisés pour la carte micro (non paginé).

    Même format que PointServiceGeoSerializer (FeatureCollection GeoJSON), mais
    construit directement à partir d'une requête `values()` : une seule requête SQL,
    aucun objet modèle ni sérialiseur par point, coordonnées arrondies à 5 décimales
    (≈ 1 m). La réponse est mise en cache par jeu de filtres.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = PointServiceFilter
    # La carte doit recevoir tous les points : une FeatureCollection paginée serait incomplète.
    pagination_class = None
    PROPRIETES = {
        "nom": "nom", "imf": "imf_id", "imf_nom": "imf__nom",
        "type_point": "type_point", "est_siege": "est_siege", "statut_point": "statut_point",
        "region_nom": "region__nom", "departement_nom": "departement__nom", "commune_nom": "commune__nom",
        "telephone": "telephone", "email": "email",
    }

    def get_queryset(self):
        return PointService.objects.filter(is_active=True, localisation__isnull=False)

    def get(self, request):
        filtres = sorted(request.query_params.items())
        return Response(en_cache("points_geojson", self._collection, filtres))

    def _collection(self) -> dict:
        lignes = self.filter_queryset(self.get_queryset()).values("id", "localisation", *self.PROPRIETES.values())
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "id": ligne["id"],
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(ligne["localisation"].x, 5), round(ligne["localisation"].y, 5)],
                    },
                    "properties": {cle: ligne[champ] for cle, champ in self.PROPRIETES.items()},
                }
                for ligne in lignes
            ],
        }
