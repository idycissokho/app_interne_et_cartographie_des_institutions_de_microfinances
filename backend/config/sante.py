"""
config/sante.py
===============
GET /api/v1/sante/ — indique que l'application répond.

Accessible sans connexion, mais ne renvoie aucune donnée et ne touche pas la base :
il sert à réveiller ou surveiller le serveur (supervision de l'intranet, ou serveur
d'hébergement gratuit mis en veille). Toutes les autres routes de l'API exigent un compte.
"""

from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


@never_cache
@require_GET
def sante(request):
    return JsonResponse({"statut": "ok"})
