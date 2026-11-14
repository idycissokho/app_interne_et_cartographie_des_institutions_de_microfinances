"""
config/wsgi.py
==============
Point d'entrée WSGI pour Gunicorn en production.
La variable DJANGO_SETTINGS_MODULE est lue depuis l'environnement.
"""

import os

from config.apm import demarrer_apm

# APM New Relic : à démarrer avant le premier import de Django (voir config/apm.py).
# Sans effet si l'agent a déjà été démarré par manage.py ou si aucune clé n'est définie.
demarrer_apm()

from django.core.wsgi import get_wsgi_application  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_wsgi_application()
