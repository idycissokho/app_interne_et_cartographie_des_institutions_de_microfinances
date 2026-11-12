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

# Désactive les migrations pour les apps locales uniquement.
# Les apps tierces (dont token_blacklist) gardent leurs migrations
# pour que leurs tables soient créées correctement.
MIGRATION_MODULES = {app.split(".")[-1]: None for app in LOCAL_APPS}  # noqa: F405

# Hashage de mot de passe minimal pour accélérer les tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Emails silencieux pendant les tests
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
