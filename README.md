# Cartographie des IMF — DRS-SFD

[![Intégration continue](https://github.com/idycissokho/app_interne_et_cartographie_des_institutions_de_microfinances/actions/workflows/ci.yml/badge.svg)](https://github.com/idycissokho/app_interne_et_cartographie_des_institutions_de_microfinances/actions/workflows/ci.yml)

Application web institutionnelle de cartographie et de gouvernance des Institutions de Microfinance (IMF), développée pour la **Direction de la Réglementation et de la Supervision des Systèmes Financiers Décentralisés (DRS-SFD)** — Ministère des Finances et du Budget du Sénégal.

---

## Table des matières

- [Présentation](#présentation)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Commandes utiles](#commandes-utiles)
- [Accès à l'application](#accès-à-lapplication)
- [Déploiement](#déploiement)
- [Documentation](#documentation)
- [Statut du projet](#statut-du-projet)

---

## Présentation

La plateforme permet à la DRS-SFD de :

- **Cartographier** les IMF et leurs points de service sur le territoire sénégalais (cartes par région et détaillée)
- **Superviser** les données institutionnelles et réglementaires (statuts, OPR, situation)
- **Gérer** les dirigeants, mandats et structures administratives
- **Importer** la liste officielle des IMF de la DRS-SFD telle quelle (Excel) : institutions, sièges et dirigeants en un seul import
- **Calculer un itinéraire** du superviseur vers une IMF (service Valhalla interne, facultatif)
- **Interroger un assistant** sur les IMF, points de service et dirigeants (moteur local, sans IA externe)
- **Auditer** toutes les actions effectuées sur la plateforme

Trois niveaux d'accès : `ADMIN`, `SUPERVISEUR`, `CONSULTANT`.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python 3.11, Django 5.2 LTS, Django REST Framework |
| Base de données | PostgreSQL 16 + PostGIS |
| Serveur | Nginx (reverse proxy), Gunicorn (WSGI) |
| Déploiement | Docker & Docker Compose |

---

## Structure du projet

```
/
├── backend/          # API Django REST Framework (apps/ : imf, points_service, dirigeants,
│                     #   cartographie, importation, audit, itineraires, assistant, authentication)
├── frontend/         # Application React TypeScript (+ maquette-carto-imf/ : maquette de référence)
├── infra/            # Docker Compose (développement et production), Nginx, PostgreSQL
├── deploy/
│   ├── intranet/     # Guide de mise en production sur le serveur intranet (cible finale)
│   └── demo/         # Démonstration en ligne temporaire (Neon, Render, Vercel)
├── config/           # Variables d'environnement (.env, jamais versionné)
├── docs/             # Conception (cahier des charges, diagrammes), architecture, itinéraire
└── README.md
```

---

## Démarrage rapide

### Prérequis

- [Docker](https://www.docker.com/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2

### 1. Cloner le projet

```bash
git clone <url-du-repo>
cd app_interne_et_cartographie_des_institutions_de_microfinances
```

### 2. Configurer les variables d'environnement

```bash
cp backend/.env.example config/.env
```

Éditer `config/.env` avec vos valeurs (voir section [Variables d'environnement](#variables-denvironnement)).

### 3. Lancer les conteneurs

```bash
docker compose -f infra/docker-compose.yml up --build
```

### 4. Initialiser la base de données

```bash
# Appliquer les migrations (versionnées dans le dépôt)
docker compose -f infra/docker-compose.yml exec backend python manage.py migrate

# Créer le compte administrateur
docker compose -f infra/docker-compose.yml exec backend python manage.py createsuperuser
```

### 5. Charger la liste officielle des IMF

Le dépôt ne contient aucune donnée réelle. Le format de référence est la **liste officielle des
IMF de la DRS-SFD** (classeur Excel « LISTE IMF » : une ligne par institution, dirigeants en
colonnes), importée telle quelle. Deux possibilités :

- **Interface** : *Import / Export* → *Institutions* → déposer le classeur.
- **Commande** : déposer le classeur dans `backend/donnees_initiales/`, puis :

```bash
docker compose -f infra/docker-compose.yml exec backend python manage.py initialiser_donnees
```

La commande charge les régions et départements, vérifie le classeur (s'il n'est pas conforme,
elle s'arrête sans rien enregistrer), puis importe en une fois les institutions, leurs sièges
géolocalisés et leurs dirigeants avec mandats. Chaque valeur incohérente (GPS hors du Sénégal,
nom sans prénom…) est écartée et listée dans un rapport `rapport_import_AAAAMMJJ_HHMMSS.csv`
écrit dans le même dossier ; la ligne est enregistrée.

Options : un chemin en argument pour un autre classeur ; `--forcer` pour mettre à jour une base
qui contient déjà des institutions. Les règles de lecture du classeur (valeurs « 0 » / « ND »,
statut OPR, graphies des départements…) sont détaillées dans
[deploy/intranet/README.md](deploy/intranet/README.md) (§ 7). Le dossier
`backend/donnees_initiales/` n'est jamais versionné, sauf son `LISEZMOI.md`.

---

## Variables d'environnement

Fichier : `config/.env`

```env
# Django
DJANGO_SECRET_KEY=votre-cle-secrete
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173

# Base de données
DB_NAME=cartographie_imf
DB_USER=postgres
DB_PASSWORD=votre-mot-de-passe
DB_HOST=db
DB_PORT=5432
```

---

## Commandes utiles

```bash
# Démarrer en arrière-plan
docker compose -f infra/docker-compose.yml up -d

# Arrêter les conteneurs
docker compose -f infra/docker-compose.yml down

# Voir les logs du backend
docker compose -f infra/docker-compose.yml logs -f backend

# Ouvrir un shell Django
docker compose -f infra/docker-compose.yml exec backend python manage.py shell

# Lancer le frontend hors Docker
cd frontend && npm install && npm run dev
```

---

## Accès à l'application

| Service | URL |
|---|---|
| Interface frontend (Vite) | http://localhost:5173 (ou http://localhost via Nginx) |
| API REST | http://localhost:8000/api/v1/ |
| Administration Django | http://localhost:8000/admin/ |
| Documentation Swagger | http://localhost:8000/api/v1/docs/ (développement uniquement) |
| Documentation ReDoc | http://localhost:8000/api/v1/redoc/ (développement uniquement) |

---

## Déploiement

| Cible | Guide | Fichiers |
|---|---|---|
| **Intranet** (production) | [deploy/intranet/README.md](deploy/intranet/README.md) | `infra/docker-compose.prod.yml`, `infra/docker/nginx/nginx.prod.conf`, `backend/Dockerfile.prod`, `frontend/Dockerfile.prod`, `deploy/intranet/env.production.example` |
| Démonstration en ligne (temporaire) | [deploy/demo/README.md](deploy/demo/README.md) | `render.yaml`, `frontend/vercel.json` |

`infra/docker-compose.yml` est réservé au développement.

**Intégration continue** : chaque push est vérifié par GitHub Actions (`.github/workflows/ci.yml`) :
qualité du code, tests backend sur PostGIS, build du frontend, puis démarrage complet de la pile
de production. Détails et notifications d'échec : [deploy/intranet/README.md](deploy/intranet/README.md) (§ 15).

---

## Documentation

| Document | Emplacement |
|---|---|
| Cahier des charges, analyse fonctionnelle | `docs/01_conception/` |
| Diagrammes (classes, contexte, cas d'utilisation) | `docs/01_conception/` |
| Architecture technique, supervision (APM) | `docs/02_architecture/` |
| Itinéraires (Valhalla, fond de carte interne) | `docs/itineraire.md` |
| Mise en production intranet | `deploy/intranet/README.md` |
| Documentation de l'API | Swagger / ReDoc (voir ci-dessus) |

---

## Statut du projet

**Version** : V1 — En cours de développement
**Dernière mise à jour** : Novembre 2026
