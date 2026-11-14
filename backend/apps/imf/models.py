"""
imf/models.py
=============
Modèles IMF (Institution de Microfinance) et Bailleur.
Représente une institution agréée ou en cours d'agrément sur le territoire sénégalais.
La suppression est logique (soft delete via is_active=False).
"""

import uuid

from django.contrib.gis.db import models as gis_models
from django.db import models


class Bailleur(models.Model):
    """Bailleur de fonds / partenaire associé à une ou plusieurs IMF (PADESS, DER, FONGIP…)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=255, unique=True)
    sigle = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Bailleur"
        verbose_name_plural = "Bailleurs"
        ordering = ["nom"]

    def __str__(self):
        return self.sigle or self.nom


class IMF(models.Model):
    """Institution de Microfinance supervisée par la DRS-SFD."""

    class TypeIMF(models.TextChoices):
        """Forme juridique de l'institution."""

        MUTUELLE = "MUTUELLE", "Mutuelle"
        COOPERATIVE = "COOPERATIVE", "Coopérative"
        SA = "SA", "Société Anonyme"
        ASSOCIATION = "ASSOCIATION", "Association"

    class StatutReglementaire(models.TextChoices):
        """Statut réglementaire de l'IMF vis-à-vis de la DRS-SFD."""

        AGREE = "AGREE", "Agréée"
        EN_COURS = "EN_COURS", "En cours d'agrément"
        RADIEE = "RADIEE", "Radiée"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=255, verbose_name="Dénomination sociale")
    sigle = models.CharField(max_length=50, blank=True, verbose_name="Sigle")
    # Identifiant réglementaire délivré par la DRS-SFD (ex. « DK1-93-00008 »).
    # Sert de clé de rapprochement à l'import : deux IMF peuvent partager un même sigle.
    numero_agrement = models.CharField(
        max_length=50, blank=True, db_index=True, verbose_name="Numéro d'agrément"
    )
    type_imf = models.CharField(max_length=20, choices=TypeIMF.choices, verbose_name="Type d'IMF")
    statut_reglementaire = models.CharField(
        max_length=20,
        choices=StatutReglementaire.choices,
        default=StatutReglementaire.EN_COURS,
        verbose_name="Statut réglementaire",
    )
    adresse_siege = models.CharField(max_length=500, verbose_name="Adresse du siège")
    localisation_siege = gis_models.PointField(
        geography=True, null=True, blank=True, verbose_name="Coordonnées GPS du siège"
    )
    telephone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    site_web = models.URLField(blank=True)
    bailleurs = models.ManyToManyField(Bailleur, blank=True, related_name="imfs")
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Institution de Microfinance"
        verbose_name_plural = "Institutions de Microfinance"
        ordering = ["nom"]

    def __str__(self):
        return self.sigle or self.nom

    def compter_points_service(self) -> int:
        """Retourne le nombre de points de service actifs rattachés à cette IMF."""
        return self.points_service.filter(is_active=True).count()

    def verifier_statut_actif(self) -> bool:
        """Retourne True si l'IMF est agréée et non désactivée."""
        return self.statut_reglementaire == self.StatutReglementaire.AGREE and self.is_active

    def obtenir_coordonnees_gps(self) -> dict | None:
        """Retourne {"latitude", "longitude"} du siège, ou None si non renseigné."""
        if not self.localisation_siege:
            return None
        return {"latitude": self.localisation_siege.y, "longitude": self.localisation_siege.x}
