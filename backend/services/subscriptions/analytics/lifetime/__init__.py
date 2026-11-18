"""Lifetime: cuanto duraron activas las suscripciones que se dieron de baja cada mes.

Lee y limpia el log como el analisis mensual, y sus bajas son las mismas que
cuenta el churn. Ver `bajas_mes`.
"""

from .queries import get_lifetime_detail, get_lifetime_month, get_lifetime_months
from .runner import run_lifetime_analysis

__all__ = [
    "run_lifetime_analysis",
    "get_lifetime_detail",
    "get_lifetime_month",
    "get_lifetime_months",
]
