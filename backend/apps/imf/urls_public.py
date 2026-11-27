"""Routes publiques (sans connexion) — voir views_public.py."""

from django.urls import path

from apps.itineraires.views import ItinerairePublicView

from .views_public import RecherchePubliqueView, RegistrePublicView, ResumePublicView

app_name = "public"

urlpatterns = [
    path("institutions/", RecherchePubliqueView.as_view(), name="institutions"),
    path("resume/", ResumePublicView.as_view(), name="resume"),
    path("registre/", RegistrePublicView.as_view(), name="registre"),
    # Trajet jusqu'au siège d'une institution, depuis l'extrait du registre (accueil).
    path("itineraire/", ItinerairePublicView.as_view(), name="itineraire"),
]
