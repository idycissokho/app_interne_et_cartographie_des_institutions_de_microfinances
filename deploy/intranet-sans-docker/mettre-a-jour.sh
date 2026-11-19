#!/usr/bin/env bash
# =============================================================================
# mettre-a-jour.sh — installe la dernière version de la branche deploiement-intranet
#
# À lancer SUR LE SERVEUR, par deploy_app (sans sudo) :
#   /var/www/annuairedesimf/app/deploy/intranet-sans-docker/mettre-a-jour.sh
#   … --frontend-compile /chemin/vers/dist   # interface compilée ailleurs (sur le PC), copiée par scp
#
# Étapes : sauvegarde de la base → code (git fetch + reset) → dépendances Python →
# compilation de l'interface → migrations, référentiel géographique, compte administrateur,
# fichiers statiques → bascule de l'interface → redémarrage de Gunicorn → contrôle de santé.
#
# Jamais touchés : app/config/.env.production, media/, venv/, logs/, sauvegardes/.
# Redémarrage sans sudo complet : règle /etc/sudoers.d/carto-imf (carto-imf.sudoers).
# =============================================================================
set -euo pipefail
umask 027

# --- Emplacements (dérivés de celui du script : <racine>/app/deploy/intranet-sans-docker/) ---
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP="$RACINE/app"
VENV="$RACINE/venv"
FICHIER_ENV="$APP/config/.env.production"
SERVICE="carto-imf-gunicorn"
BRANCHE="deploiement-intranet"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"

FRONTEND_COMPILE=""
if [ "${1:-}" = "--frontend-compile" ]; then
  FRONTEND_COMPILE="${2:?indiquer le dossier dist/ copié depuis le PC}"
fi

erreur() { echo "ERREUR : $*" >&2; exit 1; }
info()   { echo; echo "==> $*"; }
# Valeur d'une variable du fichier de réglages (sans l'interpréter comme du shell).
reglage() { grep -E "^$1=" "$FICHIER_ENV" | tail -1 | cut -d= -f2- || true; }

# --- 0. Vérifications ---------------------------------------------------------------------
[ "$(id -un)" != "root" ] || erreur "ne pas lancer ce script en root : utiliser le compte deploy_app."
[ -f "$FICHIER_ENV" ] || erreur "$FICHIER_ENV introuvable (guide, § e)."
[ -x "$VENV/bin/python" ] || erreur "environnement Python absent : $VENV (guide, § d)."
mkdir -p "$RACINE/logs" "$RACINE/sauvegardes" "$RACINE/media"
touch "$RACINE/logs/gunicorn.log"

export DJANGO_SETTINGS_MODULE=config.settings.production
export DJANGO_ENV_FILE="$FICHIER_ENV"
manage() { (cd "$APP/backend" && "$VENV/bin/python" manage.py "$@"); }

# --- 1. Sauvegarde de la base ---------------------------------------------------------------
info "Sauvegarde de la base"
SAUVEGARDE="$RACINE/sauvegardes/carto-imf-$HORODATAGE.dump"
PGPASSWORD="$(reglage DB_PASSWORD)" pg_dump -h "$(reglage DB_HOST)" -p "$(reglage DB_PORT)" \
  -U "$(reglage DB_USER)" -d "$(reglage DB_NAME)" -Fc -f "$SAUVEGARDE"
echo "    $SAUVEGARDE ($(du -h "$SAUVEGARDE" | cut -f1))"
# Sauvegardes de plus de 30 jours supprimées (les plus récentes suffisent à un retour arrière).
find "$RACINE/sauvegardes" -name 'carto-imf-*.dump' -mtime +30 -delete

# --- 2. Code ------------------------------------------------------------------------------
info "Code : dernière version de $BRANCHE"
cd "$APP"
git rev-parse HEAD > "$RACINE/logs/version-precedente.txt"
git fetch --quiet origin "$BRANCHE"
git reset --quiet --hard "origin/$BRANCHE"
echo "    version précédente : $(cut -c1-8 "$RACINE/logs/version-precedente.txt")  →  installée : $(git rev-parse --short HEAD)"
grep '^source=' VERSION 2>/dev/null | sed 's/^/    /' || true

# --- 3. Dépendances Python --------------------------------------------------------------------
info "Dépendances Python"
"$VENV/bin/pip" install --quiet --disable-pip-version-check -r backend/requirements/production.txt

# --- 4. Interface (compilée AVANT de toucher à la base : un échec ici ne change rien au site) ---
info "Interface"
if [ -n "$FRONTEND_COMPILE" ]; then
  [ -f "$FRONTEND_COMPILE/index.html" ] || erreur "$FRONTEND_COMPILE ne contient pas d'interface compilée (index.html)."
  DIST="$FRONTEND_COMPILE"
  echo "    interface compilée fournie : $DIST"
else
  # Node 22 installé par nvm dans le compte deploy_app (guide, § h). nvm ne supporte pas
  # « set -eu » : options suspendues le temps de le charger.
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    set +eu
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm use --silent 22 >/dev/null 2>&1
    set -eu
  fi
  MAJEURE="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
  [ "${MAJEURE:-0}" -ge 22 ] || erreur "Node 22 requis (trouvé : $(node --version 2>/dev/null || echo aucun)). Guide, § h."
  (cd frontend && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
  DIST="$APP/frontend/dist"
fi

# --- 5. Base, référentiel, compte administrateur, fichiers statiques ------------------------------
info "Migrations de la base"
manage migrate --noinput
info "Référentiel géographique (sans doublon)"
manage charger_regions
manage charger_departements
manage creer_admin --si-configure
info "Fichiers statiques de l'administration"
manage collectstatic --noinput --verbosity 0

# --- 6. Bascule de l'interface (instantanée ; la version précédente est gardée) ----------------
info "Mise en ligne de l'interface"
rm -rf "$RACINE/frontend.nouveau" "$RACINE/frontend.precedent"
# Copie : hérite du groupe www-data de /var/www/annuairedesimf (pas de chmod : deploy_app n'étant pas
# membre de www-data, un chmod retirerait cet héritage).
cp -R "$DIST" "$RACINE/frontend.nouveau"
[ -d "$RACINE/frontend" ] && mv "$RACINE/frontend" "$RACINE/frontend.precedent"
mv "$RACINE/frontend.nouveau" "$RACINE/frontend"

# --- 7. Redémarrage et contrôle -------------------------------------------------------------
info "Redémarrage de $SERVICE"
sudo -n /usr/bin/systemctl restart "$SERVICE" \
  || erreur "redémarrage refusé : la règle sudoers carto-imf est-elle installée ? (guide, § i)"

ORIGINE="$(reglage DJANGO_CSRF_TRUSTED_ORIGINS | cut -d, -f1)"
info "Contrôle de santé : $ORIGINE/api/v1/sante/"
for _ in $(seq 1 20); do
  if curl -fsk --max-time 5 "$ORIGINE/api/v1/sante/" | grep -q '"ok"'; then
    echo "    API opérationnelle."
    info "Mise à jour terminée : $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 3
done
echo "L'API ne répond pas. Journal : tail -n 50 $RACINE/logs/gunicorn.log" >&2
echo "Retour arrière : guide, § m (sauvegarde : $SAUVEGARDE)." >&2
exit 1
