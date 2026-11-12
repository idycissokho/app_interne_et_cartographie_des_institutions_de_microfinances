"""
audit/serializers.py
====================
Sérialiseur du module audit :
- JournalAuditSerializer : lecture seule — aucune création via l'API
"""

from rest_framework import serializers
from .models import JournalAudit


class JournalAuditSerializer(serializers.ModelSerializer):
    """Sérialiseur en lecture seule pour les entrées du journal d'audit."""

    utilisateur_email = serializers.EmailField(source="utilisateur.email", read_only=True)

    class Meta:
        model = JournalAudit
        fields = [
            "id", "utilisateur", "utilisateur_email", "action",
            "objet_concerne", "role", "date_action", "details",
        ]
        read_only_fields = fields
