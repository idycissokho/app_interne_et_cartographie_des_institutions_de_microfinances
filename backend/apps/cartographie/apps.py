from django.apps import AppConfig


class CartographieConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.cartographie"

    def ready(self):
        # Le cache des statistiques et des cartes est invalidé à chaque écriture.
        from config.cache_donnees import brancher_signaux

        brancher_signaux()
