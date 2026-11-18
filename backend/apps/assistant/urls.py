"""
assistant/urls.py
=================
  POST question/ — Répond à une question sur les IMF, points de service et dirigeants
"""

from django.urls import path

from .views import QuestionView

app_name = "assistant"

urlpatterns = [path("question/", QuestionView.as_view(), name="question")]
