"""
Section « Itinéraire » : droits, validation, fournisseur simulé, positions non fiables,
erreurs du moteur, cache et confidentialité. Aucun appel réseau réel.
"""

import io
import json
import logging
import urllib.error
from unittest import mock

import pytest
from django.contrib.gis.geos import Point
from django.test import override_settings

from apps.audit.models import JournalAudit
from apps.imf.models import IMF
from apps.itineraires.fournisseurs import (
    ErreurFournisseur,
    ResultatMode,
    ValhallaFournisseur,
    decoder_polyline,
)
from apps.itineraires.services import arrondir_origine
from apps.points_service.models import PointService

pytestmark = pytest.mark.django_db

URL_CALCUL = "/api/v1/itineraires/calculer/"
URL_RECHERCHE = "/api/v1/itineraires/destinations/"
ORIGINE = {"lat": 14.6928, "lon": -17.4467}  # Dakar Plateau
VALHALLA = override_settings(ROUTING_PROVIDER="valhalla", ROUTING_URL="http://valhalla.test", ROUTING_TIMEOUT=10)


def trajet(mode: str = "voiture", duree: float = 20.0) -> ResultatMode:
    return ResultatMode(
        statut="ok", distance_km=12.5, duree_min=duree,
        geometrie={"type": "LineString", "coordinates": [[-17.44, 14.69], [-17.30, 14.75]]},
        etapes=[{"instruction": "Roulez vers le nord.", "distance_km": 12.5, "duree_min": duree}],
    )


@pytest.fixture
def imf():
    return IMF.objects.create(
        nom="Mutuelle Test", sigle="MT", numero_agrement="DK-01", type_imf="MUTUELLE",
        adresse_siege="Thiès", localisation_siege=Point(-16.93, 14.79),
    )


@pytest.fixture
def point(imf):
    return PointService.objects.create(imf=imf, nom="Agence Rufisque", localisation=Point(-17.27, 14.71))


def corps(destination, **extra):
    type_ = "institution" if isinstance(destination, IMF) else "point_service"
    return {"origine": ORIGINE, "destination": {"type": type_, "id": str(destination.pk)}, **extra}


def simuler(**par_mode):
    """Remplace ValhallaFournisseur.calculer : par_mode[mode] = ResultatMode ou exception."""

    def calculer(self, origine, destination, mode):
        valeur = par_mode.get(mode, trajet(mode))
        if isinstance(valeur, Exception):
            raise valeur
        return valeur

    return mock.patch.object(ValhallaFournisseur, "calculer", autospec=True, side_effect=calculer)


# ── Droits ──────────────────────────────────────────────────────────────────
@VALHALLA
@pytest.mark.parametrize("role", ["client_superviseur", "client_admin"])
def test_superviseur_et_admin_calculent(request, role, point):
    with simuler():
        reponse = request.getfixturevalue(role).post(URL_CALCUL, corps(point), format="json")
    assert reponse.status_code == 200, reponse.data


@pytest.mark.parametrize("url", [URL_CALCUL, URL_RECHERCHE + "?q=Mu", "destinations/"])
def test_consultant_refuse(client_consultant, point, url):
    if url == "destinations/":
        url = f"{URL_RECHERCHE}point_service/{point.pk}/"
    appel = client_consultant.post(url, corps(point), format="json") if url == URL_CALCUL else client_consultant.get(url)
    assert appel.status_code == 403


def test_anonyme_refuse(client, point):
    assert client.post(URL_CALCUL, corps(point), content_type="application/json").status_code == 401


# ── Validation ──────────────────────────────────────────────────────────────
@VALHALLA
@pytest.mark.parametrize("origine", [{"lat": 48.85, "lon": 2.35}, {"lat": 14.7}, {"lat": "abc", "lon": -17}, {"lat": 95, "lon": -17}])
def test_origine_invalide(client_superviseur, point, origine):
    with simuler() as fournisseur:
        reponse = client_superviseur.post(URL_CALCUL, {**corps(point), "origine": origine}, format="json")
    assert reponse.status_code == 400
    assert "origine" in reponse.data
    fournisseur.assert_not_called()


@VALHALLA
def test_mode_inconnu(client_superviseur, point):
    reponse = client_superviseur.post(URL_CALCUL, corps(point, modes=["avion"]), format="json")
    assert reponse.status_code == 400


@VALHALLA
def test_destination_inconnue_ou_desactivee(client_superviseur, point):
    point.is_active = False
    point.save()
    assert client_superviseur.post(URL_CALCUL, corps(point), format="json").status_code == 404


@VALHALLA
def test_coordonnees_destination_relues_en_base(client_superviseur, point):
    """Des coordonnées de destination envoyées par le client sont ignorées."""
    donnees = corps(point)
    donnees["destination"].update(lat=0, lon=0)
    with simuler() as fournisseur:
        reponse = client_superviseur.post(URL_CALCUL, donnees, format="json")
    assert reponse.status_code == 200
    _, _, destination, _ = fournisseur.call_args.args
    assert destination == (14.71, -17.27)


# ── Destinations sans position fiable ───────────────────────────────────────
@VALHALLA
@pytest.mark.parametrize("position", [None, Point(-17.33333, 14.75), Point(2.35, 48.85)])
def test_destination_sans_position_fiable(client_superviseur, imf, position):
    imf.localisation_siege = position
    imf.save()
    with simuler() as fournisseur:
        reponse = client_superviseur.post(URL_CALCUL, corps(imf), format="json")
    assert reponse.status_code == 422
    assert reponse.data["code"] == "destination_sans_position"
    assert "n'est pas valide" in reponse.data["detail"]
    fournisseur.assert_not_called()


def test_pas_de_repli_sur_le_point_siege(client_superviseur, imf):
    """Une IMF sans GPS fiable reste invalide, même si son point « Siège » est géolocalisé."""
    imf.localisation_siege = None
    imf.save()
    PointService.objects.create(imf=imf, nom="Siège", type_point="AGENCE", est_siege=True, localisation=Point(-16.93, 14.79))
    reponse = client_superviseur.get(f"{URL_RECHERCHE}institution/{imf.pk}/")
    assert reponse.status_code == 422


def test_detail_destination(client_superviseur, point):
    reponse = client_superviseur.get(f"{URL_RECHERCHE}point_service/{point.pk}/")
    assert reponse.status_code == 200
    assert reponse.data["nom"] == "Agence Rufisque"
    assert reponse.data["sous_titre"] == "Agence · MT"


# ── Recherche ───────────────────────────────────────────────────────────────
def test_recherche_limitee_aux_positions_fiables(client_superviseur, imf, point):
    PointService.objects.create(imf=imf, nom="Agence défaut", localisation=Point(-17.33333, 14.75))
    PointService.objects.create(imf=imf, nom="Agence sans GPS")
    resultats = client_superviseur.get(URL_RECHERCHE + "?q=agence").data["results"]
    assert [r["nom"] for r in resultats] == ["Agence Rufisque"]


@pytest.mark.parametrize("texte, attendu", [("DK-01", "institution"), ("mt", "institution"), ("Rufisque", "point_service")])
def test_recherche_nom_sigle_agrement(client_superviseur, point, texte, attendu):
    resultats = client_superviseur.get(URL_RECHERCHE + f"?q={texte}").data["results"]
    assert attendu in {r["type"] for r in resultats}


URL_CARTE = URL_RECHERCHE + "carte/"


def test_carte_toutes_les_structures_fiables(client_superviseur, imf, point):
    """Sièges d'IMF et points de service à l'ouverture de la page ; positions non fiables exclues."""
    PointService.objects.create(imf=imf, nom="Agence défaut", localisation=Point(-17.33333, 14.75))
    PointService.objects.create(imf=imf, nom="Agence sans GPS")
    IMF.objects.create(nom="IMF sans GPS", type_imf="SA", adresse_siege="Dakar")
    epingles = client_superviseur.get(URL_CARTE).data["results"]
    assert sorted((e["type"], e["nom"], e["type_point"]) for e in epingles) == [
        ("institution", "Mutuelle Test", "IMF"), ("point_service", "Agence Rufisque", "AGENCE"),
    ]


def test_siege_social_signale(client_superviseur, imf):
    """Le siège social est une agence marquée est_siege : signalé sur la carte et dans la fiche."""
    siege = PointService.objects.create(imf=imf, nom="Siège Thiès", est_siege=True, localisation=Point(-16.92, 14.80))
    epingle = next(e for e in client_superviseur.get(URL_CARTE).data["results"] if e["id"] == str(siege.pk))
    assert epingle["siege"] is True and epingle["type_point"] == "AGENCE"
    fiche = client_superviseur.get(f"{URL_RECHERCHE}point_service/{siege.pk}/").data
    assert fiche["sous_titre"] == "Siège social · MT"


def test_carte_refusee_au_consultant(client_consultant):
    assert client_consultant.get(URL_CARTE).status_code == 403


def test_recherche_trop_courte(client_superviseur, point):
    assert client_superviseur.get(URL_RECHERCHE + "?q=a").data["results"] == []


# ── Résultats et fournisseur ────────────────────────────────────────────────
@VALHALLA
def test_trois_modes_et_plus_rapide(client_superviseur, point):
    with simuler(pied=trajet("pied", 150), moto=trajet("moto", 18), voiture=trajet("voiture", 22)):
        donnees = client_superviseur.post(URL_CALCUL, corps(point), format="json").data
    assert set(donnees["modes"]) == {"pied", "moto", "voiture"}
    assert donnees["plus_rapide"] == "moto"
    assert donnees["destination"]["type"] == "point_service"
    assert donnees["modes"]["voiture"]["geometrie"]["type"] == "LineString"


@VALHALLA
def test_mode_indisponible_signale(client_superviseur, point):
    indisponible = ResultatMode(statut="indisponible", message="Ce mode n'est pas disponible chez le fournisseur.")
    with simuler(moto=indisponible):
        donnees = client_superviseur.post(URL_CALCUL, corps(point), format="json").data
    assert donnees["modes"]["moto"]["statut"] == "indisponible"
    assert donnees["modes"]["moto"]["duree_min"] is None


@VALHALLA
def test_timeout_du_fournisseur(client_superviseur, point):
    panne = ErreurFournisseur("Le service d'itinéraire ne répond pas.")
    with simuler(pied=panne, moto=panne, voiture=panne):
        reponse = client_superviseur.post(URL_CALCUL, corps(point), format="json")
    assert reponse.status_code == 424
    assert reponse.data["code"] == "fournisseur_indisponible"


@VALHALLA
def test_panne_partielle_non_mise_en_cache(client_superviseur, point):
    with simuler(moto=ErreurFournisseur("Le service d'itinéraire ne répond pas.")) as fournisseur:
        premiere = client_superviseur.post(URL_CALCUL, corps(point), format="json").data
        client_superviseur.post(URL_CALCUL, corps(point), format="json")
    assert premiere["modes"]["moto"]["statut"] == "erreur"
    assert premiere["modes"]["voiture"]["statut"] == "ok"
    assert fournisseur.call_count == 6


@override_settings(ROUTING_URL="")
def test_fournisseur_non_configure(client_superviseur, point):
    reponse = client_superviseur.post(URL_CALCUL, corps(point), format="json")
    assert reponse.status_code == 501
    assert reponse.data["code"] == "fournisseur_non_configure"


@override_settings(ROUTING_PROVIDER="inconnu", ROUTING_URL="http://x")
def test_fournisseur_inconnu(client_superviseur, point):
    assert client_superviseur.post(URL_CALCUL, corps(point), format="json").data["code"] == "fournisseur_non_configure"


@VALHALLA
def test_cache_origine_arrondie(client_superviseur, point):
    """Deux départs à ~20 m l'un de l'autre : un seul calcul (3 modes)."""
    proche = {"lat": ORIGINE["lat"] + 0.0001, "lon": ORIGINE["lon"] + 0.0001}
    with simuler() as fournisseur:
        client_superviseur.post(URL_CALCUL, corps(point), format="json")
        client_superviseur.post(URL_CALCUL, {**corps(point), "origine": proche}, format="json")
    assert fournisseur.call_count == 3


def test_arrondi_origine():
    assert arrondir_origine(14.69283, -17.44671) == (14.693, -17.4465)


# ── Confidentialité ─────────────────────────────────────────────────────────
@VALHALLA
def test_position_ni_journalisee_ni_enregistree(client_superviseur, point, caplog):
    with caplog.at_level(logging.DEBUG), simuler():
        client_superviseur.post(URL_CALCUL, corps(point), format="json")
    assert "14.69" not in caplog.text and "17.44" not in caplog.text
    assert not JournalAudit.objects.filter(details__icontains="14.69").exists()


# ── Valhalla (HTTP simulé) ──────────────────────────────────────────────────
def _reponse_http(statut: int, donnees: dict):
    corps_ = io.BytesIO(json.dumps(donnees).encode())
    if statut == 200:
        reponse = mock.MagicMock(status=200)
        reponse.__enter__.return_value = reponse
        reponse.read = corps_.read
        return reponse
    return urllib.error.HTTPError("http://valhalla.test/route", statut, "erreur", {}, corps_)


def _valhalla(statut, donnees=None, exception=None):
    effet = exception or _reponse_http(statut, donnees or {})
    cle = "side_effect" if isinstance(effet, Exception) else "return_value"
    return mock.patch("urllib.request.urlopen", **{cle: effet})


FOURNISSEUR = ValhallaFournisseur("http://valhalla.test", timeout=10)
DEPART, ARRIVEE = (14.6928, -17.4467), (14.79, -16.93)


def test_valhalla_trajet():
    donnees = {"trip": {"summary": {"length": 70.0, "time": 4405.8}, "legs": [{"shape": "_p~iF~ps|U_ulLnnqC", "maneuvers": [
        {"instruction": "Conduisez vers le nord-est.", "length": 69.9, "time": 4400},
        {"instruction": "Vous êtes arrivé.", "length": 0, "time": 0},
    ]}]}}
    with _valhalla(200, donnees) as appel:
        resultat = FOURNISSEUR.calculer(DEPART, ARRIVEE, "moto")
    envoye = json.loads(appel.call_args.args[0].data)
    assert envoye["costing"] == "motorcycle" and envoye["directions_options"]["language"] == "fr-FR"
    assert appel.call_args.kwargs["timeout"] == 10
    assert resultat.statut == "ok" and resultat.duree_min == 73.4
    assert resultat.etapes[0]["instruction"] == "Conduisez vers le nord-est."
    assert resultat.geometrie["coordinates"][0] == [-12.02, 3.85]


@pytest.mark.parametrize("code, statut", [(442, "aucun_itineraire"), (171, "aucun_itineraire"), (154, "indisponible"), (125, "indisponible")])
def test_valhalla_refus(code, statut):
    with _valhalla(400, {"error_code": code, "error": "…"}):
        assert FOURNISSEUR.calculer(DEPART, ARRIVEE, "pied").statut == statut


@pytest.mark.parametrize("exception", [TimeoutError("timed out"), urllib.error.URLError("refused")])
def test_valhalla_injoignable(exception):
    with _valhalla(0, exception=exception), pytest.raises(ErreurFournisseur):
        FOURNISSEUR.calculer(DEPART, ARRIVEE, "voiture")


@pytest.mark.parametrize("statut_http", [500, 503, 429])
def test_valhalla_erreur_serveur(statut_http):
    with _valhalla(statut_http, {"error": "…"}), pytest.raises(ErreurFournisseur):
        FOURNISSEUR.calculer(DEPART, ARRIVEE, "voiture")


def test_valhalla_reponse_illisible():
    with _valhalla(200, {"inattendu": True}), pytest.raises(ErreurFournisseur):
        FOURNISSEUR.calculer(DEPART, ARRIVEE, "voiture")


def test_decoder_polyline():
    # Exemple de référence de l'algorithme (précision 5) : (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    assert decoder_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", precision=5) == [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]
