"""Lectura del lifetime de un mes: cuanto duraron las suscripciones que se fueron.

Todo sale de `lifetime_bajas_mes`, una fila por baja. Las estadisticas se
calculan aqui al leer: son unas miles de filas y asi un cambio de tramos o de
percentiles no obliga a recalcular nada.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.models import Periodo
from core.utils import clean_json_nullable

from .bajas_mes import DIMS_BAJAS, INSTALADAS_DESDE

logger = logging.getLogger(__name__)

# Solo se miden las bajas instaladas desde `INSTALADAS_DESDE`: los clientes
# captados desde la migracion de enero de 2026, que es lo que interesa. Las de
# la base antigua siguen guardadas (y cuentan en el cuadre), pero no se leen.

# Tramos de duracion, en dias (ambos extremos incluidos). Las instaladas desde
# 2026 llevan como mucho unos meses de vida, asi que son meses de 30 dias, todos
# del mismo ancho: con uno de 60 entre medias, ese parecia concentrar el doble
# de bajas solo por ser el doble de largo. Cortan en 30 y en 90 dias, que es lo
# que la pagina destaca.
TRAMOS = [
    *[(f"{desde}-{hasta} d", desde, hasta) for desde, hasta in [(0, 30), *((d, d + 29) for d in range(31, 361, 30))]],
    ("+360 d", 361, None),
]

# Campanas que no cuentan en el lifetime: se quitan al leer, de todo (resumen,
# tramos, dimensiones y exportacion). "Sin campanna" es la base anterior a las
# campanas, casi entera instalada antes de 2026; "Exonerado" no paga, asi que su
# baja no es la de un cliente. Siguen guardadas en la tabla, y por eso el
# cuadre con el cierre mensual se hace con todas.
CAMPANNAS_EXCLUIDAS = ("Sin campanna", "Exonerado")

_MES = re.compile(r"^\d{4}-\d{2}$")


def get_meses_lifetime(db=None) -> list[str]:
    """Los meses calculados, del mas reciente al mas antiguo (`YYYY-MM`)."""
    if db is None:
        db = DBConnector()
    if not db.tabla_existe(TableNames.LIFETIME_BAJAS_MES):
        return []
    df = db.query(
        f'SELECT DISTINCT periodo_reporte FROM "{DB_SCHEMA}"."{TableNames.LIFETIME_BAJAS_MES}"'
    )
    return sorted((m for m in df["periodo_reporte"] if _MES.match(str(m))), reverse=True)


def _resumen(serie: pd.Series) -> dict[str, Any]:
    """Promedio, mediana, cuartiles y extremos de una duracion en dias."""
    s = pd.to_numeric(serie, errors="coerce").dropna()
    if s.empty:
        return {"n": 0, "promedio": None, "mediana": None, "p25": None, "p75": None, "min": None, "max": None}
    return {
        "n": int(len(s)),
        "promedio": round(float(s.mean()), 1),
        "mediana": float(s.median()),
        "p25": float(s.quantile(0.25)),
        "p75": float(s.quantile(0.75)),
        "min": int(s.min()),
        "max": int(s.max()),
    }


def _pct(parte: int, total: int) -> float:
    return round(parte / total * 100, 1) if total else 0.0


def _tramos(serie: pd.Series, tramos: list[tuple[str, int, int | None]]) -> list[dict[str, Any]]:
    """Cuantas bajas caen en cada tramo, su % y el % acumulado hasta ese tramo."""
    s = serie.dropna()
    filas = []
    acumuladas = 0
    for etiqueta, desde, hasta in tramos:
        dentro = s >= desde
        if hasta is not None:
            dentro &= s <= hasta
        n = int(dentro.sum())
        acumuladas += n
        filas.append({
            "tramo": etiqueta,
            "desde": desde,
            "hasta": hasta,
            "bajas": n,
            "pct": _pct(n, len(s)),
            "pct_acumulado": _pct(acumuladas, len(s)),
        })
    # Los tramos vacios del final no dicen nada (nadie llego a durar tanto) y
    # le quitan sitio al grafico.
    while len(filas) > 1 and filas[-1]["bajas"] == 0:
        filas.pop()
    return filas


def _por_dimension(df: pd.DataFrame) -> dict[str, list[dict[str, Any]]]:
    """Por cada valor de cada dimension, la duracion de sus bajas.

    Los valores sin ninguna baja no aparecen. `pct_30`/`pct_90` son las que se
    fueron en su primer mes y en sus primeros tres meses.
    """
    salida: dict[str, list[dict[str, Any]]] = {}
    for dim in DIMS_BAJAS:
        if dim not in df.columns:
            continue
        filas = []
        for valor, grp in df.groupby(dim, sort=False):
            dias = grp["dias_desde_instalacion"]
            resumen = _resumen(dias)
            filas.append({
                "valor": str(valor),
                "bajas": resumen["n"],
                "promedio": resumen["promedio"],
                "mediana": resumen["mediana"],
                "p25": resumen["p25"],
                "p75": resumen["p75"],
                "pct_30": _pct(int((dias <= 30).sum()), resumen["n"]),
                "pct_90": _pct(int((dias <= 90).sum()), resumen["n"]),
            })
        salida[dim] = sorted(filas, key=lambda f: f["bajas"], reverse=True)
    return salida


def _bajas_del_reporte(db, mes: str) -> int | None:
    """Cuantas bajas tiene guardadas el cierre mensual de ese mes, si lo hay.

    Sirve para avisar cuando los dos calculos se hicieron con datos distintos:
    el lifetime lee el log de hoy, y el cierre, el que habia al correrlo.
    """
    if not db.tabla_existe(TableNames.ANALYZER_BAJAS_DETALLADAS):
        return None
    etiqueta = Periodo.build(f"{mes}-01").label()
    df = db.query(
        f'SELECT count(*) AS n FROM "{DB_SCHEMA}"."{TableNames.ANALYZER_BAJAS_DETALLADAS}"'
        " WHERE periodo_reporte = %s",
        [etiqueta],
    )
    return int(df["n"].iloc[0]) or None


def _leer_mes(mes: str | None, db) -> pd.DataFrame:
    """Las bajas guardadas de un mes, con las duraciones ya numericas."""
    if not mes or not _MES.match(mes):
        return pd.DataFrame()
    try:
        df = db.read_table_filtered(TableNames.LIFETIME_BAJAS_MES, "periodo_reporte", [mes])
    except Exception:
        logger.exception("Error leyendo el lifetime de %s", mes)
        return pd.DataFrame()
    if df.empty:
        return df
    df["dias_desde_instalacion"] = pd.to_numeric(df["dias_desde_instalacion"], errors="coerce")
    return df


def _las_que_cuentan(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int], int]:
    """Las bajas que mide el lifetime: fuera de las campanas excluidas e instaladas desde 2026.

    Devuelve tambien cuantas se quitaron de cada campana excluida y cuantas,
    del resto, se instalaron antes de `INSTALADAS_DESDE`.
    """
    if df.empty:
        return df, {}, 0
    fuera = df["campanna"].isin(CAMPANNAS_EXCLUIDAS)
    excluidas = {c: int(n) for c, n in df.loc[fuera, "campanna"].value_counts().items()}
    resto = df[~fuera]
    de_2026 = pd.to_datetime(resto["f_ini"], errors="coerce") >= INSTALADAS_DESDE
    return resto[de_2026], excluidas, int((~de_2026).sum())


def get_lifetime_mes(mes: str | None, db=None) -> dict[str, Any] | None:
    """El lifetime de las bajas de un mes, o `None` si ese mes no esta calculado.

    Sin el detalle por orden: son unas miles de filas que solo hacen falta al
    exportar, y las pide `get_lifetime_detalle`.
    """
    if db is None:
        db = DBConnector()
    todas = _leer_mes(mes, db)
    if todas.empty:
        return None
    df, excluidas, anteriores = _las_que_cuentan(todas)
    return clean_json_nullable({
        "mes": mes,
        "fecha_corte": todas["fecha_corte"].iloc[0],
        "mes_en_curso": str(todas["mes_en_curso"].iloc[0]).lower() == "true",
        "bajas": int(len(df)),
        # Todas las bajas del mes, excluidas incluidas: es lo que se cuadra con
        # el cierre mensual.
        "bajas_mes": int(len(todas)),
        "excluidas": excluidas,
        "anteriores": anteriores,
        "bajas_reporte": _bajas_del_reporte(db, mes),
        "instaladas_desde": INSTALADAS_DESDE.strftime("%Y-%m-%d"),
        "resumen": _resumen(df["dias_desde_instalacion"]),
        "tramos": _tramos(df["dias_desde_instalacion"], TRAMOS),
        "por_dimension": _por_dimension(df),
    })


def get_lifetime_detalle(mes: str | None, db=None) -> list[dict[str, Any]]:
    """Una fila por baja del mes que cuenta, para exportar. Vacia si el mes no esta calculado."""
    if db is None:
        db = DBConnector()
    df, _, _ = _las_que_cuentan(_leer_mes(mes, db))
    if df.empty:
        return []
    columnas = [
        "orden", "f_ini", "f_baja", "estado_cierre", "dias_desde_instalacion",
        *[d for d in DIMS_BAJAS if d in df.columns],
    ]
    detalle = df[columnas].sort_values("dias_desde_instalacion")
    return clean_json_nullable(detalle.to_dict("records"))
