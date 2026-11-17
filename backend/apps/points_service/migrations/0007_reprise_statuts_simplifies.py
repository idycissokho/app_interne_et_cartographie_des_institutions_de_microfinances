"""
Reprise des données pour 0006 (séparée : PostgreSQL refuse de créer l'index de « est_siege »
dans la même transaction que ces mises à jour).
- siège social -> agence marquée « est_siege » (elle situe toujours l'IMF) ;
- bureau de représentation -> agence ; suspendu -> fermé ;
- statut réglementaire du point = celui de son IMF.
"""

from django.db import migrations


def vers_nouveaux_statuts(apps, schema_editor):
    Point = apps.get_model("points_service", "PointService")
    IMF = apps.get_model("imf", "IMF")
    Point.objects.filter(type_point="SIEGE").update(type_point="AGENCE", est_siege=True)
    Point.objects.filter(type_point="BUREAU").update(type_point="AGENCE")
    Point.objects.filter(statut_point="SUSPENDU").update(statut_point="FERME")
    for statut in ("EN_ACTIVITE", "OPR", "RETRAIT_AGREMENT"):
        Point.objects.filter(imf__in=IMF.objects.filter(statut_reglementaire=statut)).update(statut_reglementaire=statut)


def vers_anciens_statuts(apps, schema_editor):
    Point = apps.get_model("points_service", "PointService")
    Point.objects.filter(est_siege=True).update(type_point="SIEGE")
    Point.objects.filter(statut_reglementaire="RETRAIT_AGREMENT").update(statut_reglementaire="RADIE")
    Point.objects.filter(statut_reglementaire__in=["EN_ACTIVITE", "OPR"]).update(statut_reglementaire="AGREE")



class Migration(migrations.Migration):

    dependencies = [
        ("points_service", "0006_statuts_simplifies"),
        ("imf", "0006_statuts_simplifies"),
    ]

    operations = [
        migrations.RunPython(vers_nouveaux_statuts, vers_anciens_statuts),
    ]
