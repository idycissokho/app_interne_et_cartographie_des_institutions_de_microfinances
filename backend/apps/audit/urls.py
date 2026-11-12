"""
audit/urls.py
=============
Routes du module audit :
  GET /api/v1/audit/         — Liste paginée du journal
  GET /api/v1/audit/<uuid>/  — Détail d'une entrée
"""

from django.urls import path
from .views import JournalAuditListView, JournalAuditDetailView

app_name = "audit"

urlpatterns = [
    path("", JournalAuditListView.as_view(), name="audit-list"),
    path("<uuid:pk>/", JournalAuditDetailView.as_view(), name="audit-detail"),
]
