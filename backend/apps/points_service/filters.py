"""
points_service/filters.py
=========================
Filtres partagés par la liste et l'export GeoJSON (carte micro CAR-MIC-04 à 08).
"""

import django_filters

from .models import PointService


class PointServiceFilter(django_filters.FilterSet):
    bailleur = django_filters.UUIDFilter(field_name="imf__bailleurs", distinct=True)
    sans_gps = django_filters.BooleanFilter(field_name="localisation", lookup_expr="isnull")

    class Meta:
        model = PointService
        fields = [
            "imf", "type_point", "statut_point", "statut_reglementaire",
            "region", "departement", "commune", "bailleur", "sans_gps",
        ]
