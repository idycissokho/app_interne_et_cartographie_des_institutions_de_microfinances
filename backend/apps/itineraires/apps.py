from django.apps import AppConfig


class ItinerairesConfig(AppConfig):
    """Calcul d'itinéraires vers les IMF et les points de service (aucun modèle, aucune table)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.itineraires"
    verbose_name = "Itinéraires"
