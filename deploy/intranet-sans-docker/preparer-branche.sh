#!/usr/bin/env bash
# =============================================================================
# preparer-branche.sh — régénère la branche deploiement-intranet à partir de master
#
# À lancer sur LE PC DE DÉVELOPPEMENT, depuis n'importe quel dossier du dépôt :
#   deploy/intranet-sans-docker/preparer-branche.sh             # prépare ET pousse
#   deploy/intranet-sans-docker/preparer-branche.sh --sans-envoi # prépare sans pousser (essai)
#
# 1. vérifie : on est sur master, l'arbre de travail est propre, master = origin/master ;
# 2. recrée deploiement-intranet depuis master (git checkout -B) ;
# 3. retire les chemins listés dans exclusions.txt ;
# 4. écrit le fichier VERSION (commit de master d'origine, date) ;
# 5. commit, git push --force-with-lease, puis retour sur master.
#
# master n'est JAMAIS modifié : seul le commit de la branche de déploiement est créé.
# La branche deploiement-intranet ne se modifie jamais à la main : relancer ce script.
# =============================================================================
set -euo pipefail

BRANCHE="deploiement-intranet"
SOURCE="master"
DISTANT="origin"
ENVOI=1
[ "${1:-}" = "--sans-envoi" ] && ENVOI=0

erreur() { echo "ERREUR : $*" >&2; exit 1; }
info()   { echo "==> $*"; }

RACINE="$(git rev-parse --show-toplevel)" || erreur "lancer ce script depuis le dépôt Git du projet."
cd "$RACINE"
EXCLUSIONS="deploy/intranet-sans-docker/exclusions.txt"

# --- 1. Vérifications ----------------------------------------------------------------
[ "$(git rev-parse --abbrev-ref HEAD)" = "$SOURCE" ] \
  || erreur "se placer d'abord sur $SOURCE (git checkout $SOURCE)."
[ -z "$(git status --porcelain)" ] \
  || erreur "l'arbre de travail n'est pas propre (git status) : committer ou mettre de côté les modifications."
[ -f "$EXCLUSIONS" ] || erreur "$EXCLUSIONS introuvable."

info "Récupération de ${DISTANT}…"
git fetch --quiet "$DISTANT"
LOCAL="$(git rev-parse "$SOURCE")"
DISTANT_SHA="$(git rev-parse "$DISTANT/$SOURCE")"
if [ "$LOCAL" != "$DISTANT_SHA" ]; then
  if git merge-base --is-ancestor "$LOCAL" "$DISTANT_SHA"; then
    erreur "$SOURCE est en retard sur $DISTANT/$SOURCE : faire git pull."
  else
    erreur "$SOURCE contient des commits non poussés (ou a divergé) : faire git push d'abord."
  fi
fi
COURT="$(git rev-parse --short "$LOCAL")"

# Quoi qu'il arrive (erreur comprise), on revient sur master avec un arbre propre.
retour_master() {
  if [ "$(git rev-parse --abbrev-ref HEAD)" != "$SOURCE" ]; then
    git checkout --quiet --force "$SOURCE"
  fi
}
trap retour_master EXIT

# --- 2. Branche recréée depuis master --------------------------------------------------
info "Branche $BRANCHE recréée depuis $SOURCE@$COURT"
git checkout --quiet -B "$BRANCHE" "$SOURCE"

# --- 3. Exclusions ---------------------------------------------------------------------
while IFS= read -r ligne || [ -n "$ligne" ]; do
  chemin="$(printf '%s' "$ligne" | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//')"
  case "$chemin" in ""|\#*) continue ;; esac
  case "$chemin" in
    deploy/intranet-sans-docker*|backend/apps|backend/config|frontend/src)
      erreur "exclusion interdite (indispensable au déploiement) : $chemin" ;;
  esac
  if [ -n "$(git ls-files -- "$chemin")" ]; then
    git rm -r --quiet -- "$chemin"
    echo "    retiré : $chemin"
  else
    echo "    (absent de $SOURCE, ignoré) : $chemin"
  fi
done < "$EXCLUSIONS"

# --- 4. VERSION ----------------------------------------------------------------------
{
  echo "branche=$BRANCHE"
  echo "source=$SOURCE@$LOCAL"
  echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Généré par deploy/intranet-sans-docker/preparer-branche.sh — ne pas modifier à la main."
} > VERSION
git add VERSION

# Contrôles : l'essentiel est présent, aucun fichier Docker n'est parti.
for indispensable in backend/manage.py backend/requirements/production.txt frontend/package.json \
                     frontend/package-lock.json deploy/intranet-sans-docker/mettre-a-jour.sh; do
  [ -n "$(git ls-files -- "$indispensable")" ] || erreur "fichier indispensable absent de la branche : $indispensable"
done
RESTES_DOCKER="$(git ls-files | grep -Ei '(^|/)(Dockerfile[^/]*|\.dockerignore|docker-compose[^/]*|docker-entrypoint\.sh)$' || true)"
if [ -n "$RESTES_DOCKER" ]; then
  echo "$RESTES_DOCKER" >&2
  erreur "des fichiers Docker restent dans la branche : compléter $EXCLUSIONS."
fi

# --- 5. Commit et envoi ---------------------------------------------------------------
git commit --quiet -m "deploiement: $SOURCE@$COURT" \
  -m "Branche générée par deploy/intranet-sans-docker/preparer-branche.sh depuis $SOURCE@$LOCAL. Ne pas modifier à la main."
info "Commit créé : $(git rev-parse --short HEAD) ($(git ls-files | wc -l | tr -d ' ') fichiers)"

if [ "$ENVOI" = 1 ]; then
  info "Envoi de $BRANCHE vers ${DISTANT}…"
  git push --quiet --force-with-lease "$DISTANT" "$BRANCHE"
  info "Terminé. Sur le serveur : ./app/deploy/intranet-sans-docker/mettre-a-jour.sh"
else
  info "Essai : branche préparée localement, NON envoyée (--sans-envoi)."
fi
