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
from django.db.models import Count, Q, Sum

# Nom du champ de PointService correspondant à chaque niveau administratif.
CHAMP_POINT_PAR_TYPE = {
    "REGION": "region",
    "DEPARTEMENT": "departement",
    "COMMUNE": "commune",
}


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
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sous_zones",
        help_text="Région d'un département, département d'une commune.",
    )
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

    @staticmethod
    def annotations_agregats(type_zone: str) -> dict:
        """
        Annotations Count/Sum à appliquer à un queryset de zones d'un même niveau.
        S'appuie sur le rattachement administratif des points (region/departement/commune).
        """
        rel = f"points_{CHAMP_POINT_PAR_TYPE[type_zone]}"
        actif = Q(**{f"{rel}__is_active": True})
        return {
            "nb_points_service": Count(rel, filter=actif, distinct=True),
            "nb_imf": Count(f"{rel}__imf", filter=actif, distinct=True),
            "encours_total": Sum(f"{rel}__encours", filter=actif),
            "depots_total": Sum(f"{rel}__depots", filter=actif),
            "nb_membres_total": Sum(f"{rel}__nombre_membres", filter=actif),
        }

    def calculer_agregats_macro(self) -> dict:
        """Retourne les agrégats des points de service rattachés à cette zone."""
        from apps.points_service.models import PointService

        qs = PointService.objects.filter(
            is_active=True, **{CHAMP_POINT_PAR_TYPE[self.type_zone]: self}
        )
        sommes = qs.aggregate(
            encours_total=Sum("encours"),
            depots_total=Sum("depots"),
            nb_membres_total=Sum("nombre_membres"),
        )
        return {
            "nb_points_service": qs.count(),
            "nb_imf": qs.values("imf").distinct().count(),
            "encours_total": sommes["encours_total"] or 0,
            "depots_total": sommes["depots_total"] or 0,
            "nb_membres_total": sommes["nb_membres_total"] or 0,
        }

    def verifier_appartenance_point(self, point) -> bool:
        """Retourne True si le point GPS appartient à cette zone géographique."""
        if not self.geometrie:
            return False
        return ZoneGeographique.objects.filter(pk=self.pk, geometrie__covers=point).exists()

    @classmethod
    def localiser(cls, point) -> dict:
        """
        Retourne {"region", "departement", "commune"} contenant le point GPS
        (requête spatiale ST_Covers, compatible avec le type geography).
        """
        zones = cls.objects.filter(is_active=True, geometrie__covers=point)
        trouve = {CHAMP_POINT_PAR_TYPE[z.type_zone]: z for z in zones}
        return {champ: trouve.get(champ) for champ in CHAMP_POINT_PAR_TYPE.values()}
