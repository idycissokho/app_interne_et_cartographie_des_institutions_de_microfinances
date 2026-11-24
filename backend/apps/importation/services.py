"""
importation/services.py
=======================
Services du module importation hors traitement des lignes :
- valider_fichier : contrôle du fichier avant enregistrement (extension, taille)
- COLONNES        : colonnes du format canonique, par type d'import
- lignes_export   : export CSV des points de service et des dirigeants, au même format que
  l'import (un fichier exporté peut être corrigé puis réimporté). Les institutions s'exportent
  au format de la liste officielle des IMF (canevas.py).

Le traitement des imports lui-même est dans processors.py.
"""

from pathlib import Path

from rest_framework.exceptions import ValidationError

from apps.dirigeants.models import Dirigeant, Mandat
from apps.points_service.models import PointService

from .models import ImportationFichier
from .processors import PROCESSORS

TAILLE_MAX_OCTETS = 5 * 1024 * 1024
EXTENSIONS = {".csv", ".xlsx"}

# Colonnes du modèle de fichier et de l'export : celles des processors.
COLONNES = {type_import: processor.colonnes for type_import, processor in PROCESSORS.items()}


def valider_fichier(fichier) -> None:
    """Contrôle extension et taille avant enregistrement (appelé par le sérialiseur)."""
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        raise ValidationError("Format non pris en charge : utilisez un fichier .csv ou .xlsx.")
    if fichier.size > TAILLE_MAX_OCTETS:
        raise ValidationError(f"Fichier trop volumineux (max {TAILLE_MAX_OCTETS // (1024 * 1024)} Mo).")


# ---------------------------------------------------------------------------
# Export CSV (même format que l'import)
# ---------------------------------------------------------------------------

def _lat_lon(point):
    return ("", "") if not point else (point.y, point.x)


def _imf_ref(imf):
    return imf.sigle or imf.nom


def lignes_export(type_import: str, region=None):
    """Lignes d'export CSV des points de service ou des dirigeants, dans l'ordre de COLONNES[type_import].
    `region` : ne garder que les points situés dans cette région, ou les mandats dans ses institutions."""
    if type_import == ImportationFichier.TypeImport.POINTS_SERVICE:
        qs = PointService.objects.filter(is_active=True)
        if region is not None:
            qs = qs.filter(region=region)
        qs = qs.select_related(
            "imf", "region", "departement", "commune"
        ).order_by("imf__nom", "nom")
        for ps in qs:
            lat, lon = _lat_lon(ps.localisation)
            yield [_imf_ref(ps.imf), ps.imf.numero_agrement, ps.nom, ps.reference_externe,
                   ps.type_point, ps.statut_point, ps.statut_reglementaire,
                   ps.adresse, getattr(ps.region, "code", ""), getattr(ps.departement, "code", ""),
                   getattr(ps.commune, "code", ""), lat, lon, ps.date_ouverture or "",
                   ps.telephone, ps.email, ps.encours, ps.depots if ps.depots is not None else "",
                   ps.nombre_membres if ps.nombre_membres is not None else "", ps.lieu_dit, ps.url_fiche]
    else:
        qs = Mandat.objects.filter(is_active=True, dirigeant__is_active=True)
        if region is not None:
            qs = qs.filter(imf__region=region)
        qs = qs.select_related("dirigeant", "imf").order_by("dirigeant__nom", "dirigeant__prenom", "-date_debut")
        avec_mandat = set()
        for m in qs:
            d = m.dirigeant
            avec_mandat.add(d.pk)
            yield [d.nom, d.prenom, d.telephone, d.email_professionnel, d.email_secondaire, d.adresse,
                   _imf_ref(m.imf), m.imf.numero_agrement, m.fonction_mandat, m.date_debut, m.date_fin or "", m.statut_mandat]
        if region is not None:
            return  # dirigeants sans mandat : rattachés à aucune région
        for d in Dirigeant.objects.filter(is_active=True).exclude(pk__in=avec_mandat).order_by("nom", "prenom"):
            yield [d.nom, d.prenom, d.telephone, d.email_professionnel, d.email_secondaire, d.adresse, "", "", "", "", "", ""]
