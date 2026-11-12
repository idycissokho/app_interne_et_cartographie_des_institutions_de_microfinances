import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import Utilisateur

from .factories import AdminFactory, SuperviseurFactory, UtilisateurFactory


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def consultant(db):
    return UtilisateurFactory(password="TestPass123!")


@pytest.fixture
def admin(db):
    return AdminFactory(password="AdminPass123!")


@pytest.fixture
def auth_client(client, consultant):
    """Client authentifié avec un token JWT valide."""
    refresh = RefreshToken.for_user(consultant)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client, consultant


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLoginView:
    url = "/api/v1/auth/login/"

    def test_login_succes(self, client, consultant):
        resp = client.post(self.url, {"email": consultant.email, "password": "TestPass123!"})
        assert resp.status_code == status.HTTP_200_OK
        assert "access" in resp.data
        assert "refresh" in resp.data
        assert resp.data["utilisateur"]["email"] == consultant.email

    def test_login_mauvais_mot_de_passe(self, client, consultant):
        resp = client.post(self.url, {"email": consultant.email, "password": "mauvais"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_email_inexistant(self, client):
        resp = client.post(self.url, {"email": "inconnu@drs.sn", "password": "TestPass123!"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_compte_inactif(self, client, db):
        user = UtilisateurFactory(is_active=False, password="TestPass123!")
        resp = client.post(self.url, {"email": user.email, "password": "TestPass123!"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_sans_email(self, client):
        resp = client.post(self.url, {"password": "TestPass123!"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_enregistre_ip(self, client, consultant):
        client.post(
            self.url,
            {"email": consultant.email, "password": "TestPass123!"},
            REMOTE_ADDR="192.168.1.10",
        )
        consultant.refresh_from_db()
        assert consultant.derniere_connexion_ip == "192.168.1.10"

    def test_token_contient_role(self, client, consultant):
        resp = client.post(self.url, {"email": consultant.email, "password": "TestPass123!"})
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken(resp.data["access"])
        assert token["role"] == Utilisateur.Role.CONSULTANT


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLogoutView:
    url = "/api/v1/auth/logout/"

    def test_logout_succes(self, auth_client):
        client, user = auth_client
        refresh = str(RefreshToken.for_user(user))
        resp = client.post(self.url, {"refresh": refresh})
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_logout_sans_token_refresh(self, auth_client):
        client, _ = auth_client
        resp = client.post(self.url, {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_logout_token_invalide(self, auth_client):
        client, _ = auth_client
        resp = client.post(self.url, {"refresh": "token.invalide.ici"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_logout_non_authentifie(self, client):
        resp = client.post(self.url, {"refresh": "quelconque"})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Profil
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProfilView:
    url = "/api/v1/auth/profil/"

    def test_get_profil(self, auth_client):
        client, user = auth_client
        resp = client.get(self.url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["email"] == user.email
        assert resp.data["role"] == user.role
        assert "nom_complet" in resp.data

    def test_get_profil_non_authentifie(self, client):
        resp = client.get(self.url)
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_patch_profil_nom_prenom(self, auth_client):
        client, user = auth_client
        resp = client.patch(self.url, {"nom": "Diallo", "prenom": "Amadou"})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["nom"] == "Diallo"
        assert resp.data["prenom"] == "Amadou"

    def test_patch_profil_role_ignore(self, auth_client):
        """Le rôle ne doit pas être modifiable via le profil."""
        client, user = auth_client
        role_initial = user.role
        resp = client.patch(self.url, {"role": Utilisateur.Role.ADMIN})
        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.role == role_initial


# ---------------------------------------------------------------------------
# Changement de mot de passe
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestChangePasswordView:
    url = "/api/v1/auth/change-password/"

    def test_changement_succes(self, auth_client):
        client, user = auth_client
        resp = client.post(self.url, {
            "ancien_mot_de_passe": "TestPass123!",
            "nouveau_mot_de_passe": "NouveauPass456!",
            "confirmation": "NouveauPass456!",
        })
        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password("NouveauPass456!")

    def test_ancien_mot_de_passe_incorrect(self, auth_client):
        client, _ = auth_client
        resp = client.post(self.url, {
            "ancien_mot_de_passe": "mauvais",
            "nouveau_mot_de_passe": "NouveauPass456!",
            "confirmation": "NouveauPass456!",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirmation_ne_correspond_pas(self, auth_client):
        client, _ = auth_client
        resp = client.post(self.url, {
            "ancien_mot_de_passe": "TestPass123!",
            "nouveau_mot_de_passe": "NouveauPass456!",
            "confirmation": "Different789!",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_nouveau_mot_de_passe_trop_simple(self, auth_client):
        client, _ = auth_client
        resp = client.post(self.url, {
            "ancien_mot_de_passe": "TestPass123!",
            "nouveau_mot_de_passe": "123",
            "confirmation": "123",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_authentifie(self, client):
        resp = client.post(self.url, {})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Modèle Utilisateur
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestUtilisateurModel:
    def test_str(self, consultant):
        assert consultant.email in str(consultant)

    def test_nom_complet(self, db):
        user = UtilisateurFactory(nom="Ndiaye", prenom="Fatou")
        assert user.nom_complet == "Fatou Ndiaye"

    def test_is_admin_false_pour_consultant(self, consultant):
        assert consultant.is_admin is False

    def test_is_admin_true_pour_admin(self, admin):
        assert admin.is_admin is True

    def test_is_superviseur(self, db):
        sup = SuperviseurFactory()
        assert sup.is_superviseur is True

    def test_uuid_comme_pk(self, consultant):
        import uuid
        assert isinstance(consultant.pk, uuid.UUID)

    def test_create_superuser(self, db):
        from apps.authentication.models import Utilisateur
        user = Utilisateur.objects.create_superuser(
            email="admin@drs.sn", password="Admin123!", nom="Admin", prenom="Super"
        )
        assert user.is_staff is True
        assert user.is_superuser is True
        assert user.role == Utilisateur.Role.ADMIN
