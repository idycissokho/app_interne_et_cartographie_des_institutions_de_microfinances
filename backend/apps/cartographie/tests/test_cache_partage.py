"""Cache partagé par tous les processus : une suppression faite hors de l'application
(commande manage.py, shell) doit être vue aussitôt par l'application en ligne."""

import pytest

from apps.imf.models import IMF
from config.cache_donnees import en_cache


def test_cache_dans_une_table_de_la_base_hors_tests():
    from config.settings import base

    # Les tests remplacent le cache par la mémoire (settings/test.py) ; la configuration
    # réelle (développement, production) est une table de la base, partagée.
    assert base.CACHES["default"]["BACKEND"].endswith("DatabaseCache")
    assert base.CACHES["default"]["LOCATION"] == "cache_donnees"


@pytest.mark.django_db
def test_suppression_en_masse_perime_le_cache():
    IMF.objects.create(nom="Caisse A", type_imf="SA", adresse_siege="Dakar")
    compter = lambda: en_cache("essai_compte", lambda: IMF.objects.count())  # noqa: E731
    assert compter() == 1
    IMF.objects.all().delete()  # comme le vidage depuis manage.py shell
    assert compter() == 0
