"""Routes publiques (sans connexion) — voir views_public.py."""

from django.urls import path

from .views_public import RecherchePubliqueView, RegistrePublicView, ResumePublicView

app_name = "public"

urlpatterns = [
    path("institutions/", RecherchePubliqueView.as_view(), name="institutions"),
    path("resume/", ResumePublicView.as_view(), name="resume"),
    path("registre/", RegistrePublicView.as_view(), name="registre"),
]
