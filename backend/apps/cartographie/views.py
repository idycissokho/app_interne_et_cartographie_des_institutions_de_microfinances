"""
cartographie/views.py
=====================
Vues DRF du module cartographie :
- ZoneGeographiqueListCreateView : liste + création
- ZoneGeographiqueDetailView     : détail, modification, soft delete
- ZoneGeographiqueGeoView        : contours GeoJSON simplifiés pour la carte (en cache)
- ZoneAgregatsView               : indicateurs par zone pour la carte macro (en cache)
- StatistiquesView               : tous les compteurs du tableau de bord en un appel (en cache)
"""

import json
from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.mixins import AuditMixin
from apps.authentication.permissions import IsAdmin
from config.cache_donnees import en_cache

from .models import CHAMP_POINT_PAR_TYPE, ZoneGeographique
from .serializers import (
    ZoneAgregatsSerializer,
    ZoneGeographiqueDetailSerializer,
    ZoneGeographiqueListSerializer,
)

# Tolérance de simplification des contours, en degrés (≈ 200 m) : invisible à
# l'échelle d'une carte du pays, et plusieurs fois moins de points à transmettre.
TOLERANCE_CONTOURS = 0.002


class ZoneGeographiqueListCreateView(AuditMixin, generics.ListCreateAPIView):
    """GET  /api/v1/cartographie/zones/  — Liste des zones géographiques.
    POST /api/v1/cartographie/zones/  — Création (ADMIN uniquement).
    """

    queryset = ZoneGeographique.objects.filter(is_active=True)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_zone", "parent"]
    search_fields = ["nom", "code"]
    ordering_fields = ["nom", "type_zone"]

    def get_serializer_class(self):
        """Détaillé pour la création, allégé pour la liste."""
        return ZoneGeographiqueDetailSerializer if self.request.method == "POST" else ZoneGeographiqueListSerializer

    def get_permissions(self):
        """Création réservée aux ADMIN, lecture ouverte à tout utilisateur authentifié."""
        if self.request.method == "POST":
            return [IsAdmin()]
        return [IsAuthenticated()]


class ZoneGeographiqueDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/v1/cartographie/zones/<uuid>/"""

    queryset = ZoneGeographique.objects.filter(is_active=True)
    serializer_class = ZoneGeographiqueDetailSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


def _arrondir(coordonnees, decimales=5):
    """Arrondit récursivement des coordonnées GeoJSON (5 décimales ≈ 1 m)."""
    if isinstance(coordonnees[0], int | float):
        return [round(c, decimales) for c in coordonnees]
    return [_arrondir(c, decimales) for c in coordonnees]


class ZoneGeographiqueGeoView(generics.GenericAPIView):
    """GET /api/v1/cartographie/zones/geojson/  — Contours GeoJSON pour la carte.

    Filtrable par type_zone pour charger uniquement le niveau souhaité.
    Les contours sont simplifiés, arrondis à 5 décimales et mis en cache : ils ne
    changent qu'à la modification d'une zone, qui invalide le cache.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["type_zone", "parent"]
    # La carte doit recevoir toutes les zones du niveau demandé.
    pagination_class = None

    def get_queryset(self):
        """Exclut les zones sans géométrie de l'export GeoJSON."""
        return ZoneGeographique.objects.filter(is_active=True, geometrie__isnull=False)

    def get(self, request):
        filtres = sorted(request.query_params.items())
        return Response(en_cache("zones_geojson", self._collection, filtres))

    def _collection(self) -> dict:
        zones = self.filter_queryset(self.get_queryset())
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "id": zone.id,
                    "type": "Feature",
                    "geometry": self._geometrie(zone),
                    "properties": {
                        "code": zone.code, "nom": zone.nom, "type_zone": zone.type_zone, "parent": zone.parent_id,
                    },
                }
                for zone in zones
            ],
        }

    @staticmethod
    def _geometrie(zone) -> dict:
        contour = zone.geometrie.simplify(TOLERANCE_CONTOURS, preserve_topology=True)
        geometrie = json.loads(contour.geojson)
        geometrie["coordinates"] = _arrondir(geometrie["coordinates"])
        return geometrie


class ZoneAgregatsView(generics.GenericAPIView):
    """GET /api/v1/cartographie/zones/agregats/?type_zone=REGION — Carte macro.

    Retourne, pour chaque zone du niveau demandé, le nombre d'IMF, de points de
    service, l'encours, les dépôts, le nombre de membres et les principaux bailleurs.
    Deux requêtes SQL quel que soit le nombre de zones ; réponse mise en cache.
    """

    serializer_class = ZoneAgregatsSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["parent"]

    def _type_zone(self) -> str:
        type_zone = self.request.query_params.get("type_zone", ZoneGeographique.TypeZone.REGION)
        if type_zone not in ZoneGeographique.TypeZone.values:
            raise ValidationError({"type_zone": f"Valeurs possibles : {ZoneGeographique.TypeZone.values}"})
        return type_zone

    def get_queryset(self):
        type_zone = self._type_zone()
        return ZoneGeographique.objects.filter(is_active=True, type_zone=type_zone).annotate(
            **ZoneGeographique.annotations_agregats(type_zone)
        ).order_by("nom")

    def get(self, request):
        type_zone = self._type_zone()
        filtres = sorted(request.query_params.items())
        return Response(en_cache("zones_agregats", lambda: self._agregats(type_zone), filtres))

    def _agregats(self, type_zone: str) -> list:
        zones = self.filter_queryset(self.get_queryset())
        contexte = {**self.get_serializer_context(), "principaux_bailleurs": self._principaux_bailleurs(type_zone)}
        return ZoneAgregatsSerializer(zones, many=True, context=contexte).data

    @staticmethod
    def _principaux_bailleurs(type_zone: str) -> dict:
        """{ id de zone: [2 bailleurs associés au plus grand nombre d'IMF présentes] }, en une requête."""
        from apps.points_service.models import PointService

        champ = CHAMP_POINT_PAR_TYPE[type_zone]
        lignes = (
            PointService.objects.filter(
                is_active=True, imf__bailleurs__is_active=True, **{f"{champ}__isnull": False}
            )
            .order_by()
            .values(champ, "imf__bailleurs__nom", "imf__bailleurs__sigle")
            .annotate(n=Count("imf", distinct=True))
        )
        par_zone = defaultdict(list)
        for ligne in lignes:
            par_zone[ligne[champ]].append((-ligne["n"], ligne["imf__bailleurs__nom"], ligne["imf__bailleurs__sigle"]))
        return {
            zone: [sigle or nom for _, nom, sigle in sorted(bailleurs)[:2]]
            for zone, bailleurs in par_zone.items()
        }


class StatistiquesView(APIView):
    """GET /api/v1/cartographie/statistiques/ — Compteurs du tableau de bord, de l'espace
    supervision et des en-têtes de listes, en un seul appel.

    Remplace une quinzaine d'appels « liste paginée à 1 élément » qui ne servaient
    qu'à lire un total. Sept requêtes SQL d'agrégation, réponse mise en cache
    (invalidée à chaque écriture ; la clé change aussi chaque jour, les échéances
    de mandats dépendant de la date).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        aujourd_hui = timezone.localdate()
        return Response(en_cache("statistiques", lambda: self._statistiques(aujourd_hui), aujourd_hui))

    @staticmethod
    def _statistiques(aujourd_hui) -> dict:
        from apps.dirigeants.models import Dirigeant, Mandat
        from apps.imf.models import IMF
        from apps.points_service.models import PointService

        debut_annee = timezone.make_aware(timezone.datetime(aujourd_hui.year, 1, 1))
        imfs = IMF.objects.filter(is_active=True)
        Statut = IMF.StatutReglementaire
        imf = imfs.aggregate(
            total=Count("pk"),
            en_activite=Count("pk", filter=Q(statut_reglementaire=Statut.EN_ACTIVITE)),
            en_activite_depuis_janvier=Count(
                "pk", filter=Q(statut_reglementaire=Statut.EN_ACTIVITE, date_creation__gte=debut_annee)
            ),
            opr=Count("pk", filter=Q(statut_reglementaire=Statut.OPR)),
            retrait_agrement=Count("pk", filter=Q(statut_reglementaire=Statut.RETRAIT_AGREMENT)),
            # Fiche incomplète : téléphone, email ou position GPS du siège manquant.
            incompletes=Count("pk", filter=Q(telephone="") | Q(email="") | Q(localisation_siege__isnull=True)),
        )
        imf["par_type"] = {
            **dict.fromkeys(IMF.TypeIMF.values, 0),
            **dict(imfs.order_by().values_list("type_imf").annotate(n=Count("pk"))),
        }
        imf["avec_bailleur"] = imfs.filter(bailleurs__isnull=False).distinct().count()

        points_actifs = PointService.objects.filter(is_active=True)
        points = points_actifs.aggregate(total=Count("pk"), sans_gps=Count("pk", filter=Q(localisation__isnull=True)))
        points["par_type"] = {
            **dict.fromkeys(PointService.TypePoint.values, 0),
            **dict(points_actifs.order_by().values_list("type_point").annotate(n=Count("pk"))),
        }

        # Mêmes périmètres que les listes /dirigeants/ et /dirigeants/mandats/.
        mandats = Mandat.objects.filter(is_active=True, dirigeant__is_active=True, imf__is_active=True).aggregate(
            total=Count("pk"),
            sans_justificatif=Count("pk", filter=Q(fichier_justificatif="", documents_justificatifs="")),
            echeance_30j=Count("pk", filter=Q(date_fin__lte=aujourd_hui + timedelta(days=30))),
        )
        dirigeants_en_fonction = (
            Dirigeant.objects.filter(is_active=True, mandats__statut_mandat=Mandat.StatutMandat.EN_FONCTION)
            .distinct()
            .count()
        )
        communes = ZoneGeographique.objects.filter(is_active=True, type_zone=ZoneGeographique.TypeZone.COMMUNE)
        return {
            "imf": imf,
            "points": points,
            "dirigeants": {"en_fonction": dirigeants_en_fonction},
            "mandats": mandats,
            "communes": {
                "total": communes.count(),
                "couvertes": communes.filter(points_commune__is_active=True).distinct().count(),
            },
        }
