"""
config/settings/test.py
========================
Paramètres spécifiques à l'environnement de test automatisé.
Optimise la vitesse d'exécution des tests.
"""

from .base import *  # noqa: F401, F403

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
CORS_ALLOWED_ORIGINS = []
CSRF_TRUSTED_ORIGINS = []

# Les migrations sont versionnées : on les applique telles quelles pour que
# les tests valident aussi le schéma réellement déployé.

# Imports traités pendant la requête (une tâche de fond ne verrait pas la transaction du test),
# et progression écrite par la connexion principale.
IMPORT_ASYNCHRONE = False
IMPORT_ALIAS_SUIVI = "default"
DATABASES.pop("suivi", None)  # noqa: F405

# Hashage de mot de passe minimal pour accélérer les tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Emails silencieux pendant les tests
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Cache en mémoire pendant les tests : chaque test vide le cache sans accès à la base, et les
# tests de performance comptent les requêtes SQL des vues seules. En dehors des tests, le cache
# est une table partagée par tous les processus (base.py, CACHES).
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "tests"}}
