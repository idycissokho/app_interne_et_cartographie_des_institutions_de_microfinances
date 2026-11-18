# Déploiement sur le serveur intranet — Carto IMF (DRS-SFD)

Ce guide installe l'application complète sur le serveur de l'intranet : base de données,
API, interface web et serveur HTTPS. Toutes les commandes se tapent **depuis le dossier du
projet** sur le serveur. Chaque étape a été vérifiée sur une installation de test complète.

```
Postes de l'intranet ──HTTPS 443──▶ nginx ──▶ frontend (interface React)
                                      │
                                      ├──▶ backend (Django + Gunicorn) ──▶ db (PostgreSQL + PostGIS)
                                      └──▶ /media/justificatifs/ (fichiers déposés)
```

Fichiers utilisés :

| Fichier | Rôle |
|---|---|
| `infra/docker-compose.prod.yml` | Les 4 services de production (+ Valhalla facultatif) |
| `infra/docker/nginx/nginx.prod.conf` | HTTPS, redirection 80 → 443, aiguillage API / interface |
| `deploy/intranet/env.production.example` | Modèle des réglages (à copier dans `config/.env.production`) |
| `backend/Dockerfile.prod`, `frontend/Dockerfile.prod` | Images de production |

> `infra/docker-compose.yml` est réservé au **développement** : ne jamais l'utiliser ni le
> combiner sur le serveur (il publie la base de données et monte le code source).

---

## 1. Prérequis

- Serveur Linux 64 bits : **2 processeurs, 4 Go de mémoire, 20 Go de disque** au minimum
  (prévoir 2 Go de plus pour Valhalla).
- **Docker 24 ou plus** avec le module Compose : `docker --version` et `docker compose version`.
- **Ports 80 et 443** libres sur le serveur et ouverts sur le pare-feu de l'intranet.
- Un **nom** pour le serveur, par exemple `carto-imf.intranet.local`, enregistré dans le DNS interne.
- Un **certificat HTTPS** pour ce nom, émis par l'autorité de certification interne (à demander
  au service informatique) : deux fichiers, le certificat complet et sa clé privée.
- **Accès à Internet pendant l'installation** : la construction des images télécharge les
  dépendances (Python, Node, images Docker). Sans Internet sur le serveur, voir § 10.

---

## 2. Récupérer le code

```bash
git clone <adresse-du-depot> carto-imf
cd carto-imf
git checkout master
```

(Sans accès au dépôt : copier une archive du projet sur le serveur et la décompresser.)

---

## 3. Réglages : `config/.env.production`

```bash
cp deploy/intranet/env.production.example config/.env.production
chmod 600 config/.env.production
```

Générer les secrets et les noter dans le fichier :

```bash
openssl rand -base64 48                  # → DJANGO_SECRET_KEY
openssl rand -base64 24 | tr -d '/+='    # → DB_PASSWORD
```

Ouvrir `config/.env.production` (`nano config/.env.production`) et remplacer **chaque valeur
entre `< >`** :

| Variable | Exemple | À savoir |
|---|---|---|
| `DJANGO_SECRET_KEY` | (généré) | Ne jamais la changer ensuite : elle signe les sessions |
| `DJANGO_ALLOWED_HOSTS` | `carto-imf.intranet.local` | Nom utilisé par les postes, plusieurs possibles séparés par `,` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://carto-imf.intranet.local` | Même nom avec `https://` |
| `DB_PASSWORD` | (généré) | **Fixé au premier démarrage** : ne plus le modifier ensuite (voir § 9) |
| `DJANGO_ADMIN_EMAIL` / `DJANGO_ADMIN_PASSWORD` | | Premier compte administrateur, créé au premier démarrage |
| `EMAIL_*` | | Facultatif (courriels d'erreur) |

Laisser **`DJANGO_DONNEES_FICTIVES=false`** : sur l'intranet, les données sont réelles.

---

## 4. Certificat HTTPS

Copier les deux fichiers fournis par le service informatique, sous ces noms exacts :

```bash
mkdir -p infra/docker/nginx/certs
cp /chemin/vers/certificat-complet.pem infra/docker/nginx/certs/fullchain.pem
cp /chemin/vers/cle-privee.pem         infra/docker/nginx/certs/privkey.pem
chmod 600 infra/docker/nginx/certs/privkey.pem
```

`fullchain.pem` contient le certificat du serveur **suivi** des certificats intermédiaires.
Les postes doivent faire confiance à l'autorité interne (c'est le cas si elle est déployée
par le service informatique).

**Pour un premier essai seulement**, en attendant le vrai certificat (les navigateurs
afficheront un avertissement) :

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 90 \
  -subj "/CN=carto-imf.intranet.local" -addext "subjectAltName=DNS:carto-imf.intranet.local" \
  -keyout infra/docker/nginx/certs/privkey.pem -out infra/docker/nginx/certs/fullchain.pem
```

> Pourquoi HTTPS est obligatoire : Django refuse les connexions non sécurisées en production,
> et les navigateurs ne donnent la position GPS (section Itinéraire) que sur une adresse HTTPS.

---

## 5. Premier démarrage

```bash
docker compose -f infra/docker-compose.prod.yml up -d --build
```

La construction prend 5 à 10 minutes la première fois. Au démarrage, le backend fait
**automatiquement** :

1. les **migrations** de la base (création de toutes les tables) ;
2. le chargement des **14 régions et 46 départements** ;
3. la création du **compte administrateur** de `config/.env.production` ;
4. le lancement de Gunicorn.

Suivre le démarrage (Ctrl+C pour quitter l'affichage, les services continuent) :

```bash
docker compose -f infra/docker-compose.prod.yml logs -f backend
```

On doit voir notamment `Régions : 14 créée(s)`, `Départements : 46 créé(s)`,
`Compte administrateur … : créé (rôle ADMIN)` puis `Booting worker`.

---

## 6. Vérifier l'installation

```bash
docker compose -f infra/docker-compose.prod.yml ps
```

Les 4 services doivent être `Up` (et `db` en `healthy`). Puis, depuis le serveur :

```bash
curl -k https://localhost/api/v1/sante/      # → {"statut": "ok"}
curl -I http://localhost/                    # → 301 vers https://
```

Depuis un poste de l'intranet, ouvrir **https://carto-imf.intranet.local** et se connecter
avec le compte administrateur. L'administration Django est sur `/admin/`.

---

## 7. Charger la liste officielle des IMF

Le format de référence est la **liste officielle des IMF de la DRS-SFD** (classeur Excel
« LISTE IMF », une ligne par institution, dirigeants en colonnes), importée **telle quelle** :
aucune colonne à renommer ni à supprimer. Un seul import enregistre les institutions, leur
siège (point de service géolocalisé, région, département) et leurs dirigeants avec mandats.

**Option A — interface (recommandée)**. Menu *Import / Export* → *Importer* → *Institutions*,
déposer le classeur, *Lancer l'import*. Le traitement se fait en tâche de fond avec une barre
de progression, puis un rapport liste les valeurs écartées (GPS hors du Sénégal, nom de
dirigeant sans prénom…) : l'institution est enregistrée, seule la valeur fautive est écartée.

**Option B — commande**. Déposer le classeur dans `backend/donnees_initiales/`, puis :

```bash
docker compose -f infra/docker-compose.prod.yml run --rm \
  -v "$PWD/backend/donnees_initiales:/app/donnees_initiales" \
  backend python manage.py initialiser_donnees
```

Résultat de référence avec la liste 2025 (300 institutions) : 300 institutions et 300 sièges,
2 102 mandats de dirigeants, 0 ligne rejetée, environ 1 minute.

Règles appliquées à la lecture du classeur :

| Dans le classeur | Enregistré |
|---|---|
| `0`, `ND`, `Non défini`, `nd@nd.sn`, `X` | Valeur non renseignée (cellule vide) |
| `FORME` : IMCEC, SA, ASSOCIATION | Mutuelle, Société anonyme, Association |
| `Situation` : OPR | Statut « OPR » ; autre situation : « En activité » |
| `DEPARTEMENT` : GUEDIAWAYES, NIORO, MEDINA YORO FOULAH, BOUKINLING | Guédiawaye, Nioro du Rip, Médina-Yorofoula, Bounkiling |
| `Directeur général / Gérant` | Directeur général (SA) ou gérant (autres) |
| Colonnes en double (`ANNEE` / `Année de création`, `FORME` / `Forme juridique`) | La première renseignée |

**Mise à jour annuelle** : importer la nouvelle liste de la même façon. Les institutions sont
retrouvées par leur numéro d'agrément et mises à jour (une cellule vide ne remplace pas une
valeur existante) ; quand un dirigeant a changé, le mandat de son prédécesseur est clos à la
date de l'import. Un réimport du même fichier ne crée aucun doublon.

Le **modèle vide** et l'**export** (onglet *Exporter* → *Liste officielle des IMF*) sont au
même format : un export peut être corrigé dans Excel puis réimporté. Les points de service
autres que les sièges s'importent à part (type *Points de service*, canevas CSV).

Les fichiers de `backend/donnees_initiales/` ne sont jamais versionnés ; les supprimer après
le chargement.

---

## 8. Comptes utilisateurs

Dans l'administration Django (`https://carto-imf.intranet.local/admin/`), section
*Utilisateurs* → *Ajouter* : adresse e-mail, nom, prénom, mot de passe et **rôle** :

| Rôle | Droits |
|---|---|
| Consultant | Consulter (institutions, points de service, dirigeants, cartes, itinéraire) |
| Superviseur | Consulter + modifier |
| Administrateur | Tout, dont créer, désactiver, importer, exporter, journal d'audit |

Nouveau mot de passe administrateur sans l'écrire dans l'historique du terminal :

```bash
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py changepassword <email>
```

---

## 9. Mettre à jour l'application

```bash
cd carto-imf
mkdir -p sauvegardes
docker compose -f infra/docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc' \
  > sauvegardes/avant-maj-$(date +%Y%m%d-%H%M).dump      # sauvegarde d'abord (§ 10)
git pull
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Les **migrations sont appliquées automatiquement** au redémarrage du backend. Pour les lancer
ou les contrôler à la main :

```bash
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py showmigrations --plan | tail
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py migrate
```

Les postes récupèrent la nouvelle interface au prochain chargement de la page (rien à vider).

> Ne jamais lancer `docker compose … down -v` : l'option `-v` **supprime la base de données**.
> `DB_PASSWORD` est enregistré dans la base au premier démarrage : le modifier ensuite dans
> `config/.env.production` empêcherait le backend de s'y connecter.

---

## 10. Sauvegardes et restauration

**Sauvegarde de la base** (format compressé, ≈ 1 Mo pour la liste complète) :

```bash
mkdir -p sauvegardes
docker compose -f infra/docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc' \
  > sauvegardes/carto-imf-$(date +%Y%m%d).dump
```

**Sauvegarde des fichiers déposés** (justificatifs, fichiers importés) :

```bash
docker run --rm -v cartographie-imf_media_files:/media:ro -v "$PWD/sauvegardes:/out" alpine \
  tar czf /out/medias-$(date +%Y%m%d).tar.gz -C /media .
```

**Automatiser** chaque nuit à 2 h (`crontab -e`, remplacer le chemin du projet) :

```
0 2 * * * cd /opt/carto-imf && docker compose -f infra/docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc' > sauvegardes/carto-imf-$(date +\%Y\%m\%d).dump && find sauvegardes -name '*.dump' -mtime +30 -delete
```

Copier régulièrement le dossier `sauvegardes/` hors du serveur.

**Restaurer** une sauvegarde (remplace le contenu actuel de la base) :

```bash
docker compose -f infra/docker-compose.prod.yml stop backend
docker compose -f infra/docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner' \
  < sauvegardes/carto-imf-AAAAMMJJ.dump
docker compose -f infra/docker-compose.prod.yml start backend
```

**Serveur sans Internet** : construire les images sur un poste connecté, puis les transférer :

```bash
# Sur le poste connecté (même code) :
docker compose -f infra/docker-compose.prod.yml build
docker save cartographie-imf-backend:prod cartographie-imf-frontend:prod postgis/postgis:16-3.4 nginx:1.27-alpine \
  | gzip > images-carto-imf.tar.gz
# Sur le serveur, après copie du fichier :
gunzip -c images-carto-imf.tar.gz | docker load
docker compose -f infra/docker-compose.prod.yml up -d      # sans --build
```

---

## 11. Commandes utiles

```bash
# État et journaux
docker compose -f infra/docker-compose.prod.yml ps
docker compose -f infra/docker-compose.prod.yml logs -f --tail 100 backend
docker compose -f infra/docker-compose.prod.yml logs --tail 100 nginx

# Redémarrer / arrêter / relancer (les données sont conservées)
docker compose -f infra/docker-compose.prod.yml restart backend
docker compose -f infra/docker-compose.prod.yml stop
docker compose -f infra/docker-compose.prod.yml up -d

# Console Django, contrôles
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py shell
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py check --deploy

# Compléter département / région des points d'après leur GPS (--simulation : sans rien écrire)
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py rattacher_zones --simulation
docker compose -f infra/docker-compose.prod.yml exec backend python manage.py rattacher_zones
```

Le service redémarre tout seul après un redémarrage du serveur (`restart: always`), à
condition que Docker soit lancé au démarrage : `sudo systemctl enable docker`.

---

## 12. Itinéraire et fond de carte

- **Itinéraire** : sans réglage, la section affiche « non configurée ». Pour calculer les
  trajets sur l'intranet, démarrer le service Valhalla (téléchargement de la carte du Sénégal
  et préparation : 10 à 20 minutes la première fois) :

  ```bash
  docker compose -f infra/docker-compose.prod.yml --profile itineraire up -d
  ```

  puis mettre `ROUTING_URL=http://valhalla:8002` dans `config/.env.production` et
  `docker compose -f infra/docker-compose.prod.yml up -d backend`. Détails et mise à jour de la
  carte : `docs/itineraire.md`.
- **Fond de carte** : il est téléchargé par le navigateur des postes depuis OpenFreeMap
  (Internet). Si les postes n'ont pas accès à Internet, les cartes s'affichent sur un fond uni
  (points et régions restent visibles) ; servir les tuiles en interne est décrit dans
  `docs/itineraire.md` (§ d).
- **Usage sur le terrain** (téléphone hors des locaux) : l'application n'est joignable que
  depuis l'intranet ; prévoir l'accès par le VPN du ministère.

---

## 13. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `nginx` redémarre en boucle | Certificat absent ou mal nommé | Vérifier `infra/docker/nginx/certs/fullchain.pem` et `privkey.pem` (§ 4), puis `logs nginx` |
| « Bad Request (400) » | Nom du serveur absent de `DJANGO_ALLOWED_HOSTS` | Corriger `config/.env.production`, puis `up -d backend` |
| Connexion à `/admin/` refusée (CSRF) | `DJANGO_CSRF_TRUSTED_ORIGINS` incomplet | Mettre l'adresse exacte avec `https://`, puis `up -d backend` |
| `backend` en erreur « password authentication failed » | `DB_PASSWORD` modifié après le premier démarrage | Remettre l'ancien mot de passe (§ 9) |
| Erreur 502 | Backend en cours de démarrage ou arrêté | `ps`, puis `logs backend` ; patienter 30 s après un redémarrage |
| Import bloqué « en cours » | Serveur redémarré pendant l'import | Il passe en « interrompu » après 10 min ; relancer l'import |
| Position GPS refusée par le navigateur | Site ouvert en HTTP ou certificat non reconnu | Utiliser `https://` et le certificat de l'autorité interne |

---

## 14. Liste de contrôle sécurité

- [ ] `config/.env.production` en `chmod 600`, secrets générés, jamais envoyés par e-mail.
- [ ] `DJANGO_DONNEES_FICTIVES=false`, `DJANGO_SERVIR_MEDIAS=false`.
- [ ] Certificat de l'autorité interne en place (pas le certificat auto-signé d'essai).
- [ ] `DJANGO_SECURE_HSTS_SECONDS` passé à `31536000` une fois HTTPS validé sur les postes.
- [ ] Seuls les ports 80 et 443 ouverts sur le serveur (la base n'est jamais exposée).
- [ ] Sauvegarde nocturne en place et copiée hors du serveur ; restauration testée une fois.
- [ ] `sudo systemctl enable docker` (redémarrage automatique).
