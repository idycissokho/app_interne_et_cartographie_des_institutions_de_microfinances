"""
config/apm.py
=============
Supervision applicative (APM) avec New Relic.

L'agent mesure pour chaque requête la latence, les erreurs, les requêtes SQL et
la consommation CPU / mémoire du processus Django, puis les envoie à New Relic.

Il n'est activé que si NEW_RELIC_LICENSE_KEY est renseignée : sans clé, rien
n'est chargé et l'application se comporte exactement comme avant.

Toute la configuration passe par des variables d'environnement (voir .env.example) :
  NEW_RELIC_LICENSE_KEY   clé d'ingestion du compte New Relic (secret)
  NEW_RELIC_APP_NAME      nom affiché dans New Relic
  NEW_RELIC_ENVIRONMENT   development / production

demarrer_apm() doit être appelée AVANT le premier import de Django, sinon
l'agent ne peut pas instrumenter les vues, le middleware et la base de données.
"""

import os
import sys


def demarrer_apm() -> bool:
    """Initialise l'agent New Relic. Retourne True s'il a été activé."""
    if not os.environ.get("NEW_RELIC_LICENSE_KEY"):
        return False

    # Pas de télémétrie pendant les tests automatisés.
    if "pytest" in sys.modules or "test" in sys.argv[1:2]:
        return False

    try:
        import newrelic.agent
    except ImportError:
        print(
            "APM : NEW_RELIC_LICENSE_KEY est définie mais le paquet « newrelic » "
            "est absent. Reconstruire l'image : docker compose up -d --build backend",
            file=sys.stderr,
        )
        return False

    # Sans fichier newrelic.ini : l'agent lit les variables NEW_RELIC_*.
    newrelic.agent.initialize()
    return True
