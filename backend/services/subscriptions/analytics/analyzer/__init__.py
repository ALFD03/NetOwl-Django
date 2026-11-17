"""El analisis mensual de churn, repartido en cinco pasos.

`loader` lee, `cleaner` normaliza, `rules` completa lo que Odoo no registro,
`metrics_calc` responde el estado a una fecha y `dimensions` desglosa;
`analyzer` los orquesta y es lo unico que se exporta.
"""

from .analyzer import MetricsAnalyzer
