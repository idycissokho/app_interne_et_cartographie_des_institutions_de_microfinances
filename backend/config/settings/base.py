"""
config/settings/base.py
=======================
Paramètres Django communs à tous les environnements (développement, test, production).

Les valeurs sensibles (clé secrète, identifiants base de données, etc.) sont
systématiquement lues depuis les variables d'environnement via django-environ.
Aucune valeur sensible ne doit être codée en dur dans ce fichier.
"""

from pathlib import Path

import environ

# ---------------------------------------------------------------------------
# Chemins de base
# ---------------------------------------------------------------------------

# Racine du backend (dossier contenant manage.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
# Fichier de réglages : celui qu'indique DJANGO_ENV_FILE (installation sans Docker :
# config/.env.production, lu à l'identique par Gunicorn et par les commandes manage.py),
# sinon backend/.env, sinon le .env racine (partagé avec docker-compose).
_fichier_impose = env("DJANGO_ENV_FILE", default="")
if _fichier_impose and not Path(_fichier_impose).is_file():
    raise environ.ImproperlyConfigured(f"DJANGO_ENV_FILE : fichier introuvable ({_fichier_impose}).")
for _env_file in ((Path(_fichier_impose),) if _fichier_impose else (BASE_DIR / ".env", BASE_DIR.parent / ".env")):
    if _env_file.is_file():
        environ.Env.read_env(_env_file)
        break


# ---------------------------------------------------------------------------
# Sécurité
# ---------------------------------------------------------------------------

SECRET_KEY = env("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])


# ---------------------------------------------------------------------------
# Applications installées
# ---------------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",  # Support géospatial GeoDjango
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "rest_framework_gis",  # Support GeoJSON pour le module cartographie
]

# Chaque domaine fonctionnel est isolé dans sa propre application
LOCAL_APPS = [
    "apps.authentication",
    "apps.imf",
    "apps.points_service",
    "apps.dirigeants",
    "apps.cartographie",
    "apps.importation",
    "apps.audit",
    "apps.itineraires",
    "apps.assistant",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Compresse les réponses JSON / GeoJSON (le GeoJSON des points passe de 290 à 47 Ko).
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # Avant CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ---------------------------------------------------------------------------
# URLs et WSGI
# ---------------------------------------------------------------------------

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ---------------------------------------------------------------------------
# Base de données PostgreSQL + PostGIS
# ---------------------------------------------------------------------------

# Deux façons de configurer la base, au choix de l'environnement d'installation :
#  - DATABASE_URL (une seule variable, ex. hébergeur PostgreSQL) :
#      postgres://utilisateur:motdepasse@hote:5432/base?sslmode=require
#    Les paramètres après « ? » (sslmode, channel_binding…) sont transmis au pilote.
#  - sinon DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT (Docker Compose de l'intranet).
# Dans les deux cas, le moteur PostGIS est imposé (GeoDjango).
_OPTIONS_BASE = {
    "CONN_MAX_AGE": env.int("DB_CONN_MAX_AGE", default=60),
    "CONN_HEALTH_CHECKS": True,
}

if env("DATABASE_URL", default=""):
    _base = env.db_url("DATABASE_URL", engine="django.contrib.gis.db.backends.postgis")
    _base.setdefault("OPTIONS", {}).setdefault("connect_timeout", 10)
else:
    _base = {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
        "OPTIONS": {"connect_timeout": 10},
    }

DATABASES = {"default": {**_base, **_OPTIONS_BASE}}

# Seconde connexion à la MÊME base, réservée au suivi des imports : l'import s'exécute dans une
# transaction, sa progression (lignes traitées) est publiée par cette connexion pour être lue
# pendant le traitement. Aucune table, aucune migration propre.
DATABASES["suivi"] = {**DATABASES["default"], "CONN_MAX_AGE": 0}
IMPORT_ALIAS_SUIVI = "suivi"

# Imports traités en tâche de fond (l'écran suit la progression) ; false = pendant la requête.
IMPORT_ASYNCHRONE = env.bool("IMPORT_ASYNCHRONE", default=True)
# Un import sans nouvelle depuis ce délai (minutes) est déclaré interrompu (serveur redémarré).
IMPORT_DELAI_INTERRUPTION = env.int("IMPORT_DELAI_INTERRUPTION", default=10)


# ---------------------------------------------------------------------------
# Validation des mots de passe
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Dakar"
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Fichiers statiques et médias
# ---------------------------------------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
# Dossier des fichiers déposés ; réglable pour le placer hors du code (installation sans Docker).
MEDIA_ROOT = Path(env("DJANGO_MEDIA_ROOT", default=str(BASE_DIR / "mediafiles")))

# Fichiers déposés (justificatifs, imports) servis par Django lui-même.
# À laisser à False quand un serveur web les sert (Nginx de l'intranet).
# Attention : ces fichiers sont alors accessibles SANS connexion à qui connaît leur adresse.
SERVIR_MEDIAS = env.bool("DJANGO_SERVIR_MEDIAS", default=False)

# Données fictives : remplace automatiquement noms, téléphones, e-mails et adresses
# des dirigeants après chaque import (démonstration accessible sur Internet).
# Voir apps/dirigeants/anonymisation.py et la commande « anonymiser_dirigeants ».
DONNEES_FICTIVES = env.bool("DJANGO_DONNEES_FICTIVES", default=False)


# ---------------------------------------------------------------------------
# Itinéraires (apps/itineraires, docs/itineraire.md)
# ---------------------------------------------------------------------------

# Moteur de calcul d'itinéraire et son adresse. ROUTING_URL vide : section indisponible
# (aucun appel vers l'extérieur par défaut, comportement attendu sur l'intranet sans moteur).
ROUTING_PROVIDER = env("ROUTING_PROVIDER", default="valhalla")
ROUTING_URL = env("ROUTING_URL", default="")
ROUTING_TIMEOUT = env.float("ROUTING_TIMEOUT", default=10)
# Identifiant de l'application auprès du moteur (les instances publiques l'exigent).
ROUTING_USER_AGENT = env("ROUTING_USER_AGENT", default="cartographie-imf/1.0")


# ---------------------------------------------------------------------------
# Clé primaire par défaut
# ---------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Modèle utilisateur custom
AUTH_USER_MODEL = "authentication.Utilisateur"


# ---------------------------------------------------------------------------
# JWT — SimpleJWT
# ---------------------------------------------------------------------------

from datetime import timedelta  # noqa: E402

# Sessions (recommandations OWASP pour une application manipulant des données personnelles) :
# - jeton d'accès court : 15 min ;
# - inactivité : sans renouvellement pendant SESSION_INACTIVITE_MINUTES, le jeton de
#   rafraîchissement expire (il est renouvelé à chaque activité, rotation + liste noire) ;
# - durée maximale : au-delà de SESSION_DUREE_MAX_HEURES depuis la connexion, il faut se
#   reconnecter, même en restant actif (contrôle dans RafraichissementSerializer).
SESSION_INACTIVITE_MINUTES = env.int("SESSION_INACTIVITE_MINUTES", default=30)
SESSION_DUREE_MAX_HEURES = env.int("SESSION_DUREE_MAX_HEURES", default=8)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCES_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(minutes=SESSION_INACTIVITE_MINUTES),
    "TOKEN_REFRESH_SERIALIZER": "apps.authentication.serializers.RafraichissementSerializer",
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    # Tolérance d'horloge : sans elle, un jeton est refusé (401) si l'horloge du serveur recule
    # d'une seconde entre son émission et son contrôle (resynchronisation d'une machine virtuelle).
    "LEEWAY": timedelta(seconds=env.int("JWT_TOLERANCE_SECONDES", default=10)),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}


# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    # Authentification JWT uniquement — pas de session pour l'API
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.authentication.authentification.JWTAuthentificationMotDePasse",
    ),
    # Toute requête doit être authentifiée par défaut
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Pagination : 20 éléments par page
    "DEFAULT_PAGINATION_CLASS": "config.pagination.PaginationStandard",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Limitation des tentatives de connexion (force brute) : par adresse IP.
    "DEFAULT_THROTTLE_RATES": {
        "connexion": env("LIMITE_CONNEXION", default="10/min"),
        # Assistant (questions sur les données) : par utilisateur.
        "assistant": env("LIMITE_ASSISTANT", default="30/min"),
    },
}


# ---------------------------------------------------------------------------
# Documentation OpenAPI
# ---------------------------------------------------------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "API Cartographie IMF — DRS-SFD",
    "DESCRIPTION": (
        "API REST de l'application interne de cartographie et de gouvernance "
        "des Institutions de Microfinance du Sénégal."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}


# ---------------------------------------------------------------------------
# Journalisation
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # Logger dédié aux opérations d'audit métier
        "audit": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}


# ---------------------------------------------------------------------------
# Cache — statistiques, indicateurs par zone, contours, points de la carte
# (voir config/cache_donnees.py). Mémoire locale par défaut : avec plusieurs
# processus (Gunicorn), préférer un cache partagé (Redis, Memcached).
# ---------------------------------------------------------------------------

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "cartographie-imf",
    }
}
