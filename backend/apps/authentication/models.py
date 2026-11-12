import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UtilisateurManager


class Utilisateur(AbstractBaseUser, PermissionsMixin):
    """
    Modèle utilisateur custom de l'application DRS-SFD.
    Remplace le modèle auth.User de Django.
    Identifiant : email (pas le username).
    """

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrateur"
        SUPERVISEUR = "SUPERVISEUR", "Superviseur"
        CONSULTANT = "CONSULTANT", "Consultant"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, verbose_name="Adresse email")
    nom = models.CharField(max_length=100, verbose_name="Nom")
    prenom = models.CharField(max_length=100, verbose_name="Prénom")
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CONSULTANT,
        verbose_name="Rôle",
    )

    is_active = models.BooleanField(default=True, verbose_name="Compte actif")
    is_staff = models.BooleanField(default=False, verbose_name="Accès admin Django")

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)
    derniere_connexion_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = UtilisateurManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nom", "prenom"]

    class Meta:
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.email})"

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_superviseur(self):
        return self.role == self.Role.SUPERVISEUR
