"""
audit/mixins.py
===============
AuditMixin : journalise automatiquement les opérations des vues génériques DRF
dans JournalAudit (création, modification, suppression et, si demandé, consultation).

Le mixin se branche sur les méthodes d'action (create/update/destroy/retrieve)
et non sur perform_*, afin que les vues restent libres de personnaliser
perform_create / perform_destroy (rattachement à l'URL, soft delete, etc.).

Usage :
    class MaVue(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
        audit_consultation = True  # journalise aussi les GET détail
"""

from .models import JournalAudit


class AuditMixin:
    """Journalise les opérations d'écriture (et optionnellement de lecture détail)."""

    #: Si True, chaque GET détail (retrieve) est journalisé comme CONSULTATION.
    audit_consultation = False

    # -- Capture du sérialiseur utilisé pour récupérer l'instance créée/modifiée --
    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        self._audit_serializer = serializer
        return serializer

    def _journaliser(self, action, instance, details=None):
        model = instance.__class__ if instance is not None else self.get_queryset().model
        identifiant = getattr(instance, "pk", None)
        JournalAudit.enregistrer(
            utilisateur=self.request.user,
            action=action,
            objet_concerne=f"{model._meta.label}:{identifiant}",
            details={"libelle": str(instance) if instance is not None else "", **(details or {})},
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        self._journaliser(JournalAudit.Action.CREATION, self._audit_serializer.instance)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        self._journaliser(
            JournalAudit.Action.MODIFICATION,
            self._audit_serializer.instance,
            {"champs_modifies": sorted(request.data.keys())},
        )
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        response = super().destroy(request, *args, **kwargs)
        self._journaliser(JournalAudit.Action.SUPPRESSION, instance)
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        if self.audit_consultation:
            self._journaliser(JournalAudit.Action.CONSULTATION, self._audit_serializer.instance)
        return response
