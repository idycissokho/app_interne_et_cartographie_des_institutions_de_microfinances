# =============================================================================
# backend/Dockerfile
# Image Docker pour le backend Django — Cartographie IMF DRS-SFD
#
# Étapes :
#   builder : installe les dépendances Python + bibliothèques système C
#   final   : image légère d'exécution uniquement
# =============================================================================

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dépendances système nécessaires à psycopg2 et GeoDjango (GDAL, GEOS, PROJ)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements/development.txt


# =============================================================================
# Image finale
# =============================================================================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Bibliothèques runtime uniquement (sans outils de compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    gdal-bin \
    libgdal32 \
    libgeos-c1v5 \
    libproj25 \
    && rm -rf /var/lib/apt/lists/*

# Copie des packages Python depuis le builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

# Utilisateur non-root pour la sécurité (principe du moindre privilège)
RUN addgroup --system django && \
    adduser --system --ingroup django django && \
    chown -R django:django /app

USER django

EXPOSE 8000

# Applique les migrations puis démarre Gunicorn
CMD ["sh", "-c", \
    "python manage.py migrate --noinput && \
     python manage.py collectstatic --noinput && \
     gunicorn config.wsgi:application \
       --bind 0.0.0.0:8000 \
       --workers 2 \
       --timeout 120 \
       --access-logfile - \
       --error-logfile -"]
