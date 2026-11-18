"""
assistant/views.py
==================
POST /api/v1/assistant/question/  {"question": "..."}

Répond uniquement à partir de la base (IMF, points de service, dirigeants et mandats), avec un
moteur local : aucune donnée ne quitte le serveur. Ouvert à tous les utilisateurs connectés,
qui consultent déjà ces informations dans l'application. Les réponses qui affichent des
dirigeants sont journalisées, comme l'ouverture d'une fiche dirigeant.
"""

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.models import JournalAudit

from .moteur import repondre


class QuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=300, trim_whitespace=True)


class QuestionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "assistant"

    def post(self, request):
        serializer = QuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data["question"]
        reponse = repondre(question)
        if reponse.dirigeants_consultes:
            JournalAudit.enregistrer(
                request.user, JournalAudit.Action.CONSULTATION, "assistant.Question",
                {"libelle": f"Assistant : {question[:120]}", "dirigeants": reponse.dirigeants_consultes[:20]},
            )
        return Response(reponse.en_dict(), status=status.HTTP_200_OK)
