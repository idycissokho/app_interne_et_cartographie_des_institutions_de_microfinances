"""
dirigeants/models.py
====================
Modèles Dirigeant et Mandat.
Un dirigeant peut exercer plusieurs mandats dans différentes IMF (historique complet).
La suppression est logique (soft delete via is_active=False).
"""

import uuid

from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

from apps.imf.models import IMF


class Dirigeant(models.Model):
    """Personne physique pouvant exercer un mandat de direction dans une IMF."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    telephone = models.CharField(max_length=100, blank=True)
    adresse = models.CharField(max_length=500, blank=True)
    email_professionnel = models.EmailField(blank=True)
    email_secondaire = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Dirigeant"
        verbose_name_plural = "Dirigeants"
        ordering = ["nom", "prenom"]

    def __str__(self):
        return self.get_nom_complet()

    def get_nom_complet(self) -> str:
        """Retourne le nom complet du dirigeant."""
        return f"{self.prenom} {self.nom}"

    def lister_mandats_historique(self):
        """Retourne tous les mandats du dirigeant, du plus récent au plus ancien."""
        return self.mandats.order_by("-date_debut")


class Mandat(models.Model):
    """Mandat d'un dirigeant au sein d'une IMF pour une fonction et une période données."""

    class FonctionMandat(models.TextChoices):
        PCA = "PCA", "Président du Conseil d'Administration"
        VICE_PRESIDENT_CA = "VICE_PRESIDENT_CA", "Vice-président du Conseil d'Administration"
        SECRETAIRE_GENERAL_CA = "SECRETAIRE_GENERAL_CA", "Secrétaire général du Conseil d'Administration"
        PRESIDENT_CONSEIL = "PRESIDENT_CONSEIL", "Président du Conseil"
        DG = "DG", "Directeur Général"
        DGA = "DGA", "Directeur Général Adjoint"
        GERANT = "GERANT", "Gérant"
        PRESIDENT_COMITE_CREDIT = "PRESIDENT_COMITE_CREDIT", "Président de la Commission Crédit"
        PRESIDENT_CONSEIL_SURVEILLANCE = (
            "PRESIDENT_CONSEIL_SURVEILLANCE",
            "Président du Conseil de Surveillance",
        )
        VICE_PRESIDENT_CS = "VICE_PRESIDENT_CS", "Vice-président du Conseil de Surveillance"
        SECRETAIRE_GENERAL_CS = "SECRETAIRE_GENERAL_CS", "Secrétaire général du Conseil de Surveillance"
        VICE_PRESIDENT_CC = "VICE_PRESIDENT_CC", "Vice-président de la Commission Crédit"
        SECRETAIRE_GENERAL_CC = "SECRETAIRE_GENERAL_CC", "Secrétaire général de la Commission Crédit"
        RESPONSABLE_CONFORMITE = "RESPONSABLE_CONFORMITE", "Responsable Conformité / Contrôle interne"
        AUDITEUR_INTERNE = "AUDITEUR_INTERNE", "Auditeur interne"
        DAF = "DAF", "Directeur Administratif et Financier"
        RESPONSABLE_SI = "RESPONSABLE_SI", "Responsable IT / Systèmes d'Information"
        RESPONSABLE_OPERATIONS = "RESPONSABLE_OPERATIONS", "Responsable Opérations / Réseau"

    class StatutMandat(models.TextChoices):
        EN_FONCTION = "EN_FONCTION", "En fonction"
        INTERIM = "INTERIM", "Intérim"
        SUSPENDU = "SUSPENDU", "Suspendu"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dirigeant = models.ForeignKey(Dirigeant, on_delete=models.PROTECT, related_name="mandats")
    imf = models.ForeignKey(IMF, on_delete=models.PROTECT, related_name="mandats")
    fonction_mandat = models.CharField(max_length=40, choices=FonctionMandat.choices)
    date_debut = models.DateField()
    date_fin = models.DateField(null=True, blank=True)
    statut_mandat = models.CharField(
        max_length=20,
        choices=StatutMandat.choices,
        default=StatutMandat.EN_FONCTION,
    )
    documents_justificatifs = models.URLField(blank=True, help_text="Lien vers un document externe.")
    fichier_justificatif = models.FileField(
        upload_to="justificatifs/%Y/%m/",
        blank=True,
        validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png"])],
        help_text="PV, décision, arrêté ou lettre formelle (PDF ou image).",
    )
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Mandat"
        verbose_name_plural = "Mandats"
        ordering = ["-date_debut"]

    def __str__(self):
        return f"{self.dirigeant} — {self.get_fonction_mandat_display()} ({self.imf})"

    def clean(self):
        if self.date_fin and self.date_debut and self.date_fin < self.date_debut:
            raise ValidationError({"date_fin": "La date de fin doit être postérieure à la date de début."})

    def est_en_cours(self) -> bool:
        """Retourne True si le mandat est actif et sans date de fin."""
        return self.statut_mandat == self.StatutMandat.EN_FONCTION and self.date_fin is None

    def attacher_justificatif(self, url_document: str) -> None:
        """Attache un document justificatif au mandat."""
        self.documents_justificatifs = url_document
        self.save(update_fields=["documents_justificatifs", "date_modification"])
