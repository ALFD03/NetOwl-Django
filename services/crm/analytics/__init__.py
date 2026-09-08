"""
CRM Analytics Module - Backend Package.
"""

from .analyzer import run_crm_analysis
from .loader import import_crm_csv
from .queries import (
    get_crm_cierre_historico,
    get_crm_dimensiones,
    get_crm_metric_totals,
    get_crm_periodos,
)

__all__ = [
    "import_crm_csv",
    "run_crm_analysis",
    "get_crm_periodos",
    "get_crm_cierre_historico",
    "get_crm_metric_totals",
    "get_crm_dimensiones",
]