"""
importation/urls.py
===================
Routes du module importation :
  GET/POST /api/v1/importation/         — Liste et upload
  GET      /api/v1/importation/<uuid>/  — Détail et rapport d'un import
"""

from django.urls import path
from .views import ImportationListCreateView, ImportationDetailView

app_name = "importation"

urlpatterns = [
    path("", ImportationListCreateView.as_view(), name="importation-list"),
    path("<uuid:pk>/", ImportationDetailView.as_view(), name="importation-detail"),
]
