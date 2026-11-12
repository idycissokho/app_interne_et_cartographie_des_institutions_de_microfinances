"""
cartographie/urls.py
====================
Routes du module cartographie :
  GET/POST             /api/v1/cartographie/zones/          — Liste et création
  GET/PUT/PATCH/DELETE /api/v1/cartographie/zones/<uuid>/  — Détail zone
  GET                  /api/v1/cartographie/zones/geojson/ — Export GeoJSON
  GET                  /api/v1/cartographie/zones/agregats/ — Indicateurs par zone (carte macro)
"""

from django.urls import path
from .views import (
    ZoneAgregatsView,
    ZoneGeographiqueDetailView,
    ZoneGeographiqueGeoView,
    ZoneGeographiqueListCreateView,
)

app_name = "cartographie"

urlpatterns = [
    path("zones/", ZoneGeographiqueListCreateView.as_view(), name="zone-list"),
    path("zones/agregats/", ZoneAgregatsView.as_view(), name="zone-agregats"),
    path("zones/geojson/", ZoneGeographiqueGeoView.as_view(), name="zone-geojson"),
    path("zones/<uuid:pk>/", ZoneGeographiqueDetailView.as_view(), name="zone-detail"),
]
