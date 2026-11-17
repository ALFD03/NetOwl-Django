"""Cuanto duraron activas las suscripciones que se dieron de baja en cada mes.

Las bajas de un mes son **las mismas que cuenta el churn mensual**: las activas
al inicio del mes que al cierre no estan activas ni en plan gratuito
(`bajas_idx` en `analyzer.py`). Se leen del mismo log limpio (`loader.load_data`)
con el mismo `EstadoAcumulado`, asi que el total de un mes es el del reporte.

De cada baja se mide cuanto duro **desde la instalacion**: de `fecha_inicio` a
la baja, su antiguedad entera. Solo necesita esas dos fechas, asi que vale para
cualquier orden. La pagina lo muestra dos veces: sobre todas las bajas del mes y
solo sobre las instaladas desde `INSTALADAS_DESDE` (ver `queries.py`).

La baja se fecha en el **inicio del tramo inactivo** vigente al cierre (pausa ->
+30 dias -> cancelado es un solo tramo), no en el dia del cierre: quien se corta
el 28 y sigue cortado el 31 estuvo activo hasta el 28.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from core.config import ACTIVE_STATE, DIMS, FREE_STATE
from core.models import Periodo

from ..analyzer.metrics_calc import EstadoAcumulado

# El primer mes: el log actual empieza con la migracion de enero de 2026, y
# antes solo el formato v15 cubre una parte de las ordenes. El estado al inicio
# de un mes anterior no se puede leer para todos.
MES_INICIO = pd.Timestamp("2026-01-01")

# El producto no se desglosa: el export guarda el plan de *hoy*, y el de una
# orden cancelada es "Cancelado", que es justo lo que tienen casi todas las bajas.
DIMS_BAJAS = [d for d in DIMS if d != "producto"]

# El activo que `rules.py` intercala entre un log inactivo y un "corte
# automatico por factura impaga". Un cliente en pausa recibe un corte por cada
# factura, y ese activo inventado partia su tramo inactivo en dos: la baja
# quedaba fechada en el ultimo corte en vez de en el inicio de la pausa.
# Cuenta para el estado al cierre (como en el mensual), no para fechar tramos.
NOTA_ACTIVO_ENTRE_CORTES = "sintetico - activo entre inactivo y corte impago"

# La pagina solo mide las bajas instaladas desde esta fecha: los clientes
# captados desde la migracion de enero de 2026, no la base antigua, que pesa
# mucho en las bajas de cada mes. Se guardan todas; `queries.py` filtra al leer.
INSTALADAS_DESDE = pd.Timestamp("2026-01-01")

COLUMNAS = [
    "orden", "f_ini", "f_baja", "estado_cierre", "dias_desde_instalacion",
    *DIMS_BAJAS, "mes_en_curso", "fecha_corte",
]

def _anotar_tramos(log: pd.DataFrame) -> pd.DataFrame:
    """Anade a cada log su clase y el inicio del tramo al que pertenece.

    Un tramo son logs consecutivos de la misma clase (activo, gratuito o
    inactivo). `clase` es la que decide el estado al cierre; los tramos se
    arman con `clase_tramo`, que trata como inactivo el activo sintetico entre
    cortes.
    """
    estado = log["estado"].to_numpy()
    clase = np.where(estado == ACTIVE_STATE, "A", np.where(estado == FREE_STATE, "F", "X"))
    log["clase"] = clase
    entre_cortes = log["log_norm"].fillna("").eq(NOTA_ACTIVO_ENTRE_CORTES).to_numpy()
    clase_tramo = pd.Series(np.where(entre_cortes, "X", clase), index=log.index)

    otra_orden = log["orden"] != log["orden"].shift()
    nuevo = otra_orden | (clase_tramo != clase_tramo.shift())
    log["inicio_tramo"] = log["f_dt"].where(nuevo).ffill()
    return log


def _meses(fecha_corte: pd.Timestamp) -> list[Periodo]:
    """Los meses desde `MES_INICIO` hasta el de la fecha de corte, este incluido."""
    meses = []
    mes = MES_INICIO
    while mes <= fecha_corte:
        meses.append(Periodo.build(mes.strftime("%Y-%m-01")))
        mes = mes + pd.offsets.MonthBegin(1)
    return meses


def _dias(desde: pd.Series, hasta: pd.Series) -> pd.Series:
    """Dias enteros entre dos fechas; nunca negativos, nulos si falta una."""
    return ((hasta - desde).dt.total_seconds() // 86400).clip(lower=0).astype("Int64")


def calcular_bajas_por_mes(
    subs: pd.DataFrame, logs: pd.DataFrame, dims
) -> dict[str, pd.DataFrame]:
    """Las bajas de cada mes con su duracion, indexadas por `YYYY-MM`.

    `dims` es el `DimsPreparadas` del mensual (`prepare_subs_dims`): cada baja
    cae en la misma zona, sucursal o campana que en el reporte de churn. El mes
    de la fecha de corte sale marcado `mes_en_curso`: sus bajas son las de hoy y
    todavia pueden volver antes de fin de mes.
    """
    if logs.empty:
        return {}
    fecha_corte = pd.Timestamp(logs["f_dt"].max())
    log = _anotar_tramos(
        logs[["orden", "f_dt", "estado", "log_norm"]].reset_index(drop=True)
    )
    estados = EstadoAcumulado(log)
    f_ini = subs.drop_duplicates(subset=["orden"]).set_index("orden")["f_ini_dt"]
    mapas = {d: dims.mapa(d, f"Sin {d}") for d in DIMS_BAJAS if d in dims.frame.columns}

    resultado: dict[str, pd.DataFrame] = {}
    for periodo in _meses(fecha_corte):
        # Mismo recorrido que el mensual: activas justo antes del dia 1, y el
        # ultimo log de cada una al cierre. Las fechas crecen de un mes al
        # siguiente, asi que `EstadoAcumulado` sigue siendo una sola pasada.
        inicio = estados.ultimos(periodo.fecha_inicio, strictly_before=True)
        activas_al_inicio = set(inicio.loc[inicio["clase"] == "A", "orden"])
        cierre = estados.ultimos(periodo.fecha_final)
        bajas = cierre[(cierre["clase"] == "X") & cierre["orden"].isin(activas_al_inicio)].copy()

        bajas["f_ini"] = bajas["orden"].map(f_ini)
        bajas["f_baja"] = bajas["inicio_tramo"]
        bajas["estado_cierre"] = bajas["estado"]
        bajas["dias_desde_instalacion"] = _dias(bajas["f_ini"], bajas["f_baja"])
        for dim, mapa in mapas.items():
            bajas[dim] = bajas["orden"].map(mapa).fillna(f"Sin {dim}")
        bajas["mes_en_curso"] = pd.Timestamp(periodo.fecha_final) > fecha_corte
        bajas["fecha_corte"] = fecha_corte.strftime("%Y-%m-%d")

        for col in ("f_ini", "f_baja"):
            bajas[col] = bajas[col].dt.strftime("%Y-%m-%d")
        resultado[periodo.periodo_mes()] = bajas.reindex(columns=COLUMNAS).reset_index(drop=True)
    return resultado
