"""
conftest.py (racine backend)
============================
Fixtures partagées par les tests de toutes les apps.
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.tests.factories import (
    AdminFactory,
    SuperviseurFactory,
    UtilisateurFactory,
)


def _client_pour(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    client.user = user
    return client


@pytest.fixture
def client_admin(db):
    return _client_pour(AdminFactory())


@pytest.fixture
def client_superviseur(db):
    return _client_pour(SuperviseurFactory())


@pytest.fixture
def client_consultant(db):
    return _client_pour(UtilisateurFactory())
