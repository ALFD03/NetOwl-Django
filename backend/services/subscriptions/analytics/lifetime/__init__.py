"""Lifetime: cuanto duraron activas las suscripciones que se dieron de baja cada mes.

Lee y limpia el log como el analisis mensual, y sus bajas son las mismas que
cuenta el churn. Ver `bajas_mes`.
"""

from .queries import get_lifetime_detalle, get_lifetime_mes, get_meses_lifetime
from .runner import run_lifecycle_analysis

__all__ = [
    "run_lifecycle_analysis",
    "get_lifetime_detalle",
    "get_lifetime_mes",
    "get_meses_lifetime",
]
