"""
config/settings/development.py
================================
Paramètres spécifiques à l'environnement de développement local.
Active le mode debug, la barre de débogage et assouplit les restrictions CORS.
"""

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Mode debug — JAMAIS activer en production
# ---------------------------------------------------------------------------

DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]


# ---------------------------------------------------------------------------
# CORS — Autorise le frontend Vite en développement
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Port par défaut de Vite
    "http://127.0.0.1:5173",
]
CORS_ALLOW_CREDENTIALS = False


# ---------------------------------------------------------------------------
# Applications supplémentaires en développement
# ---------------------------------------------------------------------------

INSTALLED_APPS += [  # noqa: F405
    "debug_toolbar",
    "django_extensions",
]

MIDDLEWARE += [  # noqa: F405
    "debug_toolbar.middleware.DebugToolbarMiddleware",
]

INTERNAL_IPS = ["127.0.0.1"]


# ---------------------------------------------------------------------------
# Base de données de développement
# ---------------------------------------------------------------------------

# Les valeurs sont lues depuis le fichier .env local
# Aucune valeur par défaut codée en dur pour les secrets


# ---------------------------------------------------------------------------
# Emails — affichage dans la console en développement
# ---------------------------------------------------------------------------

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
