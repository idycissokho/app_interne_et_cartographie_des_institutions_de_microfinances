"""
config/cache_donnees.py
=======================
Cache des réponses coûteuses et identiques pour tous les utilisateurs :
statistiques, indicateurs par zone, contours, points de la carte, listes d'options.

Principe : chaque clé de cache contient un numéro de version. Toute création,
modification ou suppression d'une donnée de référence (IMF, point de service,
dirigeant, mandat, zone, bailleur) incrémente ce numéro : les anciennes entrées
ne sont plus lues et expirent d'elles-mêmes. Aucun risque d'afficher une donnée
périmée après un import ou une saisie.

Le cache par défaut (mémoire locale) est propre à chaque processus : avec plusieurs
processus (Gunicorn), configurer un cache partagé (Redis, Memcached) dans CACHES,
sinon un autre processus peut servir l'ancienne valeur jusqu'à DUREE secondes.
"""

import hashlib

from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save

DUREE = 600  # secondes
CLE_VERSION = "donnees:version"


def _version() -> int:
    version = cache.get(CLE_VERSION)
    if version is None:
        version = 1
        cache.set(CLE_VERSION, version, None)
    return version


def en_cache(nom: str, calcul, *parametres, duree: int = DUREE):
    """Retourne la valeur en cache pour (nom, paramètres), sinon l'obtient par `calcul()`.

    `calcul` ne doit pas retourner None (None signifie « absent du cache »).
    """
    empreinte = hashlib.md5(repr(parametres).encode()).hexdigest()
    cle = f"donnees:v{_version()}:{nom}:{empreinte}"
    valeur = cache.get(cle)
    if valeur is None:
        valeur = calcul()
        cache.set(cle, valeur, duree)
    return valeur


def invalider(**kwargs) -> None:
    """Périme toutes les entrées en changeant de version (immédiatement, puis à la validation
    de la transaction en cours, pour qu'une lecture concurrente ne remette pas l'ancien état)."""
    _changer_de_version()
    transaction.on_commit(_changer_de_version)


def _changer_de_version() -> None:
    try:
        cache.incr(CLE_VERSION)
    except ValueError:  # clé absente (cache vidé ou expiré)
        cache.set(CLE_VERSION, 2, None)


def brancher_signaux() -> None:
    """Invalide le cache à chaque écriture sur une donnée de référence."""
    from apps.cartographie.models import ZoneGeographique
    from apps.dirigeants.models import Dirigeant, Mandat
    from apps.imf.models import IMF, Bailleur
    from apps.points_service.models import PointService

    for modele in (IMF, Bailleur, PointService, Dirigeant, Mandat, ZoneGeographique):
        identifiant = f"cache_donnees_{modele.__name__}"
        post_save.connect(invalider, sender=modele, dispatch_uid=f"{identifiant}_save")
        post_delete.connect(invalider, sender=modele, dispatch_uid=f"{identifiant}_delete")
    m2m_changed.connect(invalider, sender=IMF.bailleurs.through, dispatch_uid="cache_donnees_imf_bailleurs")
