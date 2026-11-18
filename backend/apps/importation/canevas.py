"""
importation/canevas.py
======================
Canevas officiel des institutions : la « LISTE IMF » de la DRS-SFD.

La DRS-SFD tient la liste des IMF dans un classeur Excel d'une feuille, une ligne par
institution, dirigeants en colonnes. C'est le format de référence de l'application :
- le modèle à télécharger (GET /importation/modeles/imf/) en reprend exactement les en-têtes ;
- l'export des institutions (GET /importation/export/imf/) produit ce même classeur, rempli
  à partir de la base : il peut être corrigé dans Excel puis réimporté ;
- l'import (processors.ImportIMFProcessor) le reconnaît à ses en-têtes.

Conventions du classeur reprises à l'export : régions et départements en majuscules sans
accents, cellule vide pour une valeur inconnue (le classeur d'origine utilise aussi « 0 » ou
« ND », que l'import traite comme des cellules vides).
"""

import io
import unicodedata

from django.db.models import Prefetch

from apps.dirigeants.models import Mandat
from apps.imf.models import IMF

TITRE_FEUILLE = "LISTE IMF"

#: En-têtes de la liste officielle, dans l'ordre du classeur.
ENTETES = [
    "N°AGREMENT", "STRUCTURES", "SIGLE", "REGIONS", "DEPARTEMENT", "AFFILIATION", "ANNEE", "FORME",
    "TYPE", "TAILLE", "SITUATION 2025", "E-mail SFD", "Téléphone SFD", "Adresse SFD",
    "Président du CA", "Vice-président du CA", "Secrétaire général du CA", "Nombre de membres du CA",
    "E-mail du PCA", "Téléphone du PCA",
    "Président du CS", "Vice-président du CS", "Secrétaire général du CS", "Nombre de membres du CS",
    "E-mail du président du CS", "Téléphone du président du CS",
    "Président du CC", "Secrétaire général du CC", "Vice-président du CC", "Nombre de membres du CC",
    "Adresse du PCC", "Téléphone du PCC",
    "Directeur général / Gérant", "E-mail DG", "Téléphone DG", "Adresse DG",
    "Année de création", "Forme juridique", "Type d'union", "Nombre d'unions affiliées",
    "Nombre d'institutions de base", "Situation", "Localisation (carte)", "Latitude", "Longitude",
]

_F = Mandat.FonctionMandat
# Forme juridique à écrire quand seule la forme de l'application est connue (IMF saisie à l'écran).
FORME_SELON_TYPE = {
    IMF.TypeIMF.MUTUELLE: "IMCEC", IMF.TypeIMF.COOPERATIVE: "IMCEC",
    IMF.TypeIMF.SA: "SA", IMF.TypeIMF.ASSOCIATION: "ASSOCIATION",
}


def _majuscules(texte: str) -> str:
    """« Thiès » -> « THIES » (convention du classeur)."""
    sans_accents = unicodedata.normalize("NFKD", texte or "")
    return "".join(c for c in sans_accents if not unicodedata.combining(c)).upper()


def _titulaires(imf: IMF) -> dict[str, Mandat]:
    """Mandat en cours le plus récent de chaque fonction de l'IMF."""
    titulaires: dict[str, Mandat] = {}
    for mandat in imf.mandats_en_cours:  # triés du plus récent au plus ancien
        titulaires.setdefault(mandat.fonction_mandat, mandat)
    return titulaires


def ligne(imf: IMF) -> list:
    """Ligne de la liste officielle pour une IMF (valeurs dans l'ordre de ENTETES)."""
    t = _titulaires(imf)

    def nom(*fonctions):
        mandat = next((t[f] for f in fonctions if f in t), None)
        return mandat.dirigeant if mandat else None

    pca, pcs, pcc = nom(_F.PCA), nom(_F.PRESIDENT_CONSEIL_SURVEILLANCE), nom(_F.PRESIDENT_COMITE_CREDIT)
    dg = nom(_F.DG, _F.GERANT)

    def personne(dirigeant, champ="nom"):
        if dirigeant is None:
            return None
        if champ == "nom":
            return dirigeant.get_nom_complet()
        return getattr(dirigeant, champ) or None

    forme = imf.forme_juridique or FORME_SELON_TYPE.get(imf.type_imf, "")
    situation = "OPR" if imf.statut_reglementaire == IMF.StatutReglementaire.OPR else imf.situation
    gps = imf.localisation_siege
    valeurs = [
        imf.numero_agrement, imf.nom, imf.sigle,
        _majuscules(imf.region.nom) if imf.region else None,
        _majuscules(imf.departement.nom) if imf.departement else None,
        imf.affiliation, imf.annee_creation, forme, imf.type_sfd, imf.taille, None,
        imf.email, imf.telephone, imf.adresse_siege,
        personne(pca), personne(nom(_F.VICE_PRESIDENT_CA)), personne(nom(_F.SECRETAIRE_GENERAL_CA)),
        imf.nb_membres_ca, personne(pca, "email_professionnel"), personne(pca, "telephone"),
        personne(pcs), personne(nom(_F.VICE_PRESIDENT_CS)), personne(nom(_F.SECRETAIRE_GENERAL_CS)),
        imf.nb_membres_cs, personne(pcs, "email_professionnel"), personne(pcs, "telephone"),
        personne(pcc), personne(nom(_F.SECRETAIRE_GENERAL_CC)), personne(nom(_F.VICE_PRESIDENT_CC)),
        imf.nb_membres_cc, personne(pcc, "adresse"), personne(pcc, "telephone"),
        personne(dg), personne(dg, "email_professionnel"), personne(dg, "telephone"), personne(dg, "adresse"),
        imf.annee_creation, forme, imf.type_union, imf.nb_unions_affiliees, imf.nb_institutions_base,
        situation, imf.lieu_dit,
        gps.y if gps else None, gps.x if gps else None,
    ]
    return [None if v == "" else v for v in valeurs]


def institutions():
    """IMF actives avec ce qu'il faut pour la liste (régions, départements, mandats en cours)."""
    en_cours = Mandat.objects.filter(
        is_active=True, dirigeant__is_active=True, date_fin=None,
    ).select_related("dirigeant").order_by("-date_debut")
    return IMF.objects.filter(is_active=True).select_related("region", "departement").prefetch_related(
        Prefetch("mandats", queryset=en_cours, to_attr="mandats_en_cours")
    ).order_by("nom")


def classeur(avec_donnees: bool) -> bytes:
    """Classeur .xlsx de la liste officielle : en-têtes seuls (modèle) ou rempli (export)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = TITRE_FEUILLE
    ws.append(ENTETES)
    for cellule in ws[1]:
        cellule.font = Font(bold=True)
    ws.freeze_panes = "C2"
    for rang, entete in enumerate(ENTETES, start=1):
        ws.column_dimensions[get_column_letter(rang)].width = max(12, min(40, len(entete) + 4))
    if avec_donnees:
        for imf in institutions():
            ws.append(ligne(imf))
    sortie = io.BytesIO()
    wb.save(sortie)
    return sortie.getvalue()
