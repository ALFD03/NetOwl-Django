"""Cuanto duraron activas las suscripciones que se dieron de baja en cada mes.

Las bajas de un mes son **las mismas que cuenta el churn mensual**: las activas
al inicio del mes que al cierre no estan activas ni en plan gratuito
(`churn_idx` en `analyzer.py`). Se leen del mismo log limpio (`loader.load_data`)
con el mismo `AccumulatedState`, asi que el total de un mes es el del reporte.

De cada baja se mide cuanto duro **desde la instalacion**: de `fecha_inicio` a
la baja, su antiguedad entera. Solo necesita esas dos fechas, asi que vale para
cualquier orden. La pagina lo muestra dos veces: sobre todas las bajas del mes y
solo sobre las instaladas desde `INSTALLED_SINCE` (ver `queries.py`).

La baja se fecha en el **inicio del tramo inactivo** vigente al cierre (pausa ->
+30 dias -> cancelado es un solo tramo), no en el dia del cierre: quien se corta
el 28 y sigue cortado el 31 estuvo activo hasta el 28.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from core.config import ACTIVE_STATE, DIMS, FREE_STATE
from core.models import Period

from ..analyzer.metrics_calc import AccumulatedState

# El primer mes: el log actual empieza con la migracion de enero de 2026, y
# antes solo el formato v15 cubre una parte de las ordenes. El estado al inicio
# de un mes anterior no se puede leer para todos.
START_MONTH = pd.Timestamp("2026-01-01")

# El producto no se desglosa: el export guarda el plan de *hoy*, y el de una
# orden cancelada es "Cancelado", que es justo lo que tienen casi todas las bajas.
CHURN_DIMS = [d for d in DIMS if d != "producto"]

# El activo que `rules.py` intercala entre un log inactivo y un "corte
# automatico por factura impaga". Un cliente en pausa recibe un corte por cada
# factura, y ese activo inventado partia su tramo inactivo en dos: la baja
# quedaba fechada en el ultimo corte en vez de en el inicio de la pausa.
# Cuenta para el estado al cierre (como en el mensual), no para fechar tramos.
ACTIVE_BETWEEN_CUTS_NOTE = "sintetico - activo entre inactivo y corte impago"

# La pagina solo mide las bajas instaladas desde esta fecha: los clientes
# captados desde la migracion de enero de 2026, no la base antigua, que pesa
# mucho en las bajas de cada mes. Se guardan todas; `queries.py` filtra al leer.
INSTALLED_SINCE = pd.Timestamp("2026-01-01")

COLUMNS = [
    "orden", "f_ini", "f_baja", "estado_cierre", "dias_desde_instalacion",
    *CHURN_DIMS, "mes_en_curso", "fecha_corte",
]

def _annotate_tiers(log: pd.DataFrame) -> pd.DataFrame:
    """Anade a cada log su clase y el inicio del tramo al que pertenece.

    Un tramo son logs consecutivos de la misma clase (activo, gratuito o
    inactivo). `clase` es la que decide el estado al cierre; los tramos se
    arman con `tier_class`, que trata como inactivo el activo sintetico entre
    cortes.
    """
    state = log["estado"].to_numpy()
    kind = np.where(state == ACTIVE_STATE, "A", np.where(state == FREE_STATE, "F", "X"))
    log["clase"] = kind
    between_cuts = log["log_norm"].fillna("").eq(ACTIVE_BETWEEN_CUTS_NOTE).to_numpy()
    tier_class = pd.Series(np.where(between_cuts, "X", kind), index=log.index)

    other_order = log["orden"] != log["orden"].shift()
    new = other_order | (tier_class != tier_class.shift())
    log["inicio_tramo"] = log["f_dt"].where(new).ffill()
    return log


def _months(cutoff_date: pd.Timestamp) -> list[Period]:
    """Los meses desde `START_MONTH` hasta el de la fecha de corte, este incluido."""
    months = []
    month = START_MONTH
    while month <= cutoff_date:
        months.append(Period.build(month.strftime("%Y-%m-01")))
        month = month + pd.offsets.MonthBegin(1)
    return months


def _days(since: pd.Series, until: pd.Series) -> pd.Series:
    """Dias enteros entre dos fechas; nunca negativos, nulos si falta una."""
    return ((until - since).dt.total_seconds() // 86400).clip(lower=0).astype("Int64")


def compute_churn_by_month(
    subs: pd.DataFrame, logs: pd.DataFrame, dims
) -> dict[str, pd.DataFrame]:
    """Las bajas de cada mes con su duracion, indexadas por `YYYY-MM`.

    `dims` es el `PreparedDims` del mensual (`prepare_subs_dims`): cada baja
    cae en la misma zona, sucursal o campana que en el reporte de churn. El mes
    de la fecha de corte sale marcado `mes_en_curso`: sus bajas son las de hoy y
    todavia pueden volver antes de fin de mes.
    """
    if logs.empty:
        return {}
    cutoff_date = pd.Timestamp(logs["f_dt"].max())
    log = _annotate_tiers(
        logs[["orden", "f_dt", "estado", "log_norm"]].reset_index(drop=True)
    )
    states = AccumulatedState(log)
    f_ini = subs.drop_duplicates(subset=["orden"]).set_index("orden")["f_ini_dt"]
    mappings = {d: dims.mapping(d, f"Sin {d}") for d in CHURN_DIMS if d in dims.frame.columns}

    result: dict[str, pd.DataFrame] = {}
    for period in _months(cutoff_date):
        # Mismo recorrido que el mensual: activas justo antes del dia 1, y el
        # ultimo log de cada una al cierre. Las fechas crecen de un mes al
        # siguiente, asi que `AccumulatedState` sigue siendo una sola pasada.
        start = states.latest(period.start_date, strictly_before=True)
        active_at_start = set(start.loc[start["clase"] == "A", "orden"])
        close = states.latest(period.end_date)
        churns = close[(close["clase"] == "X") & close["orden"].isin(active_at_start)].copy()

        churns["f_ini"] = churns["orden"].map(f_ini)
        churns["f_baja"] = churns["inicio_tramo"]
        churns["estado_cierre"] = churns["estado"]
        churns["dias_desde_instalacion"] = _days(churns["f_ini"], churns["f_baja"])
        for dim, mapping in mappings.items():
            churns[dim] = churns["orden"].map(mapping).fillna(f"Sin {dim}")
        churns["mes_en_curso"] = pd.Timestamp(period.end_date) > cutoff_date
        churns["fecha_corte"] = cutoff_date.strftime("%Y-%m-%d")

        for col in ("f_ini", "f_baja"):
            churns[col] = churns[col].dt.strftime("%Y-%m-%d")
        result[period.period_month()] = churns.reindex(columns=COLUMNS).reset_index(drop=True)
    return result
