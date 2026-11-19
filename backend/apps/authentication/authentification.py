"""
authentication/authentification.py
==================================
Authentification JWT de l'API, avec le changement de mot de passe obligatoire :
tant qu'un compte a « doit_changer_mot_de_passe », seules les routes nécessaires pour
choisir un nouveau mot de passe répondent (les autres renvoient 403).
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

# Routes encore accessibles avant le changement : connexion, profil, changement, déconnexion.
ROUTES_AUTORISEES = {"login", "profil", "change-password", "logout"}


class MotDePasseAChanger(PermissionDenied):
    default_detail = "Vous devez d'abord choisir un nouveau mot de passe."
    default_code = "mot_de_passe_a_changer"


class JWTAuthentificationMotDePasse(JWTAuthentication):
    def authenticate(self, request):
        resultat = super().authenticate(request)
        if resultat is None:
            return None
        utilisateur, jeton = resultat
        if getattr(utilisateur, "doit_changer_mot_de_passe", False):
            route = getattr(request._request, "resolver_match", None)
            if not (route and route.namespace == "authentication" and route.url_name in ROUTES_AUTORISEES):
                raise MotDePasseAChanger()
        return utilisateur, jeton
