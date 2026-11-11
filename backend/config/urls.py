"""
config/urls.py
==============
Point d'entrée unique de toutes les routes de l'application.
Chaque domaine fonctionnel expose ses propres URLs via include().
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

# ---------------------------------------------------------------------------
# Préfixe API — toutes les routes REST sont regroupées sous /api/v1/
# ---------------------------------------------------------------------------

API_V1 = "api/v1/"

urlpatterns = [
    # Interface d'administration Django
    path("admin/", admin.site.urls),

    # Authentification JWT (login, refresh, verify)
    path(f"{API_V1}auth/", include("apps.authentication.urls")),

    # Domaines fonctionnels métier
    path(f"{API_V1}imf/", include("apps.imf.urls")),
    path(f"{API_V1}points-service/", include("apps.points_service.urls")),
    path(f"{API_V1}dirigeants/", include("apps.dirigeants.urls")),
    path(f"{API_V1}cartographie/", include("apps.cartographie.urls")),
    path(f"{API_V1}importation/", include("apps.importation.urls")),
    path(f"{API_V1}audit/", include("apps.audit.urls")),

]

# Schéma détaillé limité au développement pour ne pas exposer les routes internes.
if settings.DEBUG:
    urlpatterns += [
        path(f"{API_V1}schema/", SpectacularAPIView.as_view(), name="schema"),
        path(f"{API_V1}docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
        path(f"{API_V1}redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    ]
