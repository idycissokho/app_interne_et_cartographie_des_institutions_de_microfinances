"""Table du cache partagé (config/cache_donnees.py, settings CACHES : DatabaseCache).

Créée ici pour que `migrate` suffise partout (serveur, Docker, tests) ; sans effet si le cache
configuré n'est pas une table de la base (DJANGO_CACHE=memoire).
"""

from django.core.management import call_command
from django.db import migrations


def creer_table_cache(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):
    dependencies = [("cartographie", "0002_zonegeographique_parent")]

    operations = [migrations.RunPython(creer_table_cache, migrations.RunPython.noop)]
