"""Assistant : compréhension des questions, réponses tirées de la base, hors-sujet, droits, journal."""

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon

from apps.assistant.moteur import repondre
from apps.audit.models import JournalAudit
from apps.cartographie.models import ZoneGeographique
from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.points_service.models import PointService

URL = "/api/v1/assistant/question/"


def _carre(x1, y1, x2, y2):
    return MultiPolygon(Polygon(((x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1))), srid=4326)


@pytest.fixture
def jeu(db):
    thies = ZoneGeographique.objects.create(code="R2", nom="Thiès", type_zone="REGION", geometrie=_carre(-17.1, 14.6, -16.5, 15.0))
    kolda = ZoneGeographique.objects.create(code="R8", nom="Kolda", type_zone="REGION", geometrie=_carre(-15.5, 12.5, -14.5, 13.2))
    acep = IMF.objects.create(nom="Alliance de Crédit et d'Épargne pour la Production de Thiès", sigle="ACEP THIES",
                              type_imf="MUTUELLE", adresse_siege="Thiès", region=thies, telephone="33 951 00 00",
                              numero_agrement="TH1-93-00010")
    mpal = IMF.objects.create(nom="Caisse Populaire d'Épargne et de Crédit de Mpal", sigle="CPEC MPAL", type_imf="MUTUELLE",
                              statut_reglementaire="OPR", adresse_siege="Mpal", region=kolda)
    PointService.objects.create(imf=acep, nom="Siège — ACEP THIES", type_point="AGENCE", est_siege=True, region=thies,
                                localisation=Point(-16.93, 14.79))
    PointService.objects.create(imf=acep, nom="Guichet Khombole", type_point="GUICHET", region=thies)
    PointService.objects.create(imf=mpal, nom="Agence Mpal", type_point="AGENCE", statut_point="FERME", region=kolda)
    awa = Dirigeant.objects.create(prenom="Awa", nom="Ndiaye", telephone="77 000 00 01", email_professionnel="awa@acep.sn")
    Mandat.objects.create(dirigeant=awa, imf=acep, fonction_mandat="DG", date_debut="2021-01-04")
    moussa = Dirigeant.objects.create(prenom="Moussa", nom="Sarr")
    Mandat.objects.create(dirigeant=moussa, imf=mpal, fonction_mandat="PCA", date_debut="2020-05-01")
    return {"acep": acep, "mpal": mpal, "awa": awa, "thies": thies}


@pytest.mark.parametrize("question", [
    "Quelle est la capitale de la France ?", "Donne-moi une recette de cuisine", "Quel temps fait-il à Thiès ?",
])
def test_hors_sujet(jeu, question):
    reponse = repondre(question)
    assert reponse.hors_sujet and "ne concerne pas" in reponse.texte


def test_salutation_propose_des_exemples(jeu):
    reponse = repondre("Bonjour")
    assert not reponse.hors_sujet and reponse.suggestions


def test_compter_imf_par_statut_et_region(jeu):
    assert repondre("Combien d'IMF sont en OPR ?").texte.startswith("1 institution au statut « OPR »")
    assert repondre("Combien d'institutions dans la région de Thiès ?").texte.startswith("1 institution dont le siège est dans la région de Thiès")


def test_fiche_imf_par_sigle_et_agrement(jeu):
    for question in ("Fiche de ACEP Thiès", "TH1-93-00010"):
        reponse = repondre(question)
        assert "ACEP THIES" in reponse.texte and "Directeur Général — Awa Ndiaye" in reponse.texte
        assert reponse.lien["url"] == f"/consultation?imf={jeu['acep'].pk}"


def test_fonction_d_une_imf_avec_contacts(jeu):
    reponse = repondre("Qui est le DG de l'ACEP Thiès ?")
    assert "**Awa Ndiaye**" in reponse.texte and "77 000 00 01" in reponse.texte
    assert reponse.dirigeants_consultes == [str(jeu["awa"].pk)]


def test_points_de_service_filtres(jeu):
    assert repondre("Combien de guichets ?").texte.startswith("1 guichet")
    assert repondre("Combien de points fermés ?").texte.startswith("1 point de service au statut « Fermé »")
    reponse = repondre("Points de service sans GPS dans la région de Thiès")
    assert reponse.texte.startswith("1 point de service dans la région de Thiès sans coordonnées GPS")
    assert "gps=sans" in reponse.lien["url"]


def test_dirigeant_par_son_nom(jeu):
    reponse = repondre("Moussa Sarr")
    assert reponse.elements[0]["titre"] == "Moussa Sarr" and "CPEC MPAL" in reponse.elements[0]["sous_titre"]


def test_api_reservee_aux_connectes_et_journalisee(client, client_consultant, jeu):
    assert client.post(URL, {"question": "Combien d'IMF ?"}, content_type="application/json").status_code == 401
    reponse = client_consultant.post(URL, {"question": "Qui est le DG de ACEP THIES ?"}, format="json")
    assert reponse.status_code == 200 and "Awa Ndiaye" in reponse.data["texte"]
    assert JournalAudit.objects.filter(action="CONSULTATION", objet_concerne="assistant.Question").exists()


def test_question_trop_longue_refusee(client_consultant, jeu):
    assert client_consultant.post(URL, {"question": "x" * 301}, format="json").status_code == 400
