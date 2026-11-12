from django.urls import path
from .views import IMFListCreateView, IMFDetailView

app_name = "imf"

urlpatterns = [
    path("", IMFListCreateView.as_view(), name="imf-list"),
    path("<uuid:pk>/", IMFDetailView.as_view(), name="imf-detail"),
]
