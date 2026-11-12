
Cartographie des Institutions de Microfinance du Sénégal
Application web institutionnelle de cartographie et de gouvernance des IMF, développée pour la Direction de la Réglementation et de la Supervision des Systèmes Financiers Décentralisés (DRS-SFD) — Ministère des Finances et du Budget.

🌍 Présentation du Projet
Cette application est un outil stratégique permettant à la DRS-SFD de centraliser, visualiser et superviser l'ensemble des Institutions de Microfinance (IMF) opérant sur le territoire sénégalais.

Fonctionnalités clés :

Cartographie interactive : Visualisation géographique des IMF et de leurs points de service.
Gouvernance : Gestion des dirigeants, des mandats et des structures administratives.
Supervision : Suivi et audit des données institutionnelles.
Importation de données : Outils de chargement massif pour l'initialisation du système.
🛠 Architecture Technique
Couche	Technologie
Frontend	React 18, TypeScript, Vite
Backend	Python 3.11, Django 5.2 LTS, DRF
Base de données	PostgreSQL 16, PostGIS (Extension Spatiale)
Serveur	Nginx (reverse proxy), Gunicorn (WSGI)
Déploiement	Docker & Docker Compose
🚀 Installation et Démarrage avec Docker
Le projet est entièrement conteneurisé. L'utilisation de Docker est la méthode recommandée pour garantir un environnement identique pour tous les développeurs.

1. Prérequis
Docker et Docker Compose installés.
2. Configuration des variables d'environnement
Avant de lancer le projet, configurez vos secrets :

Run
cd backend
cp .env.example .env
(Modifiez le fichier .env avec votre SECRET_KEY et vos identifiants POSTGRES).

3. Lancement du projet
Depuis la racine du projet :

Run
docker-compose up --build
4. Initialisation de la base de données
Run
# Appliquer les migrations
docker-compose exec backend python manage.py migrate

# Créer l'administrateur
docker-compose exec backend python manage.py createsuperuser
L'application sera alors accessible sur http://localhost:8000.

📂 Organisation du dépôt

Apply
/
├── backend/        # API Django REST Framework (Conteneurisé)
├── frontend/       # Application React TypeScript (Conteneurisé)
├── docs/           # Documentation technique du projet
└── docker-compose.yml # Orchestration des services
📖 Documentation
La documentation technique complète est disponible dans le dossier docs/.

docs/architecture.md — Décisions architecturales
docs/conventions.md — Conventions de code
docs/api.md — Documentation de l'API
📈 Statut du projet
Version : V1 — En cours de développement initial Dernière mise à jour : Janvier 2026

