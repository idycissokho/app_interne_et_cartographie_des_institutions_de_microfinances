"""
dirigeants/urls.py
==================
Routes du module dirigeants :
  GET/POST             /api/v1/dirigeants/                            — Liste et création
  GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/                    — Détail dirigeant
  GET/POST             /api/v1/dirigeants/<uuid>/mandats/            — Mandats d'un dirigeant
  GET/PUT/PATCH/DELETE /api/v1/dirigeants/<uuid>/mandats/<uuid>/     — Détail mandat
"""

from django.urls import path
from .views import DirigeantListCreateView, DirigeantDetailView, MandatListCreateView, MandatDetailView

app_name = "dirigeants"

urlpatterns = [
    path("", DirigeantListCreateView.as_view(), name="dirigeant-list"),
    path("<uuid:pk>/", DirigeantDetailView.as_view(), name="dirigeant-detail"),
    path("<uuid:dirigeant_pk>/mandats/", MandatListCreateView.as_view(), name="mandat-list"),
    path("<uuid:dirigeant_pk>/mandats/<uuid:pk>/", MandatDetailView.as_view(), name="mandat-detail"),
]
