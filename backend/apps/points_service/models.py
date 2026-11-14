"""
points_service/models.py
========================
Modèle PointService.
Représente un point de service (agence, guichet, bureau) rattaché à une IMF,
avec sa localisation géospatiale PostGIS.
"""

import uuid

from django.contrib.gis.db import models as gis_models
from django.db import models

from apps.imf.models import IMF


class PointService(models.Model):
    """Point de service physique d'une IMF sur le territoire sénégalais."""

    class TypePoint(models.TextChoices):
        SIEGE = "SIEGE", "Siège social"
        AGENCE = "AGENCE", "Agence"
        GUICHET = "GUICHET", "Guichet"
        BUREAU = "BUREAU", "Bureau de représentation"

    class StatutPoint(models.TextChoices):
        OUVERT = "OUVERT", "Ouvert"
        FERME = "FERME", "Fermé"
        SUSPENDU = "SUSPENDU", "Suspendu"

    class StatutReglementaire(models.TextChoices):
        AGREE = "AGREE", "Agréé"
        EN_COURS = "EN_COURS", "En cours d'agrément"
        RADIE = "RADIE", "Radié"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    imf = models.ForeignKey(IMF, on_delete=models.PROTECT, related_name="points_service")
    nom = models.CharField(max_length=255)
    # Identifiant du point dans le fichier d'origine (ex. annuaire DRS-SFD). Clé de
    # rapprochement à l'import : une IMF peut avoir plusieurs points de même nom.
    reference_externe = models.CharField(
        max_length=50, blank=True, db_index=True, verbose_name="Référence dans le fichier source"
    )
    type_point = models.CharField(max_length=20, choices=TypePoint.choices, default=TypePoint.AGENCE)
    statut_point = models.CharField(max_length=20, choices=StatutPoint.choices, default=StatutPoint.OUVERT)
    statut_reglementaire = models.CharField(
        max_length=20,
        choices=StatutReglementaire.choices,
        default=StatutReglementaire.EN_COURS,
    )
    adresse = models.CharField(max_length=500, blank=True)
    region = models.ForeignKey(
        "cartographie.ZoneGeographique",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="points_region",
        limit_choices_to={"type_zone": "REGION"},
    )
    departement = models.ForeignKey(
        "cartographie.ZoneGeographique",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="points_departement",
        limit_choices_to={"type_zone": "DEPARTEMENT"},
    )
    commune = models.ForeignKey(
        "cartographie.ZoneGeographique",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="points_commune",
        limit_choices_to={"type_zone": "COMMUNE"},
    )
    date_ouverture = models.DateField(null=True, blank=True)
    telephone = models.CharField(max_length=100, blank=True)
    lieu_dit = models.CharField(max_length=255, blank=True, verbose_name="Localité")
    url_fiche = models.URLField(max_length=500, blank=True, verbose_name="Fiche dans l'annuaire")
    email = models.EmailField(blank=True)
    localisation = gis_models.PointField(geography=True, null=True, blank=True)
    encours = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    depots = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    nombre_membres = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Point de service"
        verbose_name_plural = "Points de service"
        ordering = ["imf", "nom"]

    def __str__(self):
        return f"{self.nom} ({self.imf})"

    def save(self, *args, **kwargs):
        """Complète region/departement/commune à partir du GPS s'ils ne sont pas renseignés."""
        if self.localisation and not (self.region_id and self.departement_id and self.commune_id):
            from apps.cartographie.models import ZoneGeographique

            for champ, zone in ZoneGeographique.localiser(self.localisation).items():
                if zone is not None and getattr(self, f"{champ}_id") is None:
                    setattr(self, champ, zone)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "region", "departement", "commune"}
        super().save(*args, **kwargs)
