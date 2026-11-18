"""
assistant/moteur.py
===================
Moteur de questions-réponses local (sans IA externe) sur les données de la plateforme.

1. La question est normalisée (minuscules, sans accents, mots).
2. On y repère : une institution (sigle, nom, numéro d'agrément), une région ou un département,
   un statut réglementaire, un type d'IMF, un type ou un statut de point, une fonction de
   dirigeant, un nom de dirigeant, et l'intention (compter, lister, coordonnées, échéances…).
3. Une requête en lecture seule produit la réponse, avec des liens vers les écrans de l'application.

Sans aucun repère du domaine, la question est déclarée hors sujet.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.points_service.models import PointService

MAX_ELEMENTS = 6

HORS_SUJET = (
    "Je réponds uniquement aux questions sur les données de la plateforme : institutions de "
    "microfinance, points de service, dirigeants et mandats. Votre question ne concerne pas ce périmètre."
)
SUGGESTIONS = [
    "Combien d'IMF sont en OPR ?",
    "Qui est le DG de l'ACEP Dakar ?",
    "Points de service de la région de Thiès",
    "Mandats qui expirent bientôt",
]

# --------------------------------------------------------------------------------------
# Vocabulaire
# --------------------------------------------------------------------------------------

MOTS_VIDES = set(
    "a au aux avec ce ces cet cette d de des du dans en est et il ils je j la le les leur leurs l me mes moi mon ma "
    "ne nous on ou où par pas pour qu que quel quelle quelles quels qui sa se ses son sont sur t ta te tes toi ton "
    "tu un une vos votre y s c n m elle elles donne donner dis dire montre montrer affiche afficher peux pouvez "
    "veux voudrais savoir connaitre trouve trouver svp merci stp il y a ont avoir etre fait faire tout tous toutes "
    "toute chaque comment ou quand plus moins tres bien aussi alors sans exemple".split()
)
DOMAINE = set(
    "imf imfs institution institutions microfinance sfd sfds caisse caisses mutuelle mutuelles cooperative "
    "cooperatives association associations societe societes anonyme anonymes point points service services agence "
    "agences guichet guichets siege sieges dirigeant dirigeants dirigeante dirigeantes mandat mandats fonction "
    "fonctions responsable responsables president presidente presidents directeur directrice directeurs gerant "
    "gerante gerants statut statuts activite actives actifs active actif opr retrait agrement agrements agree "
    "region regions departement departements commune communes membres encours depots telephone telephones "
    "contact contacts email emails mail adresse adresses gps coordonnees geolocalise geolocalises localisation "
    "combien nombre liste lister total echeance echeances expire expirent expiration renouveler statistique "
    "statistiques chiffres bilan resume secteur reseau ouvert ouverts ouverte ouvertes ferme fermes fermee fermees "
    "conseil administration surveillance commission credit dg dga pca daf".split()
)
SALUTATIONS = {"bonjour", "bonsoir", "salut", "hello", "coucou", "aide", "help"}

STATUTS_IMF = [
    (("retrait",), "RETRAIT_AGREMENT"),
    (("opr",), "OPR"),
    (("en", "activite"), "EN_ACTIVITE"), (("actives",), "EN_ACTIVITE"), (("actifs",), "EN_ACTIVITE"),
    (("active",), "EN_ACTIVITE"), (("actif",), "EN_ACTIVITE"), (("activite",), "EN_ACTIVITE"),
]
TYPES_IMF = [
    (("societe", "anonyme"), "SA"), (("societes", "anonymes"), "SA"),
    (("mutuelle",), "MUTUELLE"), (("mutuelles",), "MUTUELLE"),
    (("cooperative",), "COOPERATIVE"), (("cooperatives",), "COOPERATIVE"),
    (("association",), "ASSOCIATION"), (("associations",), "ASSOCIATION"),
]
TYPES_POINT = [(("agence",), "AGENCE"), (("agences",), "AGENCE"), (("guichet",), "GUICHET"), (("guichets",), "GUICHET")]
MOTS_SIEGE = {"siege", "sieges"}
STATUTS_POINT = [
    (("ouvert",), "OUVERT"), (("ouverts",), "OUVERT"), (("ouverte",), "OUVERT"), (("ouvertes",), "OUVERT"),
    (("ferme",), "FERME"), (("fermes",), "FERME"), (("fermee",), "FERME"), (("fermees",), "FERME"),
]
# Fonctions : formes longues d'abord (« directeur general adjoint » avant « directeur general »).
FONCTIONS = [
    (("directeur", "general", "adjoint"), "DGA"), (("directrice", "generale", "adjointe"), "DGA"), (("dga",), "DGA"),
    (("directeur", "general"), "DG"), (("directrice", "generale"), "DG"), (("dg",), "DG"),
    (("president", "conseil", "administration"), "PCA"), (("presidente", "conseil", "administration"), "PCA"), (("pca",), "PCA"),
    (("president", "conseil", "surveillance"), "PRESIDENT_CONSEIL_SURVEILLANCE"), (("pcs",), "PRESIDENT_CONSEIL_SURVEILLANCE"),
    (("president", "commission", "credit"), "PRESIDENT_COMITE_CREDIT"), (("president", "comite", "credit"), "PRESIDENT_COMITE_CREDIT"),
    (("directeur", "administratif"), "DAF"), (("daf",), "DAF"),
    (("gerant",), "GERANT"), (("gerante",), "GERANT"), (("gerants",), "GERANT"),
    (("auditeur",), "AUDITEUR_INTERNE"), (("conformite",), "RESPONSABLE_CONFORMITE"),
]
LIBELLE_FONCTION = dict(Mandat.FonctionMandat.choices)
LIBELLE_STATUT_IMF = dict(IMF.StatutReglementaire.choices)
LIBELLE_TYPE_IMF = dict(IMF.TypeIMF.choices)
LIBELLE_TYPE_POINT = dict(PointService.TypePoint.choices)
LIBELLE_STATUT_POINT = dict(PointService.StatutPoint.choices)
LIBELLE_STATUT_MANDAT = dict(Mandat.StatutMandat.choices)


def normaliser(texte: str) -> list[str]:
    """« Qui est le DG de l'ACEP ? » -> ["qui", "est", "le", "dg", "de", "l", "acep"]."""
    sans_accents = unicodedata.normalize("NFKD", str(texte or ""))
    sans_accents = "".join(c for c in sans_accents if not unicodedata.combining(c))
    return [m for m in re.split(r"[^a-z0-9]+", sans_accents.lower()) if m]


def _trouver(mots: list[str], expression: tuple[str, ...]) -> int:
    """Position de l'expression (suite de mots) dans la question, ou -1."""
    n = len(expression)
    for i in range(len(mots) - n + 1):
        if tuple(mots[i:i + n]) == expression:
            return i
    return -1


def _premier(mots: list[str], table) -> tuple[str | None, set[int]]:
    """Première valeur de la table dont l'expression figure dans la question, et ses positions."""
    for expression, valeur in table:
        i = _trouver(mots, expression)
        if i >= 0:
            return valeur, set(range(i, i + len(expression)))
    return None, set()


# --------------------------------------------------------------------------------------
# Réponse
# --------------------------------------------------------------------------------------

@dataclass
class Reponse:
    texte: str
    elements: list[dict] = field(default_factory=list)
    lien: dict | None = None
    suggestions: list[str] = field(default_factory=list)
    hors_sujet: bool = False
    #: Identifiants des dirigeants affichés (journal d'audit).
    dirigeants_consultes: list[str] = field(default_factory=list)

    def en_dict(self) -> dict:
        return {"texte": self.texte, "elements": self.elements, "lien": self.lien,
                "suggestions": self.suggestions, "hors_sujet": self.hors_sujet}


def _element(titre: str, sous_titre: str = "", lien: str = "") -> dict:
    return {"titre": titre, "sous_titre": sous_titre, "lien": lien}


def _pluriel(n: int, singulier: str, pluriel: str | None = None) -> str:
    return f"{n:,}".replace(",", " ") + " " + (singulier if n <= 1 else (pluriel or singulier + "s"))


def _qs(**params) -> str:
    parties = [f"{k}={v}" for k, v in params.items() if v]
    return ("?" + "&".join(parties)) if parties else ""


def _nom_imf(imf: IMF) -> str:
    return f"{imf.nom} ({imf.sigle})" if imf.sigle and imf.sigle.lower() not in imf.nom.lower() else imf.nom


# --------------------------------------------------------------------------------------
# Analyse de la question
# --------------------------------------------------------------------------------------

@dataclass
class Analyse:
    mots: list[str]
    imfs: list[IMF] = field(default_factory=list)
    zone: ZoneGeographique | None = None
    statut_imf: str | None = None
    type_imf: str | None = None
    type_point: str | None = None
    siege: bool = False
    statut_point: str | None = None
    fonction: str | None = None
    reste: list[str] = field(default_factory=list)  # mots non reconnus (noms propres possibles)

    def a(self, *mots: str) -> bool:
        return any(m in self.mots for m in mots)


def _index_imf() -> list[tuple[IMF, tuple[str, ...], set[str], str]]:
    """IMF actives avec leur sigle (mots), les mots de leur nom et leur numéro d'agrément."""
    return [
        (imf, tuple(normaliser(imf.sigle)), set(normaliser(imf.nom)), "".join(normaliser(imf.numero_agrement)))
        for imf in IMF.objects.filter(is_active=True).only("id", "nom", "sigle", "numero_agrement")
    ]


def _chercher_imf(mots: list[str], utilises: set[int], significatifs: list[str]) -> list[IMF]:
    index = _index_imf()
    # 1. Sigle complet présent dans la question (le plus long l'emporte : « ccms bakel » avant « ccms »).
    trouves: list[tuple[int, IMF, set[int]]] = []
    for imf, sigle, _, _ in index:
        if sigle and (len(sigle) > 1 or len(sigle[0]) >= 3):
            i = _trouver(mots, sigle)
            if i >= 0:
                trouves.append((len(sigle), imf, set(range(i, i + len(sigle)))))
    if trouves:
        longueur = max(t[0] for t in trouves)
        meilleurs = [t for t in trouves if t[0] == longueur]
        for _, _, pos in meilleurs:
            utilises |= pos
        return [t[1] for t in meilleurs]
    # 2. Numéro d'agrément (« DK1-93-00008 »).
    colle = "".join(mots)
    for imf, _, _, agrement in index:
        if agrement and len(agrement) >= 6 and agrement in colle:
            return [imf]
    # 3. Premier mot d'un sigle (« acep » -> ACEP DAKAR, ACEP THIES…).
    for i, mot in enumerate(mots):
        if len(mot) >= 3 and mot not in DOMAINE and mot not in MOTS_VIDES:
            par_sigle = [imf for imf, sigle, _, _ in index if sigle and sigle[0] == mot]
            if par_sigle:
                utilises.add(i)
                return par_sigle
    # 4. Mots du nom : toutes les mots significatifs restants figurent dans le nom.
    if significatifs:
        par_nom = [imf for imf, _, mots_nom, _ in index if all(m in mots_nom for m in significatifs)]
        if par_nom:
            utilises |= {i for i, m in enumerate(mots) if m in significatifs}
            return sorted(par_nom, key=lambda imf: len(imf.nom))
    return []


def analyser(question: str) -> Analyse:
    mots = normaliser(question)
    a = Analyse(mots=mots)
    utilises: set[int] = set()

    for table, attribut in ((FONCTIONS, "fonction"), (STATUTS_IMF, "statut_imf"), (TYPES_IMF, "type_imf"),
                            (TYPES_POINT, "type_point"), (STATUTS_POINT, "statut_point")):
        sans_vides = mots if table is not FONCTIONS else [m for m in mots if m not in {"du", "de", "d", "la", "l"}]
        valeur, pos = _premier(sans_vides, table)
        setattr(a, attribut, valeur)
        if valeur and table is not FONCTIONS:
            utilises |= pos
    a.siege = bool(MOTS_SIEGE & set(mots))

    # Institution, avant la zone : « CCMS Ziguinchor » est une IMF, « à Ziguinchor » une région.
    significatifs = [m for m in mots if len(m) >= 3 and m not in DOMAINE and m not in MOTS_VIDES]
    zones = {tuple(normaliser(z.nom)): z for z in ZoneGeographique.objects.filter(type_zone__in=["REGION", "DEPARTEMENT"])}
    significatifs_imf = [m for m in significatifs if not any(m in cle for cle in zones)]
    a.imfs = _chercher_imf(mots, utilises, significatifs_imf)

    # Zone : région d'abord, puis département ; la plus longue expression l'emporte.
    for expression in sorted(zones, key=len, reverse=True):
        i = _trouver(mots, expression)
        if i >= 0 and not (set(range(i, i + len(expression))) & utilises):
            candidate = zones[expression]
            if a.zone is None or (candidate.type_zone == "REGION" and a.zone.type_zone != "REGION"):
                a.zone = candidate
                utilises |= set(range(i, i + len(expression)))
            break

    a.reste = [m for i, m in enumerate(mots) if i not in utilises and m in significatifs
               and not any(m in cle for cle in zones)]
    return a


# --------------------------------------------------------------------------------------
# Requêtes
# --------------------------------------------------------------------------------------

def _imfs_filtrees(a: Analyse):
    qs = IMF.objects.filter(is_active=True)
    if a.statut_imf:
        qs = qs.filter(statut_reglementaire=a.statut_imf)
    if a.type_imf:
        qs = qs.filter(type_imf=a.type_imf)
    if a.zone:
        # Siège dans la zone : région de l'IMF, ou zone de son agence « siège ».
        champ = "region" if a.zone.type_zone == "REGION" else "departement"
        siege = Q(points_service__est_siege=True, points_service__is_active=True, **{f"points_service__{champ}": a.zone})
        qs = qs.filter((Q(region=a.zone) | siege) if champ == "region" else siege).distinct()
    return qs


def _points_filtres(a: Analyse):
    qs = PointService.objects.filter(is_active=True, imf__is_active=True).select_related("imf", "region", "commune")
    if a.imfs:
        qs = qs.filter(imf__in=a.imfs)
    if a.type_point:
        qs = qs.filter(type_point=a.type_point)
    if a.siege:
        qs = qs.filter(est_siege=True)
    if a.statut_point:
        qs = qs.filter(statut_point=a.statut_point)
    if a.statut_imf:
        qs = qs.filter(imf__statut_reglementaire=a.statut_imf)
    if a.zone:
        qs = qs.filter(**{"region" if a.zone.type_zone == "REGION" else "departement": a.zone})
    if a.a("gps", "geolocalise", "geolocalises", "coordonnees") and a.a("sans", "pas", "non", "manque", "manquent"):
        qs = qs.filter(localisation__isnull=True)
    return qs


def _mandats_filtres(a: Analyse):
    qs = Mandat.objects.filter(is_active=True, dirigeant__is_active=True, imf__is_active=True).select_related("dirigeant", "imf")
    if a.imfs:
        qs = qs.filter(imf__in=a.imfs)
    if a.fonction:
        qs = qs.filter(fonction_mandat=a.fonction)
    if a.zone and a.zone.type_zone == "REGION":
        qs = qs.filter(imf__region=a.zone)
    return qs


def _descr_filtres(a: Analyse, sujet: str) -> str:
    morceaux = []
    if sujet == "imf":
        if a.type_imf:
            morceaux.append(f"de type {LIBELLE_TYPE_IMF[a.type_imf].lower()}")
        if a.statut_imf:
            morceaux.append(f"au statut « {LIBELLE_STATUT_IMF[a.statut_imf]} »")
        if a.zone:
            morceaux.append(f"dont le siège est dans {'la région' if a.zone.type_zone == 'REGION' else 'le département'} de {a.zone.nom}")
    else:
        if a.imfs and len(a.imfs) == 1:
            morceaux.append(f"de {a.imfs[0].sigle or a.imfs[0].nom}")
        elif a.imfs:
            morceaux.append(f"des {len(a.imfs)} institutions « {(a.imfs[0].sigle or '').split()[0] if a.imfs[0].sigle else a.imfs[0].nom} »")
        if a.statut_point:
            morceaux.append(f"au statut « {LIBELLE_STATUT_POINT[a.statut_point]} »")
        if a.zone:
            morceaux.append(f"dans {'la région' if a.zone.type_zone == 'REGION' else 'le département'} de {a.zone.nom}")
    return (" " + ", ".join(morceaux)) if morceaux else ""


# --------------------------------------------------------------------------------------
# Réponses par intention
# --------------------------------------------------------------------------------------

def _fiche_imf(imf: IMF, contacts_seuls: bool = False) -> Reponse:
    region = imf.region.nom if imf.region_id else (
        PointService.objects.filter(imf=imf, est_siege=True, region__isnull=False).values_list("region__nom", flat=True).first())
    nb_points = PointService.objects.filter(imf=imf, is_active=True).count()
    direction = list(Mandat.objects.filter(imf=imf, is_active=True, statut_mandat="EN_FONCTION", fonction_mandat__in=["DG", "PCA", "GERANT"])
                     .select_related("dirigeant").order_by("fonction_mandat"))
    nb_dirigeants = Mandat.objects.filter(imf=imf, is_active=True, statut_mandat="EN_FONCTION").values("dirigeant").distinct().count()
    contacts = [f"Téléphone : {imf.telephone}" if imf.telephone else "", f"Email : {imf.email}" if imf.email else "",
                f"Adresse du siège : {imf.adresse_siege}" if imf.adresse_siege else ""]
    contacts = [c for c in contacts if c]
    if contacts_seuls:
        texte = f"**{_nom_imf(imf)}**\n" + ("\n".join(contacts) if contacts else "Aucune coordonnée n'est enregistrée pour cette institution.")
    else:
        lignes = [
            f"**{_nom_imf(imf)}** — {LIBELLE_TYPE_IMF.get(imf.type_imf, imf.type_imf)}, statut « {LIBELLE_STATUT_IMF.get(imf.statut_reglementaire, imf.statut_reglementaire)} ».",
            f"Siège : {region or 'région non renseignée'}." + (f" N° d'agrément : {imf.numero_agrement}." if imf.numero_agrement else ""),
            f"{_pluriel(nb_points, 'point')} de service, {_pluriel(nb_dirigeants, 'dirigeant')} en fonction.",
        ]
        if direction:
            lignes.append("Direction : " + " ; ".join(f"{LIBELLE_FONCTION[m.fonction_mandat]} — {m.dirigeant.get_nom_complet()}" for m in direction) + ".")
        lignes += contacts
        texte = "\n".join(lignes)
    return Reponse(
        texte, elements=[_element(_nom_imf(imf), region or "", f"/consultation?imf={imf.pk}")],
        lien={"libelle": "Ouvrir la fiche de l'institution", "url": f"/consultation?imf={imf.pk}"},
        suggestions=[f"Dirigeants de {imf.sigle or imf.nom}", f"Points de service de {imf.sigle or imf.nom}"],
        dirigeants_consultes=[str(m.dirigeant_id) for m in direction],
    )


def _plusieurs_imf(imfs: list[IMF]) -> Reponse:
    return Reponse(
        f"Plusieurs institutions correspondent ({len(imfs)}). Précisez laquelle :",
        elements=[_element(_nom_imf(i), "", f"/consultation?imf={i.pk}") for i in imfs[:MAX_ELEMENTS]],
        suggestions=[f"Fiche de {i.sigle or i.nom}" for i in imfs[:3]],
    )


def _dirigeants(a: Analyse, contacts: bool) -> Reponse:
    mandats = _mandats_filtres(a).filter(statut_mandat__in=["EN_FONCTION", "INTERIM"]).order_by("imf__nom", "fonction_mandat")
    total = mandats.count()
    lien_dir = "/dirigeants" + _qs(imf=a.imfs[0].pk if len(a.imfs) == 1 else "", fonction=a.fonction or "",
                                   region=a.zone.pk if a.zone and a.zone.type_zone == "REGION" else "")
    cible = (a.imfs[0].sigle or a.imfs[0].nom) if len(a.imfs) == 1 else ""
    fonction = LIBELLE_FONCTION.get(a.fonction, "") if a.fonction else ""
    if not total:
        quoi = f"Aucun mandat de {fonction.lower() or 'dirigeant'} en cours n'est enregistré" + (f" pour **{cible}**" if cible else "") + "."
        if a.fonction and cible:
            # La fonction demandée n'existe pas pour cette institution : on montre sa direction enregistrée.
            autre = _dirigeants(Analyse(mots=a.mots, imfs=a.imfs), contacts)
            autre.texte = quoi + " Voici les dirigeants enregistrés pour cette institution.\n" + autre.texte
            return autre
        return Reponse(quoi, lien={"libelle": "Voir les dirigeants", "url": lien_dir})
    liste = list(mandats[:MAX_ELEMENTS])
    if a.fonction and cible and total == 1:
        m = liste[0]
        d = m.dirigeant
        texte = f"Le poste de {fonction.lower()} de **{cible}** est occupé par **{d.get_nom_complet()}**" + (
            f", en fonction depuis le {m.date_debut:%d/%m/%Y}." if m.date_debut else ".")
        coord = [f"Téléphone : {d.telephone}" if d.telephone else "", f"Email : {d.email_professionnel}" if d.email_professionnel else ""]
        if any(coord):
            texte += "\n" + "\n".join(c for c in coord if c)
    else:
        intitule = fonction.lower() if fonction else "toutes fonctions"
        texte = f"{_pluriel(total, 'mandat')} en cours ({intitule}" + (f" de **{cible}**" if cible else "") + (
            f", région de {a.zone.nom}" if a.zone and a.zone.type_zone == "REGION" else "") + ")."
        if total > MAX_ELEMENTS:
            texte += f" Voici les {MAX_ELEMENTS} premiers."
    elements = []
    for m in liste:  # noqa: B007
        details = [LIBELLE_FONCTION.get(m.fonction_mandat, m.fonction_mandat)]
        if not cible:
            details.append(m.imf.sigle or m.imf.nom)
        if contacts:
            details += [x for x in (m.dirigeant.telephone, m.dirigeant.email_professionnel) if x]
        elements.append(_element(m.dirigeant.get_nom_complet(), " · ".join(details), f"/dirigeants?imf={m.imf_id}"))
    return Reponse(texte, elements=elements, lien={"libelle": "Voir tous ces mandats", "url": lien_dir},
                   dirigeants_consultes=[str(m.dirigeant_id) for m in liste])


def _personne(a: Analyse, contacts: bool) -> Reponse | None:
    """Recherche d'un dirigeant par son nom (mots non reconnus de la question)."""
    if not a.reste:
        return None
    filtre = Q()
    for mot in a.reste:
        filtre &= Q(nom__icontains=mot) | Q(prenom__icontains=mot)
    personnes = list(Dirigeant.objects.filter(filtre, is_active=True).prefetch_related("mandats__imf")[:MAX_ELEMENTS + 1])
    if not personnes:
        return None
    elements = []
    for d in personnes[:MAX_ELEMENTS]:
        mandats = [m for m in d.mandats.all() if m.is_active]
        details = " ; ".join(f"{LIBELLE_FONCTION.get(m.fonction_mandat, m.fonction_mandat)} — {m.imf.sigle or m.imf.nom} "
                             f"({LIBELLE_STATUT_MANDAT.get(m.statut_mandat, '').lower()})" for m in mandats) or "aucun mandat en cours"
        if contacts:
            details += "".join(f" · {x}" for x in (d.telephone, d.email_professionnel) if x)
        elements.append(_element(d.get_nom_complet(), details, f"/dirigeants?q={d.nom}"))
    texte = (f"J'ai trouvé {_pluriel(len(personnes), 'dirigeant')} correspondant à « {' '.join(a.reste)} »"
             + (" (les premiers seulement)." if len(personnes) > MAX_ELEMENTS else "."))
    return Reponse(texte, elements=elements, lien={"libelle": "Rechercher dans les dirigeants", "url": f"/dirigeants?q={' '.join(a.reste)}"},
                   dirigeants_consultes=[str(d.pk) for d in personnes[:MAX_ELEMENTS]])


def _points(a: Analyse, compter: bool) -> Reponse:
    qs = _points_filtres(a)
    total = qs.count()
    nature = "siège" if a.siege else (LIBELLE_TYPE_POINT[a.type_point].lower() if a.type_point else "point de service")
    pluriel_nature = {"siège": "sièges", "point de service": "points de service"}.get(nature, nature + "s")
    sans_gps = a.a("gps", "geolocalise", "geolocalises", "coordonnees") and a.a("sans", "pas", "non", "manque", "manquent")
    quantite = f"Aucun {nature}" if not total else _pluriel(total, nature, pluriel_nature)
    texte = f"{quantite}{_descr_filtres(a, 'point')}" + (" sans coordonnées GPS" if sans_gps else "") + "."
    texte = texte[0].upper() + texte[1:]
    lien = "/points-service" + _qs(imf=a.imfs[0].pk if len(a.imfs) == 1 else "", type=a.type_point or "", statut=a.statut_point or "",
                                   region=a.zone.pk if a.zone and a.zone.type_zone == "REGION" else "",
                                   departement=a.zone.pk if a.zone and a.zone.type_zone == "DEPARTEMENT" else "", gps="sans" if sans_gps else "")
    elements = []
    if total and not (compter and total > MAX_ELEMENTS):
        for p in qs.order_by("nom")[:MAX_ELEMENTS]:
            lieu = (p.commune.nom if p.commune_id else None) or (p.region.nom if p.region_id else "lieu non renseigné")
            elements.append(_element(p.nom, f"{LIBELLE_TYPE_POINT.get(p.type_point, '')} · {p.imf.sigle or p.imf.nom} · {lieu}",
                                     f"/points-service?imf={p.imf_id}"))
        if total > MAX_ELEMENTS:
            texte += f" Voici les {MAX_ELEMENTS} premiers résultats."
    return Reponse(texte, elements=elements, lien={"libelle": "Voir dans Points de service", "url": lien})


def _imfs(a: Analyse, compter: bool) -> Reponse:
    qs = _imfs_filtrees(a)
    total = qs.count()
    texte = f"{'Aucune institution' if not total else _pluriel(total, 'institution')}{_descr_filtres(a, 'imf')}."
    texte = texte[0].upper() + texte[1:]
    if not compter and not (a.statut_imf or a.type_imf or a.zone):
        repartition = dict(qs.values_list("statut_reglementaire").annotate(n=Count("pk")))
        texte += " Répartition : " + ", ".join(f"{LIBELLE_STATUT_IMF[s]} {repartition.get(s, 0)}" for s in LIBELLE_STATUT_IMF) + "."
    elements = []
    if total and (not compter or total <= MAX_ELEMENTS):
        for imf in qs.order_by("nom")[:MAX_ELEMENTS]:
            elements.append(_element(_nom_imf(imf), LIBELLE_STATUT_IMF.get(imf.statut_reglementaire, ""), f"/consultation?imf={imf.pk}"))
        if total > MAX_ELEMENTS:
            texte += f" Voici les {MAX_ELEMENTS} premières."  # institutions
    return Reponse(texte, elements=elements, lien={"libelle": "Voir dans Institutions", "url": "/imf" + _qs(statut=a.statut_imf or "")})


def _echeances(a: Analyse) -> Reponse:
    aujourd_hui = timezone.localdate()
    qs = _mandats_filtres(a).filter(date_fin__isnull=False, date_fin__lte=aujourd_hui + timedelta(days=90)).order_by("date_fin")
    total = qs.count()
    if not total:
        return Reponse("Aucun mandat n'expire dans les 90 prochains jours, et aucune échéance n'est dépassée.",
                       lien={"libelle": "Voir les mandats", "url": "/dirigeants"})
    liste = list(qs[:MAX_ELEMENTS])
    elements = [_element(m.dirigeant.get_nom_complet(),
                         f"{LIBELLE_FONCTION.get(m.fonction_mandat, '')} · {m.imf.sigle or m.imf.nom} · "
                         + ("échu le " if m.date_fin < aujourd_hui else "expire le ") + f"{m.date_fin:%d/%m/%Y}",
                         f"/dirigeants?imf={m.imf_id}") for m in liste]
    return Reponse(f"{_pluriel(total, 'mandat')} arrivé(s) à échéance ou expirant sous 90 jours.", elements=elements,
                   lien={"libelle": "Voir les échéances", "url": "/dirigeants?alerte=echeance"},
                   dirigeants_consultes=[str(m.dirigeant_id) for m in liste])


def _statistiques() -> Reponse:
    imfs = IMF.objects.filter(is_active=True)
    par_statut = dict(imfs.values_list("statut_reglementaire").annotate(n=Count("pk")))
    points = PointService.objects.filter(is_active=True, imf__is_active=True)
    par_type = dict(points.values_list("type_point").annotate(n=Count("pk")))
    mandats = Mandat.objects.filter(is_active=True, dirigeant__is_active=True, imf__is_active=True, statut_mandat="EN_FONCTION")
    texte = "\n".join([
        f"**{_pluriel(imfs.count(), 'institution')}** : " + ", ".join(f"{LIBELLE_STATUT_IMF[s]} {par_statut.get(s, 0)}" for s in LIBELLE_STATUT_IMF) + ".",
        f"**{_pluriel(points.count(), 'point')} de service** : " + ", ".join(f"{LIBELLE_TYPE_POINT[t]}s {par_type.get(t, 0)}" for t in LIBELLE_TYPE_POINT)
        + f", dont {points.filter(localisation__isnull=True).count()} sans coordonnées GPS.",
        f"**{_pluriel(mandats.values('dirigeant').distinct().count(), 'dirigeant')} en fonction**.",
    ])
    return Reponse(texte, lien={"libelle": "Ouvrir le tableau de bord", "url": "/"}, suggestions=SUGGESTIONS[:3])


# --------------------------------------------------------------------------------------
# Aiguillage
# --------------------------------------------------------------------------------------

def repondre(question: str) -> Reponse:
    a = analyser(question)
    mots = set(a.mots)
    if not mots:
        return Reponse("Posez votre question sur les institutions, les points de service ou les dirigeants.", suggestions=SUGGESTIONS)

    if mots & SALUTATIONS and not (mots & DOMAINE) and not a.imfs:
        return Reponse(
            "Bonjour. Je réponds à vos questions sur les données de la plateforme : institutions de microfinance, "
            "points de service, dirigeants et mandats. Par exemple :", suggestions=SUGGESTIONS)

    # Une zone seule (« Quel temps fait-il à Dakar ? ») ne suffit pas : il faut un mot du domaine,
    # une institution ou une fonction de dirigeant.
    du_domaine = bool(mots & DOMAINE) or bool(a.imfs) or a.fonction is not None
    if not du_domaine and not _personne(a, False):
        return Reponse(HORS_SUJET, suggestions=SUGGESTIONS, hors_sujet=True)

    compter = a.a("combien", "nombre", "total", "compte", "nb")
    contacts = a.a("telephone", "telephones", "contact", "contacts", "email", "emails", "mail", "joindre", "numero", "adresse")
    sujet_points = a.a("point", "points", "agence", "agences", "guichet", "guichets") or a.siege or a.type_point or a.statut_point
    sujet_dirigeants = (a.a("dirigeant", "dirigeants", "dirigeante", "dirigeantes", "mandat", "mandats", "qui", "dirige",
                            "responsable", "responsables", "president", "presidente") or a.fonction is not None)

    if a.a("expire", "expirent", "expiration", "echeance", "echeances", "renouveler", "echu", "echus"):
        return _echeances(a)
    if a.a("statistique", "statistiques", "chiffres", "bilan", "resume", "synthese") or (a.a("secteur") and not a.imfs):
        return _statistiques()

    if len(a.imfs) > 1 and not (compter and not sujet_points and not sujet_dirigeants):
        if sujet_points:
            return _points(a, compter)
        return _plusieurs_imf(a.imfs)

    if sujet_points:
        return _points(a, compter)
    if sujet_dirigeants:
        if a.imfs or a.fonction or a.zone or compter:
            return _dirigeants(a, contacts)
        trouve = _personne(a, contacts)
        return trouve or _dirigeants(a, contacts)
    if len(a.imfs) == 1:
        return _fiche_imf(a.imfs[0], contacts_seuls=contacts)
    if compter or a.statut_imf or a.type_imf or a.zone or a.a("imf", "imfs", "institution", "institutions", "sfd", "sfds", "microfinance"):
        return _imfs(a, compter)

    # Un nom propre seul : peut-être un dirigeant.
    trouve = _personne(a, contacts)
    if trouve:
        return trouve
    if not du_domaine:
        return Reponse(HORS_SUJET, suggestions=SUGGESTIONS, hors_sujet=True)
    return Reponse("Je n'ai pas trouvé de réponse dans les données de la plateforme. Reformulez, par exemple :",
                   suggestions=SUGGESTIONS)
