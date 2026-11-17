"""Lectura de datos para el analisis de supervivencia.

No tiene cargador propio: lee y limpia exactamente como el analisis mensual
(`analyzer.loader` + `cleaner` + `rules`). La baja del ciclo de vida se define
por el estado al cierre de mes, y ese estado tiene que ser el mismo que ve el
churn mensual, logs sinteticos y tramo gratuito incluidos. Con un cargador
aparte los dos calculos terminaban contando clientes distintos.
"""

from __future__ import annotations

import pandas as pd

from core.database import DBConnector

from ..analyzer import cleaner, rules
from ..analyzer import loader as analyzer_loader


def load_data(db=None) -> tuple[pd.DataFrame, pd.DataFrame, set[str]]:
    """Devuelve `(suscripciones, logs, ordenes_con_actividad)`.

    Los logs salen ordenados por `["orden", "f_dt"]`, que es la invariante de la
    que depende `metrics_calc.EstadoAcumulado`. `ordenes_con_actividad` son las
    que alguna vez estuvieron activas: el mismo filtro que usa el mensual para
    contar un alta.
    """
    if db is None:
        db = DBConnector()
    df_subs_raw, df_logs, df_logs_v15, df_free_raw = analyzer_loader.load_data(db)
    df_free_meta = cleaner.build_free_meta(df_free_raw)
    subs, logs = cleaner.build_clean_data(df_subs_raw, df_logs, df_logs_v15)
    logs, ordenes_con_actividad = rules.apply_log_rules(logs, subs, df_free_meta)
    return subs, logs, ordenes_con_actividad
