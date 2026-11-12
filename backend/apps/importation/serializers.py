"""
importation/serializers.py
==========================
Sérialiseurs du module importation :
- ImportationFichierSerializer : upload + suivi du statut
"""

from rest_framework import serializers

from .models import ImportationFichier
from .services import valider_fichier


class ImportationFichierSerializer(serializers.ModelSerializer):
    """Sérialiseur pour l'upload et le suivi d'un import de fichier."""

    utilisateur_email = serializers.EmailField(source="utilisateur.email", read_only=True)
    taux_succes = serializers.FloatField(read_only=True)

    class Meta:
        model = ImportationFichier
        fields = [
            "id", "utilisateur", "utilisateur_email", "type_import", "fichier",
            "statut", "nb_lignes_total", "nb_lignes_importees", "nb_lignes_erreur",
            "taux_succes", "rapport_erreurs", "date_creation", "date_modification",
        ]
        read_only_fields = [
            "id", "utilisateur", "statut", "nb_lignes_total",
            "nb_lignes_importees", "nb_lignes_erreur", "rapport_erreurs",
            "date_creation", "date_modification",
        ]

    def validate_fichier(self, fichier):
        valider_fichier(fichier)
        return fichier
