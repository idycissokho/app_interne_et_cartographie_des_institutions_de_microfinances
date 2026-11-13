"""
importation/services.py
=======================
Traitement des imports (CSV / Excel) et des exports CSV des référentiels.

Principes :
- Les colonnes d'import et d'export sont identiques (COLONNES) : un fichier exporté
  peut être corrigé puis réimporté.
- Chaque ligne est validée par le sérialiseur DRF du module concerné : mêmes
  règles que l'API (choix, formats, IMF active, dates de mandat…).
- Import idempotent : une ligne correspondant à un enregistrement existant le met à
  jour (cellules vides = valeur conservée) au lieu de créer un doublon.
- Chaque ligne est traitée dans son propre point de sauvegarde : une ligne en
  erreur n'empêche pas l'import des autres et est consignée dans rapport_erreurs.
"""

import csv
import io
import json
import uuid
from datetime import date, datetime
from pathlib import Path

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.dirigeants.serializers import DirigeantDetailSerializer, MandatSerializer
from apps.imf.models import IMF
from apps.imf.serializers import IMFDetailSerializer
from apps.points_service.models import PointService
from apps.points_service.serializers import PointServiceDetailSerializer

from .models import ImportationFichier

TAILLE_MAX_OCTETS = 5 * 1024 * 1024
LIGNES_MAX = 10_000
EXTENSIONS = {".csv", ".xlsx"}

COLONNES = {
    ImportationFichier.TypeImport.IMF: [
        "nom", "sigle", "type_imf", "statut_reglementaire", "adresse_siege",
        "latitude", "longitude", "telephone", "email", "site_web",
    ],
    ImportationFichier.TypeImport.POINTS_SERVICE: [
        "imf", "nom", "type_point", "statut_point", "statut_reglementaire", "adresse",
        "region", "departement", "commune", "latitude", "longitude", "date_ouverture",
        "telephone", "email", "encours", "depots", "nombre_membres",
    ],
    ImportationFichier.TypeImport.DIRIGEANTS: [
        "nom", "prenom", "telephone", "email_professionnel", "email_secondaire",
        "imf", "fonction_mandat", "date_debut", "date_fin", "statut_mandat",
    ],
}
OBLIGATOIRES = {
    ImportationFichier.TypeImport.IMF: {"nom", "type_imf", "adresse_siege"},
    ImportationFichier.TypeImport.POINTS_SERVICE: {"imf", "nom"},
    ImportationFichier.TypeImport.DIRIGEANTS: {"nom", "prenom"},
}
COLONNES_NUMERIQUES = {"latitude", "longitude", "encours", "depots", "nombre_membres"}


class _PointVirgule(csv.excel):
    delimiter = ";"


class ErreurLigne(Exception):
    """Erreur de validation d'une ligne, avec le détail par colonne."""

    def __init__(self, erreurs):
        super().__init__(erreurs)
        self.erreurs = erreurs


# ---------------------------------------------------------------------------
# Lecture des fichiers
# ---------------------------------------------------------------------------

def valider_fichier(fichier) -> None:
    """Contrôle extension et taille avant enregistrement (appelé par le sérialiseur)."""
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        raise ValidationError("Format non pris en charge : utilisez un fichier .csv ou .xlsx.")
    if fichier.size > TAILLE_MAX_OCTETS:
        raise ValidationError(f"Fichier trop volumineux (max {TAILLE_MAX_OCTETS // (1024 * 1024)} Mo).")


def _normaliser_cellule(valeur) -> str:
    if valeur is None:
        return ""
    if isinstance(valeur, datetime):
        return valeur.date().isoformat()
    if isinstance(valeur, date):
        return valeur.isoformat()
    if isinstance(valeur, float) and valeur.is_integer():
        return str(int(valeur))
    return str(valeur).strip()


def lire_lignes(fichier) -> tuple[list[str], list[dict]]:
    """Retourne (en-têtes normalisés, lignes sous forme de dict colonne -> texte)."""
    fichier.open("rb")
    try:
        contenu = fichier.read()
    finally:
        fichier.close()

    if Path(fichier.name).suffix.lower() == ".xlsx":
        from openpyxl import load_workbook

        feuille = load_workbook(io.BytesIO(contenu), read_only=True, data_only=True).active
        brutes = [[_normaliser_cellule(c) for c in ligne] for ligne in feuille.iter_rows(values_only=True)]
    else:
        texte = contenu.decode("utf-8-sig", errors="replace")
        try:
            dialecte = csv.Sniffer().sniff(texte[:4096], delimiters=";,\t")
        except csv.Error:  # une seule colonne ou fichier ambigu : séparateur Excel FR
            dialecte = _PointVirgule
        brutes = [[c.strip() for c in ligne] for ligne in csv.reader(io.StringIO(texte), dialecte)]

    brutes = [ligne for ligne in brutes if any(ligne)]
    if not brutes:
        return [], []
    entetes = [c.strip().lower() for c in brutes[0]]
    lignes = [dict(zip(entetes, ligne + [""] * (len(entetes) - len(ligne)), strict=False)) for ligne in brutes[1:]]
    return entetes, lignes


# ---------------------------------------------------------------------------
# Résolution des références (IMF, zones) et conversions
# ---------------------------------------------------------------------------

def _resoudre_imf(ref: str) -> IMF:
    try:
        return IMF.objects.get(pk=uuid.UUID(ref))
    except (ValueError, IMF.DoesNotExist):
        pass
    for champ in ("sigle__iexact", "nom__iexact"):
        trouves = list(IMF.objects.filter(is_active=True, **{champ: ref})[:2])
        if len(trouves) == 1:
            return trouves[0]
        if len(trouves) > 1:
            raise ErreurLigne({"imf": f"Référence ambiguë : plusieurs IMF « {ref} »."})
    raise ErreurLigne({"imf": f"IMF introuvable : « {ref} » (sigle, nom ou identifiant)."})


def _resoudre_zone(ref: str, type_zone: str) -> ZoneGeographique:
    zone = (
        ZoneGeographique.objects.filter(type_zone=type_zone, is_active=True, code=ref).first()
        or ZoneGeographique.objects.filter(type_zone=type_zone, is_active=True, nom__iexact=ref).first()
    )
    if zone is None:
        raise ErreurLigne({type_zone.lower(): f"Zone introuvable : « {ref} » (code ou nom)."})
    return zone


def _nombre(valeur: str) -> str:
    """Accepte le format français : '1 250 000,50' -> '1250000.50'."""
    return valeur.replace(" ", "").replace(" ", "").replace(",", ".")


def _localisation(ligne: dict) -> str | None:
    lat, lon = ligne.pop("latitude", ""), ligne.pop("longitude", "")
    if not lat and not lon:
        return None
    try:
        lat_f, lon_f = float(lat), float(lon)
    except ValueError:
        raise ErreurLigne({"latitude": "Latitude et longitude doivent être deux nombres."}) from None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        raise ErreurLigne({"latitude": "Coordonnées GPS hors limites."})
    return json.dumps({"type": "Point", "coordinates": [lon_f, lat_f]})


def _preparer(ligne: dict, type_import: str) -> dict:
    """Ne garde que les colonnes connues, convertit les nombres et retire les cellules vides."""
    donnees = {}
    for col in COLONNES[type_import]:
        valeur = ligne.get(col, "")
        donnees[col] = _nombre(valeur) if col in COLONNES_NUMERIQUES else valeur
    manquantes = [c for c in OBLIGATOIRES[type_import] if not donnees.get(c)]
    if manquantes:
        raise ErreurLigne({c: "Valeur obligatoire." for c in manquantes})
    return donnees


def _sans_vides(donnees: dict) -> dict:
    return {k: v for k, v in donnees.items() if v not in ("", None)}


def _enregistrer(serializer_class, instance, donnees, **save_kwargs):
    serializer = serializer_class(instance=instance, data=donnees, partial=instance is not None)
    if not serializer.is_valid():
        raise ErreurLigne(_erreurs_en_texte(serializer.errors))
    return serializer.save(**save_kwargs), instance is None


def _erreurs_en_texte(erreurs):
    if isinstance(erreurs, dict):
        return {k: _erreurs_en_texte(v) for k, v in erreurs.items()}
    if isinstance(erreurs, list):
        return " ".join(str(e) for e in erreurs)
    return str(erreurs)


# ---------------------------------------------------------------------------
# Traitement ligne à ligne par type d'import
# ---------------------------------------------------------------------------

def _ligne_imf(ligne: dict) -> bool:
    donnees = _preparer(ligne, ImportationFichier.TypeImport.IMF)
    localisation = _localisation(donnees)
    if localisation:
        donnees["localisation_siege"] = localisation
    existante = None
    if donnees.get("sigle"):
        existante = IMF.objects.filter(is_active=True, sigle__iexact=donnees["sigle"]).first()
    existante = existante or IMF.objects.filter(is_active=True, nom__iexact=donnees["nom"]).first()
    _, cree = _enregistrer(IMFDetailSerializer, existante, _sans_vides(donnees))
    return cree


def _ligne_point_service(ligne: dict) -> bool:
    donnees = _preparer(ligne, ImportationFichier.TypeImport.POINTS_SERVICE)
    imf = _resoudre_imf(donnees["imf"])
    donnees["imf"] = str(imf.pk)
    for champ, type_zone in (("region", "REGION"), ("departement", "DEPARTEMENT"), ("commune", "COMMUNE")):
        if donnees.get(champ):
            donnees[champ] = str(_resoudre_zone(donnees[champ], type_zone).pk)
    localisation = _localisation(donnees)
    if localisation:
        donnees["localisation"] = localisation
    existant = PointService.objects.filter(
        imf=imf, nom__iexact=donnees["nom"], is_active=True
    ).first()
    _, cree = _enregistrer(PointServiceDetailSerializer, existant, _sans_vides(donnees))
    return cree


CHAMPS_MANDAT = ("imf", "fonction_mandat", "date_debut", "date_fin", "statut_mandat")


def _ligne_dirigeant(ligne: dict) -> bool:
    donnees = _sans_vides(_preparer(ligne, ImportationFichier.TypeImport.DIRIGEANTS))
    mandat = {k: donnees.pop(k) for k in CHAMPS_MANDAT if k in donnees}

    existant = None
    if donnees.get("email_professionnel"):
        existant = Dirigeant.objects.filter(
            is_active=True, email_professionnel__iexact=donnees["email_professionnel"]
        ).first()
    if existant is None and donnees.get("telephone"):
        existant = Dirigeant.objects.filter(
            is_active=True,
            nom__iexact=donnees["nom"],
            prenom__iexact=donnees["prenom"],
            telephone=donnees["telephone"],
        ).first()
    dirigeant, cree = _enregistrer(DirigeantDetailSerializer, existant, donnees)

    if mandat:
        if not {"imf", "fonction_mandat", "date_debut"} <= mandat.keys():
            raise ErreurLigne({"mandat": "Pour un mandat, imf, fonction_mandat et date_debut sont requis."})
        imf = _resoudre_imf(mandat["imf"])
        mandat["imf"] = str(imf.pk)
        mandat_existant = Mandat.objects.filter(
            dirigeant=dirigeant, imf=imf, is_active=True,
            fonction_mandat=mandat["fonction_mandat"], date_debut=mandat["date_debut"],
        ).first()
        _enregistrer(MandatSerializer, mandat_existant, mandat, dirigeant=dirigeant)
    return cree


TRAITEMENTS = {
    ImportationFichier.TypeImport.IMF: _ligne_imf,
    ImportationFichier.TypeImport.POINTS_SERVICE: _ligne_point_service,
    ImportationFichier.TypeImport.DIRIGEANTS: _ligne_dirigeant,
}


def traiter_importation(importation: ImportationFichier) -> ImportationFichier:
    """Lit le fichier, importe chaque ligne et met à jour statut + compteurs + rapport."""
    importation.statut = ImportationFichier.StatutImport.EN_COURS
    importation.save(update_fields=["statut", "date_modification"])

    def echec(message):
        importation.statut = ImportationFichier.StatutImport.ECHEC
        importation.rapport_erreurs = [{"ligne": None, "erreurs": {"fichier": message}}]
        importation.save()
        return importation

    try:
        entetes, lignes = lire_lignes(importation.fichier)
    except Exception as exc:  # fichier corrompu, encodage, xlsx invalide…
        return echec(f"Fichier illisible : {exc}")

    manquantes = sorted(OBLIGATOIRES[importation.type_import] - set(entetes))
    if manquantes:
        return echec(f"Colonnes obligatoires absentes : {', '.join(manquantes)}.")
    if len(lignes) > LIGNES_MAX:
        return echec(f"Trop de lignes ({len(lignes)}), maximum {LIGNES_MAX}.")

    traiter = TRAITEMENTS[importation.type_import]
    creees = mises_a_jour = 0
    erreurs = []
    for numero, ligne in enumerate(lignes, start=2):  # ligne 1 = en-têtes
        try:
            with transaction.atomic():
                if traiter(dict(ligne)):
                    creees += 1
                else:
                    mises_a_jour += 1
        except ErreurLigne as exc:
            valeurs = {col: ligne.get(col, "") for col in exc.erreurs if col in ligne}
            erreurs.append({"ligne": numero, "erreurs": exc.erreurs, "valeurs": valeurs})

    importation.nb_lignes_total = len(lignes)
    importation.nb_lignes_importees = creees + mises_a_jour
    importation.nb_lignes_erreur = len(erreurs)
    importation.rapport_erreurs = erreurs
    importation.statut = ImportationFichier.StatutImport.TERMINE
    importation.save()
    importation.lignes_creees, importation.lignes_mises_a_jour = creees, mises_a_jour
    return importation


# ---------------------------------------------------------------------------
# Export CSV (même format que l'import)
# ---------------------------------------------------------------------------

def _lat_lon(point):
    return ("", "") if not point else (point.y, point.x)


def _imf_ref(imf):
    return imf.sigle or imf.nom


def lignes_export(type_import: str):
    if type_import == ImportationFichier.TypeImport.IMF:
        for imf in IMF.objects.filter(is_active=True).order_by("nom"):
            lat, lon = _lat_lon(imf.localisation_siege)
            yield [imf.nom, imf.sigle, imf.type_imf, imf.statut_reglementaire, imf.adresse_siege,
                   lat, lon, imf.telephone, imf.email, imf.site_web]
    elif type_import == ImportationFichier.TypeImport.POINTS_SERVICE:
        qs = PointService.objects.filter(is_active=True).select_related(
            "imf", "region", "departement", "commune"
        ).order_by("imf__nom", "nom")
        for ps in qs:
            lat, lon = _lat_lon(ps.localisation)
            yield [_imf_ref(ps.imf), ps.nom, ps.type_point, ps.statut_point, ps.statut_reglementaire,
                   ps.adresse, getattr(ps.region, "code", ""), getattr(ps.departement, "code", ""),
                   getattr(ps.commune, "code", ""), lat, lon, ps.date_ouverture or "",
                   ps.telephone, ps.email, ps.encours, ps.depots if ps.depots is not None else "",
                   ps.nombre_membres if ps.nombre_membres is not None else ""]
    else:
        qs = Mandat.objects.filter(is_active=True, dirigeant__is_active=True).select_related(
            "dirigeant", "imf"
        ).order_by("dirigeant__nom", "dirigeant__prenom", "-date_debut")
        avec_mandat = set()
        for m in qs:
            d = m.dirigeant
            avec_mandat.add(d.pk)
            yield [d.nom, d.prenom, d.telephone, d.email_professionnel, d.email_secondaire,
                   _imf_ref(m.imf), m.fonction_mandat, m.date_debut, m.date_fin or "", m.statut_mandat]
        for d in Dirigeant.objects.filter(is_active=True).exclude(pk__in=avec_mandat).order_by("nom", "prenom"):
            yield [d.nom, d.prenom, d.telephone, d.email_professionnel, d.email_secondaire, "", "", "", "", ""]
