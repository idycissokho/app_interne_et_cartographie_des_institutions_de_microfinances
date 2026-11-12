"""
importation/urls.py
===================
Routes du module importation :
  GET/POST /api/v1/importation/                  — Liste et upload (traitement immédiat)
  GET      /api/v1/importation/<uuid>/           — Détail et rapport d'un import
  GET      /api/v1/importation/modeles/<type>/   — Canevas CSV (IMF, POINTS_SERVICE, DIRIGEANTS)
  GET      /api/v1/importation/export/<type>/    — Export CSV du référentiel
"""

from django.urls import path

from .views import ExportView, ImportationDetailView, ImportationListCreateView, ModeleImportView

app_name = "importation"

urlpatterns = [
    path("", ImportationListCreateView.as_view(), name="importation-list"),
    path("modeles/<str:type_import>/", ModeleImportView.as_view(), name="importation-modele"),
    path("export/<str:type_import>/", ExportView.as_view(), name="importation-export"),
    path("<uuid:pk>/", ImportationDetailView.as_view(), name="importation-detail"),
]
