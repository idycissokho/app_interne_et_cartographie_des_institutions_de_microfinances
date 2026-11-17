"""
itineraires/urls.py
===================
Routes de la section « Itinéraire » (SUPERVISEUR et ADMIN) :
  POST /api/v1/itineraires/calculer/
  GET  /api/v1/itineraires/destinations/?q=
  GET  /api/v1/itineraires/destinations/<institution|point_service>/<uuid>/
"""

from django.urls import path

from .views import CalculerItineraireView, DestinationDetailView, DestinationsView

app_name = "itineraires"

urlpatterns = [
    path("calculer/", CalculerItineraireView.as_view(), name="calculer"),
    path("destinations/", DestinationsView.as_view(), name="destinations"),
    path(
        "destinations/<str:type_destination>/<uuid:pk>/",
        DestinationDetailView.as_view(),
        name="destination-detail",
    ),
]
