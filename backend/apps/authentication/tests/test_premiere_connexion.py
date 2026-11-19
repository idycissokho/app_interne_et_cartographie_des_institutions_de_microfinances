"""
Changement de mot de passe obligatoire à la première connexion.

Un compte créé par un administrateur (ou dont il a réinitialisé le mot de passe) reçoit un mot
de passe provisoire : l'utilisateur ne peut rien faire d'autre que choisir le sien.
"""

import pytest
from django.urls import reverse
from rest_framework import status

from apps.authentication.models import Utilisateur

from .factories import UtilisateurFactory

PROVISOIRE = "Provisoire123!"
NOUVEAU = "MonNouveau456!"


def _connecter(client, email, mot_de_passe=PROVISOIRE):
    resp = client.post("/api/v1/auth/login/", {"email": email, "password": mot_de_passe})
    assert resp.status_code == status.HTTP_200_OK, resp.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    return resp


@pytest.mark.django_db
class TestBlocageAvantChangement:
    def test_connexion_signale_le_changement(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE, doit_changer_mot_de_passe=True)
        resp = _connecter(api_client, user.email)
        assert resp.data["utilisateur"]["doit_changer_mot_de_passe"] is True

    def test_donnees_refusees_mais_profil_accessible(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE, doit_changer_mot_de_passe=True)
        _connecter(api_client, user.email)
        refus = api_client.get("/api/v1/imf/")
        assert refus.status_code == status.HTTP_403_FORBIDDEN
        assert "nouveau mot de passe" in str(refus.data["detail"])
        assert api_client.get("/api/v1/auth/profil/").status_code == status.HTTP_200_OK

    def test_changement_debloque_le_compte(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE, doit_changer_mot_de_passe=True)
        _connecter(api_client, user.email)
        resp = api_client.post("/api/v1/auth/change-password/", {
            "ancien_mot_de_passe": PROVISOIRE, "nouveau_mot_de_passe": NOUVEAU, "confirmation": NOUVEAU,
        })
        assert resp.status_code == status.HTTP_200_OK, resp.data
        user.refresh_from_db()
        assert user.doit_changer_mot_de_passe is False
        assert user.check_password(NOUVEAU)
        # Le même jeton donne maintenant accès aux données.
        assert api_client.get("/api/v1/imf/").status_code == status.HTTP_200_OK

    def test_nouveau_identique_refuse(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE, doit_changer_mot_de_passe=True)
        _connecter(api_client, user.email)
        resp = api_client.post("/api/v1/auth/change-password/", {
            "ancien_mot_de_passe": PROVISOIRE, "nouveau_mot_de_passe": PROVISOIRE, "confirmation": PROVISOIRE,
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.doit_changer_mot_de_passe is True

    def test_deconnexion_possible(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE, doit_changer_mot_de_passe=True)
        resp = _connecter(api_client, user.email)
        fin = api_client.post("/api/v1/auth/logout/", {"refresh": resp.data["refresh"]})
        assert fin.status_code == status.HTTP_204_NO_CONTENT

    def test_compte_normal_non_concerne(self, api_client):
        user = UtilisateurFactory(password=PROVISOIRE)
        _connecter(api_client, user.email)
        assert api_client.get("/api/v1/imf/").status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestAdministrationDjango:
    def test_compte_cree_par_admin_doit_changer(self, client, admin_user_django):
        client.force_login(admin_user_django)
        resp = client.post(reverse("admin:authentication_utilisateur_add"), {
            "email": "agent@drs-sfd.sn", "nom": "Diop", "prenom": "Awa", "role": "CONSULTANT",
            "password1": PROVISOIRE, "password2": PROVISOIRE,
        })
        assert resp.status_code == 302, resp.content[:2000]
        assert Utilisateur.objects.get(email="agent@drs-sfd.sn").doit_changer_mot_de_passe is True

    def test_mot_de_passe_reinitialise_par_admin_doit_changer(self, client, admin_user_django):
        user = UtilisateurFactory(password="Ancien789!")
        client.force_login(admin_user_django)
        resp = client.post(reverse("admin:auth_user_password_change", args=[user.pk]), {
            "password1": PROVISOIRE, "password2": PROVISOIRE,
        })
        assert resp.status_code == 302, resp.content[:2000]
        user.refresh_from_db()
        assert user.doit_changer_mot_de_passe is True
        assert user.check_password(PROVISOIRE)


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def admin_user_django(db):
    from .factories import AdminFactory

    return AdminFactory()
