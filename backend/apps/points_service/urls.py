from django.urls import path
from .views import PointServiceListCreateView, PointServiceDetailView

app_name = "points_service"

urlpatterns = [
    path("", PointServiceListCreateView.as_view(), name="ps-list"),
    path("<uuid:pk>/", PointServiceDetailView.as_view(), name="ps-detail"),
]
