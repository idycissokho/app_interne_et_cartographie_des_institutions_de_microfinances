"""
imf/views_public.py
===================
Accès public, sans connexion (page d'accueil de la plateforme) :

  GET /api/v1/public/institutions/?q=…   recherche par numéro d'agrément, nom ou sigle
  GET /api/v1/public/resume/             chiffres d'ensemble affichés sur l'accueil
  GET /api/v1/public/registre/           registre complet (carte des sièges, liste par région)

Seules les informations d'identification réglementaire sont exposées (dénomination, agrément,
statut, type, forme, région, département, localité, année de création, position et téléphone du
siège) : ni dirigeants, ni indicateurs financiers, ni adresse électronique.
"""

from django.db.models import Q, Value
from django.db.models.functions import Replace, Upper
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import IMF

RESULTATS_MAX = 8


def _agrement_normalise(texte: str) -> str:
    """« dk1-93 00008 » → « DK19300008 » : la saisie tolère espaces, tirets et minuscules."""
    return "".join(c for c in texte.upper() if c.isalnum())


def _fiche(imf: IMF) -> dict:
    point = imf.localisation_siege
    return {
        "id": str(imf.id),
        "nom": imf.nom,
        "sigle": imf.sigle,
        "numero_agrement": imf.numero_agrement,
        "statut": imf.statut_reglementaire,
        "statut_libelle": imf.get_statut_reglementaire_display(),
        "type": imf.type_sfd or imf.get_type_imf_display(),
        "forme_juridique": imf.forme_juridique or imf.get_type_imf_display(),
        "region": imf.region.nom if imf.region else "",
        "departement": imf.departement.nom if imf.departement else "",
        "localite": imf.lieu_dit or imf.adresse_siege,
        "adresse": imf.adresse_siege,
        "annee_creation": imf.annee_creation,
        "telephone": imf.telephone,
        "position": [point.x, point.y] if point else None,
    }


class _VuePublique(APIView):
    permission_classes = [AllowAny]
    # Aucun jeton lu : un jeton expiré resté dans le navigateur ne doit pas provoquer de 401.
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public"


class RecherchePubliqueView(_VuePublique):
    def get(self, request):
        q = " ".join(request.query_params.get("q", "").split())[:100]
        if len(q) < 2:
            return Response({"resultats": [], "exact": False})

        base = IMF.objects.filter(is_active=True).select_related("region", "departement")
        agrement = _agrement_normalise(q)
        annotees = base.annotate(
            agrement_norm=Upper(Replace(Replace(Replace("numero_agrement", Value("-"), Value("")), Value(" "), Value("")), Value("/"), Value("")))
        )
        # Numéro d'agrément complet : réponse unique, sans ambiguïté.
        exactes = list(annotees.filter(agrement_norm=agrement)[:RESULTATS_MAX]) if len(agrement) >= 4 else []
        if exactes:
            return Response({"resultats": [_fiche(i) for i in exactes], "exact": True})

        filtre = Q(nom__icontains=q) | Q(sigle__icontains=q)
        if len(agrement) >= 2:
            filtre |= Q(agrement_norm__contains=agrement)
        trouvees = annotees.filter(filtre).order_by("nom")[:RESULTATS_MAX]
        return Response({"resultats": [_fiche(i) for i in trouvees], "exact": False})


class ResumePublicView(_VuePublique):
    """Chiffres d'ensemble (accueil, page de connexion) : des comptes, aucune donnée nominative."""

    def get(self, request):
        from apps.points_service.models import PointService

        actives = IMF.objects.filter(is_active=True)
        points = PointService.objects.filter(is_active=True)
        geolocalises = points.exclude(localisation=None)
        return Response({
            "institutions": actives.count(),
            "en_activite": actives.filter(statut_reglementaire=IMF.StatutReglementaire.EN_ACTIVITE).count(),
            "regions": actives.exclude(region=None).values("region").distinct().count(),
            "points_service": points.count(),
            "points_service_geolocalises": geolocalises.count(),
            "regions_points_service": geolocalises.exclude(region=None).values("region").distinct().count(),
        })


class RegistrePublicView(_VuePublique):
    """Registre complet (quelques centaines de lignes) : la page cherche et filtre sans aller-retour."""

    def get(self, request):
        institutions = (
            IMF.objects.filter(is_active=True).select_related("region", "departement").order_by("nom")
        )
        return Response({"institutions": [_fiche(i) for i in institutions]})
