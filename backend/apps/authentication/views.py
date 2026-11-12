import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import JournalAudit

from .serializers import ChangePasswordSerializer, LoginSerializer, UtilisateurSerializer

audit_logger = logging.getLogger("audit")


class LoginView(APIView):
    """
    POST /api/v1/auth/login/
    Retourne une paire de tokens JWT (access + refresh).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]

        # Enregistrement de l'IP de dernière connexion
        ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR"))
        if ip:
            ip = ip.split(",")[0].strip()
        user.derniere_connexion_ip = ip
        user.save(update_fields=["derniere_connexion_ip"])

        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        refresh["nom_complet"] = user.nom_complet

        audit_logger.info("LOGIN user=%s ip=%s", user.email, ip)
        JournalAudit.enregistrer(
            user, JournalAudit.Action.CONNEXION, f"authentication.Utilisateur:{user.pk}", {"ip": ip}
        )

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "utilisateur": UtilisateurSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/
    Invalide le refresh token (blacklist).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Le token refresh est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Token invalide ou déjà révoqué."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audit_logger.info("LOGOUT user=%s", request.user.email)
        JournalAudit.enregistrer(
            request.user, JournalAudit.Action.DECONNEXION, f"authentication.Utilisateur:{request.user.pk}"
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfilView(APIView):
    """
    GET  /api/v1/auth/profil/  — Retourne le profil de l'utilisateur connecté.
    PATCH /api/v1/auth/profil/ — Met à jour nom et prénom uniquement.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)

    def patch(self, request):
        serializer = UtilisateurSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """
    POST /api/v1/auth/change-password/
    Permet à l'utilisateur connecté de changer son mot de passe.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        audit_logger.info("PASSWORD_CHANGED user=%s", request.user.email)
        JournalAudit.enregistrer(
            request.user,
            JournalAudit.Action.CHANGEMENT_MOT_DE_PASSE,
            f"authentication.Utilisateur:{request.user.pk}",
        )
        return Response(
            {"detail": "Mot de passe modifié avec succès."},
            status=status.HTTP_200_OK,
        )
