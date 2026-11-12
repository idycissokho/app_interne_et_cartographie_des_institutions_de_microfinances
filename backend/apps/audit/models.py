"""
audit/models.py
===============
Modèle JournalAudit.
Enregistre toutes les actions effectuées par les utilisateurs sur les données métier.
Les entrées sont en lecture seule — aucune modification ni suppression autorisée.
"""

import uuid
from django.db import models
from django.conf import settings


class JournalAudit(models.Model):
    """Entrée immuable du journal d'audit des actions utilisateurs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="actions_audit",
    )
    action = models.CharField(max_length=100)
    objet_concerne = models.CharField(max_length=255)
    role = models.CharField(max_length=20, blank=True)
    date_action = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Journal d'audit"
        verbose_name_plural = "Journal d'audit"
        ordering = ["-date_action"]

    def __str__(self):
        return f"{self.action} — {self.objet_concerne} ({self.date_action:%Y-%m-%d %H:%M})"

    @classmethod
    def enregistrer(cls, utilisateur, action: str, objet_concerne: str, details: dict = None):
        """Crée une entrée d'audit. À appeler depuis les vues après chaque opération sensible."""
        return cls.objects.create(
            utilisateur=utilisateur,
            action=action,
            objet_concerne=objet_concerne,
            role=getattr(utilisateur, "role", ""),
            details=details or {},
        )
