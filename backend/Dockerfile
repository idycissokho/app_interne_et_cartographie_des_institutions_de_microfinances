# Utilisation d'une image Python stable
FROM python:3.11-slim-bookworm

# Éviter que Python écrive des fichiers .pyc et forcer l'affichage des logs en temps réel
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Installation des dépendances système pour GeoDjango et PostgreSQL
# On utilise les versions -dev pour garantir la compatibilité avec l'OS
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    libpq-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Définition du dossier de travail
WORKDIR /app

# Installation des dépendances Python
# On copie d'abord les fichiers de requirements pour profiter du cache Docker
COPY requirements/ /app/requirements/
# Si tu as un fichier requirements.txt unique, adapte cette ligne
RUN pip install --upgrade pip
# Installation des dépendances (ajuste le chemin selon ton fichier exact)
RUN pip install -r requirements/development.txt || pip install -r requirements/base.txt || pip install -r requirements.txt

# Copie du reste du code du projet
COPY . /app/

# On expose le port 8000 pour Django
EXPOSE 8000

# Commande pour lancer l'application
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]