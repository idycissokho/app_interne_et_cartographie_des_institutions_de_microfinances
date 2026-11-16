# Démonstration en ligne — Neon + Render + Vercel

Déploiement **temporaire et gratuit**, pour que les collaborateurs voient l'application
et fassent leurs retours. La mise en production définitive se fera sur l'**intranet**
du ministère (Docker Compose + Nginx, dossier `infra/`), avec le **même code** :
seules les variables d'environnement changent.

| Rôle | Service | Ce qui y tourne |
|---|---|---|
| Base de données | Neon | PostgreSQL 16 + PostGIS |
| API Django | Render (Web Service Docker, offre gratuite) | `backend/Dockerfile.prod` |
| Interface React | Vercel | `frontend/` (build Vite) |

Le navigateur ne parle qu'à Vercel : Vercel relaie `/api/…` et `/media/…` vers Render
(`frontend/vercel.json`). Comme en local (proxy Vite) et sur l'intranet (Nginx),
le frontend appelle donc l'API en chemins relatifs, sans CORS.

---

## 1. Fichiers propres à la démo (à supprimer pour l'intranet)

| Fichier | Rôle |
|---|---|
| `render.yaml` | Blueprint Render : décrit le service web et la liste des variables à saisir. |
| `frontend/vercel.json` | Relais `/api` et `/media` vers Render + repli sur `index.html` (React Router). Contient l'adresse Render. |
| `deploy/demo/README.md` | Ce guide. |

Tout le reste est **commun** à la démo et à l'intranet (voir § 7).

## 2. Fichiers communs ajoutés ou modifiés

| Fichier | Rôle |
|---|---|
| `backend/Dockerfile.prod` | Image de production : `requirements/production.txt`, `config.settings.production`, `collectstatic`, Gunicorn sur `$PORT` (8000 par défaut), utilisateur non root. Le `Dockerfile` de développement reste celui de Docker Compose. |
| `backend/docker-entrypoint.sh` | Au démarrage : migrations (`MIGRER_AU_DEMARRAGE`), compte administrateur si `DJANGO_ADMIN_*` sont définies, puis Gunicorn. |
| `backend/.dockerignore` | Garde hors de l'image les secrets (`.env`) et les données réelles (`mediafiles/`). |
| `backend/config/settings/base.py` | `DATABASE_URL` (prioritaire, moteur PostGIS imposé, `?sslmode=require` transmis) ou `DB_*` comme avant ; options `DJANGO_SERVIR_MEDIAS` et `DJANGO_DONNEES_FICTIVES` (désactivées par défaut). |
| `backend/config/settings/production.py` | Retire en plus toute application de débogage. Le reste (DEBUG=False, HTTPS, CORS, WhiteNoise) existait déjà et lit l'environnement. |
| `backend/requirements/base.txt` | `django-debug-toolbar` retiré (il reste dans `development.txt`) : il n'est plus installé en production. |
| `backend/pyproject.toml` | Python 3.11, comme l'image Docker. |
| `backend/config/sante.py`, `config/urls.py` | `GET /api/v1/sante/` : répond `{"statut": "ok"}` sans connexion, sans donnée ni accès à la base (réveil et supervision). Service optionnel de `/media/`. |
| `backend/apps/authentication/management/commands/creer_admin.py` | Crée l'administrateur depuis `DJANGO_ADMIN_EMAIL` / `DJANGO_ADMIN_PASSWORD`. |
| `backend/apps/dirigeants/anonymisation.py` et commande `anonymiser_dirigeants` | Remplace noms, téléphones, e-mails et adresses des dirigeants par des données fictives, y compris leurs copies dans le journal d'audit et les rapports d'import. |
| `backend/apps/importation/processors.py` | Avec `DJANGO_DONNEES_FICTIVES=true`, tout import de dirigeants est aussitôt anonymisé. |
| `frontend/src/api/client.ts` | Serveur en cours de démarrage (502/503/504 ou pas de réponse) : attente jusqu'à 2 min au lieu d'une erreur. |
| `frontend/src/components/AvisSysteme.tsx`, `App.tsx`, `main.tsx`, `styles/global.css` | Message « Démarrage du serveur, merci de patienter… » et bandeau « Version de démonstration » (`VITE_DEMO=true`). |
| `.gitignore` (racine) | Le fichier existant est dans `config/` et ne protège que ce dossier ; celui-ci s'applique à tout le dépôt. |
| `backend/.env.example` | Documente les nouvelles variables. |

## 3. Mise en ligne, dans l'ordre

### 3.1 Neon (base de données)

1. Créer un projet : PostgreSQL 16, région **AWS Europe Central 1 (Frankfurt)**.
2. *SQL Editor* : `CREATE EXTENSION IF NOT EXISTS postgis;`
   (Django tente aussi de la créer à la première migration.)
3. *Connect* : **désactiver « Connection pooling »**, puis copier la chaîne de connexion :
   `postgresql://neondb_owner:…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   C'est la valeur de `DATABASE_URL`. Elle contient le mot de passe : ne la collez que dans Render (ou dans votre terminal).

### 3.2 Render (API)

1. *New* → *Blueprint* → choisir le dépôt et **la branche à montrer** → Render lit `render.yaml`.
2. Saisir les variables demandées (tableau § 4).
3. Premier déploiement : construction de l'image (≈ 5 min), puis migrations et création de
   l'administrateur au démarrage (voir les *Logs*).
4. Contrôle : `https://cartographie-imf-api.onrender.com/api/v1/sante/` → `{"statut": "ok"}`.

Si Render attribue une autre adresse que `cartographie-imf-api.onrender.com` (nom déjà pris),
reportez-la dans `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` **et** `frontend/vercel.json`.

### 3.3 Vercel (interface)

1. *Add New* → *Project* → choisir le dépôt, **Root Directory : `frontend`**.
   `vercel.json` fixe le reste (Vite, `npm ci`, `npm run build`, dossier `dist`).
2. *Environment Variables* : `VITE_DEMO` = `true`.
3. *Deploy*. Une fois l'adresse connue (`https://<projet>.vercel.app`), la reporter dans Render
   (`DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`) : Render redéploie seul.

## 4. Variables à saisir

**Neon** : rien à saisir ; on en retire seulement `DATABASE_URL`.

**Render** (service `cartographie-imf-api`) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | chaîne Neon **non poolée**, avec `?sslmode=require` |
| `DJANGO_SECRET_KEY` | générée par Render (ne rien saisir) |
| `DJANGO_ALLOWED_HOSTS` | `cartographie-imf-api.onrender.com` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://cartographie-imf-api.onrender.com,https://<projet>.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | `https://<projet>.vercel.app` |
| `DJANGO_ADMIN_EMAIL` | adresse de connexion de l'administrateur |
| `DJANGO_ADMIN_PASSWORD` | mot de passe robuste (12 caractères ou plus, refusé s'il est trop simple) |
| `DJANGO_TRUST_X_FORWARDED_PROTO` | `true` (déjà dans `render.yaml`) |
| `DJANGO_DONNEES_FICTIVES` | `true` (déjà dans `render.yaml`) |
| `DJANGO_SERVIR_MEDIAS` | `false` (déjà dans `render.yaml`, voir § 6) |
| `WEB_CONCURRENCY` | `1` (déjà dans `render.yaml`) |

**Vercel** : `VITE_DEMO` = `true`.

## 5. Une fois en ligne : migrations, administrateur, données

**Migrations et administrateur** : automatiques à chaque démarrage du service Render
(`docker-entrypoint.sh`). L'offre gratuite de Render ne donne ni console (*Shell*) ni
commande de pré-déploiement : les autres commandes se lancent **depuis votre poste**,
avec l'image locale de Docker Compose, en visant la base Neon par `DATABASE_URL`.

```bash
# Depuis la racine du projet. Remplacer la chaîne par celle de Neon (entre guillemets).
export NEON_URL='postgresql://neondb_owner:…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require'

# 1. (facultatif, déjà fait par Render au démarrage) migrations
docker compose -f infra/docker-compose.yml run --rm --no-deps -e DATABASE_URL="$NEON_URL" \
  backend python manage.py migrate

# 2. Données : régions, IMF, points de service, dirigeants (annuaire DRS-SFD), ≈ 1 min.
#    Le classeur est monté dans le conteneur (-v) : remplacer le chemin à gauche du « : ».
#    DJANGO_DONNEES_FICTIVES=true : les dirigeants sont anonymisés dès leur import.
docker compose -f infra/docker-compose.yml run --rm --no-deps \
  -e DATABASE_URL="$NEON_URL" -e DJANGO_DONNEES_FICTIVES=true \
  -v "$PWD/backend/mediafiles/importations/<annuaire>.xlsx:/tmp/annuaire.xlsx:ro" \
  backend python manage.py charger_annuaire /tmp/annuaire.xlsx

# 3. Vérification : anonymiser à nouveau (sans effet si c'est déjà fait).
docker compose -f infra/docker-compose.yml run --rm --no-deps -e DATABASE_URL="$NEON_URL" \
  backend python manage.py anonymiser_dirigeants --confirmer

# 4. (si besoin) nouveau mot de passe administrateur, sans l'écrire dans la commande
read -s DJANGO_ADMIN_PASSWORD && export DJANGO_ADMIN_PASSWORD
docker compose -f infra/docker-compose.yml run --rm --no-deps -e DATABASE_URL="$NEON_URL" \
  -e DJANGO_ADMIN_EMAIL='admin@…' -e DJANGO_ADMIN_PASSWORD \
  backend python manage.py creer_admin --reinitialiser-mot-de-passe
```

Le classeur doit être monté avec `-v` : dans Docker Compose, `/app/mediafiles` est un volume
Docker qui masque le dossier `backend/mediafiles/` du poste.

**Un seul chargement** : une fois anonymisés, les dirigeants ne portent plus les noms du classeur.
Recharger le même fichier créerait des doublons. Pour recommencer, repartir d'une base Neon vide
(*Branches → Reset* ou nouvelle base), puis redémarrer le service Render pour qu'il refasse les migrations.

Après un chargement de données, **redémarrez le service Render** (*Manual Deploy → Restart service*) :
son cache de 10 minutes ne voit pas les changements faits depuis votre poste.

`anonymiser_dirigeants` est **irréversible** : elle affiche la base visée et exige `--confirmer`.
Ne jamais la lancer sur la base de l'intranet.

## 6. Limites de l'offre gratuite (à dire aux collaborateurs)

- **Mise en veille** : sans visite pendant 15 min, Render arrête le service. La visite suivante
  attend son redémarrage (jusqu'à une minute) : l'interface affiche
  « Démarrage du serveur, merci de patienter… », puis continue seule.
- **Fichiers déposés éphémères** : justificatifs et fichiers d'import sont effacés à chaque
  redémarrage du service. Les données en base (Neon), elles, sont conservées.
- **Justificatifs non consultables** : `DJANGO_SERVIR_MEDIAS=false`, car les servir rendrait
  ces fichiers lisibles sans connexion par qui connaît leur adresse. Les liens « Justificatif »
  répondent donc « introuvable » sur la démo.
- **Imports volumineux par l'interface** : la requête passe par le relais Vercel, dont le délai
  est limité. Pour l'annuaire complet, préférer la commande du § 5.
- Un classeur importé **par l'interface** est conservé sur le disque de Render jusqu'au
  redémarrage suivant (non publié, car `DJANGO_SERVIR_MEDIAS=false`). Seule la copie de
  l'import « Dirigeants » est effacée aussitôt. Le chargement par la commande du § 5 n'en laisse aucune.
- Base Neon gratuite : 0,5 Go, mise en veille après 5 min d'inactivité (réveil en quelques secondes).

## 7. Vérifications après mise en ligne

- [ ] `https://<projet>.vercel.app` affiche la connexion et le bandeau « Version de démonstration ».
- [ ] Sans être connecté, `https://<projet>.vercel.app/api/v1/imf/` répond **401** ;
      `…/api/v1/sante/` répond `{"statut": "ok"}`.
- [ ] Connexion avec `DJANGO_ADMIN_EMAIL` → tableau de bord avec les chiffres de la base.
- [ ] Après 15 min sans visite : rechargement → message de démarrage, puis la page s'affiche.
- [ ] Carte micro : fond de carte et points ; carte macro : régions colorées, fiche au survol.
- [ ] Dirigeants : noms et e-mails fictifs (`…@example.com`), téléphones `+221 00 000 …`.
- [ ] Import / Export : export CSV des IMF téléchargé ; import d'un petit fichier de points de service.
- [ ] Rechargement (F5) sur `/dirigeants?imf=…` et `/carte/macro` : la page se recharge, pas d'erreur 404.
- [ ] Journal d'audit : la connexion et les consultations y figurent.

## 8. Passage à l'intranet

À **supprimer** : `render.yaml`, `frontend/vercel.json`, `deploy/demo/` ; sur Render, Vercel et Neon,
supprimer les projets (la base Neon contient une copie des IMF et points de service).

À **ne pas reprendre** de la démo : `DJANGO_DONNEES_FICTIVES` (laisser `false`, valeur par défaut),
`DJANGO_SERVIR_MEDIAS` (`false` : Nginx sert `/media/`), `VITE_DEMO` (absent : pas de bandeau),
`WEB_CONCURRENCY=1`.

À **renseigner** dans `config/.env` de l'intranet :

| Variable | Valeur sur l'intranet |
|---|---|
| `DATABASE_URL` | vide (on garde `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST=db`…) ou l'URL du serveur PostgreSQL du ministère |
| `DJANGO_SECRET_KEY` | nouvelle clé, propre à l'intranet |
| `DJANGO_ALLOWED_HOSTS` | nom(s) du serveur intranet |
| `DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | adresse(s) de l'intranet (`https://…` ou `http://…`) |
| `DJANGO_ADMIN_EMAIL`, `DJANGO_ADMIN_PASSWORD` | compte administrateur de l'intranet (ou vides après sa création) |
| `DJANGO_TRUST_X_FORWARDED_PROTO` | `true` si Nginx transmet `X-Forwarded-Proto` (c'est le cas de `infra/docker/nginx/nginx.conf`) |
| `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SECURE_HSTS_SECONDS` | si l'intranet est en **HTTP sans certificat** : `false` et `0`, sinon Django redirige vers HTTPS |

Côté `infra/` (non modifié pour la démo) : pour l'intranet, le service `backend` devra être construit
avec `dockerfile: Dockerfile.prod` (Gunicorn au lieu de `runserver`), et l'interface servie par Nginx
après `npm run build` (sans `VITE_DEMO`). Le Docker Compose de développement reste inchangé.
