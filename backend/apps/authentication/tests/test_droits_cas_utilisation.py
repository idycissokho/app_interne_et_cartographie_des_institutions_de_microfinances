"""
Droits par rôle — DIAGRAMME DE CAS UTILISATION.drawio
=====================================================
- ROLE_CONSUL      : consulter IMF, points de service, dirigeants, cartes.
- ROLE_SUPERVISOR  : consulter + MODIFIER (IMF, point de service, mandat / dirigeant).
- ROLE_ADMIN       : tout, dont créer / désactiver, Import / Export Excel, journal d'audit.
"""

import pytest

from apps.dirigeants.models import Dirigeant, Mandat
from apps.imf.models import IMF
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db

ROLES = ("client_admin", "client_superviseur", "client_consultant")


@pytest.fixture
def jeu():
    imf = IMF.objects.create(nom="IMF A", sigle="IA", type_imf="MUTUELLE", adresse_siege="Dakar")
    point = PointService.objects.create(imf=imf, nom="Agence", type_point="AGENCE")
    dirigeant = Dirigeant.objects.create(nom="Diop", prenom="Awa")
    mandat = Mandat.objects.create(dirigeant=dirigeant, imf=imf, fonction_mandat="DG", date_debut="2022-01-01")
    return {"imf": imf, "point": point, "dirigeant": dirigeant, "mandat": mandat}


def _client(request, role):
    return request.getfixturevalue(role)


# ── Consulter : tous les rôles ─────────────────────────────────────────────
@pytest.mark.parametrize("role", ROLES)
def test_consultation_ouverte_a_tous(request, role, jeu):
    c = _client(request, role)
    for url in (
        "/api/v1/imf/",
        f"/api/v1/imf/{jeu['imf'].pk}/",
        "/api/v1/points-service/",
        f"/api/v1/points-service/{jeu['point'].pk}/",
        "/api/v1/points-service/geojson/",
        "/api/v1/dirigeants/",
        f"/api/v1/dirigeants/{jeu['dirigeant'].pk}/",
        "/api/v1/dirigeants/mandats/",
        "/api/v1/cartographie/zones/agregats/?type_zone=REGION",
    ):
        assert c.get(url).status_code == 200, url


# ── Modifier : superviseur et admin, pas le consultant ─────────────────────
@pytest.mark.parametrize("role, attendu", [("client_admin", 200), ("client_superviseur", 200), ("client_consultant", 403)])
def test_modification(request, role, attendu, jeu):
    c = _client(request, role)
    d, m = jeu["dirigeant"], jeu["mandat"]
    assert c.patch(f"/api/v1/imf/{jeu['imf'].pk}/", {"telephone": "338000000"}, format="json").status_code == attendu
    assert c.patch(f"/api/v1/points-service/{jeu['point'].pk}/", {"adresse": "Rue 1"}, format="json").status_code == attendu
    assert c.patch(f"/api/v1/dirigeants/{d.pk}/", {"telephone": "770000000"}, format="json").status_code == attendu
    assert c.patch(f"/api/v1/dirigeants/{d.pk}/mandats/{m.pk}/", {"statut_mandat": "SUSPENDU"}, format="json").status_code == attendu


# ── Créer : admin uniquement ───────────────────────────────────────────────
@pytest.mark.parametrize("role, attendu", [("client_admin", 201), ("client_superviseur", 403), ("client_consultant", 403)])
def test_creation(request, role, attendu, jeu):
    c = _client(request, role)
    d = jeu["dirigeant"]
    imf = {"nom": f"Nouvelle {role}", "type_imf": "SA", "adresse_siege": "Thiès"}
    assert c.post("/api/v1/imf/", imf, format="json").status_code == attendu
    point = {"imf": str(jeu["imf"].pk), "nom": "Guichet", "type_point": "GUICHET"}
    assert c.post("/api/v1/points-service/", point, format="json").status_code == attendu
    assert c.post("/api/v1/dirigeants/", {"nom": "Sow", "prenom": "Ali"}, format="json").status_code == attendu
    mandat = {"imf": str(jeu["imf"].pk), "fonction_mandat": "PCA", "date_debut": "2024-01-01"}
    assert c.post(f"/api/v1/dirigeants/{d.pk}/mandats/", mandat, format="json").status_code == attendu


# ── Désactiver : admin uniquement ──────────────────────────────────────────
@pytest.mark.parametrize("role, attendu", [("client_admin", 204), ("client_superviseur", 403), ("client_consultant", 403)])
def test_desactivation(request, role, attendu, jeu):
    c = _client(request, role)
    d, m = jeu["dirigeant"], jeu["mandat"]
    assert c.delete(f"/api/v1/dirigeants/{d.pk}/mandats/{m.pk}/").status_code == attendu
    assert c.delete(f"/api/v1/dirigeants/{d.pk}/").status_code == attendu
    assert c.delete(f"/api/v1/points-service/{jeu['point'].pk}/").status_code == attendu
    assert c.delete(f"/api/v1/imf/{jeu['imf'].pk}/").status_code == attendu
    if attendu == 403:
        assert IMF.objects.get(pk=jeu["imf"].pk).is_active


# ── Import / Export Excel et journal d'audit : admin uniquement ────────────
@pytest.mark.parametrize("role, attendu", [("client_admin", 200), ("client_superviseur", 403), ("client_consultant", 403)])
def test_import_export_et_audit(request, role, attendu):
    c = _client(request, role)
    for url in (
        "/api/v1/importation/",
        "/api/v1/importation/export/imf/",
        "/api/v1/importation/modeles/imf/",
        "/api/v1/audit/",
    ):
        assert c.get(url).status_code == attendu, url
