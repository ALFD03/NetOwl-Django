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

from .queries import get_periodos

logger = logging.getLogger(__name__)

# Tope de nodos que acepta un filtro. Cada uno es un valor mas que comparar en
# memoria y el parametro lo escribe la interfaz: un site grande no pasa de unas
# decenas, cualquier cifra por encima es ruido.
MAX_NODOS_POR_CONSULTA = 300

# Columnas de la ficha, con el nombre que tienen en `subscriptions`. El orden es
# el de la exportacion.
_COLUMNAS_FICHA = [
    "orden_producto", "cliente", "ci", "sucursal", "zona", "campanna",
    "producto", "tipo", "total", "fecha_inicio", "estado", "phone", "phone2",
]

def limpiar_nodos(crudo: list[str] | None) -> list[str] | None:
    """Normaliza la lista de nodos de un filtro; None significa "todos".

    Un nodo es `"Zona - Sucursal"`, no solo la zona: la misma zona puede estar
    repartida entre dos sucursales -Los Parques tiene NETCOM y NYC- y son dos
    filas distintas del reporte. Filtrando por la zona sola, exportar cualquiera
    de las dos traia las bajas de ambas.
    """
    if not crudo:
        return None
    nodos = [n.strip() for n in crudo if n and n.strip()]
    if not nodos:
        return None
    return nodos[:MAX_NODOS_POR_CONSULTA]


def _texto(valor: Any) -> str:
    """Una celda de la base (todas son `text`) como cadena limpia."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return ""
    texto = str(valor).strip()
    return "" if texto.lower() in ("nan", "none", "null", "<na>") else texto


def _numero(valor: Any) -> float | None:
    """El subtotal como numero, o None si no lo es.

    Va como numero y no como texto porque en la hoja tiene que poder sumarse;
    None -y no 0- cuando no hay dato, que es lo que espera `downloadRowsAsExcel`.
    """
    numero = pd.to_numeric(_texto(valor).replace(",", ""), errors="coerce")
    return None if pd.isna(numero) else float(numero)


def _columnas_presentes(db: DBConnector, tabla: str) -> list[str]:
    """Las columnas de `_COLUMNAS_FICHA` que la tabla tiene de verdad.

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
        params=[DB_SCHEMA, tabla],
    )
    existentes = set(df["column_name"]) if not df.empty else set()
    return [c for c in _COLUMNAS_FICHA if c in existentes]


def _fichas(db: DBConnector, ordenes: list[str]) -> pd.DataFrame:
    """La ficha de cada orden, indexada por orden y sin duplicados.

    Primero `subscriptions` (una fila por orden) y, para lo que ya no este ahi,
    `subscriptions-b`, que guarda el detalle linea a linea del ultimo export.

    Del respaldo se toma la primera linea de la orden, que puede ser el router o
    la instalacion en vez del plan: el consolidado elige el producto con
    `imports._first_matching_plan` y el detalle no. Es lo mismo que hace
    `eta_report.calculate_eta_report` con su propio respaldo.
    """
    vacio = pd.DataFrame(columns=_COLUMNAS_FICHA).set_index("orden_producto")

    def _leer(tabla: str, valores: list[str]) -> pd.DataFrame:
        if not db.tabla_existe(tabla):
            return vacio
        columnas = _columnas_presentes(db, tabla)
        if "orden_producto" not in columnas:
            return vacio
        df = db.read_table_filtered(
            tabla, "orden_producto", valores, columns=columnas
        )
        if df.empty:
            return vacio
        # Lo que el export no traiga se rellena vacio: la ficha sale incompleta,
        # no rota.
        for col in _COLUMNAS_FICHA:
            if col not in df.columns:
                df[col] = None
        df["orden_producto"] = df["orden_producto"].astype(str).str.strip()
        return df.drop_duplicates(subset=["orden_producto"], keep="first").set_index(
            "orden_producto"
        )

    fichas = _leer(TableNames.SUBSCRIPTIONS, ordenes)
    faltantes = [o for o in ordenes if o not in fichas.index]
    if faltantes:
        historicas = _leer(TableNames.SUBSCRIPTIONS_B, faltantes)
        if not historicas.empty:
            fichas = pd.concat([fichas, historicas])
    return fichas


def get_bajas_detalle(
    periodo_reporte: str | None = None,
    nodos_filtro: list[str] | None = None,
) -> dict[str, Any]:
    """Las bajas de un periodo con la ficha de cada cliente.

    Con `nodos_filtro` solo devuelve las de esos nodos `"Zona - Sucursal"`: es
    como los reportes comerciales acotan la exportacion a un site, a un
    coordinador o a un nodo suelto, mandando los que ese grupo ya tiene en
    pantalla en vez de repetir aqui el agrupamiento del catalogo.

    El filtro es por nodo y no por zona porque una zona puede estar repartida
    entre varias sucursales, y cada par es una fila distinta del reporte.
    """
    db = DBConnector()
    try:
        periodos = get_periodos()
        if not periodos:
            return {"status": "empty", "message": "No hay periodos calculados", "bajas": []}

        objetivo = periodo_reporte or periodos[0]

        # La crea el analisis mensual la primera vez que termina: que no exista
        # todavia no es un fallo, es que nadie ha calculado nada.
        if not db.tabla_existe(TableNames.ANALYZER_BAJAS_DETALLADAS):
            return {
                "status": "empty",
                "period": objetivo,
                "periods": periodos,
                "message": f"No hay bajas calculadas para {objetivo}",
                "bajas": [],
            }

        df_bajas = db.query(
            f"""
            SELECT DISTINCT orden
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_BAJAS_DETALLADAS}
            WHERE periodo_reporte = %s
            """,
            params=[objetivo],
        )
        if df_bajas.empty:
            return {
                "status": "empty",
                "period": objetivo,
                "periods": periodos,
                "message": f"No hay bajas registradas en {objetivo}",
                "bajas": [],
            }

        ordenes = [o for o in df_bajas["orden"].astype(str).str.strip().unique() if o]
        fichas = _fichas(db, ordenes)

        # El nodo se arma igual que en `prepare_subs_dims` -recortado, con el
        # mismo relleno y unido por " - "- para que el filtro case exactamente
        # con lo que la pagina muestra en la columna de la dimension.
        permitidos = (
            {n.strip().lower() for n in nodos_filtro} if nodos_filtro else None
        )

        filas: list[dict[str, Any]] = []
        for orden in ordenes:
            ficha = fichas.loc[orden] if orden in fichas.index else None
            dato = (lambda col: _texto(ficha[col])) if ficha is not None else (lambda col: "")

            zona = dato("zona") or "Sin Zona"
            sucursal = dato("sucursal") or "Sin Sucursal"
            if permitidos is not None and f"{zona} - {sucursal}".lower() not in permitidos:
                continue

            filas.append({
                "orden": orden,
                "cliente": dato("cliente"),
                "cedula": dato("ci"),
                "sucursal": sucursal,
                "zona": zona,
                "campanna": dato("campanna"),
                "producto": dato("producto"),
                "tipo_servicio": dato("tipo"),
                "subtotal": _numero(ficha["total"]) if ficha is not None else None,
                "fecha_inicio": dato("fecha_inicio"),
                "estado_suscripcion": dato("estado"),
                "phone1": dato("phone"),
                "phone2": dato("phone2"),
            })

        filas.sort(key=lambda f: (f["zona"], f["sucursal"], f["orden"]))

        return {
            "status": "success",
            "period": objetivo,
            "periods": periodos,
            "total": len(filas),
            "bajas": filas,
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
