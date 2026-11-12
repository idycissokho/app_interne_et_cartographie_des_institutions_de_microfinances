"""
imf/urls.py
===========
Routes du module IMF :
  GET/POST  /api/v1/imf/          — Liste et création
  GET/PUT/PATCH/DELETE /api/v1/imf/<uuid>/ — Détail, modification, suppression logique
"""

from django.urls import path
from .views import IMFListCreateView, IMFDetailView

app_name = "imf"

urlpatterns = [
    path("", IMFListCreateView.as_view(), name="imf-list"),
    path("<uuid:pk>/", IMFDetailView.as_view(), name="imf-detail"),
]
