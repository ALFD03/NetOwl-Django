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
from core.models import Period
from core.utils import clean_json_nullable

from .monthly_churn import CHURN_DIMS, INSTALLED_SINCE

logger = logging.getLogger(__name__)

# Solo se miden las bajas instaladas desde `INSTALLED_SINCE`: los clientes
# captados desde la migracion de enero de 2026, que es lo que interesa. Las de
# la base antigua siguen guardadas (y cuentan en el cuadre), pero no se leen.

# Tramos de duracion, en dias (ambos extremos incluidos). Las instaladas desde
# 2026 llevan como mucho unos meses de vida, asi que son meses de 30 dias, todos
# del mismo ancho: con uno de 60 entre medias, ese parecia concentrar el doble
# de bajas solo por ser el doble de largo. Cortan en 30 y en 90 dias, que es lo
# que la pagina destaca.
TIERS = [
    *[(f"{since}-{until} d", since, until) for since, until in [(0, 30), *((d, d + 29) for d in range(31, 361, 30))]],
    ("+360 d", 361, None),
]

# Campanas que no cuentan en el lifetime: se quitan al leer, de todo (resumen,
# tramos, dimensiones y exportacion). "Sin campanna" es la base anterior a las
# campanas, casi entera instalada antes de 2026; "Exonerado" no paga, asi que su
# baja no es la de un cliente. Siguen guardadas en la tabla, y por eso el
# cuadre con el cierre mensual se hace con todas.
EXCLUDED_CAMPAIGNS = ("Sin campanna", "Exonerado")

_MONTH = re.compile(r"^\d{4}-\d{2}$")


def get_lifetime_months(db=None) -> list[str]:
    """Los meses calculados, del mas reciente al mas antiguo (`YYYY-MM`)."""
    if db is None:
        db = DBConnector()
    if not db.table_exists(TableNames.LIFETIME_CHURNED):
        return []
    df = db.query(
        f'SELECT DISTINCT periodo_reporte FROM "{DB_SCHEMA}"."{TableNames.LIFETIME_CHURNED}"'
    )
    return sorted((m for m in df["periodo_reporte"] if _MONTH.match(str(m))), reverse=True)


def _summary(series: pd.Series) -> dict[str, Any]:
    """Promedio, mediana, cuartiles y extremos de una duracion en dias."""
    s = pd.to_numeric(series, errors="coerce").dropna()
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


def _pct(part: int, total: int) -> float:
    return round(part / total * 100, 1) if total else 0.0


def _tiers(series: pd.Series, tiers: list[tuple[str, int, int | None]]) -> list[dict[str, Any]]:
    """Cuantas bajas caen en cada tramo, su % y el % acumulado hasta ese tramo."""
    s = series.dropna()
    rows = []
    accumulated = 0
    for label, since, until in tiers:
        inside = s >= since
        if until is not None:
            inside &= s <= until
        n = int(inside.sum())
        accumulated += n
        rows.append({
            "tramo": label,
            "desde": since,
            "hasta": until,
            "bajas": n,
            "pct": _pct(n, len(s)),
            "pct_acumulado": _pct(accumulated, len(s)),
        })
    # Los tramos vacios del final no dicen nada (nadie llego a durar tanto) y
    # le quitan sitio al grafico.
    while len(rows) > 1 and rows[-1]["bajas"] == 0:
        rows.pop()
    return rows


def _by_dimension(df: pd.DataFrame) -> dict[str, list[dict[str, Any]]]:
    """Por cada valor de cada dimension, la duracion de sus bajas.

    Los valores sin ninguna baja no aparecen. `pct_30`/`pct_90` son las que se
    fueron en su primer mes y en sus primeros tres meses.
    """
    departure: dict[str, list[dict[str, Any]]] = {}
    for dim in CHURN_DIMS:
        if dim not in df.columns:
            continue
        rows = []
        for value, grp in df.groupby(dim, sort=False):
            days = grp["dias_desde_instalacion"]
            summary = _summary(days)
            rows.append({
                "valor": str(value),
                "bajas": summary["n"],
                "promedio": summary["promedio"],
                "mediana": summary["mediana"],
                "p25": summary["p25"],
                "p75": summary["p75"],
                "pct_30": _pct(int((days <= 30).sum()), summary["n"]),
                "pct_90": _pct(int((days <= 90).sum()), summary["n"]),
            })
        departure[dim] = sorted(rows, key=lambda f: f["bajas"], reverse=True)
    return departure


def _report_churns(db, month: str) -> int | None:
    """Cuantas bajas tiene guardadas el cierre mensual de ese mes, si lo hay.

    Sirve para avisar cuando los dos calculos se hicieron con datos distintos:
    el lifetime lee el log de hoy, y el cierre, el que habia al correrlo.
    """
    if not db.table_exists(TableNames.ANALYZER_CHURNED):
        return None
    label = Period.build(f"{month}-01").label()
    df = db.query(
        f'SELECT count(*) AS n FROM "{DB_SCHEMA}"."{TableNames.ANALYZER_CHURNED}"'
        " WHERE periodo_reporte = %s",
        [label],
    )
    return int(df["n"].iloc[0]) or None


def _read_month(month: str | None, db) -> pd.DataFrame:
    """Las bajas guardadas de un mes, con las duraciones ya numericas."""
    if not month or not _MONTH.match(month):
        return pd.DataFrame()
    try:
        df = db.read_table_filtered(TableNames.LIFETIME_CHURNED, "periodo_reporte", [month])
    except Exception:
        logger.exception("Error leyendo el lifetime de %s", month)
        return pd.DataFrame()
    if df.empty:
        return df
    df["dias_desde_instalacion"] = pd.to_numeric(df["dias_desde_instalacion"], errors="coerce")
    return df


def _counted(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int], int]:
    """Las bajas que mide el lifetime: fuera de las campanas excluidas e instaladas desde 2026.

    Devuelve tambien cuantas se quitaron de cada campana excluida y cuantas,
    del resto, se instalaron antes de `INSTALLED_SINCE`.
    """
    if df.empty:
        return df, {}, 0
    outside = df["campanna"].isin(EXCLUDED_CAMPAIGNS)
    excluded = {c: int(n) for c, n in df.loc[outside, "campanna"].value_counts().items()}
    rest = df[~outside]
    from_2026 = pd.to_datetime(rest["f_ini"], errors="coerce") >= INSTALLED_SINCE
    return rest[from_2026], excluded, int((~from_2026).sum())


def get_lifetime_month(month: str | None, db=None) -> dict[str, Any] | None:
    """El lifetime de las bajas de un mes, o `None` si ese mes no esta calculado.

    Sin el detalle por orden: son unas miles de filas que solo hacen falta al
    exportar, y las pide `get_lifetime_detail`.
    """
    if db is None:
        db = DBConnector()
    all_rows = _read_month(month, db)
    if all_rows.empty:
        return None
    df, excluded, previous = _counted(all_rows)
    return clean_json_nullable({
        "mes": month,
        "fecha_corte": all_rows["fecha_corte"].iloc[0],
        "mes_en_curso": str(all_rows["mes_en_curso"].iloc[0]).lower() == "true",
        "bajas": int(len(df)),
        # Todas las bajas del mes, excluidas incluidas: es lo que se cuadra con
        # el cierre mensual.
        "bajas_mes": int(len(all_rows)),
        "excluidas": excluded,
        "anteriores": previous,
        "bajas_reporte": _report_churns(db, month),
        "instaladas_desde": INSTALLED_SINCE.strftime("%Y-%m-%d"),
        "resumen": _summary(df["dias_desde_instalacion"]),
        "tramos": _tiers(df["dias_desde_instalacion"], TIERS),
        "por_dimension": _by_dimension(df),
    })


def get_lifetime_detail(month: str | None, db=None) -> list[dict[str, Any]]:
    """Una fila por baja del mes que cuenta, para exportar. Vacia si el mes no esta calculado."""
    if db is None:
        db = DBConnector()
    df, _, _ = _counted(_read_month(month, db))
    if df.empty:
        return []
    columns = [
        "orden", "f_ini", "f_baja", "estado_cierre", "dias_desde_instalacion",
        *[d for d in CHURN_DIMS if d in df.columns],
    ]
    detail = df[columns].sort_values("dias_desde_instalacion")
    return clean_json_nullable(detail.to_dict("records"))
