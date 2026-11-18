"""Orquestacion del analisis de lifetime por mes."""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.database import DBConnector
from core.tables import replace

from ..analyzer.dimensions import prepare_subs_dims
from ..tables import LIFETIME_CHURNED
from .loader import load_data
from .monthly_churn import INSTALLED_SINCE, compute_churn_by_month


def run_lifetime_analysis(db=None) -> dict[str, Any]:
    """Calcula y guarda las bajas de cada mes con sus duraciones.

    Recorre de una vez todos los meses desde `START_MONTH`: la carga y la
    limpieza del log son el coste y no dependen del mes. Cada mes se guarda en
    `lifetime_bajas_mes` con `periodo = "YYYY-MM"`, reemplazando su calculo
    anterior. Devuelve un resumen escalar para el job.
    """
    if db is None:
        db = DBConnector()
    subs, logs, _ = load_data(db)
    by_month = compute_churn_by_month(subs, logs, prepare_subs_dims(db))
    if not by_month:
        raise ValueError("No hay logs de suscripciones: no se calcula el lifetime.")

    print("\nLIFETIME POR MES")
    for month, churns in by_month.items():
        with db.transaction() as cur:
            replace(cur, LIFETIME_CHURNED, churns, periodo_reporte=month, metodo_calculo="lifetime")
        if churns.empty:
            print(f"  {month}: sin bajas")
            continue
        running = " (en curso)" if bool(churns["mes_en_curso"].iloc[0]) else ""
        from_2026 = churns.loc[pd.to_datetime(churns["f_ini"]) >= INSTALLED_SINCE, "dias_desde_instalacion"]
        median_2026 = f"mediana {from_2026.median():.0f} d" if len(from_2026) else "ninguna"
        print(
            f"  {month}{running}: {len(churns)} bajas"
            f" | mediana desde instalacion {churns['dias_desde_instalacion'].median():.0f} d"
            f" | instaladas desde 2026: {len(from_2026)}, {median_2026}"
        )

    last = next(reversed(by_month.values()))
    return {
        "meses_calculados": len(by_month),
        "bajas_totales": int(sum(len(b) for b in by_month.values())),
        "fecha_corte": last["fecha_corte"].iloc[0] if not last.empty else None,
    }
