# Cartographie des Institutions de Microfinance du Sénégal

Application web institutionnelle de cartographie et de gouvernance des IMF,
développée pour la Direction de la Réglementation et de la Supervision des
Systèmes Financiers Décentralisés (DRS-SFD) — Ministère des Finances et du Budget.

---

## Présentation

Cette application permet à la DRS-SFD de centraliser, visualiser et superviser
l'ensemble des Institutions de Microfinance (IMF) opérant sur le territoire
sénégalais, leurs points de service, leurs dirigeants et leurs mandats.

---

## Architecture technique

| Couche       | Technologie                              |
|--------------|------------------------------------------|
| Frontend     | React 18, TypeScript, Vite               |
| Backend      | Python 3.12, Django 5.2 LTS, DRF         |
| Base de données | PostgreSQL 16, PostGIS                |
| Serveur      | Nginx (reverse proxy), Gunicorn (WSGI)   |
| Déploiement  | Intranet DRS-SFD                         |

---

## Organisation du dépôt

```
/
├── backend/        # API Django REST Framework
├── frontend/       # Application React TypeScript
├── docs/           # Documentation technique du projet
└── .github/        # Workflows CI/CD (à venir)
```

---

## Démarrage rapide

### Prérequis

- Python 3.12+
- Node.js 20 LTS+
- PostgreSQL 16+ avec extension PostGIS
- Git

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements/development.txt
cp .env.example .env
# Renseigner les variables dans .env
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Renseigner les variables dans .env.local
npm run dev
```

---

## Documentation

La documentation technique complète est disponible dans le dossier `docs/`.

- `docs/architecture.md` — Décisions architecturales
- `docs/conventions.md` — Conventions de code
- `docs/api.md` — Documentation de l'API (à compléter)

---

## Statut du projet

Version : V1 — En cours de développement initial
Dernière mise à jour : Janvier 2026
