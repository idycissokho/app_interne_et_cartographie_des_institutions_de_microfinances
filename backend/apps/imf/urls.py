"""
imf/urls.py
===========
Routes du module IMF :
  GET/POST             /api/v1/imf/                      — Liste et création
  GET/PUT/PATCH/DELETE /api/v1/imf/<uuid>/               — Détail, modification, suppression logique
  GET                  /api/v1/imf/<uuid>/mandats/       — Onglet « Dirigeants » de la fiche IMF
  GET/POST             /api/v1/imf/bailleurs/            — Référentiel des bailleurs
  GET/PUT/PATCH/DELETE /api/v1/imf/bailleurs/<uuid>/     — Détail d'un bailleur
"""

from django.urls import path

from apps.dirigeants.views import MandatsParIMFView

from .views import BailleurDetailView, BailleurListCreateView, IMFDetailView, IMFListCreateView

app_name = "imf"

urlpatterns = [
    path("", IMFListCreateView.as_view(), name="imf-list"),
    path("bailleurs/", BailleurListCreateView.as_view(), name="bailleur-list"),
    path("bailleurs/<uuid:pk>/", BailleurDetailView.as_view(), name="bailleur-detail"),
    path("<uuid:pk>/", IMFDetailView.as_view(), name="imf-detail"),
    path("<uuid:imf_pk>/mandats/", MandatsParIMFView.as_view(), name="imf-mandats"),
]
