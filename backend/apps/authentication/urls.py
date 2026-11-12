"""
authentication/urls.py
======================
Routes du module authentification :
  POST   login/            — Obtenir une paire de tokens JWT
  POST   logout/           — Révoquer le refresh token (blacklist)
  POST   token/refresh/    — Renouveler l'access token
  GET    profil/           — Lire le profil de l'utilisateur connecté
  PATCH  profil/           — Mettre à jour nom et prénom
  POST   change-password/  — Changer le mot de passe
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import ChangePasswordView, LoginView, LogoutView, ProfilView

app_name = "authentication"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("profil/", ProfilView.as_view(), name="profil"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
]
