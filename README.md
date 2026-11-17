# Cartographie des IMF — DRS-SFD

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
- [Documentation](#documentation)
- [Statut du projet](#statut-du-projet)

---

## Présentation

La plateforme permet à la DRS-SFD de :

- **Cartographier** les IMF et leurs points de service sur le territoire sénégalais
- **Superviser** les données institutionnelles et réglementaires
- **Gérer** les dirigeants, mandats et structures administratives
- **Importer** des données massives depuis des fichiers Excel/CSV
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
├── backend/          # API Django REST Framework
├── frontend/         # Application React TypeScript
├── infra/            # Docker, Nginx, PostgreSQL, docker-compose.yml
├── config/           # Variables d'environnement (.env, .gitignore)
├── docs/
│   ├── 01_conception/    # Cahier des charges, diagrammes
│   ├── 02_architecture/  # Décisions techniques, schémas
│   ├── 03_api/           # Documentation des endpoints
│   └── 04_infra/         # Guides déploiement et infrastructure
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
# Générer les migrations
docker compose -f infra/docker-compose.yml exec backend python manage.py makemigrations

# Appliquer les migrations
docker compose -f infra/docker-compose.yml exec backend python manage.py migrate

# Créer le compte administrateur
docker compose -f infra/docker-compose.yml exec backend python manage.py createsuperuser
```

### 5. Charger les données de référence (annuaire DRS-SFD)

Le dépôt ne contient aucune donnée réelle. Déposez l'export Excel de l'annuaire (`.xlsx`) dans
`backend/donnees_initiales/`, puis lancez une fois :

```bash
docker compose -f infra/docker-compose.yml exec backend python manage.py initialiser_donnees
```

La commande :

1. charge les régions et départements ;
2. vérifie le classeur (lisible, colonnes obligatoires présentes) — s'il n'est pas conforme, elle s'arrête sans rien enregistrer ;
3. importe les institutions, puis les points de service, puis les dirigeants et mandats : chaque ligne
   conforme aux règles de la base est enregistrée, chaque ligne non conforme est écartée ;
4. affiche le bilan et écrit dans le même dossier un rapport `rapport_import_AAAAMMJJ_HHMMSS.csv` des lignes écartées.

Options : un chemin en argument pour un autre classeur ; `--forcer` pour recharger une base qui
contient déjà des institutions (sans cette option, la commande refuse, pour éviter les doublons).
Le dossier `backend/donnees_initiales/` n'est jamais versionné, sauf son `LISEZMOI.md`.

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
| Interface frontend | http://localhost:5173 |
| API REST | http://localhost:8000/api/v1/ |
| Administration Django | http://localhost:8000/admin/ |
| Documentation Swagger | http://localhost:8000/api/v1/docs/ |
| Documentation ReDoc | http://localhost:8000/api/v1/redoc/ |

---

## Documentation

| Document | Emplacement |
|---|---|
| Cahier des charges | `docs/01_conception/` |
| Diagrammes (classes, contexte, cas d'utilisation) | `docs/01_conception/` |
| Architecture technique | `docs/02_architecture/` |
| Documentation API | `docs/03_api/` |
| Guide infrastructure | `docs/04_infra/` |

---

## Statut du projet

**Version** : V1 — En cours de développement
**Dernière mise à jour** : Novembre 2026
