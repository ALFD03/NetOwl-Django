"""
CRM Analytics Module - Backend Package.
"""

from .analyzer import run_crm_analysis
from .day_metrics import (
    build_crm_day_metrics,
    get_crm_day_payload,
    get_crm_day_series,
    get_crm_periodos_con_dias,
)
from .loader import campos_odoo_importacion, import_crm_csv
from .queries import (
    get_crm_cierre_historico,
    get_crm_dimensiones,
    get_crm_metric_totals,
    get_crm_periodos,
)

__all__ = [
    "import_crm_csv",
    "campos_odoo_importacion",
    "run_crm_analysis",
    "build_crm_day_metrics",
    "get_crm_day_payload",
    "get_crm_day_series",
    "get_crm_periodos_con_dias",
    "get_crm_periodos",
    "get_crm_cierre_historico",
    "get_crm_metric_totals",
    "get_crm_dimensiones",
]