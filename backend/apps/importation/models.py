"""
importation/models.py
=====================
Modèle ImportationFichier.
Trace chaque import de données (CSV/Excel) effectué par un utilisateur.
Permet de suivre le statut du traitement et les erreurs éventuelles.
"""

import uuid

from django.conf import settings
from django.db import models


class ImportationFichier(models.Model):
    """Enregistrement d'un import de données depuis un fichier CSV ou Excel."""

    class StatutImport(models.TextChoices):
        EN_ATTENTE = "EN_ATTENTE", "En attente"
        EN_COURS = "EN_COURS", "En cours"
        TERMINE = "TERMINE", "Terminé"
        ECHEC = "ECHEC", "Échec"

    class TypeImport(models.TextChoices):
        IMF = "IMF", "Institutions de Microfinance"
        POINTS_SERVICE = "POINTS_SERVICE", "Points de service"
        DIRIGEANTS = "DIRIGEANTS", "Dirigeants"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="importations",
    )
    type_import = models.CharField(max_length=20, choices=TypeImport.choices)
    fichier = models.FileField(upload_to="importations/%Y/%m/")
    statut = models.CharField(
        max_length=20,
        choices=StatutImport.choices,
        default=StatutImport.EN_ATTENTE,
    )
    nb_lignes_total = models.PositiveIntegerField(default=0)
    nb_lignes_importees = models.PositiveIntegerField(default=0)
    nb_lignes_erreur = models.PositiveIntegerField(default=0)
    rapport_erreurs = models.JSONField(default=list, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Importation de fichier"
        verbose_name_plural = "Importations de fichiers"
        ordering = ["-date_creation"]

    def __str__(self):
        return f"{self.get_type_import_display()} — {self.statut} ({self.date_creation:%Y-%m-%d})"

    @property
    def taux_succes(self) -> float:
        """Retourne le pourcentage de lignes importées avec succès."""
        if not self.nb_lignes_total:
            return 0.0
        return round(self.nb_lignes_importees / self.nb_lignes_total * 100, 2)
