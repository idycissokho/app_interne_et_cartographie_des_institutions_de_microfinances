# Carto IMF — Installation sur le serveur intranet, sans Docker

Ce guide installe l'application sur le serveur intranet **srv2** (Debian 12) sans Docker :
PostgreSQL + PostGIS du serveur, Django servi par Gunicorn (service systemd), interface React
compilée, Apache en façade sur le port **8443** (HTTPS). Les autres sites du serveur (Apache sur
80/443, nginx sur 81) ne sont jamais modifiés.

Chaque commande indique **qui** la lance :

| Repère | Qui | Où |
|---|---|---|
| **[ADMINISTRATEUR]** | l'administrateur du serveur (root) | srv2 |
| **[deploy_app]** | toi, connecté en SSH avec le compte `deploy_app` (sans sudo) | srv2 |
| **[MON PC]** | toi, sur le poste de développement | dépôt Git du projet |

```
Postes de l'intranet ──HTTPS :8443──▶ Apache (VirtualHost carto-imf)
                                        ├─ /                      → /var/www/annuairedesimf/frontend   (interface React)
                                        ├─ /api/ /admin/ /static/ → Gunicorn 127.0.0.1:8000 → PostgreSQL + PostGIS (localhost:5432)
                                        └─ /media/justificatifs/  → /var/www/annuairedesimf/media/justificatifs
```

**Organisation sur le serveur**

```
/var/www/annuairedesimf/            (deploy_app:www-data, droits 2750)
├── app/                       clone de la branche deploiement-intranet (jamais servi par Apache)
│   └── config/.env.production réglages et secrets (chmod 600, jamais versionné)
├── venv/                      environnement Python 3.11
├── frontend/                  interface compilée : SEUL dossier servi comme DocumentRoot
├── frontend.precedent/        interface de la version précédente (retour arrière)
├── media/                     fichiers déposés (justificatifs/ servis, importations/ jamais servis)
├── logs/gunicorn.log          journal de l'application
└── sauvegardes/               copies de la base faites avant chaque mise à jour
```

**Branches Git.** `master` est la branche de travail complète (Docker, démo, maquette, tests,
CI…). La branche **`deploiement-intranet`** ne contient que le nécessaire à ce serveur : elle est
**régénérée** depuis master par `preparer-branche.sh` (§ b) et ne se modifie **jamais** à la main.
Le serveur ne fait que la récupérer.

## Sommaire

a. [Prérequis à demander à l'administrateur](#a-prérequis-à-demander-à-ladministrateur) ·
b. [Préparer la branche de déploiement](#b-préparer-la-branche-de-déploiement) ·
c. [Accès au dépôt et récupération du code](#c-accès-au-dépôt-et-récupération-du-code) ·
d. [Environnement Python](#d-environnement-python) ·
e. [Réglages](#e-réglages--configenvproduction) ·
f. [Vérifier la base et PostGIS](#f-vérifier-la-base-et-postgis) ·
g. [Initialiser la base et charger la liste des IMF](#g-initialiser-la-base-et-charger-la-liste-officielle-des-imf) ·
h. [Interface (frontend)](#h-interface-frontend) ·
i. [Service Gunicorn](#i-service-gunicorn-systemd) ·
j. [Site Apache](#j-site-apache) ·
k. [Vérifications](#k-liste-de-vérification) ·
l. [Mise à jour](#l-mise-à-jour) ·
m. [Retour arrière](#m-retour-arrière) ·
n. [Dépannage](#n-dépannage) ·
o. [Itinéraire](#o-section-itinéraire)

---

## a. Prérequis à demander à l'administrateur

Tout ce qui demande root est regroupé ici et aux § i et j. Un message prêt à envoyer reprend
l'ensemble dans l'ordre (voir la fin de ce guide : [Message à l'administrateur](#message-à-ladministrateur)).

**1. Paquets** **[ADMINISTRATEUR]** — PostGIS pour la version de PostgreSQL installée (15 sur
Debian 12), bibliothèques géographiques utilisées par Django (GDAL, GEOS, PROJ), client
PostgreSQL et environnement virtuel Python :

```bash
psql --version          # doit afficher 15.x ; sinon remplacer 15 par la version affichée ci-dessous
```

```bash
apt update
apt install -y postgresql-15-postgis-3 gdal-bin libgdal32 libgeos-c1v5 libproj25 libpq5 postgresql-client python3-venv
```

Aucun compilateur n'est nécessaire : les paquets Python s'installent déjà compilés.

**2. Extension PostGIS dans la base de l'application** **[ADMINISTRATEUR]** (remplacer `<base>`) :

```bash
sudo -u postgres psql -d <base> -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

```bash
sudo -u postgres psql -d <base> -c "SELECT postgis_full_version();"
```

L'utilisateur de la base doit en être propriétaire (ou avoir le droit de créer des tables dans le
schéma `public`).

**3. Ports** **[ADMINISTRATEUR]** — 8443 (site, HTTPS) et 8000 (Gunicorn, local) doivent être libres ;
8443 doit être ouvert aux postes de l'intranet sur le pare-feu :

```bash
ss -tlnp | grep -E ':(8000|8443)\s' || echo "ports libres"
```

**4. Certificat HTTPS** — au départ, le certificat d'essai de Debian (`ssl-cert-snakeoil`, déjà
utilisé par Apache) : les navigateurs afficheront un avertissement. Dès que l'informatique fournit
un certificat de l'autorité interne pour l'adresse du serveur, l'administrateur remplace les deux
lignes `SSLCertificate…` de `/etc/apache2/sites-available/carto-imf.conf` et recharge Apache.

**5. Module `proxy_http`, service, droits de redémarrage, site Apache** : § i et § j.

---

## b. Préparer la branche de déploiement

**[MON PC]** — sur master, à jour et poussé (la CI GitHub doit être verte) :

```bash
git checkout master
git pull
```

```bash
deploy/intranet-sans-docker/preparer-branche.sh
```

Le script vérifie que l'arbre de travail est propre et que master est identique à `origin/master`,
recrée `deploiement-intranet` depuis master, retire les chemins de
[`exclusions.txt`](exclusions.txt), ajoute un fichier `VERSION` (commit de master d'origine),
pousse la branche, puis revient sur master. Il s'arrête à la moindre erreur.

Pour un essai sans rien envoyer : `deploy/intranet-sans-docker/preparer-branche.sh --sans-envoi`
(puis `git branch -D deploiement-intranet` pour effacer la branche locale d'essai).

Pour retirer (ou garder) un fichier dans la branche : modifier `exclusions.txt` **sur master**,
committer, pousser, relancer le script.

---

## c. Accès au dépôt et récupération du code

**1. Clé de déploiement (lecture seule)** **[deploy_app]**

```bash
ssh-keygen -t ed25519 -C "srv2-carto-imf" -f ~/.ssh/id_ed25519 -N ""
```

```bash
cat ~/.ssh/id_ed25519.pub
```

**[MON PC]** Sur GitHub : dépôt du projet → *Settings* → *Deploy keys* → *Add deploy key* →
titre `srv2`, coller la ligne affichée, **ne pas** cocher *Allow write access* → *Add key*.

**[deploy_app]** Vérifier (répondre `yes` à la première question) :

```bash
ssh -T git@github.com
```

Réponse attendue : `Hi …! You've successfully authenticated, but GitHub does not provide shell access.`

**2. Récupérer la branche** **[deploy_app]**

```bash
cd /var/www/annuairedesimf
rm -f test.txt
git clone --branch deploiement-intranet --single-branch git@github.com:idycissokho/app_interne_et_cartographie_des_institutions_de_microfinances.git app
```

```bash
cat app/VERSION
```

**3. Dossiers de l'application** **[deploy_app]**

```bash
cd /var/www/annuairedesimf
mkdir -p media/justificatifs media/importations logs sauvegardes app/config
touch logs/gunicorn.log
ls -la
```

Chaque dossier doit appartenir à `deploy_app`, groupe **`www-data`**, avec un **`s`** dans les droits
(`drwxr-sr-x`) : il l'hérite tout seul de `/var/www/annuairedesimf`, et les fichiers créés ensuite
prennent le groupe `www-data`, ce qui permet à Apache de lire l'interface et les justificatifs.
Les autres comptes du serveur n'y ont pas accès : `/var/www/annuairedesimf` (2750) leur est fermé.

> **Ne pas lancer `chmod` sur ces dossiers** avec le compte deploy_app : comme deploy_app n'est pas
> membre du groupe `www-data`, Linux retire alors le `s`, et les nouveaux fichiers ne seraient plus
> lisibles par Apache (erreur 403). Si c'est arrivé : supprimer le dossier vide et le recréer avec
> `mkdir`.

---

## d. Environnement Python

**[deploy_app]**

```bash
cd /var/www/annuairedesimf
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r app/backend/requirements/production.txt
```

Erreur `ensurepip is not available` : le paquet `python3-venv` manque (§ a.1).

---

## e. Réglages : config/.env.production

**1. Créer le fichier** **[deploy_app]**

```bash
cd /var/www/annuairedesimf/app
cp deploy/intranet-sans-docker/env.production.example config/.env.production
chmod 600 config/.env.production
```

**2. Générer la clé secrète** **[deploy_app]** (à copier dans `DJANGO_SECRET_KEY`) :

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

**3. Compléter** **[deploy_app]** : remplacer chaque valeur entre `< >`.

```bash
nano config/.env.production
```

| Variable | Valeur |
|---|---|
| `DJANGO_SECRET_KEY` | la clé générée ; ne plus jamais la changer (elle signe les sessions) |
| `DJANGO_ALLOWED_HOSTS` | `10.233.225.2` (adresse tapée par les postes, sans le port ; plusieurs : séparées par `,`) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://10.233.225.2:8443` (même adresse, avec `https://` et le port) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | fournis par l'administrateur ; `DB_HOST=localhost` |
| `DJANGO_MEDIA_ROOT` | `/var/www/annuairedesimf/media` (déjà rempli) |
| `DJANGO_TRUST_X_FORWARDED_PROTO` | `true` (Apache termine le HTTPS) |
| `DJANGO_ADMIN_EMAIL`, `DJANGO_ADMIN_PASSWORD` | premier compte administrateur (12 caractères au moins, chiffres, majuscules, symboles) |
| `ROUTING_URL` | vide (§ o) |
| `DJANGO_DONNEES_FICTIVES` | `false` : données réelles |

Vérifier qu'il ne reste aucune valeur à remplacer (aucune ligne ne doit s'afficher) :

```bash
grep -E '^[A-Z_]+=<' config/.env.production
```

**4. Raccourcis pour les commandes Django** **[deploy_app]** (une seule fois) : les commandes
`manage.py` lisent ainsi le même fichier de réglages que Gunicorn.

```bash
cat >> ~/.profile <<'EOF'

# --- Carto IMF : réglages de production pour manage.py ---
export DJANGO_SETTINGS_MODULE=config.settings.production
export DJANGO_ENV_FILE=/var/www/annuairedesimf/app/config/.env.production
carto-manage() { (cd /var/www/annuairedesimf/app/backend && /var/www/annuairedesimf/venv/bin/python manage.py "$@"); }
EOF
```

```bash
source ~/.profile
echo "$DJANGO_ENV_FILE"
```

(`~/.profile` et non `~/.bashrc` : sous Debian, `~/.bashrc` est ignoré par les sessions non interactives.)

> Raccourci : `carto-manage <commande>` équivaut à `python manage.py <commande>`, depuis n'importe
> quel dossier (ex. `carto-manage showmigrations`, `carto-manage changepassword <email>`). La suite
> du guide donne la forme longue, qui marche aussi sans ce raccourci.

---

## f. Vérifier la base et PostGIS

**[deploy_app]** — connexion à la base avec les identifiants du fichier de réglages (le mot de passe est demandé) :

```bash
psql -h localhost -U <utilisateur-de-la-base> -d <nom-de-la-base> -c "SELECT postgis_full_version();"
```

Doit afficher `POSTGIS="3.x…"`. Sinon : § a.2.

Django, GDAL et la configuration de production :

```bash
cd /var/www/annuairedesimf/app/backend
../../venv/bin/python manage.py check --deploy --fail-level ERROR > /dev/null 2>&1 && echo "Configuration OK" || ../../venv/bin/python manage.py check --deploy --fail-level ERROR
```

```bash
../../venv/bin/python -c "import django; django.setup(); from django.contrib.gis.gdal import gdal_version; print('GDAL', gdal_version().decode())"
```

`check --deploy` ne doit afficher **aucune erreur** (les avertissements `drf_spectacular` et
`security.W004/W005/W021` liés à HSTS sont attendus : HSTS est volontairement désactivé, § n).

---

## g. Initialiser la base et charger la liste officielle des IMF

**1. Tables, référentiel géographique, compte administrateur, fichiers statiques** **[deploy_app]**

```bash
cd /var/www/annuairedesimf/app/backend
../../venv/bin/python manage.py migrate --noinput
```

```bash
../../venv/bin/python manage.py charger_regions
../../venv/bin/python manage.py charger_departements
```

Attendu : `Régions : 14 créée(s)` et `Départements : 46 créé(s)`.

```bash
../../venv/bin/python manage.py creer_admin --si-configure
```

```bash
../../venv/bin/python manage.py collectstatic --noinput
```

**2. Liste officielle des IMF** — deux façons, au choix :

*Par l'interface (recommandé, une fois le site en ligne, § k)* : *Import / Export* → *Institutions*
→ déposer le classeur `LISTE IMF 2025 ok.xlsx` tel quel.

*Par la commande* : copier le classeur sur le serveur **[MON PC]** (adapter le chemin local) :

```bash
scp "backend/mediafiles/LISTE IMF 2025 ok.xlsx" deploy_app@10.233.225.2:/var/www/annuairedesimf/app/backend/donnees_initiales/
```

puis l'importer **[deploy_app]** :

```bash
cd /var/www/annuairedesimf/app/backend
../../venv/bin/python manage.py initialiser_donnees
```

Résultat attendu avec la liste 2025 : 300 institutions et 300 sièges, environ 2 100 mandats,
0 ligne rejetée ; les valeurs écartées (GPS hors du Sénégal, nom sans prénom…) sont listées dans
`donnees_initiales/rapport_import_….csv`. Supprimer ensuite le classeur (données réelles) :

```bash
rm /var/www/annuairedesimf/app/backend/donnees_initiales/*.xlsx
```

---

## h. Interface (frontend)

Le Node du serveur (v20) est trop ancien : la compilation demande **Node 22**. Trois possibilités :

| Option | Avantages | Inconvénients |
|---|---|---|
| **1. Node 22 installé par deploy_app avec nvm (recommandé)** | Aucun droit root ; la mise à jour se fait en une commande (`mettre-a-jour.sh` compile tout seul) | Node dans le dossier personnel de deploy_app |
| 2. Compiler sur le PC et copier `dist/` par `scp` | Rien à installer sur le serveur | Une étape manuelle à chaque mise à jour |
| 3. Node 22 installé par l'administrateur (dépôt NodeSource) | Node pour tout le serveur | Demande root ; risque pour les autres applications qui utilisent le Node actuel |

**Option 1 (recommandée)** **[deploy_app]**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
node --version
```

```bash
cd /var/www/annuairedesimf/app/frontend
npm ci --no-audit --no-fund
npm run build
```

Mise en ligne (copie dans le dossier servi par Apache) :

```bash
cd /var/www/annuairedesimf
rm -rf frontend && cp -R app/frontend/dist frontend
```

**Option 2** — **[MON PC]** compiler puis copier :

```bash
cd frontend && npm ci && npm run build
scp -r dist deploy_app@10.233.225.2:/var/www/annuairedesimf/dist-recu
```

**[deploy_app]** : à l'installation, `rm -rf frontend && cp -R dist-recu frontend && rm -rf dist-recu` ;
pour une mise à jour : `app/deploy/intranet-sans-docker/mettre-a-jour.sh --frontend-compile /var/www/annuairedesimf/dist-recu`.

---

## i. Service Gunicorn (systemd)

**1. Installation** **[ADMINISTRATEUR]** (une fois que deploy_app a terminé les § c à g) :

```bash
cp /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf-gunicorn.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now carto-imf-gunicorn
systemctl status carto-imf-gunicorn --no-pager
```

**2. Droit de redémarrage pour deploy_app, limité à ce service** **[ADMINISTRATEUR]** — nécessaire
aux mises à jour (§ l) ; deploy_app ne reçoit aucun autre droit :

```bash
install -m 440 -o root -g root /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.sudoers /etc/sudoers.d/carto-imf
visudo -cf /etc/sudoers.d/carto-imf
```

**3. Rotation du journal (recommandé)** **[ADMINISTRATEUR]**

```bash
install -m 644 -o root -g root /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.logrotate /etc/logrotate.d/carto-imf
logrotate -d /etc/logrotate.d/carto-imf
```

**4. Commandes courantes** **[deploy_app]**

```bash
systemctl status carto-imf-gunicorn
sudo systemctl restart carto-imf-gunicorn
sudo systemctl stop carto-imf-gunicorn
sudo systemctl start carto-imf-gunicorn
```

La règle sudoers n'autorise que ces commandes **exactes** : sans option ajoutée (pas de
`--no-pager`, par exemple) et pour ce seul service. `systemctl status` se lit aussi sans sudo.

```bash
tail -n 100 -f /var/www/annuairedesimf/logs/gunicorn.log
```

Contrôle direct de Gunicorn (sans Apache) :

```bash
curl -s -H "Host: 10.233.225.2" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/api/v1/sante/
```

Attendu : `{"statut": "ok"}`.

---

## j. Site Apache

**[ADMINISTRATEUR]** — site autonome sur le port 8443 ; aucun fichier des autres sites n'est modifié.

```bash
cp /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.apache.conf /etc/apache2/sites-available/carto-imf.conf
a2enmod proxy proxy_http headers ssl
a2ensite carto-imf
```

Vérifier **avant** de recharger (doit afficher `Syntax OK`) :

```bash
apache2ctl configtest
```

```bash
systemctl reload apache2
sleep 3; ss -tlnp | grep ':8443'
```

En cas d'erreur au `configtest`, ne pas recharger : `a2dissite carto-imf` remet Apache dans son
état précédent.

**Nom affiché** : le site répond sous `annuaireimf.drs-sfd.gouv.sn`, et un accès par l'adresse IP est
renvoyé vers ce nom (même page). Le nom doit donc exister dans le DNS interne **avant** d'installer
ou de recharger ce fichier, sinon les postes ne joignent plus le site. Le nom figure aussi dans
`DJANGO_ALLOWED_HOSTS` et `DJANGO_CSRF_TRUSTED_ORIGINS` (§ e). Mise à jour du fichier sur un
serveur déjà installé **[ADMINISTRATEUR]** :

```bash
cp /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.apache.conf /etc/apache2/sites-available/carto-imf.conf
apache2ctl configtest
systemctl reload apache2
```

---

## k. Liste de vérification

Depuis un poste de l'intranet (accepter l'avertissement du certificat tant que c'est `snakeoil`) :

- [ ] `https://10.233.225.2:8443/api/v1/sante/` → `{"statut": "ok"}`
- [ ] `https://annuaireimf.drs-sfd.gouv.sn:8443/` → page de connexion (et `https://10.233.225.2:8443/` y renvoie) ; connexion avec le compte administrateur
- [ ] Tableau de bord, *Carte macro*, *Carte micro* : les régions et les points s'affichent
      (le fond de carte vient d'Internet : sans accès Internet sur le poste, fond uni)
- [ ] Ouvrir `https://10.233.225.2:8443/imf` puis **recharger la page** (F5) : la page s'affiche
      (pas d'erreur 404)
- [ ] *Import / Export* → *Institutions* → importer la liste officielle → rapport 300/300
- [ ] Fiche d'un dirigeant → ajouter un mandat avec un **justificatif PDF**, puis l'ouvrir par son lien
- [ ] `https://10.233.225.2:8443/media/importations/` → **403** (fichiers importés jamais servis)
- [ ] `https://10.233.225.2:8443/admin/` → connexion à l'administration Django (création des comptes)

Comptes des agents : administration Django → *Utilisateurs* → *Ajouter* (adresse, nom, prénom,
mot de passe, **rôle** : Consultant, Superviseur ou Administrateur).

---

## l. Mise à jour

**1. [MON PC]** — travailler sur master (ou une branche fusionnée dans master), puis :

```bash
git checkout master
git pull
git push
```

Attendre que l'intégration continue GitHub soit **verte** (onglet *Actions*), puis :

```bash
deploy/intranet-sans-docker/preparer-branche.sh
```

**2. [deploy_app]** — un seul script fait tout :

```bash
/var/www/annuairedesimf/app/deploy/intranet-sans-docker/mettre-a-jour.sh
```

Il enchaîne : sauvegarde de la base (`sauvegardes/carto-imf-AAAAMMJJ-HHMMSS.dump`, conservées
30 jours) → `git fetch` + `git reset --hard origin/deploiement-intranet` → dépendances Python →
compilation de l'interface → `migrate`, régions, départements, compte administrateur,
`collectstatic` → mise en ligne de l'interface (l'ancienne est gardée dans `frontend.precedent/`)
→ redémarrage de Gunicorn → contrôle de santé. Il s'arrête à la première erreur.

Jamais touchés : `app/config/.env.production`, `media/`, `venv/`, `logs/`, `sauvegardes/`
(`git reset --hard` ne supprime pas les fichiers ignorés par Git). Ne **jamais** lancer
`git clean -x` dans `app/` : il effacerait `config/.env.production`.

Les postes récupèrent la nouvelle interface au prochain chargement de la page.

---

## m. Retour arrière

Le script note la version précédente dans `logs/version-precedente.txt`. **[deploy_app]**

**1. Code et interface précédents**

```bash
cd /var/www/annuairedesimf/app
git reset --hard "$(cat ../logs/version-precedente.txt)"
../venv/bin/pip install -r backend/requirements/production.txt
```

```bash
cd /var/www/annuairedesimf
mv frontend frontend.annule && mv frontend.precedent frontend && rm -rf frontend.annule
```

**2. Base** — seulement si la mise à jour contenait des migrations (le script affiche
`Applying …` à l'étape « Migrations ») : restaurer la sauvegarde faite juste avant, service arrêté.

```bash
sudo systemctl stop carto-imf-gunicorn
ls -t /var/www/annuairedesimf/sauvegardes/ | head -3
```

```bash
pg_restore -h localhost -U <utilisateur-de-la-base> -d <nom-de-la-base> --clean --if-exists --no-owner /var/www/annuairedesimf/sauvegardes/carto-imf-AAAAMMJJ-HHMMSS.dump
```

**3. Redémarrer**

```bash
sudo systemctl restart carto-imf-gunicorn
```

Le retour arrière est provisoire : corriger sur master, puis refaire une mise à jour (§ l).

---

## n. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Could not find the GDAL library` / `OSError: libgdal…` | Bibliothèques géographiques absentes | § a.1 (`gdal-bin libgdal32 libgeos-c1v5 libproj25`) |
| `type "geography" does not exist` ou `extension "postgis" … not available` au `migrate` | PostGIS absent de la base | § a.2 (`CREATE EXTENSION postgis` par l'administrateur) |
| `DJANGO_ENV_FILE : fichier introuvable` | Chemin du fichier de réglages | Vérifier `app/config/.env.production` (§ e) |
| `ImproperlyConfigured: Set the DJANGO_SECRET_KEY …` ou `No module named 'debug_toolbar'` | Réglages de production non chargés (commande lancée sans § e.4) | `echo $DJANGO_ENV_FILE` doit afficher le chemin ; sinon `source ~/.profile` (§ e.4) |
| **502 / 503 Proxy Error** | Gunicorn arrêté ou en échec | `sudo systemctl status carto-imf-gunicorn` ; `tail -n 50 logs/gunicorn.log` |
| **400 Bad Request** | Adresse absente de `DJANGO_ALLOWED_HOSTS` | Corriger `config/.env.production`, puis `sudo systemctl restart carto-imf-gunicorn` |
| Connexion à `/admin/` refusée : **CSRF** | `DJANGO_CSRF_TRUSTED_ORIGINS` sans `https://` ou sans `:8443` | Mettre l'adresse exacte, puis redémarrer |
| Boucle de redirections / page en HTTP | En-tête `X-Forwarded-Proto` non transmis | `DJANGO_TRUST_X_FORWARDED_PROTO=true` ; `a2enmod headers` ; ligne `RequestHeader` du site Apache |
| **403** sur l'interface ou un justificatif | Apache (www-data) ne peut pas lire : fichiers sans le groupe `www-data` | `ls -la /var/www/annuairedesimf /var/www/annuairedesimf/frontend` : groupe `www-data` et `s` dans les droits des dossiers (§ c.3). Sinon, l'administrateur rétablit : `chgrp -R www-data /var/www/annuairedesimf && find /var/www/annuairedesimf -type d -exec chmod g+s {} +` |
| **404** en rechargeant `/imf` | Repli vers `index.html` absent | `FallbackResource /index.html` dans le site Apache |
| Import resté « en cours » | Gunicorn redémarré pendant l'import | Il passe en échec après 10 minutes ; relancer l'import |
| `redémarrage refusé` dans `mettre-a-jour.sh` | Règle sudoers absente | § i.2 |
| `Node 22 requis` | Node absent ou trop ancien | § h (nvm) |
| `check --deploy` : avertissements W004/W005/W021 | HSTS désactivé volontairement (adresse IP partagée avec des sites en HTTP) | Rien à faire ; à activer avec un nom dédié et un certificat reconnu |

---

## o. Section Itinéraire

Désactivée au départ : `ROUTING_URL` est vide, la section affiche « non configurée ». Le reste de
l'application n'en dépend pas.

Pour l'activer plus tard, il faut un service de calcul d'itinéraires **Valhalla** joignable par le
serveur (installé par l'administrateur sur srv2 ou une autre machine de l'intranet, avec la carte
OpenStreetMap du Sénégal), puis dans `config/.env.production` :

```
ROUTING_PROVIDER=valhalla
ROUTING_URL=http://<machine-valhalla>:8002
```

et `sudo systemctl restart carto-imf-gunicorn`. Le détail (installation de Valhalla, mise à jour de
la carte) est dans `docs/itineraire.md` sur la branche master. La position GPS du navigateur
exige HTTPS, déjà en place.

---

## Message à l'administrateur

Bonjour,

Pour installer l'application Carto IMF (DRS-SFD) sur srv2, sans Docker, voici ce qui demande les
droits root. Rien ne modifie les autres sites : un nouveau site Apache sur le port 8443, un
service dédié, un droit limité pour le compte deploy_app.

**Étape 1 — maintenant** (avant que je n'installe l'application) :

```bash
psql --version
apt update
apt install -y postgresql-15-postgis-3 gdal-bin libgdal32 libgeos-c1v5 libproj25 libpq5 postgresql-client python3-venv
sudo -u postgres psql -d <base> -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d <base> -c "SELECT postgis_full_version();"
ss -tlnp | grep -E ':(8000|8443)\s' || echo "ports libres"
```

(Si `psql --version` n'affiche pas 15, remplacer `postgresql-15-postgis-3` par la version
correspondante.) Merci d'ouvrir aussi le port **8443** aux postes de l'intranet si un pare-feu est
en place.

**Étape 2 — quand je vous préviens** (l'application est installée dans /var/www/annuairedesimf) :

```bash
cp /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf-gunicorn.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now carto-imf-gunicorn
systemctl status carto-imf-gunicorn --no-pager

install -m 440 -o root -g root /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.sudoers /etc/sudoers.d/carto-imf
visudo -cf /etc/sudoers.d/carto-imf

install -m 644 -o root -g root /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.logrotate /etc/logrotate.d/carto-imf

cp /var/www/annuairedesimf/app/deploy/intranet-sans-docker/carto-imf.apache.conf /etc/apache2/sites-available/carto-imf.conf
a2enmod proxy proxy_http headers ssl
a2ensite carto-imf
apache2ctl configtest
```

Si `configtest` affiche `Syntax OK` :

```bash
systemctl reload apache2
sleep 3; ss -tlnp | grep ':8443'
```

(Sinon : `a2dissite carto-imf` et me transmettre le message d'erreur.)

La règle sudoers autorise uniquement deploy_app à démarrer, arrêter, redémarrer et consulter le
service `carto-imf-gunicorn`, pour les mises à jour. Le certificat utilisé est celui d'essai de
Debian (snakeoil) en attendant un certificat de l'autorité interne pour 10.233.225.2.

Merci.
