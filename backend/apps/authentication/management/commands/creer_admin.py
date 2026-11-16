"""
authentication/management/commands/creer_admin.py
=================================================
Crée le compte administrateur (rôle ADMIN) à partir de variables d'environnement,
sans qu'aucun mot de passe ne soit écrit dans le code ni dans l'historique du shell.

Variables lues :
  DJANGO_ADMIN_EMAIL         adresse de connexion (obligatoire)
  DJANGO_ADMIN_PASSWORD      mot de passe (obligatoire, soumis aux règles de robustesse)
  DJANGO_ADMIN_PRENOM        prénom affiché (facultatif, « Administrateur » par défaut)
  DJANGO_ADMIN_NOM           nom affiché (facultatif, « DRS-SFD » par défaut)

Usage : python manage.py creer_admin
        python manage.py creer_admin --si-configure          (sans erreur si les variables manquent)
        python manage.py creer_admin --reinitialiser-mot-de-passe

Sans --reinitialiser-mot-de-passe, un compte existant n'est jamais modifié :
la commande peut donc être lancée à chaque démarrage du serveur.
"""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Crée le compte administrateur à partir de DJANGO_ADMIN_EMAIL et DJANGO_ADMIN_PASSWORD."

    def add_arguments(self, parser):
        parser.add_argument(
            "--si-configure", action="store_true",
            help="Ne rien faire (sans erreur) si les variables ne sont pas définies.",
        )
        parser.add_argument(
            "--reinitialiser-mot-de-passe", action="store_true",
            help="Si le compte existe déjà, remplacer son mot de passe par DJANGO_ADMIN_PASSWORD.",
        )

    def handle(self, *args, si_configure=False, reinitialiser_mot_de_passe=False, **options):
        email = os.environ.get("DJANGO_ADMIN_EMAIL", "").strip()
        mot_de_passe = os.environ.get("DJANGO_ADMIN_PASSWORD", "")
        if not email or not mot_de_passe:
            if si_configure:
                self.stdout.write("Compte administrateur : DJANGO_ADMIN_EMAIL / DJANGO_ADMIN_PASSWORD non définies, rien à faire.")
                return
            raise CommandError("Définissez DJANGO_ADMIN_EMAIL et DJANGO_ADMIN_PASSWORD dans l'environnement.")

        Utilisateur = get_user_model()
        existant = Utilisateur.objects.filter(email__iexact=email).first()
        if existant and not reinitialiser_mot_de_passe:
            self.stdout.write(f"Compte administrateur {email} : déjà présent, inchangé.")
            return

        cible = existant or Utilisateur(
            email=Utilisateur.objects.normalize_email(email),
            prenom=os.environ.get("DJANGO_ADMIN_PRENOM", "Administrateur"),
            nom=os.environ.get("DJANGO_ADMIN_NOM", "DRS-SFD"),
        )
        try:
            validate_password(mot_de_passe, user=cible)
        except ValidationError as erreur:
            raise CommandError("Mot de passe refusé : " + " ".join(erreur.messages)) from erreur

        if existant:
            existant.set_password(mot_de_passe)
            existant.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(f"Compte administrateur {email} : mot de passe réinitialisé."))
            return

        Utilisateur.objects.create_superuser(
            email=email, password=mot_de_passe, prenom=cible.prenom, nom=cible.nom,
        )
        self.stdout.write(self.style.SUCCESS(f"Compte administrateur {email} : créé (rôle ADMIN)."))
