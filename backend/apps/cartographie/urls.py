"""
cartographie/urls.py
====================
Routes du module cartographie :
  GET/POST             /api/v1/cartographie/zones/          — Liste et création
  GET/PUT/PATCH/DELETE /api/v1/cartographie/zones/<uuid>/  — Détail zone
  GET                  /api/v1/cartographie/zones/geojson/ — Export GeoJSON
"""

from django.urls import path
from .views import ZoneGeographiqueListCreateView, ZoneGeographiqueDetailView, ZoneGeographiqueGeoView

app_name = "cartographie"

urlpatterns = [
    path("zones/", ZoneGeographiqueListCreateView.as_view(), name="zone-list"),
    path("zones/geojson/", ZoneGeographiqueGeoView.as_view(), name="zone-geojson"),
    path("zones/<uuid:pk>/", ZoneGeographiqueDetailView.as_view(), name="zone-detail"),
]
