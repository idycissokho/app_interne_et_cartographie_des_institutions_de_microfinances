import factory
from factory.django import DjangoModelFactory

from apps.authentication.models import Utilisateur


class UtilisateurFactory(DjangoModelFactory):
    class Meta:
        model = Utilisateur

    email = factory.Sequence(lambda n: f"user{n}@drs-sfd.sn")
    nom = factory.Faker("last_name", locale="fr_FR")
    prenom = factory.Faker("first_name", locale="fr_FR")
    role = Utilisateur.Role.CONSULTANT
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", "TestPass123!")
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, password=password, **kwargs)


class AdminFactory(UtilisateurFactory):
    role = Utilisateur.Role.ADMIN
    is_staff = True
    is_superuser = True


class SuperviseurFactory(UtilisateurFactory):
    role = Utilisateur.Role.SUPERVISEUR
