"""Accueil public : recherche d'une institution sans connexion."""

import pytest
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient

from apps.imf.models import IMF

URL = "/api/v1/public/institutions/"


def _imf(**champs):
    valeurs = {"nom": "Caisse Test", "type_imf": IMF.TypeIMF.MUTUELLE, "adresse_siege": "Dakar"}
    valeurs.update(champs)
    return IMF.objects.create(**valeurs)


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
class TestRecherchePublique:
    def test_sans_connexion_par_agrement_tolerant(self, client):
        _imf(nom="Mutuelle Alpha", numero_agrement="DK1-93-00008", localisation_siege=Point(-17.45, 14.7, srid=4326))
        _imf(nom="Mutuelle Beta", numero_agrement="DK1-93-00009")
        r = client.get(URL, {"q": "dk1 93 00008"})
        assert r.status_code == 200
        assert r.data["exact"] is True
        assert [f["nom"] for f in r.data["resultats"]] == ["Mutuelle Alpha"]
        assert r.data["resultats"][0]["position"] == pytest.approx([-17.45, 14.7])

    def test_par_nom_ou_sigle(self, client):
        _imf(nom="Crédit Mutuel du Sénégal", sigle="CMS")
        _imf(nom="Autre caisse")
        assert [f["sigle"] for f in client.get(URL, {"q": "cms"}).data["resultats"]] == ["CMS"]
        assert len(client.get(URL, {"q": "caisse"}).data["resultats"]) == 1

    def test_aucune_donnee_sensible(self, client):
        _imf(nom="Mutuelle Gamma", telephone="77 000 00 00", email="contact@gamma.sn", capital=1000)
        fiche = client.get(URL, {"q": "Gamma"}).data["resultats"][0]
        assert fiche["telephone"] == "77 000 00 00"  # téléphone du siège : public
        for cle in ("email", "capital", "ninea", "dirigeants", "nb_beneficiaires"):
            assert cle not in fiche

    def test_institution_archivee_masquee_et_saisie_courte(self, client):
        _imf(nom="Ancienne caisse", is_active=False)
        assert client.get(URL, {"q": "Ancienne"}).data["resultats"] == []
        assert client.get(URL, {"q": "a"}).data["resultats"] == []

    def test_jeton_invalide_ignore(self, client):
        _imf(nom="Mutuelle Delta")
        client.credentials(HTTP_AUTHORIZATION="Bearer jeton-expire")
        assert client.get(URL, {"q": "Delta"}).status_code == 200

    def test_resume(self, client):
        _imf(nom="A")
        _imf(nom="B", statut_reglementaire=IMF.StatutReglementaire.OPR)
        r = client.get("/api/v1/public/resume/")
        assert r.status_code == 200
        assert r.data["institutions"] == 2 and r.data["en_activite"] == 1

    def test_registre_complet_sans_archives_ni_donnees_sensibles(self, client):
        _imf(nom="Zeta", telephone="77 000 00 00")
        _imf(nom="Alpha")
        _imf(nom="Archivée", is_active=False)
        r = client.get("/api/v1/public/registre/")
        assert r.status_code == 200
        assert [f["nom"] for f in r.data["institutions"]] == ["Alpha", "Zeta"]
        assert "email" not in r.data["institutions"][0]
