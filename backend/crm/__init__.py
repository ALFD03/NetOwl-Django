"""
CRM Analytics Module - Backend Package.
"""

from .crm_loader import import_crm_csv
from .crm_analyzer import run_crm_analysis
from .crm_queries import (
    get_crm_periodos,
    get_crm_cierre_historico,
    get_crm_metric_totals,
    get_crm_dimensiones,
)

__all__ = [
    "import_crm_csv",
    "run_crm_analysis",
    "get_crm_periodos",
    "get_crm_cierre_historico",
    "get_crm_metric_totals",
    "get_crm_dimensiones",
]