"""
Sécurité des sessions : durées des jetons, durée maximale de session, compte désactivé,
déconnexion (liste noire) et limitation des tentatives de connexion.
"""

import time
from datetime import timedelta

import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.tests.factories import UtilisateurFactory

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/token/refresh/"
LOGOUT = "/api/v1/auth/logout/"
MDP = "TestPass123!"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def agent(db):
    return UtilisateurFactory(password=MDP)


def connexion(client, agent):
    resp = client.post(LOGIN, {"email": agent.email, "password": MDP})
    assert resp.status_code == 200, resp.data
    return resp.data


def test_durees_par_defaut():
    assert api_settings.ACCESS_TOKEN_LIFETIME == timedelta(minutes=15)
    assert api_settings.REFRESH_TOKEN_LIFETIME == timedelta(minutes=settings.SESSION_INACTIVITE_MINUTES)
    assert settings.SESSION_INACTIVITE_MINUTES == 30
    assert settings.SESSION_DUREE_MAX_HEURES == 8


def test_connexion_renvoie_les_regles_de_session(client, agent):
    data = connexion(client, agent)
    assert data["session"] == {"inactivite_minutes": 30, "duree_max_heures": 8}
    assert "debut_session" in RefreshToken(data["refresh"]).payload


def test_rafraichissement_conserve_le_debut_de_session(client, agent):
    data = connexion(client, agent)
    debut = RefreshToken(data["refresh"])["debut_session"]
    resp = client.post(REFRESH, {"refresh": data["refresh"]})
    assert resp.status_code == 200
    assert RefreshToken(resp.data["refresh"])["debut_session"] == debut
    # Rotation : l'ancien jeton est sur liste noire et ne sert plus.
    assert client.post(REFRESH, {"refresh": data["refresh"]}).status_code == 401


def test_session_trop_ancienne_refusee(client, agent):
    jeton = RefreshToken.for_user(agent)
    jeton["debut_session"] = int(time.time()) - settings.SESSION_DUREE_MAX_HEURES * 3600 - 60
    resp = client.post(REFRESH, {"refresh": str(jeton)})
    assert resp.status_code == 401


def test_compte_desactive_ne_peut_plus_renouveler(client, agent):
    data = connexion(client, agent)
    agent.is_active = False
    agent.save(update_fields=["is_active"])
    assert client.post(REFRESH, {"refresh": data["refresh"]}).status_code == 401


def test_deconnexion_revoque_le_jeton(client, agent):
    data = connexion(client, agent)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
    assert client.post(LOGOUT, {"refresh": data["refresh"]}).status_code == 204
    client.credentials()
    assert client.post(REFRESH, {"refresh": data["refresh"]}).status_code == 401


def test_tentatives_de_connexion_limitees(client, agent):
    for _ in range(10):
        assert client.post(LOGIN, {"email": agent.email, "password": "mauvais"}).status_code == 400
    assert client.post(LOGIN, {"email": agent.email, "password": MDP}).status_code == 429
