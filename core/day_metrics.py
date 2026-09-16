"""Lo comun a las tres tablas de metricas diarias.

Suscripciones, CRM y soporte guardan sus cortes por dia con la misma forma de
fila -`periodo_reporte`, algun escalar del mes y `dia1..dia31` con un JSON en
texto- porque el problema es el mismo: el analisis mensual ya recorre los datos
una vez, y calcular de paso el corte acumulado de cada dia sale casi gratis
frente a volver a leerlos.

Aqui vive lo que no depende del dominio: los limites del mes, la etiqueta del
periodo, y las dos lecturas que necesitan las vistas -el mes entero o un solo
dia-. Lo que cambia entre modulos es el contenido del JSON, y eso lo pone cada
`analytics/day_metrics.py`.

**Quien lee el mes entero y quien lee un dia.** Suscripciones manda el mes
completo en los props: sus desgloses diarios son pequenos y mover la barra es
entonces una reagrupacion de cliente. CRM y soporte no pueden: un dia suyo
lleva el bloque completo de metricas de cada valor dimensional -decenas de
campos por vendedor, por sucursal, por zona, por grupo de trabajo-, y el mes
entero son megabytes que el navegador no deberia recibir para ensenar uno. Por
eso `leer_dia` existe: la barra viaja con la lista de dias calculados, y elegir
uno es una recarga parcial de Inertia que lee una sola celda ya calculada.
"""
from __future__ import annotations

import calendar
import json
import logging
from datetime import date
from typing import Any

from core.config import DB_SCHEMA
from core.database import DBConnector
from core.models import Periodo

logger = logging.getLogger(__name__)

DAY_COLUMNS = [f"dia{d}" for d in range(1, 32)]


def mes_bounds(year_month: str) -> tuple[int, int, int]:
    """Ano, mes y ultimo dia de un `YYYY-MM`."""
    anio, mes = int(year_month[:4]), int(year_month[5:7])
    return anio, mes, calendar.monthrange(anio, mes)[1]


def periodo_label_mes(year_month: str) -> str:
    """Etiqueta del mes completo, la misma clave que usan las demas tablas."""
    return Periodo.build(f"{year_month}-01").label()


def ultimo_dia_a_calcular(year_month: str, hasta_dia: int | None = None) -> int:
    """Hasta que dia tiene sentido calcular el mes.

    En el mes en curso no se calculan dias futuros: su corte estaria vacio y
    solo serviria para ensanchar la barra con tramos sin datos.
    """
    anio, mes, ultimo = mes_bounds(year_month)
    hoy = date.today()
    tope = ultimo
    if (anio, mes) == (hoy.year, hoy.month):
        tope = min(tope, hoy.day)
    if hasta_dia:
        tope = min(tope, hasta_dia)
    return tope


def fecha_corte(year_month: str, dia: int) -> date:
    """El dia del corte acumulado, como fecha."""
    anio, mes, _ = mes_bounds(year_month)
    return date(anio, mes, dia)


def tabla_existe(db: DBConnector, table: str) -> bool:
    """to_regclass devuelve NULL si la tabla no existe, sin lanzar error.

    Evita consultar una tabla ausente (aun no se han calculado metricas diarias).
    """
    try:
        df = db.query(
            "SELECT to_regclass(%s) AS t", params=[f"{DB_SCHEMA}.{table}"]
        )
        return not df.empty and df.iloc[0]["t"] is not None
    except Exception:
        logger.exception("Error comprobando la tabla de metricas diarias %s", table)
        return False


def _cargar(raw: Any, donde: str) -> Any:
    """El JSON de una celda `diaN`, o None si esta vacia o corrupta."""
    if raw in (None, "", "None"):
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        logger.warning("JSON invalido en %s", donde)
        return None


def leer_mes(
    table: str,
    year_month: str,
    escalares: tuple[str, ...] = (),
    clave: str | None = None,
) -> dict[str, Any]:
    """El mes entero: `{periodo_mes, dias: {"1": {...}, ...}, **escalares}`.

    Solo lo usa suscripciones, cuyo payload diario es lo bastante pequeno para
    viajar completo a los props.

    `clave` es el `periodo_reporte` de la fila. Por defecto la etiqueta larga de
    `Periodo.label()`, que es la que usan las tablas de suscripciones; CRM y
    soporte guardan el mes en `YYYY-MM` y pasan el suyo.
    """
    if not year_month:
        return {}
    db = DBConnector()
    if not tabla_existe(db, table):
        return {}
    label = clave or periodo_label_mes(year_month)
    try:
        df = db.query(
            f"SELECT * FROM {DB_SCHEMA}.{table} WHERE periodo_reporte = %s",
            params=[label],
        )
    except Exception:
        logger.exception("Error leyendo metricas diarias de %s", table)
        return {}
    if df.empty:
        return {}

    row = df.iloc[0]
    dias: dict[str, Any] = {}
    for idx, col in enumerate(DAY_COLUMNS, start=1):
        payload = _cargar(row.get(col), f"{col} de {label}")
        if payload is not None:
            dias[str(idx)] = payload

    salida: dict[str, Any] = {
        "periodo_reporte": label,
        "periodo_mes": year_month,
        "dias": dias,
    }
    salida.update({c: row.get(c) for c in escalares})
    return salida


def leer_dia(
    table: str, year_month: str, dia: int | None = None, clave: str | None = None
) -> dict[str, Any]:
    """Un solo dia del mes, mas la lista de los que hay calculados.

    Devuelve `{periodo_mes, dias_disponibles, dia, payload}`. Sin `dia` -o con
    uno que no este calculado- cae al ultimo corte del mes, que es el mas
    reciente y el unico que se puede ensenar sin mentir.

    Son dos consultas y no una para no arrastrar los treinta y un JSON del mes
    hasta Python solo para quedarse con uno.

    `clave` es el `periodo_reporte` de la fila, como en `leer_mes`.
    """
    vacio: dict[str, Any] = {
        "periodo_mes": year_month or "",
        "dias_disponibles": [],
        "dia": 0,
        "payload": None,
    }
    if not year_month:
        return vacio
    db = DBConnector()
    if not tabla_existe(db, table):
        return vacio
    label = clave or periodo_label_mes(year_month)

    presencia = ", ".join(
        f"({c} IS NOT NULL AND {c} <> '') AS {c}" for c in DAY_COLUMNS
    )
    try:
        df = db.query(
            f"SELECT {presencia} FROM {DB_SCHEMA}.{table} WHERE periodo_reporte = %s",
            params=[label],
        )
    except Exception:
        logger.exception("Error listando los dias calculados de %s", table)
        return vacio
    if df.empty:
        return vacio

    row = df.iloc[0]
    disponibles = [
        idx for idx, col in enumerate(DAY_COLUMNS, start=1) if bool(row.get(col))
    ]
    if not disponibles:
        return {**vacio, "periodo_mes": year_month}

    elegido = dia if dia in disponibles else disponibles[-1]
    try:
        df_dia = db.query(
            f"SELECT dia{elegido} AS payload FROM {DB_SCHEMA}.{table}"
            " WHERE periodo_reporte = %s",
            params=[label],
        )
    except Exception:
        logger.exception("Error leyendo el dia %s de %s", elegido, table)
        return {**vacio, "periodo_mes": year_month, "dias_disponibles": disponibles}

    payload = (
        _cargar(df_dia.iloc[0]["payload"], f"dia{elegido} de {label}")
        if not df_dia.empty
        else None
    )
    return {
        "periodo_mes": year_month,
        "dias_disponibles": disponibles,
        "dia": elegido,
        "payload": payload,
    }


def periodos_con_dias(table: str) -> list[str]:
    """Meses (`YYYY-MM`) que ya tienen metricas diarias calculadas."""
    db = DBConnector()
    if not tabla_existe(db, table):
        return []
    try:
        df = db.query(
            f"""
            SELECT DISTINCT LEFT(periodo_reporte, 7) AS mes
            FROM {DB_SCHEMA}.{table}
            ORDER BY mes DESC
            """
        )
        return df["mes"].dropna().tolist() if not df.empty else []
    except Exception:
        logger.exception("Error listando meses con metricas diarias de %s", table)
        return []
