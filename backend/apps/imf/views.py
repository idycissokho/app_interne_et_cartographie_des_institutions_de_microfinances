from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import IMF
from .serializers import IMFListSerializer, IMFDetailSerializer
from apps.authentication.permissions import IsSuperviseurOrAdmin


class IMFListCreateView(generics.ListCreateAPIView):
    queryset = IMF.objects.filter(is_active=True)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type_imf", "statut_reglementaire"]
    search_fields = ["nom", "sigle"]
    ordering_fields = ["nom", "date_creation"]

    def get_serializer_class(self):
        return IMFDetailSerializer if self.request.method == "POST" else IMFListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]


class IMFDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = IMF.objects.filter(is_active=True)
    serializer_class = IMFDetailSerializer
    lookup_field = "pk"

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsSuperviseurOrAdmin()]
        return [IsAuthenticated()]

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])
