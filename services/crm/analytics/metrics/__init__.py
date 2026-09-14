"""Las metricas del embudo: efectividad, riesgo de devolucion y tiempos.

Un modulo por familia, y `core` los compone en el bloque que se persiste.
"""

from .core import compute_crm_metrics_for_period
from .efectividad import atribuir_perdidas, compute_efectividad
from .probabilidad import (
    compute_distribucion_etapa8,
    compute_distribucion_perdidos,
    compute_probabilidad_etapa8,
)
from .tiempo import (
    _compute_stats_distribution,
    compute_permanencias_en_etapa,
    compute_tiempo_por_etapa,
    compute_tiempos_cierre,
)

__all__ = [
    "_compute_stats_distribution",
    "compute_tiempos_cierre",
    "compute_tiempo_por_etapa",
    "compute_permanencias_en_etapa",
    "compute_efectividad",
    "atribuir_perdidas",
    "compute_distribucion_perdidos",
    "compute_distribucion_etapa8",
    "compute_probabilidad_etapa8",
    "compute_crm_metrics_for_period",
]