"""Analitica de soporte: importacion, calculo de cohortes y lectura."""

# backend/support/__init__.py

from .analyzer import run_support_analysis
from .day_metrics import (
    build_support_day_metrics,
    get_support_day_metrics,
    get_support_periodos_con_dias,
)
from .loader import import_support_csv
from .queries import (
    get_support_analytics_structured,
    get_support_breakdown,
    get_support_cierre_historico,
    get_support_dimension_metrics,
    get_support_metric_totals,
    get_support_periodos,
    get_support_tickets_list,
)

__all__ = [
    "import_support_csv",
    "run_support_analysis",
    "build_support_day_metrics",
    "get_support_day_metrics",
    "get_support_periodos_con_dias",
    "get_support_periodos",
    "get_support_cierre_historico",
    "get_support_metric_totals",
    "get_support_dimension_metrics",
    "get_support_analytics_structured",
    "get_support_breakdown",
    "get_support_tickets_list",
]
