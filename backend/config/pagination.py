"""
config/pagination.py
====================
Pagination par défaut de l'API : 20 éléments, ajustable via ?page_size= (max 1000)
pour alimenter les listes déroulantes du frontend.
"""

from rest_framework.pagination import PageNumberPagination


class PaginationStandard(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 1000
