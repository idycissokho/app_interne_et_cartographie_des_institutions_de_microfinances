"""
cartographie/models.py
======================
Modèle ZoneGeographique.
Représente les découpages administratifs du Sénégal (régions, départements, communes)
avec leur géométrie PostGIS pour la cartographie des IMF.
"""

import uuid
from django.contrib.gis.db import models as gis_models
from django.db import models


class ZoneGeographique(models.Model):
    """Zone administrative du Sénégal avec géométrie PostGIS."""

    class TypeZone(models.TextChoices):
        """Niveau administratif de la zone."""

        REGION = "REGION", "Région"
        DEPARTEMENT = "DEPARTEMENT", "Département"
        COMMUNE = "COMMUNE", "Commune"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    nom = models.CharField(max_length=255)
    type_zone = models.CharField(max_length=20, choices=TypeZone.choices)
    geometrie = gis_models.MultiPolygonField(geography=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Zone géographique"
        verbose_name_plural = "Zones géographiques"
        ordering = ["type_zone", "nom"]

    def __str__(self):
        return f"{self.get_type_zone_display()} — {self.nom}"

    def calculer_agregats_macro(self) -> dict:
        """Retourne les agrégats des points de service dans cette zone."""
        from apps.points_service.models import PointService
        qs = PointService.objects.filter(
            localisation__within=self.geometrie, is_active=True
        ) if self.geometrie else PointService.objects.none()
        return {
            "nb_points_service": qs.count(),
            "nb_imf": qs.values("imf").distinct().count(),
            "encours_total": qs.aggregate(
                total=models.Sum("encours")
            )["total"] or 0,
        }

    def verifier_appartenance_point(self, point) -> bool:
        """Retourne True si le point GPS appartient à cette zone géographique."""
        if not self.geometrie:
            return False
        return self.geometrie.contains(point)
