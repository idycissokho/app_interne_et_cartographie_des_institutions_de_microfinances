#!/usr/bin/env python
"""
manage.py
=========
Point d'entrée des commandes de gestion Django.
En développement, pointe vers config.settings.development.
La variable DJANGO_SETTINGS_MODULE peut être surchargée via l'environnement.
"""

import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

    # APM New Relic : à démarrer avant le premier import de Django (voir config/apm.py).
    from config.apm import demarrer_apm

    demarrer_apm()

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django introuvable. Vérifiez que l'environnement virtuel est activé "
            "et que les dépendances sont installées via : "
            "pip install -r requirements/development.txt"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
