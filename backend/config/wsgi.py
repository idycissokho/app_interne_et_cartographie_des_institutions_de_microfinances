"""
config/wsgi.py
==============
Point d'entrée WSGI pour Gunicorn en production.
La variable DJANGO_SETTINGS_MODULE est lue depuis l'environnement.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_wsgi_application()
