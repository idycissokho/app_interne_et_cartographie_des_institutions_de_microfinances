import uuid
from django.db import models


class IMF(models.Model):

    class TypeIMF(models.TextChoices):
        MUTUELLE = "MUTUELLE", "Mutuelle"
        COOPERATIVE = "COOPERATIVE", "Coopérative"
        SA = "SA", "Société Anonyme"

    class StatutReglementaire(models.TextChoices):
        AGREE = "AGREE", "Agréée"
        EN_COURS = "EN_COURS", "En cours d'agrément"
        RADIEE = "RADIEE", "Radiée"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=255, verbose_name="Dénomination sociale")
    sigle = models.CharField(max_length=50, blank=True, verbose_name="Sigle")
    type_imf = models.CharField(max_length=20, choices=TypeIMF.choices, verbose_name="Type d'IMF")
    statut_reglementaire = models.CharField(
        max_length=20,
        choices=StatutReglementaire.choices,
        default=StatutReglementaire.EN_COURS,
        verbose_name="Statut réglementaire",
    )
    adresse_siege = models.CharField(max_length=500, verbose_name="Adresse du siège")
    telephone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    site_web = models.URLField(blank=True)
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
        return self.points_service.filter(is_active=True).count()

    def verifier_statut_actif(self) -> bool:
        return self.statut_reglementaire == self.StatutReglementaire.AGREE and self.is_active
