"""Orquestacion del analisis de lifetime por mes."""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import TableNames
from core.database import DBConnector

from ..analyzer.dimensions import prepare_subs_dims
from .bajas_mes import INSTALADAS_DESDE, calcular_bajas_por_mes
from .loader import load_data


def run_lifecycle_analysis(db=None) -> dict[str, Any]:
    """Calcula y guarda las bajas de cada mes con sus duraciones.

    Recorre de una vez todos los meses desde `MES_INICIO`: la carga y la
    limpieza del log son el coste y no dependen del mes. Cada mes se guarda en
    `lifetime_bajas_mes` con `periodo = "YYYY-MM"`, reemplazando su calculo
    anterior. Devuelve un resumen escalar para el job.
    """
    if db is None:
        db = DBConnector()
    subs, logs, _ = load_data(db)
    por_mes = calcular_bajas_por_mes(subs, logs, prepare_subs_dims(db))
    if not por_mes:
        raise ValueError("No hay logs de suscripciones: no se calcula el lifetime.")

    print("\nLIFETIME POR MES")
    for mes, bajas in por_mes.items():
        if bajas.empty:
            print(f"  {mes}: sin bajas")
            continue
        db.save_historico(bajas, TableNames.LIFETIME_BAJAS_MES, mes, "lifetime")
        en_curso = " (en curso)" if bool(bajas["mes_en_curso"].iloc[0]) else ""
        de_2026 = bajas.loc[pd.to_datetime(bajas["f_ini"]) >= INSTALADAS_DESDE, "dias_desde_instalacion"]
        mediana_2026 = f"mediana {de_2026.median():.0f} d" if len(de_2026) else "ninguna"
        print(
            f"  {mes}{en_curso}: {len(bajas)} bajas"
            f" | mediana desde instalacion {bajas['dias_desde_instalacion'].median():.0f} d"
            f" | instaladas desde 2026: {len(de_2026)}, {mediana_2026}"
        )

    ultimo = next(reversed(por_mes.values()))
    return {
        "meses_calculados": len(por_mes),
        "bajas_totales": int(sum(len(b) for b in por_mes.values())),
        "fecha_corte": ultimo["fecha_corte"].iloc[0] if not ultimo.empty else None,
    }
