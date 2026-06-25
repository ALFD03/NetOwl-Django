"""
CRM Analytics Module - Backend Package.
"""
from __future__ import annotations

from .loader import import_crm_csv
from .analyzer import CRMAnalyzer, run_crm_analysis
from .queries import (
    get_crm_cierre,
    get_crm_dimensiones,
    get_crm_periodos,
    get_crm_dashboard_data,
    get_crm_analytics_data,
    get_crm_results_detail,
)

__all__ = [
    "import_crm_csv",
    "CRMAnalyzer",
    "run_crm_analysis",
    "get_crm_cierre",
    "get_crm_dimensiones",
    "get_crm_periodos",
    "get_crm_dashboard_data",
    "get_crm_analytics_data",
    "get_crm_results_detail",
]