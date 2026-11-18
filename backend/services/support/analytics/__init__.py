"""Analitica de soporte: importacion, calculo de cohortes y lectura."""

# backend/support/__init__.py

from .analyzer import run_support_analysis
from .day_metrics import (
    build_support_day_metrics,
    get_support_day_payload,
    get_support_day_series,
    get_support_periods_with_days,
)
from .flow import (
    get_open_tickets,
    run_flow_analysis,
    stage_usage,
    stages_to_classify,
)
from .queries import (
    get_support_analytics_structured,
    get_support_breakdown,
    get_support_close_history,
    get_support_dimension_metrics,
    get_support_metric_totals,
    get_support_periods,
)

__all__ = [
    "run_support_analysis",
    "build_support_day_metrics",
    "get_support_day_payload",
    "get_support_day_series",
    "get_support_periods_with_days",
    "get_support_periods",
    "get_support_close_history",
    "get_support_metric_totals",
    "get_support_dimension_metrics",
    "get_support_analytics_structured",
    "get_support_breakdown",
    "run_flow_analysis",
    "get_open_tickets",
    "stages_to_classify",
    "stage_usage",
]
