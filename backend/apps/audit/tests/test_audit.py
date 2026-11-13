"""
audit/tests/test_audit.py
=========================
Vérifie que les opérations métier alimentent le journal d'audit.
"""

import pytest

from apps.audit.models import JournalAudit
from apps.dirigeants.models import Dirigeant

pytestmark = pytest.mark.django_db

IMF_PAYLOAD = {
    "nom": "Crédit Mutuel Test",
    "sigle": "CMT",
    "type_imf": "MUTUELLE",
    "adresse_siege": "Dakar",
}


def _actions():
    return list(JournalAudit.objects.values_list("action", flat=True))


def test_creation_modification_suppression_imf_journalisees(client_superviseur):
    resp = client_superviseur.post("/api/v1/imf/", IMF_PAYLOAD, format="json")
    assert resp.status_code == 201
    imf_id = resp.data["id"]

    client_superviseur.patch(f"/api/v1/imf/{imf_id}/", {"sigle": "CMT2"}, format="json")
    client_superviseur.delete(f"/api/v1/imf/{imf_id}/")

    entrees = JournalAudit.objects.order_by("date_action")
    assert [e.action for e in entrees] == ["CREATION", "MODIFICATION", "SUPPRESSION"]
    assert all(e.objet_concerne == f"imf.IMF:{imf_id}" for e in entrees)
    assert all(e.utilisateur == client_superviseur.user for e in entrees)
    assert entrees[1].details["champs_modifies"] == ["sigle"]


def test_consultation_fiche_dirigeant_journalisee(client_consultant):
    dirigeant = Dirigeant.objects.create(nom="Diop", prenom="Awa")
    resp = client_consultant.get(f"/api/v1/dirigeants/{dirigeant.pk}/")
    assert resp.status_code == 200
    entree = JournalAudit.objects.get()
    assert entree.action == "CONSULTATION"
    assert entree.objet_concerne == f"dirigeants.Dirigeant:{dirigeant.pk}"
    assert entree.role == "CONSULTANT"


def test_lecture_imf_non_journalisee(client_consultant):
    client_consultant.get("/api/v1/imf/")
    assert _actions() == []


def test_echec_permission_non_journalise(client_consultant):
    resp = client_consultant.post("/api/v1/imf/", IMF_PAYLOAD, format="json")
    assert resp.status_code == 403
    assert _actions() == []


def test_connexion_journalisee(client):
    from apps.authentication.tests.factories import UtilisateurFactory

    user = UtilisateurFactory(password="TestPass123!")
    client.post("/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"})
    assert _actions() == ["CONNEXION"]


def test_pagination_ajustable_via_page_size(client_consultant):
    from apps.imf.models import IMF

    for i in range(25):
        IMF.objects.create(nom=f"IMF {i:02d}", type_imf="SA", adresse_siege="Dakar")
    assert len(client_consultant.get("/api/v1/imf/").data["results"]) == 20
    assert len(client_consultant.get("/api/v1/imf/?page_size=1000").data["results"]) == 25
