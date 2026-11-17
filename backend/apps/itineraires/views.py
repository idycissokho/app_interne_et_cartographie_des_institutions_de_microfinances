"""
itineraires/views.py
====================
Section « Itinéraire » — réservée aux SUPERVISEUR et ADMIN (CONSULTANT : 403) :
  POST /api/v1/itineraires/calculer/                       — trajets à pied, moto, voiture
  GET  /api/v1/itineraires/destinations/?q=                — recherche d'IMF et de points géolocalisés
  GET  /api/v1/itineraires/destinations/carte/             — toutes les épingles de la carte
  GET  /api/v1/itineraires/destinations/<type>/<uuid>/     — une destination (lien direct depuis une fiche)

La position de l'utilisateur voyage dans le corps de la requête POST (jamais dans l'URL,
donc absente des journaux d'accès) ; elle n'est ni enregistrée ni journalisée.

Codes d'erreur propres : 422 destination sans position fiable, 424 moteur en panne, 501 moteur
non configuré. (Pas de 503 : le frontend le réserve au serveur de l'application en redémarrage.)
"""

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.authentication.permissions import IsSuperviseurOrAdmin

from .fournisseurs import ErreurFournisseur, FournisseurNonConfigure
from .serializers import (
    CalculItineraireSerializer,
    CalculReponseSerializer,
    CarteReponseSerializer,
    DestinationSerializer,
    ErreurSerializer,
    RechercheReponseSerializer,
)
from .services import (
    TYPES,
    DestinationSansPosition,
    calculer_itineraire,
    destinations_carte,
    obtenir_destination,
    rechercher_destinations,
)


class LimiteCalculs(UserRateThrottle):
    """Ménage le moteur d'itinéraire (instance publique en démonstration) : 30 calculs par minute et par compte."""

    scope = "itineraires"
    rate = "30/min"


def _erreur(code: str, detail: str, statut: int) -> Response:
    return Response({"code": code, "detail": detail}, status=statut)


def _sans_position(erreur: DestinationSansPosition) -> Response:
    return _erreur("destination_sans_position", str(erreur), status.HTTP_422_UNPROCESSABLE_ENTITY)


REPONSES_ERREUR = {
    403: OpenApiResponse(description="Réservé aux superviseurs et administrateurs."),
    404: OpenApiResponse(description="Destination introuvable ou désactivée."),
    422: OpenApiResponse(ErreurSerializer, description="Destination sans position GPS fiable."),
}


class CalculerItineraireView(APIView):
    permission_classes = [IsSuperviseurOrAdmin]
    throttle_classes = [LimiteCalculs]

    @extend_schema(
        tags=["Itinéraires"],
        summary="Calculer les itinéraires vers une IMF ou un point de service",
        description=(
            "Calcule en une requête les trajets à pied, à moto et en voiture depuis la position de "
            "l'utilisateur. Les coordonnées de la destination sont relues en base à partir de son "
            "identifiant. Un mode que le moteur ne propose pas est renvoyé avec le statut "
            "« indisponible », sans estimation."
        ),
        request=CalculItineraireSerializer,
        responses={
            200: CalculReponseSerializer,
            400: OpenApiResponse(description="Origine invalide ou hors du Sénégal, mode inconnu."),
            **REPONSES_ERREUR,
            424: OpenApiResponse(ErreurSerializer, description="Moteur d'itinéraire injoignable, trop lent ou en erreur."),
            501: OpenApiResponse(ErreurSerializer, description="Aucun moteur d'itinéraire configuré (ROUTING_URL)."),
        },
        examples=[
            OpenApiExample(
                "Vers un point de service",
                request_only=True,
                value={
                    "origine": {"lat": 14.6928, "lon": -17.4467},
                    "destination": {"type": "point_service", "id": "3f1c2a9e-0000-4000-8000-000000000000"},
                    "modes": ["pied", "moto", "voiture"],
                },
            )
        ],
    )
    def post(self, request):
        entree = CalculItineraireSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        donnees = entree.validated_data
        try:
            destination = obtenir_destination(donnees["destination"]["type"], donnees["destination"]["id"])
        except DestinationSansPosition as erreur:
            return _sans_position(erreur)
        origine = (donnees["origine"]["lat"], donnees["origine"]["lon"])
        try:
            resultat = calculer_itineraire(origine, destination, donnees["modes"])
        except FournisseurNonConfigure as erreur:
            return _erreur("fournisseur_non_configure", str(erreur), status.HTTP_501_NOT_IMPLEMENTED)
        except ErreurFournisseur as erreur:
            return _erreur("fournisseur_indisponible", str(erreur), status.HTTP_424_FAILED_DEPENDENCY)
        return Response({"destination": destination.en_dict(), **resultat})


class DestinationsView(APIView):
    permission_classes = [IsSuperviseurOrAdmin]

    @extend_schema(
        tags=["Itinéraires"],
        operation_id="itineraires_destinations_rechercher",
        summary="Rechercher une destination",
        description=(
            "IMF (nom, sigle, numéro d'agrément) et points de service (nom, localité, IMF), limités aux "
            "positions GPS fiables. Deux caractères minimum ; 8 IMF et 12 points au plus."
        ),
        parameters=[OpenApiParameter("q", str, description="Texte recherché (2 caractères minimum).")],
        responses={200: RechercheReponseSerializer, 403: REPONSES_ERREUR[403]},
    )
    def get(self, request):
        resultats = rechercher_destinations(request.query_params.get("q", ""))
        return Response({"results": [d.en_dict() for d in resultats]})


class DestinationsCarteView(APIView):
    permission_classes = [IsSuperviseurOrAdmin]

    @extend_schema(
        tags=["Itinéraires"],
        operation_id="itineraires_destinations_carte",
        summary="Toutes les destinations de la carte",
        description=(
            "Sièges des IMF et points de service dont la position GPS est fiable, en version courte, "
            "pour afficher toutes les épingles dès l'ouverture de la page. Réponse mise en cache."
        ),
        responses={200: CarteReponseSerializer, 403: REPONSES_ERREUR[403]},
    )
    def get(self, request):
        return Response({"results": destinations_carte()})


class DestinationDetailView(APIView):
    permission_classes = [IsSuperviseurOrAdmin]

    @extend_schema(
        tags=["Itinéraires"],
        operation_id="itineraires_destination_lire",
        summary="Lire une destination",
        description="Sert au lien direct /itineraire?type=…&id=… ouvert depuis la fiche d'une IMF ou d'un point de service.",
        parameters=[OpenApiParameter("type", str, OpenApiParameter.PATH, enum=list(TYPES))],
        responses={200: DestinationSerializer, **REPONSES_ERREUR},
    )
    def get(self, request, type_destination, pk):
        try:
            return Response(obtenir_destination(type_destination, pk).en_dict())
        except DestinationSansPosition as erreur:
            return _sans_position(erreur)
