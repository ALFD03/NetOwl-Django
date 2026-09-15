"""Analisis de supervivencia: cuanto dura una suscripcion y cuanto tarda en volver.

Pipeline aparte del analisis mensual, con su propio cargador y su propio
recorrido del historico: aqui no hay periodo, se mira todo de una vez.
"""

from .queries import get_lifecycle_results, get_lifetime_dimensiones
from .runner import run_lifecycle_analysis

__all__ = [
    "run_lifecycle_analysis",
    "get_lifecycle_results",
    "get_lifetime_dimensiones",
]
