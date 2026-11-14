"""
importation/processors.py
=========================
Chaîne de traitement des imports de données (CSV / Excel).

Étapes, identiques pour tous les types d'import (voir BaseImportProcessor.executer) :
  1. Lecture du fichier (CSV ou Excel, choix de la feuille, normalisation des en-têtes)
  2. Contrôle des colonnes obligatoires
  3. Pour chaque ligne : préparation, validation, puis création ou mise à jour
  4. Rapport d'erreurs ligne par ligne et mise à jour du suivi ImportationFichier
     (EN_ATTENTE → EN_COURS → TERMINE ou ECHEC)

Un processor par type d'import, tous héritant de BaseImportProcessor :
  - ImportIMFProcessor          : institutions de microfinance
  - ImportPointServiceProcessor : points de service
  - ImportDirigeantProcessor    : dirigeants et leurs mandats

Deux formats de fichier sont acceptés :
  - le format canonique (attribut `colonnes` de chaque processor), qui est aussi
    celui des modèles et des exports CSV : un export peut être corrigé puis réimporté ;
  - l'export de l'annuaire DRS-SFD (classeur Excel à feuilles « IMF » et
    « Points de service »), reconnu grâce aux alias d'en-têtes.

Principes :
  - Chaque ligne est validée par le sérialiseur DRF du module concerné : mêmes
    règles que l'API (choix, formats, IMF active, dates de mandat…).
  - Import idempotent : une ligne correspondant à un enregistrement existant le met
    à jour (cellule vide = valeur conservée) au lieu de créer un doublon.
  - Chaque ligne est traitée dans son propre point de sauvegarde : une ligne en
    erreur est annulée seule et consignée dans le rapport, les autres sont importées.
    L'ensemble s'exécute dans une transaction : une panne en cours de route annule tout.
"""

import csv
import io
import json
import logging
import re
import unicodedata
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from functools import cached_property
from pathlib import Path

from django.db import transaction

from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.dirigeants.serializers import DirigeantDetailSerializer, MandatSerializer
from apps.imf.models import IMF
from apps.imf.serializers import IMFDetailSerializer
from apps.points_service.models import PointService
from apps.points_service.serializers import PointServiceDetailSerializer

from .models import ImportationFichier

logger = logging.getLogger(__name__)

LIGNES_MAX = 10_000

# Mentions utilisées dans les fichiers sources pour « non renseigné ».
VALEURS_VIDES = {"nd", "n_d", "na", "n_a", "non_defini", "non_renseigne", "neant"}


# ---------------------------------------------------------------------------
# Erreurs et structures de données
# ---------------------------------------------------------------------------

class ErreurFichier(Exception):
    """Le fichier entier est inexploitable (illisible, colonnes absentes, vide…)."""


class ErreurLigne(Exception):
    """Une ligne est invalide. `erreurs` associe chaque colonne fautive à son message."""

    def __init__(self, erreurs: dict[str, str]):
        super().__init__(erreurs)
        self.erreurs = erreurs


@dataclass
class LigneLue:
    """Une ligne de données : son numéro dans le fichier et ses valeurs par colonne."""

    numero: int
    valeurs: dict[str, str]


@dataclass
class BilanImport:
    """Résultat d'un import, utilisé pour le suivi et le journal d'audit."""

    lignes_creees: int = 0
    lignes_mises_a_jour: int = 0
    #: Lignes rejetées.
    erreurs: list[dict] = field(default_factory=list)
    #: Lignes importées dont une valeur facultative incohérente a été écartée.
    avertissements: list[dict] = field(default_factory=list)

    @property
    def lignes_importees(self) -> int:
        return self.lignes_creees + self.lignes_mises_a_jour


# ---------------------------------------------------------------------------
# Normalisation des textes et des cellules
# ---------------------------------------------------------------------------

def cle(texte) -> str:
    """Forme comparable d'un texte : « Numéro d'agrément » -> « numero_d_agrement »."""
    sans_accents = unicodedata.normalize("NFKD", str(texte or ""))
    sans_accents = "".join(c for c in sans_accents if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", sans_accents.lower()).strip("_")


def _normaliser_cellule(valeur) -> str:
    """Convertit une cellule (texte, nombre, date) en texte ; « ND » devient vide."""
    if valeur is None:
        return ""
    if isinstance(valeur, datetime):
        return valeur.date().isoformat()
    if isinstance(valeur, date):
        return valeur.isoformat()
    if isinstance(valeur, float) and valeur.is_integer():
        return str(int(valeur))
    texte = str(valeur).strip()
    forme = cle(texte)
    return "" if not forme or forme in VALEURS_VIDES else texte


def _nombre(valeur: str) -> str:
    """Accepte le format français : « 1 250 000,50 » -> « 1250000.50 »."""
    return re.sub(r"\s", "", valeur).replace(",", ".")


def _date(valeur: str) -> str:
    """Accepte AAAA-MM-JJ (avec ou sans heure) et JJ/MM/AAAA ; sinon laisse la valeur telle quelle."""
    if re.match(r"^\d{4}-\d{2}-\d{2}", valeur):
        return valeur[:10]
    correspondance = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", valeur)
    if correspondance:
        jour, mois, annee = correspondance.groups()
        return f"{annee}-{int(mois):02d}-{int(jour):02d}"
    return valeur


def _choix(valeur: str, choix, synonymes: dict[str, str], colonne: str) -> str:
    """Retourne le code d'un choix à partir de son code, de son libellé ou d'un synonyme."""
    if not valeur:
        return ""
    table = dict(synonymes)
    for code, libelle in choix:
        table[cle(code)] = code
        table[cle(libelle)] = code
    code = table.get(cle(valeur))
    if code is None:
        acceptees = ", ".join(c for c, _ in choix)
        raise ErreurLigne({colonne: f"Valeur « {valeur} » non autorisée. Valeurs acceptées : {acceptees}."})
    return code


# Emprise du Sénégal (avec marge) : des coordonnées en dehors sont une erreur de saisie.
EMPRISE_SENEGAL = {"latitude": (12.0, 16.9), "longitude": (-17.8, -11.2)}

# Statut réglementaire d'un point de service déduit de celui de son IMF.
STATUT_POINT_SELON_IMF = {
    IMF.StatutReglementaire.AGREE: PointService.StatutReglementaire.AGREE,
    IMF.StatutReglementaire.EN_COURS: PointService.StatutReglementaire.EN_COURS,
    IMF.StatutReglementaire.RADIEE: PointService.StatutReglementaire.RADIE,
}


def _sans_vides(donnees: dict) -> dict:
    return {k: v for k, v in donnees.items() if v not in ("", None)}


def _erreurs_en_texte(erreurs):
    """Aplati les erreurs d'un sérialiseur DRF en { colonne: message }."""
    if isinstance(erreurs, dict):
        return {k: _erreurs_en_texte(v) for k, v in erreurs.items()}
    if isinstance(erreurs, list):
        return " ".join(str(e) for e in erreurs)
    return str(erreurs)


# ---------------------------------------------------------------------------
# Lecture des fichiers
# ---------------------------------------------------------------------------

class _PointVirgule(csv.excel):
    delimiter = ";"


def _lire_excel(contenu: bytes, feuilles: tuple[str, ...]) -> list[list[str]]:
    """Lit la première feuille dont le nom figure dans `feuilles`, sinon la feuille active."""
    from openpyxl import load_workbook

    classeur = load_workbook(io.BytesIO(contenu), read_only=True, data_only=True)
    par_nom = {cle(f.title): f for f in classeur.worksheets}
    feuille = next((par_nom[n] for n in feuilles if n in par_nom), classeur.active)
    logger.info("Lecture de la feuille Excel « %s »", feuille.title)
    return [[_normaliser_cellule(c) for c in ligne] for ligne in feuille.iter_rows(values_only=True)]


def _lire_csv(contenu: bytes) -> list[list[str]]:
    """Lit un CSV en détectant le séparateur (; , ou tabulation)."""
    texte = contenu.decode("utf-8-sig", errors="replace")
    try:
        dialecte = csv.Sniffer().sniff(texte[:4096], delimiters=";,\t")
    except csv.Error:  # une seule colonne ou fichier ambigu : séparateur Excel FR
        dialecte = _PointVirgule
    return [[_normaliser_cellule(c) for c in ligne] for ligne in csv.reader(io.StringIO(texte), dialecte)]


def lire_fichier(fichier, feuilles: tuple[str, ...] = ()) -> tuple[list[str], list[LigneLue]]:
    """Retourne (en-têtes normalisés par `cle`, lignes de données numérotées comme dans le fichier)."""
    fichier.open("rb")
    try:
        contenu = fichier.read()
    finally:
        fichier.close()

    if Path(fichier.name).suffix.lower() == ".xlsx":
        brutes = _lire_excel(contenu, feuilles)
    else:
        brutes = _lire_csv(contenu)

    entetes: list[str] = []
    lignes: list[LigneLue] = []
    for numero, cellules in enumerate(brutes, start=1):
        if not any(cellules):
            continue
        if not entetes:
            entetes = [cle(c) for c in cellules]
            continue
        cellules = cellules + [""] * (len(entetes) - len(cellules))
        lignes.append(LigneLue(numero, dict(zip(entetes, cellules, strict=False))))
    return entetes, lignes


# ---------------------------------------------------------------------------
# Résolution des références
# ---------------------------------------------------------------------------

def _resoudre_imf(donnees: dict) -> IMF:
    """Trouve l'IMF d'une ligne par numéro d'agrément, puis sigle / identifiant, puis nom."""
    agrement = donnees.get("imf_agrement", "")
    reference = donnees.get("imf_sigle", "")
    nom = donnees.get("imf_nom", "")

    if agrement:
        imf = IMF.objects.filter(is_active=True, numero_agrement__iexact=agrement).first()
        if imf:
            return imf
    if reference:
        try:
            return IMF.objects.get(pk=uuid.UUID(reference))
        except (ValueError, IMF.DoesNotExist):
            pass
    for valeur, champs in ((reference, ("sigle__iexact", "nom__iexact")), (nom, ("nom__iexact",))):
        for champ in champs if valeur else ():
            trouvees = list(IMF.objects.filter(is_active=True, **{champ: valeur})[:2])
            if len(trouvees) == 1:
                return trouvees[0]
            if len(trouvees) > 1:
                raise ErreurLigne({
                    "imf_sigle": f"Référence ambiguë : plusieurs IMF « {valeur} ». "
                                 "Précisez la colonne imf_agrement."
                })
    if agrement:
        raise ErreurLigne({"imf_agrement": f"Aucune IMF ne porte le numéro d'agrément « {agrement} »."})
    if reference or nom:
        colonne = "imf_sigle" if reference else "imf_nom"
        raise ErreurLigne({colonne: f"IMF introuvable : « {reference or nom} » (sigle ou nom)."})
    raise ErreurLigne({"imf_sigle": "IMF de rattachement obligatoire (imf_sigle ou imf_agrement)."})


def _resoudre_zone(reference: str, type_zone: str) -> ZoneGeographique:
    """Zone active d'un niveau donné, par code ou par nom (sans tenir compte des accents ni de la casse)."""
    for zone in ZoneGeographique.objects.filter(type_zone=type_zone, is_active=True):
        if zone.code == reference or cle(zone.nom) == cle(reference):
            return zone
    raise ErreurLigne({type_zone.lower(): f"Zone introuvable : « {reference} » (code ou nom)."})


# ---------------------------------------------------------------------------
# Classe de base
# ---------------------------------------------------------------------------

class BaseImportProcessor(ABC):
    """Déroulé commun d'un import. Les sous-classes décrivent leurs colonnes et traitent une ligne."""

    #: Valeur de ImportationFichier.TypeImport prise en charge.
    type_import: str
    #: Colonnes du format canonique, dans l'ordre du modèle de fichier et de l'export.
    colonnes: list[str]
    #: Colonnes qui doivent exister dans le fichier et être renseignées sur chaque ligne.
    obligatoires: set[str]
    #: En-têtes équivalents (normalisés par `cle`) -> colonne canonique.
    alias: dict[str, str] = {}
    #: Feuilles Excel à lire en priorité (noms normalisés par `cle`).
    feuilles: tuple[str, ...] = ()
    #: Colonnes à convertir depuis le format numérique français.
    numeriques: set[str] = set()
    #: Colonnes de type date.
    dates: set[str] = set()

    def __init__(self, importation: ImportationFichier):
        self.importation = importation
        self.bilan = BilanImport()
        self.numero_ligne = 0  # ligne du fichier en cours de traitement
        # Valeurs facultatives incohérentes de la ligne en cours : écartées, la ligne reste importée.
        self._avertissements: dict[str, str] = {}

    # -- Déroulé ------------------------------------------------------------

    def executer(self) -> BilanImport:
        """Lit le fichier, importe chaque ligne et met à jour le suivi de l'import."""
        Statut = ImportationFichier.StatutImport
        self._changer_statut(Statut.EN_COURS)
        logger.info(
            "Import %s (%s) : début du traitement de « %s »",
            self.importation.pk, self.type_import, self.importation.fichier.name,
        )
        try:
            lignes = self.lire()
            self.importation.nb_lignes_total = len(lignes)
            self.importation.save(update_fields=["nb_lignes_total", "date_modification"])
            with transaction.atomic():
                for ligne in lignes:
                    self._importer_ligne(ligne)
        except ErreurFichier as exc:
            return self._echec(str(exc))
        except Exception as exc:  # panne inattendue : la transaction a tout annulé
            logger.exception("Import %s : erreur inattendue", self.importation.pk)
            return self._echec(f"Erreur inattendue, aucune ligne importée : {exc}")
        return self._terminer()

    def lire(self) -> list[LigneLue]:
        """Lit le fichier, applique les alias d'en-têtes et contrôle les colonnes."""
        try:
            entetes, lignes = lire_fichier(self.importation.fichier, self.feuilles)
        except Exception as exc:  # fichier corrompu, encodage, xlsx invalide…
            raise ErreurFichier(f"Fichier illisible : {exc}") from exc
        if not entetes:
            raise ErreurFichier("Le fichier est vide.")

        lignes = self.adapter_lignes(entetes, lignes)
        for ligne in lignes:
            ligne.valeurs = self._appliquer_alias(ligne.valeurs)
        # Colonnes disponibles : en-têtes du fichier (après alias) et colonnes des lignes adaptées.
        presentes = {self.alias.get(entete, entete) for entete in entetes}
        if lignes:
            presentes |= set(lignes[0].valeurs)
        self.verifier_colonnes(presentes)

        if not lignes:
            raise ErreurFichier("Le fichier ne contient aucune ligne de données.")
        if len(lignes) > LIGNES_MAX:
            raise ErreurFichier(f"Trop de lignes ({len(lignes)}), maximum {LIGNES_MAX}.")
        logger.info("Import %s : %d ligne(s) de données lue(s)", self.importation.pk, len(lignes))
        return lignes

    def adapter_lignes(self, entetes: list[str], lignes: list[LigneLue]) -> list[LigneLue]:
        """Point d'extension : transformer les lignes d'un format source particulier."""
        return lignes

    def verifier_colonnes(self, presentes: set[str]) -> None:
        """Refuse le fichier si une colonne obligatoire est absente des en-têtes."""
        manquantes = sorted(self.obligatoires - presentes)
        if manquantes:
            raise ErreurFichier(f"Colonnes obligatoires absentes : {', '.join(manquantes)}.")

    def preparer(self, valeurs: dict) -> dict:
        """Convertit nombres et dates, puis vérifie les valeurs obligatoires de la ligne."""
        donnees = dict(valeurs)
        for colonne in self.numeriques:
            if donnees.get(colonne):
                donnees[colonne] = _nombre(donnees[colonne])
        for colonne in self.dates:
            if donnees.get(colonne):
                donnees[colonne] = _date(donnees[colonne])
        return donnees

    def verifier_obligatoires(self, donnees: dict) -> None:
        manquantes = sorted(c for c in self.obligatoires if not donnees.get(c))
        if manquantes:
            raise ErreurLigne({c: "Valeur obligatoire." for c in manquantes})

    @abstractmethod
    def traiter_ligne(self, donnees: dict) -> bool:
        """Valide et enregistre une ligne. Retourne True si elle crée un enregistrement,
        False si elle en met un à jour. Lève ErreurLigne si la ligne est invalide."""

    # -- Outils internes ----------------------------------------------------

    def _appliquer_alias(self, valeurs: dict) -> dict:
        """Renomme les en-têtes connus ; à colonne égale, la première valeur renseignée gagne."""
        resultat: dict[str, str] = {}
        for entete, valeur in valeurs.items():
            colonne = self.alias.get(entete, entete)
            if not resultat.get(colonne):
                resultat[colonne] = valeur
        return resultat

    def _importer_ligne(self, ligne: LigneLue) -> None:
        """Traite une ligne dans son point de sauvegarde et consigne l'erreur éventuelle."""
        self.numero_ligne = ligne.numero
        self._avertissements = {}
        try:
            with transaction.atomic():
                creee = self.traiter_ligne(self.preparer(ligne.valeurs))
        except ErreurLigne as exc:
            erreurs = exc.erreurs
        except Exception as exc:  # erreur de base de données sur cette ligne uniquement
            logger.exception("Import %s : ligne %d, erreur inattendue", self.importation.pk, ligne.numero)
            erreurs = {"ligne": f"Erreur inattendue : {exc}"}
        else:
            if creee:
                self.bilan.lignes_creees += 1
            else:
                self.bilan.lignes_mises_a_jour += 1
            if self._avertissements:
                self._consigner(ligne, self._avertissements, avertissement=True)
            return
        self._consigner(ligne, erreurs, avertissement=False)

    def _consigner(self, ligne: LigneLue, erreurs: dict, avertissement: bool) -> None:
        """Ajoute au rapport une ligne rejetée, ou une ligne importée dont des valeurs ont été écartées."""
        detail = " ; ".join(f"{colonne} : {texte}" for colonne, texte in erreurs.items())
        nature = "importée, valeurs écartées" if avertissement else "rejetée"
        logger.warning("Import %s : ligne %d %s — %s", self.importation.pk, ligne.numero, nature, detail)
        entree = {
            "ligne": ligne.numero,
            "erreurs": erreurs,
            "valeurs": {c: ligne.valeurs.get(c, "") for c in erreurs if c in ligne.valeurs},
            "message": f"Ligne {ligne.numero} — {detail}",
            "avertissement": avertissement,
        }
        (self.bilan.avertissements if avertissement else self.bilan.erreurs).append(entree)

    def avertir(self, colonne: str, message: str) -> None:
        """Signale une valeur facultative écartée sans rejeter la ligne."""
        self._avertissements[colonne] = message

    def nettoyer_telephone(self, donnees: dict, colonne: str = "telephone") -> None:
        """Écarte un « téléphone » qui n'en est pas un (moins de 7 chiffres)."""
        valeur = donnees.get(colonne, "")
        if valeur and len(re.sub(r"\D", "", valeur)) < 7:
            self.avertir(colonne, f"« {valeur} » n'est pas un numéro de téléphone : valeur écartée.")
            valeur = ""
        donnees[colonne] = valeur[:100]

    def point_gps(self, donnees: dict) -> str | None:
        """Retire latitude / longitude de la ligne et retourne le point GeoJSON
        correspondant. Des coordonnées illisibles ou hors du Sénégal sont écartées."""
        lat, lon = donnees.pop("latitude", ""), donnees.pop("longitude", "")
        if not lat and not lon:
            return None
        try:
            lat_f, lon_f = float(_nombre(lat)), float(_nombre(lon))
        except ValueError:
            self.avertir("latitude", f"Coordonnées GPS illisibles (« {lat} » ; « {lon} ») : écartées.")
            return None
        (lat_min, lat_max), (lon_min, lon_max) = EMPRISE_SENEGAL["latitude"], EMPRISE_SENEGAL["longitude"]
        if not (lat_min <= lat_f <= lat_max and lon_min <= lon_f <= lon_max):
            self.avertir("latitude", f"Coordonnées GPS hors du Sénégal ({lat_f} ; {lon_f}) : écartées.")
            return None
        return json.dumps({"type": "Point", "coordinates": [lon_f, lat_f]})

    @cached_property
    def regions(self) -> dict[str, ZoneGeographique]:
        """Régions actives, indexées par leur nom normalisé (« saint_louis »)."""
        zones = ZoneGeographique.objects.filter(type_zone=ZoneGeographique.TypeZone.REGION, is_active=True)
        return {cle(zone.nom): zone for zone in zones}

    def region(self, reference: str) -> str:
        """Identifiant de la région nommée (ou codée) `reference`, "" si elle est vide ou inconnue."""
        if not reference:
            return ""
        zone = self.regions.get(cle(reference)) or next(
            (z for z in self.regions.values() if z.code == reference), None
        )
        if zone is None:
            self.avertir("region", f"Région inconnue : « {reference} » : valeur écartée.")
            return ""
        return str(zone.pk)

    def _enregistrer(self, serializer_class, instance, donnees: dict, obligatoires=(), **save_kwargs):
        """Valide avec le sérialiseur de l'API puis crée (instance None) ou met à jour.

        Une valeur invalide dans un champ facultatif (email mal formé, nombre illisible…)
        est écartée et signalée ; dans un champ obligatoire, elle rejette la ligne.
        """
        donnees = dict(donnees)
        for _ in range(2):
            serializer = serializer_class(instance=instance, data=donnees, partial=instance is not None)
            if serializer.is_valid():
                return serializer.save(**save_kwargs)
            erreurs = _erreurs_en_texte(serializer.errors)
            if any(champ in obligatoires or champ not in donnees for champ in erreurs):
                break
            for champ, message in erreurs.items():
                self.avertir(champ, f"Valeur « {donnees.pop(champ)} » écartée : {message}")
        raise ErreurLigne(erreurs)

    def _changer_statut(self, statut: str) -> None:
        self.importation.statut = statut
        self.importation.save(update_fields=["statut", "date_modification"])

    def _echec(self, message: str) -> BilanImport:
        """Fichier rejeté en bloc : aucune donnée importée."""
        logger.error("Import %s : échec — %s", self.importation.pk, message)
        self.bilan = BilanImport(erreurs=[{"ligne": None, "erreurs": {"fichier": message}, "message": message}])
        self.importation.statut = ImportationFichier.StatutImport.ECHEC
        self.importation.nb_lignes_importees = 0
        self.importation.nb_lignes_erreur = 0
        self.importation.rapport_erreurs = self.bilan.erreurs
        self.importation.save()
        return self.bilan

    def _terminer(self) -> BilanImport:
        """Enregistre compteurs et rapport. ECHEC si aucune ligne n'a pu être importée."""
        Statut = ImportationFichier.StatutImport
        bilan = self.bilan
        self.importation.nb_lignes_importees = bilan.lignes_importees
        self.importation.nb_lignes_erreur = len(bilan.erreurs)
        self.importation.rapport_erreurs = sorted(
            bilan.erreurs + bilan.avertissements, key=lambda entree: entree["ligne"]
        )
        self.importation.statut = Statut.TERMINE if bilan.lignes_importees else Statut.ECHEC
        self.importation.save()
        logger.info(
            "Import %s : %s — %d créée(s), %d mise(s) à jour, %d en erreur",
            self.importation.pk, self.importation.statut,
            bilan.lignes_creees, bilan.lignes_mises_a_jour, len(bilan.erreurs),
        )
        return bilan


# ---------------------------------------------------------------------------
# Institutions de microfinance
# ---------------------------------------------------------------------------

class ImportIMFProcessor(BaseImportProcessor):
    """Import des IMF. Clé de rapprochement : numéro d'agrément, sinon sigle, sinon nom.

    Chaque IMF importée reçoit aussi un point de service « Siège » (adresse, GPS,
    région, membres) : c'est lui qui la fait apparaître sur les cartes et dans les
    indicateurs par région, y compris quand elle n'a aucune agence.
    """

    type_import = ImportationFichier.TypeImport.IMF
    colonnes = [
        "nom", "sigle", "type_imf", "statut_reglementaire", "numero_agrement", "adresse_siege",
        "latitude", "longitude", "telephone", "email", "site_web",
        "region", "lieu_dit", "type_sfd", "affiliation", "forme_juridique", "type_union",
        "annee_creation", "ninea", "nb_unions_affiliees", "nb_institutions_base", "nb_beneficiaires",
        "capital", "situation", "nb_membres_ca", "nb_membres_cs", "nb_membres_cc",
        "reference_externe", "url_fiche", "date_fiche",
    ]
    obligatoires = {"nom", "type_imf", "adresse_siege"}
    feuilles = ("imf", "institutions")
    numeriques = {
        "annee_creation", "nb_unions_affiliees", "nb_institutions_base", "nb_beneficiaires",
        "capital", "nb_membres_ca", "nb_membres_cs", "nb_membres_cc",
    }
    dates = {"date_fiche"}
    alias = {
        # Export de l'annuaire DRS-SFD
        "identifiant_wordpress": "reference_externe",
        "nom_de_l_imf": "nom",
        "numero_d_agrement": "numero_agrement",
        "adresse_sfd": "adresse_siege",
        "telephone_sfd": "telephone",
        "e_mail_sfd": "email",
        "localisation_carte": "lieu_dit",
        "annee_de_creation": "annee_creation",
        "type_d_union": "type_union",
        "nombre_d_unions_affiliees": "nb_unions_affiliees",
        "nombre_d_institutions_de_base": "nb_institutions_base",
        "nombre_de_beneficiaires": "nb_beneficiaires",
        "nombre_de_membres_du_ca": "nb_membres_ca",
        "nombre_de_membres_du_cs": "nb_membres_cs",
        "nombre_de_membres_du_cc": "nb_membres_cc",
        "url_de_la_fiche": "url_fiche",
        "date_de_creation_fiche": "date_fiche",
    }
    SYNONYMES_TYPE = {
        "imcec": IMF.TypeIMF.MUTUELLE,  # institution mutualiste ou coopérative d'épargne et de crédit
        "societe_commerciale": IMF.TypeIMF.SA,
    }
    # Colonne « Type SFD » de l'annuaire, utilisée quand la forme juridique manque.
    TYPE_SELON_TYPE_SFD = {
        "societe_commerciale": IMF.TypeIMF.SA,
        "association": IMF.TypeIMF.ASSOCIATION,
        "affilie": IMF.TypeIMF.MUTUELLE,
        "non_affilie": IMF.TypeIMF.MUTUELLE,
        "reseau": IMF.TypeIMF.MUTUELLE,
    }
    SYNONYMES_STATUT = {
        "agree": IMF.StatutReglementaire.AGREE,
        "radie": IMF.StatutReglementaire.RADIEE,
        "en_cours": IMF.StatutReglementaire.EN_COURS,
    }

    def __init__(self, importation: ImportationFichier):
        super().__init__(importation)
        # IMF déjà créées ou mises à jour par ce fichier : pk -> (numéro de ligne, nom).
        self._deja_traitees: dict = {}

    def verifier_colonnes(self, presentes: set[str]) -> None:
        # Le type peut être déduit de la forme juridique (annuaire).
        if "forme_juridique" in presentes or "type_sfd" in presentes:
            presentes = presentes | {"type_imf"}
        super().verifier_colonnes(presentes)

    def preparer(self, valeurs: dict) -> dict:
        donnees = super().preparer(valeurs)
        type_imf = donnees.get("type_imf") or donnees.get("forme_juridique", "")
        try:
            type_imf = _choix(type_imf, IMF.TypeIMF.choices, self.SYNONYMES_TYPE, "type_imf")
        except ErreurLigne:
            if cle(donnees.get("type_sfd")) not in self.TYPE_SELON_TYPE_SFD:
                raise
            type_imf = ""
        donnees["type_imf"] = type_imf or self.TYPE_SELON_TYPE_SFD.get(cle(donnees.get("type_sfd")), "")
        donnees["statut_reglementaire"] = _choix(
            donnees.get("statut_reglementaire", ""), IMF.StatutReglementaire.choices,
            self.SYNONYMES_STATUT, "statut_reglementaire",
        )
        self.nettoyer_telephone(donnees)
        # Annuaire : l'adresse manque parfois, la localité puis la région la remplacent.
        donnees["adresse_siege"] = (
            donnees.get("adresse_siege") or donnees.get("lieu_dit") or donnees.get("region", "")
        )
        return donnees

    def traiter_ligne(self, donnees: dict) -> bool:
        self.verifier_obligatoires(donnees)
        localisation = self.point_gps(donnees)
        champs = {c: donnees.get(c, "") for c in self.colonnes if c not in ("latitude", "longitude")}
        champs["region"] = self.region(champs["region"])
        if localisation:
            champs["localisation_siege"] = localisation

        existante = self._trouver(champs)
        self._refuser_conflit(existante, champs["nom"])
        if existante is None and not champs["statut_reglementaire"] and champs["numero_agrement"]:
            # Une institution qui possède un numéro d'agrément est agréée.
            champs["statut_reglementaire"] = IMF.StatutReglementaire.AGREE
        imf = self._enregistrer(
            IMFDetailSerializer, existante, _sans_vides(champs), obligatoires=self.obligatoires
        )
        self._deja_traitees[imf.pk] = (self.numero_ligne, champs["nom"])
        self._synchroniser_siege(imf)
        return existante is None

    @staticmethod
    def _synchroniser_siege(imf: IMF) -> None:
        """Crée ou met à jour le point de service « Siège » de l'IMF à partir de sa fiche."""
        siege = PointService.objects.filter(
            imf=imf, type_point=PointService.TypePoint.SIEGE, is_active=True
        ).first() or PointService(imf=imf, type_point=PointService.TypePoint.SIEGE)
        siege.nom = f"Siège — {imf.sigle or imf.nom}"[:255]
        siege.statut_reglementaire = STATUT_POINT_SELON_IMF[imf.statut_reglementaire]
        siege.adresse = imf.adresse_siege
        siege.lieu_dit = imf.lieu_dit
        siege.telephone = imf.telephone
        siege.email = imf.email
        siege.localisation = imf.localisation_siege
        siege.region = imf.region
        # Les bénéficiaires d'un réseau (union) sont ceux de ses caisses affiliées, déjà
        # comptés sur leurs propres sièges : on ne les ajoute pas une seconde fois.
        est_reseau = cle(imf.type_sfd) == "reseau"
        siege.nombre_membres = None if est_reseau else imf.nb_beneficiaires
        siege.save()

    def _refuser_conflit(self, existante: IMF | None, nom: str) -> None:
        """Deux lignes du même fichier désignent la même IMF sous deux noms différents :
        la seconde est rejetée plutôt que d'écraser silencieusement la première."""
        if existante is None or existante.pk not in self._deja_traitees:
            return
        ligne, nom_precedent = self._deja_traitees[existante.pk]
        if cle(nom_precedent) != cle(nom):
            raise ErreurLigne({
                "numero_agrement": f"Même institution que la ligne {ligne} (« {nom_precedent} ») "
                                   "sous un autre nom : vérifiez le numéro d'agrément ou le sigle."
            })

    @staticmethod
    def _trouver(champs: dict) -> IMF | None:
        """IMF active correspondant à la ligne. Un sigle ou un nom identique ne suffit
        pas si l'IMF trouvée porte un autre numéro d'agrément (institutions distinctes)."""
        actives = IMF.objects.filter(is_active=True)
        agrement = champs.get("numero_agrement")
        if agrement:
            existante = actives.filter(numero_agrement__iexact=agrement).first()
            if existante:
                return existante
            actives = actives.filter(numero_agrement="")
        if champs.get("sigle"):
            existante = actives.filter(sigle__iexact=champs["sigle"]).first()
            if existante:
                return existante
        return actives.filter(nom__iexact=champs["nom"]).first()


# ---------------------------------------------------------------------------
# Points de service
# ---------------------------------------------------------------------------

class ImportPointServiceProcessor(BaseImportProcessor):
    """Import des points de service.

    Clé de rapprochement : IMF + référence externe si le fichier en fournit une
    (une IMF peut avoir plusieurs points de même nom), sinon IMF + nom du point.

    Région d'un point : colonne « region », sinon déduite du GPS, sinon d'un nom de
    région présent dans l'intitulé, sinon région de l'IMF quand celle-ci est une
    caisse de base (affiliée ou non), dont les guichets sont locaux. Les points des
    réseaux et sociétés nationales restent sans région faute d'indication.
    """

    type_import = ImportationFichier.TypeImport.POINTS_SERVICE
    colonnes = [
        "imf_sigle", "imf_agrement", "nom", "reference_externe",
        "type_point", "statut_point", "statut_reglementaire",
        "adresse", "region", "departement", "commune", "latitude", "longitude", "date_ouverture",
        "telephone", "email", "encours", "depots", "nombre_membres", "lieu_dit", "url_fiche",
    ]
    obligatoires = {"nom"}
    feuilles = ("points_de_service", "points_service", "points")
    numeriques = {"encours", "depots", "nombre_membres"}
    dates = {"date_ouverture"}
    alias = {
        "imf": "imf_sigle",
        # Export de l'annuaire DRS-SFD
        "agrement_imf_de_rattachement": "imf_agrement",
        "nom_imf_de_rattachement": "imf_nom",
        "nom_du_point_de_service": "nom",
        "identifiant_wordpress": "reference_externe",
        "typologie": "type_point",
        "e_mail": "email",
        "localisation_carte": "lieu_dit",
        "url_de_la_fiche": "url_fiche",
    }
    COLONNES_IMF = {"imf_sigle", "imf_agrement", "imf_nom"}
    SYNONYMES_TYPE = {"siege": PointService.TypePoint.SIEGE, "bureau": PointService.TypePoint.BUREAU}
    TYPES_SFD_LOCAUX = {"affilie", "non_affilie"}

    def verifier_colonnes(self, presentes: set[str]) -> None:
        super().verifier_colonnes(presentes)
        if not self.COLONNES_IMF & presentes:
            raise ErreurFichier("Colonne obligatoire absente : imf_sigle (ou imf_agrement).")

    def preparer(self, valeurs: dict) -> dict:
        donnees = super().preparer(valeurs)
        # Annuaire : la fiche a un titre et un nom, dont l'un des deux seulement est
        # propre au point (« MEC ACEP DAKAR » / « Guichet HLM5 »). On garde les deux.
        titre, nom = donnees.get("titre", ""), donnees.get("nom", "")
        if titre and cle(titre) != cle(nom):
            donnees["nom"] = f"{titre} — {nom}" if nom else titre
        donnees["type_point"] = _choix(
            donnees.get("type_point", ""), PointService.TypePoint.choices, self.SYNONYMES_TYPE, "type_point"
        )
        donnees["statut_point"] = _choix(
            donnees.get("statut_point", ""), PointService.StatutPoint.choices, {}, "statut_point"
        )
        donnees["statut_reglementaire"] = _choix(
            donnees.get("statut_reglementaire", ""), PointService.StatutReglementaire.choices,
            {"agree": PointService.StatutReglementaire.AGREE, "radie": PointService.StatutReglementaire.RADIE},
            "statut_reglementaire",
        )
        self.nettoyer_telephone(donnees)
        return donnees

    def traiter_ligne(self, donnees: dict) -> bool:
        self.verifier_obligatoires(donnees)
        imf = _resoudre_imf(donnees)
        localisation = self.point_gps(donnees)
        ignorees = {"imf_sigle", "imf_agrement", "latitude", "longitude"}
        champs = {c: donnees.get(c, "") for c in self.colonnes if c not in ignorees}
        champs["imf"] = str(imf.pk)
        champs["region"] = self.region(champs["region"])
        for colonne, type_zone in (("departement", "DEPARTEMENT"), ("commune", "COMMUNE")):
            if champs[colonne]:
                champs[colonne] = str(_resoudre_zone(champs[colonne], type_zone).pk)
        if localisation:
            champs["localisation"] = localisation
        elif not champs["region"]:
            champs["region"] = self._deduire_region(imf, donnees)

        existant = self._trouver(imf, champs)
        if existant is None and not champs["statut_reglementaire"]:
            # À défaut d'indication, un nouveau point suit le statut de son IMF.
            champs["statut_reglementaire"] = STATUT_POINT_SELON_IMF[imf.statut_reglementaire]
        self._enregistrer(
            PointServiceDetailSerializer, existant, _sans_vides(champs), obligatoires={"imf", "nom", "type_point"}
        )
        return existant is None

    def _deduire_region(self, imf: IMF, donnees: dict) -> str:
        """Région d'un point sans GPS : nom de région dans son intitulé, sinon région
        de son IMF si c'est une caisse de base. Retourne l'identifiant ou ""."""
        intitule = f"_{cle(' '.join(donnees.get(c, '') for c in ('titre', 'nom', 'lieu_dit')))}_"
        for nom, zone in self.regions.items():
            if f"_{nom}_" in intitule:
                return str(zone.pk)
        if imf.region_id and cle(imf.type_sfd) in self.TYPES_SFD_LOCAUX:
            return str(imf.region_id)
        return ""

    @staticmethod
    def _trouver(imf: IMF, champs: dict) -> PointService | None:
        """Point actif de l'IMF portant la même référence externe, sinon le même nom."""
        points = PointService.objects.filter(imf=imf, is_active=True)
        if champs["reference_externe"]:
            existant = points.filter(reference_externe=champs["reference_externe"]).first()
            if existant:
                return existant
            # Un point saisi à la main (sans référence) peut être rattaché par son nom.
            points = points.filter(reference_externe="")
        return points.filter(nom__iexact=champs["nom"]).first()


# ---------------------------------------------------------------------------
# Dirigeants et mandats
# ---------------------------------------------------------------------------

CIVILITES = {"m", "mr", "mme", "mlle", "dr", "pr", "monsieur", "madame", "mademoiselle"}


def scinder_nom_complet(nom_complet: str) -> tuple[str, str]:
    """Sépare « Prénom(s) NOM » ou « NOM Prénom(s) » en (nom, prénom).

    Le nom de famille est le groupe de mots en majuscules en fin (ou en début) de
    chaîne ; si la casse ne permet pas de trancher, c'est le dernier mot.
    """
    sans_commentaire = re.sub(r"\(.*?(\)|$)", " ", nom_complet)  # « Awa DIOP (Directrice…) »
    mots = sans_commentaire.replace(".", ". ").split()
    while mots and cle(mots[0]) in CIVILITES:
        mots = mots[1:]
    if len(mots) < 2:
        raise ErreurLigne({"nom": f"Impossible de distinguer le nom du prénom dans « {nom_complet} »."})

    def majuscules(mot: str) -> bool:
        return mot.isupper() and len(mot) > 1

    fin = len(mots)
    while fin > 1 and majuscules(mots[fin - 1]):
        fin -= 1
    if fin < len(mots) and not all(majuscules(m) for m in mots):
        return " ".join(mots[fin:]), " ".join(mots[:fin])
    debut = 0
    while debut < len(mots) - 1 and majuscules(mots[debut]):
        debut += 1
    if debut and not all(majuscules(m) for m in mots):
        return " ".join(mots[:debut]), " ".join(mots[debut:])
    return mots[-1], " ".join(mots[:-1])


class ImportDirigeantProcessor(BaseImportProcessor):
    """Import des dirigeants et, si la ligne le précise, de leur mandat dans une IMF.

    Clé de rapprochement d'un dirigeant : nom + prénom, confirmés par l'email, le
    téléphone ou un mandat dans la même IMF (une adresse email est souvent partagée
    par plusieurs dirigeants d'une même institution : elle ne suffit pas).
    Clé d'un mandat : dirigeant + IMF + fonction + date de début.
    """

    type_import = ImportationFichier.TypeImport.DIRIGEANTS
    colonnes = [
        "nom", "prenom", "telephone", "email", "email_secondaire", "adresse",
        "imf_sigle", "imf_agrement", "fonction_mandat", "date_debut", "date_fin", "statut_mandat",
    ]
    obligatoires = {"nom", "prenom"}
    feuilles = ("dirigeants", "imf")
    dates = {"date_debut", "date_fin"}
    alias = {"email_professionnel": "email", "imf": "imf_sigle"}
    COLONNES_MANDAT = ("imf_sigle", "imf_agrement", "imf_nom", "fonction_mandat", "date_debut", "date_fin", "statut_mandat")

    # Export de l'annuaire DRS-SFD : les dirigeants sont des colonnes de la feuille « IMF ».
    # (colonne du nom, fonction, colonne email, colonne téléphone, colonne adresse)
    _F = Mandat.FonctionMandat
    DIRIGEANTS_ANNUAIRE = (
        ("president_du_ca", _F.PCA, "e_mail_du_pca", "telephone_du_pca", ""),
        ("vice_president_du_ca", _F.VICE_PRESIDENT_CA, "", "", ""),
        ("secretaire_general_du_ca", _F.SECRETAIRE_GENERAL_CA, "", "", ""),
        ("president_du_cs", _F.PRESIDENT_CONSEIL_SURVEILLANCE,
         "e_mail_du_president_du_cs", "telephone_du_president_du_cs", ""),
        ("vice_president_du_cs", _F.VICE_PRESIDENT_CS, "", "", ""),
        ("secretaire_general_du_cs", _F.SECRETAIRE_GENERAL_CS, "", "", ""),
        ("president_du_cc", _F.PRESIDENT_COMITE_CREDIT, "", "telephone_du_pcc", "adresse_du_pcc"),
        ("vice_president_du_cc", _F.VICE_PRESIDENT_CC, "", "", ""),
        ("secretaire_general_du_cc", _F.SECRETAIRE_GENERAL_CC, "", "", ""),
        ("directeur_general_gerant", None, "e_mail_dg", "telephone_dg", "adresse_dg"),
    )

    def adapter_lignes(self, entetes: list[str], lignes: list[LigneLue]) -> list[LigneLue]:
        """Annuaire : une ligne IMF devient une ligne par dirigeant renseigné.

        L'annuaire ne donne pas la date de prise de fonction : la date de création de
        la fiche, à laquelle le dirigeant était en poste, sert de date de début.
        """
        if "president_du_ca" not in entetes:
            return lignes
        logger.info("Import %s : format annuaire DRS-SFD détecté (dirigeants issus de la feuille IMF)", self.importation.pk)
        resultat = []
        for ligne in lignes:
            source = ligne.valeurs
            societe_anonyme = cle(source.get("forme_juridique")) == "sa"
            for colonne, fonction, col_email, col_telephone, col_adresse in self.DIRIGEANTS_ANNUAIRE:
                if not source.get(colonne):
                    continue
                if fonction is None:
                    fonction = self._F.DG if societe_anonyme else self._F.GERANT
                resultat.append(LigneLue(ligne.numero, {
                    "nom_complet": source[colonne],
                    "email": source.get(col_email, ""),
                    "telephone": source.get(col_telephone, ""),
                    "adresse": source.get(col_adresse, ""),
                    "imf_agrement": source.get("numero_d_agrement", ""),
                    "imf_nom": source.get("nom_de_l_imf", ""),
                    "fonction_mandat": fonction,
                    "date_debut": source.get("date_de_creation_fiche", ""),
                    # Présentes pour le contrôle des colonnes obligatoires.
                    "nom": "", "prenom": "",
                }))
        return resultat

    def preparer(self, valeurs: dict) -> dict:
        donnees = super().preparer(valeurs)
        if donnees.get("nom_complet") and not (donnees.get("nom") and donnees.get("prenom")):
            donnees["nom"], donnees["prenom"] = scinder_nom_complet(donnees["nom_complet"])
        self.nettoyer_telephone(donnees)
        donnees["fonction_mandat"] = _choix(
            donnees.get("fonction_mandat", ""), Mandat.FonctionMandat.choices, {}, "fonction_mandat"
        )
        donnees["statut_mandat"] = _choix(
            donnees.get("statut_mandat", ""), Mandat.StatutMandat.choices, {}, "statut_mandat"
        )
        return donnees

    def traiter_ligne(self, donnees: dict) -> bool:
        self.verifier_obligatoires(donnees)
        mandat = _sans_vides({c: donnees.get(c, "") for c in self.COLONNES_MANDAT})
        imf = None
        if mandat:
            manquantes = [c for c in ("fonction_mandat", "date_debut") if c not in mandat]
            if manquantes:
                raise ErreurLigne({c: "Obligatoire pour enregistrer un mandat." for c in manquantes})
            imf = _resoudre_imf(mandat)

        personne = _sans_vides({
            "nom": donnees["nom"],
            "prenom": donnees["prenom"],
            "telephone": donnees.get("telephone", ""),
            "adresse": donnees.get("adresse", ""),
            "email_professionnel": donnees.get("email", ""),
            "email_secondaire": donnees.get("email_secondaire", ""),
        })
        existant = self._trouver(personne, imf)
        dirigeant = self._enregistrer(
            DirigeantDetailSerializer, existant, personne, obligatoires=self.obligatoires
        )

        if imf is not None:
            champs = {c: v for c, v in mandat.items() if not c.startswith("imf_")}
            champs["imf"] = str(imf.pk)
            mandat_existant = Mandat.objects.filter(
                dirigeant=dirigeant, imf=imf, is_active=True,
                fonction_mandat=champs["fonction_mandat"], date_debut=champs["date_debut"],
            ).first()
            self._enregistrer(MandatSerializer, mandat_existant, champs, obligatoires=set(champs), dirigeant=dirigeant)
        return existant is None

    @staticmethod
    def _trouver(personne: dict, imf: IMF | None) -> Dirigeant | None:
        """Dirigeant actif de mêmes nom et prénom, confirmé par un autre élément commun."""
        candidats = list(Dirigeant.objects.filter(
            is_active=True, nom__iexact=personne["nom"], prenom__iexact=personne["prenom"]
        ))
        email = personne.get("email_professionnel", "").lower()
        telephone = re.sub(r"\D", "", personne.get("telephone", ""))
        for candidat in candidats:
            if email and candidat.email_professionnel.lower() == email:
                return candidat
            if telephone and re.sub(r"\D", "", candidat.telephone) == telephone:
                return candidat
            if imf is not None and candidat.mandats.filter(imf=imf, is_active=True).exists():
                return candidat
        # Ligne sans élément de confirmation : on ne rapproche que s'il n'y a aucun homonyme.
        if not email and not telephone and imf is None and len(candidats) == 1:
            return candidats[0]
        return None


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

PROCESSORS: dict[str, type[BaseImportProcessor]] = {
    processor.type_import: processor
    for processor in (ImportIMFProcessor, ImportPointServiceProcessor, ImportDirigeantProcessor)
}


def lancer_importation(importation: ImportationFichier) -> BilanImport:
    """Exécute le processor correspondant au type de l'import et retourne son bilan."""
    return PROCESSORS[importation.type_import](importation).executer()
