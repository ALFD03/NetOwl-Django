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

**Tres lecturas, y cual usa cada quien.**

* `leer_serie` -> solo el bloque global de cada dia del mes. Es ligero (unos
  pocos kilobytes) porque el recorte lo hace Postgres y los desgloses
  dimensionales no salen de la base. Lo usan los tres modulos: es lo que hace
  que mover la barra sea instantaneo, porque las tarjetas del dia, el acumulado
  y las lineas de tendencia salen de ahi sin pedir nada.
* `leer_mes` -> el mes entero, desgloses incluidos. Solo suscripciones, cuyos
  desgloses diarios son pequenos.
* `leer_payload` -> un solo dia completo. CRM y soporte, cuyo dia lleva el bloque
  de metricas de cada vendedor, sucursal, zona o grupo de trabajo: el mes entero
  serian megabytes en el navegador. El cliente los va cacheando segun los visita.
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


def leer_payload(
    table: str, year_month: str, dia: int, clave: str | None = None
) -> Any:
    """El corte completo de un dia, desgloses incluidos, o None si no esta.

    Una sola celda: quien necesita saber que dias hay calculados lee antes
    `leer_serie`, que ya lo dice y ademas trae lo que dibuja las tarjetas.
    """
    if not year_month or not 1 <= dia <= 31:
        return None
    db = DBConnector()
    if not tabla_existe(db, table):
        return None
    label = clave or periodo_label_mes(year_month)
    try:
        df = db.query(
            f"SELECT dia{dia} AS payload FROM {DB_SCHEMA}.{table}"
            " WHERE periodo_reporte = %s",
            params=[label],
        )
    except Exception:
        logger.exception("Error leyendo el dia %s de %s", dia, table)
        return None
    if df.empty:
        return None
    return _cargar(df.iloc[0]["payload"], f"dia{dia} de {label}")


def leer_serie(
    table: str,
    year_month: str,
    clave: str | None = None,
    bloque: str = "global",
) -> dict[str, Any]:
    """La serie ligera del mes: solo el bloque `bloque` de cada dia.

    Devuelve `{periodo_mes, dias_disponibles, serie: {"1": {...}, ...}}`, donde
    cada entrada es el corte acumulado hasta ese dia **sin sus desgloses
    dimensionales**: las metricas globales y nada mas.

    Es lo que hace que la barra sea instantanea en los tres modulos. El mes
    entero de CRM o de soporte no cabe en los props por culpa de las dimensiones
    -decenas de bloques por vendedor, por zona, por grupo-, pero treinta y un
    bloques globales son unos pocos kilobytes. El recorte se hace en Postgres
    (`-> 'global'`), asi que lo pesado no llega ni a salir de la base.

    Con esta serie el cliente resuelve sin pedir nada: las tarjetas del dia, el
    acumulado hasta ese dia, la variacion contra el dia anterior y las lineas de
    tendencia del periodo.

    **`dias_disponibles` NO depende de que el bloque exista.** Un dia cuenta como
    calculado si su celda tiene contenido, tenga o no `bloque` dentro. Los dos se
    separan porque un mes analizado antes de que el modulo empezara a guardar
    `global` tiene sus treinta y un cortes perfectamente utiles -el desglose se
    lee igual- y atar la barra al bloque los hacia desaparecer todos. La serie
    solo trae los dias que si lo tienen, y el resumen del dia se apaga solo.
    """
    if not year_month:
        return {"periodo_mes": "", "dias_disponibles": [], "serie": {}}
    if not bloque.isidentifier():
        raise ValueError(f"Bloque invalido: {bloque!r}")

    db = DBConnector()
    vacio = {"periodo_mes": year_month, "dias_disponibles": [], "serie": {}}
    if not tabla_existe(db, table):
        return vacio
    label = clave or periodo_label_mes(year_month)

    # Dos columnas por dia: si la celda tiene algo (la barra) y el bloque recortado
    # (el resumen). Los dos `NULLIF` porque las columnas son text y una celda sin
    # calcular puede llegar vacia o con el `'None'` que dejaban las escrituras
    # antiguas: el cast de cualquiera de los dos reventaria la consulta entera, no
    # solo esa celda.
    recorte = ", ".join(
        f"({c} IS NOT NULL AND {c} <> '' AND {c} <> 'None') AS hay_{c},"
        f" (NULLIF(NULLIF({c}, ''), 'None')::jsonb -> '{bloque}') AS {c}"
        for c in DAY_COLUMNS
    )
    try:
        df = db.query(
            f"SELECT {recorte} FROM {DB_SCHEMA}.{table} WHERE periodo_reporte = %s",
            params=[label],
        )
    except Exception:
        logger.exception("Error leyendo la serie diaria de %s", table)
        return vacio
    if df.empty:
        return vacio

    row = df.iloc[0]
    serie: dict[str, Any] = {}
    disponibles: list[int] = []
    for idx, col in enumerate(DAY_COLUMNS, start=1):
        if bool(row.get(f"hay_{col}")):
            disponibles.append(idx)
        payload = _cargar(row.get(col), f"{col} de {label}")
        if payload is not None:
            serie[str(idx)] = payload

    if disponibles and not serie:
        logger.info(
            "%s tiene %d dias calculados de %s pero ninguno guarda `%s`;"
            " el mes se analizo antes de que ese bloque existiera.",
            table, len(disponibles), label, bloque,
        )

    return {
        "periodo_mes": year_month,
        "dias_disponibles": disponibles,
        "serie": serie,
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
