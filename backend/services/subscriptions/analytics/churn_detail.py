"""Detalle nominal de las bajas de un periodo, para exportar.

El analisis mensual guarda en `analyzer_bajas_detalladas` solo la orden, su
fecha de inicio y el estado con el que se fue: lo justo para contar. Quien
trabaja la baja necesita a quien llamar, asi que aqui se le devuelve al detalle
la ficha del cliente cruzando contra `subscriptions`.

Vale la misma advertencia que en el reporte de la reguladora
(`eta_report.calculate_eta_report`): **la ficha es la de hoy**, no la que tenia
la suscripcion el mes que se dio de baja. Las dos tablas de origen se truncan en
cada importacion, asi que la de entonces no es recuperable; una orden que hoy ya
no esta en `subscriptions` se rescata de `subscriptions-b`, que conserva el
detalle linea a linea.

El corte es siempre el del mes: `analyzer_day_metrics` guarda agregados por dia,
no las ordenes que los componen, asi que no hay detalle diario que exportar.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector

from .queries import get_periods

logger = logging.getLogger(__name__)

# Tope de nodos que acepta un filtro. Cada uno es un valor mas que comparar en
# memoria y el parametro lo escribe la interfaz: un site grande no pasa de unas
# decenas, cualquier cifra por encima es ruido.
MAX_NODES_PER_QUERY = 300

# Columnas de la ficha, con el nombre que tienen en `subscriptions`. El orden es
# el de la exportacion.
_CARD_COLUMNS = [
    "orden_producto", "cliente", "ci", "sucursal", "zona", "campanna",
    "producto", "tipo", "total", "fecha_inicio", "estado", "phone", "phone2",
]

def clean_nodes(raw: list[str] | None) -> list[str] | None:
    """Normaliza la lista de nodos de un filtro; None significa "todos".

    Un nodo es `"Zona - Sucursal"`, no solo la zona: la misma zona puede estar
    repartida entre dos sucursales -Los Parques tiene NETCOM y NYC- y son dos
    filas distintas del reporte. Filtrando por la zona sola, exportar cualquiera
    de las dos traia las bajas de ambas.
    """
    if not raw:
        return None
    nodes = [n.strip() for n in raw if n and n.strip()]
    if not nodes:
        return None
    return nodes[:MAX_NODES_PER_QUERY]


def _text(value: Any) -> str:
    """Una celda de la base (todas son `text`) como cadena limpia."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    return "" if text.lower() in ("nan", "none", "null", "<na>") else text


def _number(value: Any) -> float | None:
    """El subtotal como numero, o None si no lo es.

    Va como numero y no como texto porque en la hoja tiene que poder sumarse;
    None -y no 0- cuando no hay dato, que es lo que espera `downloadRowsAsExcel`.
    """
    number = pd.to_numeric(_text(value).replace(",", ""), errors="coerce")
    return None if pd.isna(number) else float(number)


def _present_columns(db: DBConnector, table: str) -> list[str]:
    """Las columnas de `_CARD_COLUMNS` que la tabla tiene de verdad.

    Las tablas de importacion se crean a partir del export, y el export no
    siempre trae todo (`phone2` y `vendedor` faltan en los antiguos). Pedir una
    columna inexistente aborta la consulta entera; preguntar antes cuesta una
    lectura del catalogo de Postgres y deja el resto de la ficha intacta.
    """
    df = db.query(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        """,
        params=[DB_SCHEMA, table],
    )
    existing = set(df["column_name"]) if not df.empty else set()
    return [c for c in _CARD_COLUMNS if c in existing]


def _cards(db: DBConnector, orders: list[str]) -> pd.DataFrame:
    """La ficha de cada orden, indexada por orden y sin duplicados.

    Primero `subscriptions` (una fila por orden) y, para lo que ya no este ahi,
    `subscriptions-b`, que guarda el detalle linea a linea del ultimo export.

    Del respaldo se toma la primera linea de la orden, que puede ser el router o
    la instalacion en vez del plan: el consolidado elige el producto con
    `imports._first_matching_plan` y el detalle no. Es lo mismo que hace
    `eta_report.calculate_eta_report` con su propio respaldo.
    """
    empty = pd.DataFrame(columns=_CARD_COLUMNS).set_index("orden_producto")

    def _read(table: str, values: list[str]) -> pd.DataFrame:
        if not db.table_exists(table):
            return empty
        columns = _present_columns(db, table)
        if "orden_producto" not in columns:
            return empty
        df = db.read_table_filtered(
            table, "orden_producto", values, columns=columns
        )
        if df.empty:
            return empty
        # Lo que el export no traiga se rellena vacio: la ficha sale incompleta,
        # no rota.
        for col in _CARD_COLUMNS:
            if col not in df.columns:
                df[col] = None
        df["orden_producto"] = df["orden_producto"].astype(str).str.strip()
        return df.drop_duplicates(subset=["orden_producto"], keep="first").set_index(
            "orden_producto"
        )

    cards = _read(TableNames.SUBSCRIPTIONS, orders)
    missing = [o for o in orders if o not in cards.index]
    if missing:
        historical = _read(TableNames.SUBSCRIPTIONS_B, missing)
        if not historical.empty:
            cards = pd.concat([cards, historical])
    return cards


def get_churn_detail(
    report_period: str | None = None,
    filter_nodes: list[str] | None = None,
) -> dict[str, Any]:
    """Las bajas de un periodo con la ficha de cada cliente.

    Con `filter_nodes` solo devuelve las de esos nodos `"Zona - Sucursal"`: es
    como los reportes comerciales acotan la exportacion a un site, a un
    coordinador o a un nodo suelto, mandando los que ese grupo ya tiene en
    pantalla en vez de repetir aqui el agrupamiento del catalogo.

    El filtro es por nodo y no por zona porque una zona puede estar repartida
    entre varias sucursales, y cada par es una fila distinta del reporte.
    """
    db = DBConnector()
    try:
        periods = get_periods()
        if not periods:
            return {"status": "empty", "message": "No hay periodos calculados", "bajas": []}

        target = report_period or periods[0]

        # La crea el analisis mensual la primera vez que termina: que no exista
        # todavia no es un fallo, es que nadie ha calculado nada.
        if not db.table_exists(TableNames.ANALYZER_CHURNED):
            return {
                "status": "empty",
                "period": target,
                "periods": periods,
                "message": f"No hay bajas calculadas para {target}",
                "bajas": [],
            }

        df_churns = db.query(
            f"""
            SELECT DISTINCT orden
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURNED}
            WHERE periodo_reporte = %s
            """,
            params=[target],
        )
        if df_churns.empty:
            return {
                "status": "empty",
                "period": target,
                "periods": periods,
                "message": f"No hay bajas registradas en {target}",
                "bajas": [],
            }

        orders = [o for o in df_churns["orden"].astype(str).str.strip().unique() if o]
        cards = _cards(db, orders)

        # El nodo se arma igual que en `prepare_subs_dims` -recortado, con el
        # mismo relleno y unido por " - "- para que el filtro case exactamente
        # con lo que la pagina muestra en la columna de la dimension.
        allowed = (
            {n.strip().lower() for n in filter_nodes} if filter_nodes else None
        )

        rows: list[dict[str, Any]] = []
        for order in orders:
            card = cards.loc[order] if order in cards.index else None
            datum = (lambda col: _text(card[col])) if card is not None else (lambda col: "")

            zone = datum("zona") or "Sin Zona"
            branch = datum("sucursal") or "Sin Sucursal"
            if allowed is not None and f"{zone} - {branch}".lower() not in allowed:
                continue

            rows.append({
                "orden": order,
                "cliente": datum("cliente"),
                "cedula": datum("ci"),
                "sucursal": branch,
                "zona": zone,
                "campanna": datum("campanna"),
                "producto": datum("producto"),
                "tipo_servicio": datum("tipo"),
                "subtotal": _number(card["total"]) if card is not None else None,
                "fecha_inicio": datum("fecha_inicio"),
                "estado_suscripcion": datum("estado"),
                "phone1": datum("phone"),
                "phone2": datum("phone2"),
            })

        rows.sort(key=lambda f: (f["zona"], f["sucursal"], f["orden"]))

        return {
            "status": "success",
            "period": target,
            "periods": periods,
            "total": len(rows),
            "bajas": rows,
        }
    except Exception:
        # Igual que en los reportes comerciales: la traza va al log del
        # servidor, no a la respuesta, porque dentro de una tarea de Celery
        # stdout acaba en el navegador.
        logger.exception("Error al construir el detalle de bajas")
        return {
            "status": "error",
            "message": "Error interno del servidor. Consulte el registro de la aplicación.",
            "bajas": [],
        }
