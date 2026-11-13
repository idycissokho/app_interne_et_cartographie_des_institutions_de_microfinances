"""
dirigeants/tests/test_dirigeants.py
===================================
Mandats : validation des dates, onglet dirigeants de la fiche IMF, filtre par fonction.
"""

import pytest

from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF

pytestmark = pytest.mark.django_db


@pytest.fixture
def imf():
    return IMF.objects.create(nom="IMF A", type_imf="MUTUELLE", adresse_siege="Dakar")


@pytest.fixture
def dirigeant():
    return Dirigeant.objects.create(nom="Ndiaye", prenom="Moussa")


def test_date_fin_avant_date_debut_refusee(client_superviseur, imf, dirigeant):
    resp = client_superviseur.post(
        f"/api/v1/dirigeants/{dirigeant.pk}/mandats/",
        {"imf": str(imf.pk), "fonction_mandat": "DG", "date_debut": "2025-01-01", "date_fin": "2024-01-01"},
        format="json",
    )
    assert resp.status_code == 400
    assert "date_fin" in resp.data


def test_nouvelle_fonction_acceptee(client_superviseur, imf, dirigeant):
    resp = client_superviseur.post(
        f"/api/v1/dirigeants/{dirigeant.pk}/mandats/",
        {"imf": str(imf.pk), "fonction_mandat": "PRESIDENT_CONSEIL_SURVEILLANCE", "date_debut": "2025-01-01"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["dirigeant"] == dirigeant.pk


def test_mandat_pour_dirigeant_inexistant_404(client_superviseur, imf):
    resp = client_superviseur.post(
        "/api/v1/dirigeants/00000000-0000-0000-0000-000000000000/mandats/",
        {"imf": str(imf.pk), "fonction_mandat": "DG", "date_debut": "2025-01-01"},
        format="json",
    )
    assert resp.status_code == 404


def test_onglet_dirigeants_fiche_imf_filtre_par_fonction(client_consultant, imf, dirigeant):
    autre = Dirigeant.objects.create(nom="Fall", prenom="Fatou")
    Mandat.objects.create(dirigeant=dirigeant, imf=imf, fonction_mandat="DG", date_debut="2024-01-01")
    Mandat.objects.create(dirigeant=autre, imf=imf, fonction_mandat="PCA", date_debut="2024-01-01")

    resp = client_consultant.get(f"/api/v1/imf/{imf.pk}/mandats/")
    assert resp.data["count"] == 2

    resp = client_consultant.get(f"/api/v1/imf/{imf.pk}/mandats/?fonction_mandat=DG")
    assert [m["dirigeant_nom_complet"] for m in resp.data["results"]] == ["Moussa Ndiaye"]


def test_onglet_dirigeants_journalise(client_consultant, imf):
    from apps.audit.models import JournalAudit

    client_consultant.get(f"/api/v1/imf/{imf.pk}/mandats/")
    entree = JournalAudit.objects.get()
    assert entree.action == "CONSULTATION" and entree.objet_concerne == f"imf.IMF:{imf.pk}"
