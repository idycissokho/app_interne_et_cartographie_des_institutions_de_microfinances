-- =============================================================================
-- docker/postgres/init.sql
-- Script exécuté une seule fois lors de la création du volume PostgreSQL.
--
-- Active l'extension PostGIS sur la base de données du projet.
-- PostGIS ajoute le support des types géographiques (Point, Polygon, etc.)
-- et des fonctions spatiales nécessaires à GeoDjango.
-- =============================================================================

-- Active l'extension PostGIS (types géospatiaux + fonctions spatiales)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Active l'extension pour les topologies géographiques (optionnel, V2)
-- CREATE EXTENSION IF NOT EXISTS postgis_topology;
