"""
dirigeants/anonymisation.py
===========================
Remplace les données personnelles des dirigeants par des données fictives
(démonstration accessible sur Internet). Opération IRRÉVERSIBLE sur la base visée.

Ce qui est remplacé :
  - nom, prénom, téléphone, e-mails et adresse de chaque dirigeant ;
  - les libellés du journal d'audit qui recopient un nom de dirigeant ;
  - les valeurs recopiées dans les rapports des imports de dirigeants,
    et les fichiers d'origine de ces imports (supprimés du stockage).
Les institutions, points de service, fonctions et dates de mandat restent intacts.

Les valeurs fictives sont tirées de listes ci-dessous à partir de l'identifiant du
dirigeant : le même dirigeant reçoit toujours le même nom, sans dépendance supplémentaire.
"""

import hashlib

from django.db import transaction

PRENOMS = (
    "Aminata", "Moussa", "Fatou", "Ibrahima", "Awa", "Cheikh", "Mariama", "Ousmane", "Khady", "Abdoulaye",
    "Ndeye", "Mamadou", "Aissatou", "Modou", "Coumba", "Babacar", "Seynabou", "Alioune", "Rokhaya", "Pape",
    "Adama", "Bineta", "Lamine", "Astou", "Malick", "Dieynaba", "Souleymane", "Yacine", "Omar", "Ramatoulaye",
)
NOMS = (
    "Diop", "Ndiaye", "Fall", "Sow", "Gueye", "Ba", "Diallo", "Faye", "Sarr", "Mbaye",
    "Cisse", "Thiam", "Kane", "Seck", "Ka", "Niang", "Diouf", "Sy", "Camara", "Toure",
    "Diagne", "Mbodj", "Sene", "Ndour", "Badji", "Sall", "Dieng", "Wade", "Lo", "Tall",
)
QUARTIERS = ("Plateau", "Médina", "Grand Yoff", "Parcelles Assainies", "Liberté 6", "HLM", "Ouakam", "Mermoz")
LIBELLE_MASQUE = "(données personnelles masquées — démonstration)"


def _graine(identifiant) -> int:
    return int(hashlib.sha256(str(identifiant).encode()).hexdigest(), 16)


def identite_fictive(identifiant) -> dict:
    """Identité fictive stable pour un identifiant donné."""
    g = _graine(identifiant)
    prenom = PRENOMS[g % len(PRENOMS)]
    nom = NOMS[(g // 97) % len(NOMS)]
    numero = g % 10_000
    # Indicatif « 00 » : n'appartient à aucun opérateur, aucun risque d'appeler quelqu'un.
    # Domaine example.com : réservé à la documentation (RFC 2606), aucun e-mail ne peut aboutir.
    local = f"{prenom}.{nom}.{numero:04d}".lower()
    return {
        "prenom": prenom,
        "nom": nom.upper(),
        "telephone": f"+221 00 000 {numero // 100:02d} {numero % 100:02d}",
        "email_professionnel": f"{local}@example.com",
        "email_secondaire": "",
        "adresse": f"Adresse fictive, {QUARTIERS[g % len(QUARTIERS)]}",
    }


@transaction.atomic
def anonymiser_dirigeants() -> dict:
    """Anonymise toute la base. Retourne le nombre d'éléments modifiés par catégorie."""
    from apps.audit.models import JournalAudit
    from apps.importation.models import ImportationFichier

    from .models import Dirigeant

    dirigeants = list(Dirigeant.objects.all())
    for d in dirigeants:
        for champ, valeur in identite_fictive(d.pk).items():
            setattr(d, champ, valeur)
    Dirigeant.objects.bulk_update(
        dirigeants, ["prenom", "nom", "telephone", "email_professionnel", "email_secondaire", "adresse"], batch_size=500
    )

    # Journal d'audit : les libellés des fiches dirigeants / mandats contiennent des noms.
    entrees = 0
    for entree in JournalAudit.objects.filter(objet_concerne__startswith="dirigeants."):
        if entree.details.get("libelle"):
            entree.details = {**entree.details, "libelle": LIBELLE_MASQUE}
            entree.save(update_fields=["details"])
            entrees += 1

    # Imports de dirigeants : rapports (valeurs recopiées) et fichiers d'origine.
    imports = 0
    for importation in ImportationFichier.objects.filter(type_import=ImportationFichier.TypeImport.DIRIGEANTS):
        importation.rapport_erreurs = [
            {
                "ligne": r.get("ligne"),
                "erreurs": {colonne: "valeur masquée (démonstration)" for colonne in (r.get("erreurs") or {})},
                "valeurs": {},
                "message": f"Ligne {r.get('ligne')} — colonnes : {', '.join(r.get('erreurs') or {})}",
                "avertissement": r.get("avertissement", False),
            }
            for r in importation.rapport_erreurs or []
        ]
        if importation.fichier:
            importation.fichier.delete(save=False)
        importation.save(update_fields=["rapport_erreurs", "fichier"])
        imports += 1

    return {"dirigeants": len(dirigeants), "entrees_audit": entrees, "imports": imports}
