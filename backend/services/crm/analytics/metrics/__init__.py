"""Las metricas del embudo: efectividad, riesgo de devolucion y tiempos.

Un modulo por familia, y `core` los compone en el bloque que se persiste.
"""

from .core import average_closes, compute_crm_metrics_for_period
from .effectiveness import attribute_lost, compute_effectiveness
from .probability import (
    compute_lost_distribution,
    compute_stage8_distribution,
    compute_stage8_probability,
)
from .timing import (
    _compute_stats_distribution,
    compute_close_times,
    compute_stage_stays,
    compute_time_by_stage,
)

__all__ = [
    "_compute_stats_distribution",
    "compute_close_times",
    "compute_time_by_stage",
    "compute_stage_stays",
    "compute_effectiveness",
    "atribuir_perdidas",
    "compute_lost_distribution",
    "compute_stage8_distribution",
    "compute_stage8_probability",
    "compute_crm_metrics_for_period",
    "average_closes",
]