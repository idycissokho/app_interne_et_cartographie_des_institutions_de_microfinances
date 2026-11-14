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
    # 100 caractères : les fiches de l'annuaire donnent souvent plusieurs numéros.
    telephone = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    site_web = models.URLField(blank=True)

    # --- Informations de l'annuaire DRS-SFD -------------------------------
    reference_externe = models.CharField(
        max_length=50, blank=True, db_index=True, verbose_name="Référence dans le fichier source"
    )
    region = models.ForeignKey(
        "cartographie.ZoneGeographique",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imfs_region",
        limit_choices_to={"type_zone": "REGION"},
        verbose_name="Région du siège",
    )
    lieu_dit = models.CharField(max_length=255, blank=True, verbose_name="Localité du siège")
    type_sfd = models.CharField(
        max_length=50, blank=True, verbose_name="Type de SFD",
        help_text="Affilié, Non affilié, Réseau, Société commerciale, Association.",
    )
    affiliation = models.CharField(max_length=255, blank=True, verbose_name="Réseau d'affiliation")
    forme_juridique = models.CharField(max_length=50, blank=True, verbose_name="Forme juridique")
    type_union = models.CharField(max_length=50, blank=True, verbose_name="Type d'union")
    annee_creation = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name="Année de création")
    ninea = models.CharField(max_length=50, blank=True, verbose_name="NINEA")
    nb_unions_affiliees = models.PositiveIntegerField(null=True, blank=True, verbose_name="Nombre d'unions affiliées")
    nb_institutions_base = models.PositiveIntegerField(null=True, blank=True, verbose_name="Nombre d'institutions de base")
    nb_beneficiaires = models.PositiveIntegerField(null=True, blank=True, verbose_name="Nombre de bénéficiaires")
    capital = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True, verbose_name="Capital (FCFA)")
    situation = models.CharField(max_length=50, blank=True, verbose_name="Situation")
    nb_membres_ca = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name="Membres du conseil d'administration")
    nb_membres_cs = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name="Membres du conseil de surveillance")
    nb_membres_cc = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name="Membres du comité de crédit")
    url_fiche = models.URLField(max_length=500, blank=True, verbose_name="Fiche dans l'annuaire")
    date_fiche = models.DateField(null=True, blank=True, verbose_name="Date de création de la fiche annuaire")
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

    def save(self, *args, **kwargs):
        """Complète la région à partir du GPS du siège si elle n'est pas renseignée."""
        if self.localisation_siege and not self.region_id:
            from apps.cartographie.models import ZoneGeographique

            self.region = ZoneGeographique.localiser(self.localisation_siege)["region"]
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "region"}
        super().save(*args, **kwargs)

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
