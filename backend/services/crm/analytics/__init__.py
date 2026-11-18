"""
CRM Analytics Module - Backend Package.
"""

from .analyzer import run_crm_analysis
from .day_metrics import (
    build_crm_day_metrics,
    get_crm_day_payload,
    get_crm_day_series,
    get_crm_periods_with_days,
)
from .queries import (
    get_crm_close_history,
    get_crm_dimensiones,
    get_crm_metric_totals,
    get_crm_periods,
)

__all__ = [
    "run_crm_analysis",
    "build_crm_day_metrics",
    "get_crm_day_payload",
    "get_crm_day_series",
    "get_crm_periods_with_days",
    "get_crm_periods",
    "get_crm_close_history",
    "get_crm_metric_totals",
    "get_crm_dimensiones",
]