"""
importation/taches.py
=====================
Exécution des imports en tâche de fond, sans service supplémentaire (ni Celery ni Redis) :
l'upload répond aussitôt, le traitement continue dans un fil d'exécution du serveur, et
l'écran suit la progression (GET /importation/<id>/ : statut et compteurs).

- IMPORT_ASYNCHRONE=false : traitement pendant la requête (tests, dépannage).
- Si le serveur redémarre pendant un import, sa transaction est annulée par la base : aucune
  ligne n'est importée. L'import, resté « en cours », est alors déclaré interrompu dès qu'il
  n'a plus donné de nouvelles depuis IMPORT_DELAI_INTERRUPTION minutes.
"""

import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.db import connections
from django.utils import timezone

from apps.audit.models import JournalAudit

from .models import ImportationFichier
from .processors import lancer_importation

logger = logging.getLogger(__name__)

EN_COURS = (ImportationFichier.StatutImport.EN_ATTENTE, ImportationFichier.StatutImport.EN_COURS)


def lancer(importation: ImportationFichier, utilisateur) -> None:
    """Traite l'import en tâche de fond (ou tout de suite si IMPORT_ASYNCHRONE=false)."""
    if not settings.IMPORT_ASYNCHRONE:
        _traiter(importation.pk, utilisateur)
        return
    threading.Thread(
        target=_traiter_en_fond, args=(importation.pk, utilisateur), name=f"import-{importation.pk}", daemon=True
    ).start()


def _traiter_en_fond(importation_id, utilisateur) -> None:
    try:
        _traiter(importation_id, utilisateur)
    finally:
        # Ce fil a ouvert ses propres connexions : elles ne doivent pas rester ouvertes.
        connections.close_all()


def _traiter(importation_id, utilisateur) -> None:
    importation = ImportationFichier.objects.get(pk=importation_id)
    try:
        bilan = lancer_importation(importation)
    except Exception:  # dernier filet : l'import ne doit jamais rester « en cours »
        logger.exception("Import %s : échec du traitement en tâche de fond", importation_id)
        message = "Erreur inattendue pendant le traitement : aucune ligne importée."
        ImportationFichier.objects.filter(pk=importation_id).update(
            statut=ImportationFichier.StatutImport.ECHEC,
            rapport_erreurs=[{"ligne": None, "erreurs": {"fichier": message}, "message": message}],
            date_modification=timezone.now(),
        )
        return
    importation.refresh_from_db()
    JournalAudit.enregistrer(
        utilisateur,
        JournalAudit.Action.IMPORTATION,
        f"{ImportationFichier._meta.label}:{importation.pk}",
        {
            "libelle": str(importation),
            "type_import": importation.type_import,
            "statut": importation.statut,
            "lignes_creees": bilan.lignes_creees,
            "lignes_mises_a_jour": bilan.lignes_mises_a_jour,
            "lignes_erreur": importation.nb_lignes_erreur,
        },
    )


def marquer_imports_interrompus() -> int:
    """Déclare en échec les imports « en cours » sans nouvelles (serveur redémarré pendant le traitement)."""
    limite = timezone.now() - timedelta(minutes=settings.IMPORT_DELAI_INTERRUPTION)
    message = (
        "Import interrompu (redémarrage du serveur pendant le traitement) : aucune ligne importée. "
        "Relancez l'import."
    )
    return ImportationFichier.objects.filter(statut__in=EN_COURS, date_modification__lt=limite).update(
        statut=ImportationFichier.StatutImport.ECHEC,
        rapport_erreurs=[{"ligne": None, "erreurs": {"fichier": message}, "message": message}],
    )
