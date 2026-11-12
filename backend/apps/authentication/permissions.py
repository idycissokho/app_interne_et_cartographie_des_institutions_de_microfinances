from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Réservé aux administrateurs DRS-SFD."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsSuperviseurOrAdmin(BasePermission):
    """Superviseurs et administrateurs — lecture/écriture sur les données IMF."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_admin or request.user.is_superviseur)
        )


class IsConsultantOrAbove(BasePermission):
    """Tout utilisateur authentifié avec un rôle valide — lecture seule."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("ADMIN", "SUPERVISEUR", "CONSULTANT")
        )
