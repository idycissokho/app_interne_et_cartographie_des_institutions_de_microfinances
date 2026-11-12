from django.urls import path

from .views import PointServiceDetailView, PointServiceGeoView, PointServiceListCreateView

app_name = "points_service"

urlpatterns = [
    path("", PointServiceListCreateView.as_view(), name="ps-list"),
    path("geojson/", PointServiceGeoView.as_view(), name="ps-geojson"),
    path("<uuid:pk>/", PointServiceDetailView.as_view(), name="ps-detail"),
]
