#!/bin/sh
# =============================================================================
# backend/docker-entrypoint.sh — démarrage de l'image de production (Dockerfile.prod)
#
#   1. migrations de la base (désactivables : MIGRER_AU_DEMARRAGE=false) ;
#   2. compte administrateur, seulement si DJANGO_ADMIN_EMAIL et DJANGO_ADMIN_PASSWORD
#      sont définies (un compte existant n'est jamais modifié) ;
#   3. lancement de la commande de l'image (Gunicorn).
#
# Toute commande passée au conteneur remplace Gunicorn à l'étape 3, par exemple :
#   docker run --rm --env-file .env cartographie-imf-backend python manage.py charger_annuaire fichier.xlsx
# =============================================================================
set -e

if [ "${MIGRER_AU_DEMARRAGE:-true}" = "true" ]; then
    echo "Migrations de la base…"
    python manage.py migrate --noinput
fi

python manage.py creer_admin --si-configure

exec "$@"
