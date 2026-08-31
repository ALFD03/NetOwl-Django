"""
Deteccion e importacion de suscripciones con plan gratuito.

El calculo normal marca a un cliente como gratuito por su log "Suscripcion
archivada". El problema es que muchas suscripciones nunca recibieron ese log en
Odoo, asi que no hay forma de fecharlas desde los logs.

Este modulo consume el export de planes gratuitos (que ademas trae la
mensajeria del chatter) e infiere, para cada suscripcion sin log, el momento en
que dejo de ser un cliente de pago. El resultado queda guardado como semilla en
`subscriptions_gratis` y el analisis lo usa SOLO cuando la suscripcion no trae
el log real: el log siempre manda. Asi no hace falta reprocesar este CSV en
cada calculo.

La deteccion es una cascada de evidencias, de la mas exacta a la mas debil:

1. `log_archivada`        Log "Suscripcion archivada" (fecha exacta del evento).
2. `cambio_tarifa`        Mensaje "Cambio de Tarifa: X -> ... Gratis".
3. `factura_cero`         Primer intento de facturacion con importe cero: en esa
                          fecha la suscripcion ya era gratuita (cota superior).
4. `facturacion_detenida` La proxima fecha de factura quedo congelada en el
                          pasado: el cron dejo de procesar la suscripcion.
5. `sin_evidencia`        Sin ninguna senal: gratuita desde su fecha de inicio.

Los metodos 1 y 2 fechan el cambio; 3 y 4 son cotas superiores (fue gratuita
"al menos desde"); 5 asume que siempre lo fue.
"""
from __future__ import annotations

import re
from typing import Optional

import numpy as np
import pandas as pd
from psycopg2 import sql

from ..conf_config import DB_SCHEMA, TableNames
from ..database import DBConnector

# --- Columnas del export -----------------------------------------------------

SUBS_COLUMNS = {
    "Líneas de la orden/Referencia de la orden": "orden_producto",
    "Líneas de la orden/Producto/Nombre": "producto",
    "Líneas de la orden/Cliente": "cliente",
    "Líneas de la orden/Cliente/CI/RIF": "ci",
    "Sucursal": "sucursal",
    "Zona": "zona",
    "Líneas de la orden/Cliente/Municipio": "municipio",
    "Tipo de Servicio": "tipo",
    "Estado de la Suscripción": "estado",
    "Campaña": "campanna",
    "Próxima Fecha de Factura": "fecha_factura",
    "Fecha de inicio": "fecha_inicio",
    "Tarifa": "tarifa",
    "Subtotal": "total",
    "Teléfono": "telefono",
    "Cliente/Phone 1": "phone",
    "Cliente/Phone 2": "phone2",
    "Vendedor": "vendedor",
}

LOG_COLUMNS = {
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado_log",
}

MSG_COLUMNS = {
    "Mensajes/Creado el": "fecha_msg",
    "Mensajes/Descripción corta": "asunto",
    "Mensajes/Contenidos": "cuerpo",
}

REQUIRED_GRATIS_HEADERS = [
    "Líneas de la orden/Referencia de la orden",
    "Tarifa",
    "Fecha de inicio",
    "Próxima Fecha de Factura",
    "Mensajes/Creado el",
    "Mensajes/Contenidos",
]

# --- Patrones de evidencia ---------------------------------------------------

FREE_TARIFF_TOKEN = "gratis"
ARCHIVED_LOG = "Suscripción archivada"
UNARCHIVED_LOG = "Suscripción desarchivada"
TARIFF_CHANGE_RE = re.compile(r"^Cambio de Tarifa:\s*(?P<origen>.+?)\s*→\s*(?P<destino>.+?)\s*$")
ZERO_INVOICE_RE = re.compile(r"price of zero|Suscripción no procesada", re.IGNORECASE)

METODO_CONFIANZA = {
    "log_archivada": "alta",
    "cambio_tarifa": "alta",
    "factura_cero": "media",
    "facturacion_detenida": "media",
    "sin_evidencia": "baja",
}

# La suscripcion en si (zona, producto, total...) llega por el import regular:
# esta tabla solo guarda desde cuando es gratuita y con que evidencia.
FREE_TABLE_COLUMNS = [
    "orden_producto", "cliente", "fecha_inicio", "tarifa", "fecha_factura",
    "fecha_gratuito", "metodo", "confianza", "siempre_gratuito", "fecha_evidencia",
]


def _is_free_tariff(value: object) -> bool:
    return FREE_TARIFF_TOKEN in str(value or "").lower()


def _strip_html(series: pd.Series) -> pd.Series:
    return (
        series.str.replace(r"<[^>]+>", " ", regex=True)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def parse_gratis_csv(csv_path: str):
    """Desdobla el export agrupado de Odoo en (suscripciones, logs, mensajes)."""
    raw = pd.read_csv(
        csv_path, dtype=str, keep_default_na=False,
        low_memory=False, encoding="utf-8-sig",
    )
    ref_col = "Líneas de la orden/Referencia de la orden"
    if ref_col not in raw.columns:
        raise ValueError(f"El CSV no contiene la columna requerida: {ref_col}")

    # Las filas de continuacion vienen sin referencia: heredan la de arriba.
    raw["orden"] = raw[ref_col].replace("", np.nan).ffill()
    raw = raw.dropna(subset=["orden"])

    df_subs = _consolidate_subs(raw)
    df_logs = _extract_logs(raw)
    df_msgs = _extract_msgs(raw)
    return df_subs, df_logs, df_msgs


def _consolidate_subs(raw: pd.DataFrame) -> pd.DataFrame:
    cols = {k: v for k, v in SUBS_COLUMNS.items() if k in raw.columns}
    df = raw[["orden"] + list(cols)].rename(columns=cols)
    df = df.replace("", np.nan)
    meta = [c for c in cols.values() if c != "orden_producto"]
    # Cada suscripcion puede traer varias lineas; nos quedamos con el primer
    # valor no vacio de cada campo, priorizando la linea de tarifa gratuita.
    df["_es_gratis"] = df["tarifa"].map(_is_free_tariff) if "tarifa" in df else False
    df = df.sort_values(["orden", "_es_gratis"], ascending=[True, False])
    df_out = df.groupby("orden", as_index=False)[meta].first()
    df_out.rename(columns={"orden": "orden_producto"}, inplace=True)
    return df_out


def _extract_logs(raw: pd.DataFrame) -> pd.DataFrame:
    cols = {k: v for k, v in LOG_COLUMNS.items() if k in raw.columns}
    if not cols:
        return pd.DataFrame(columns=["orden", "fecha_log", "log", "estado_log"])
    df = raw[["orden"] + list(cols)].rename(columns=cols)
    df = df[df["fecha_log"].astype(str).str.strip() != ""].copy()
    df["f_dt"] = pd.to_datetime(df["fecha_log"], errors="coerce")
    return df.dropna(subset=["f_dt"])


def _extract_msgs(raw: pd.DataFrame) -> pd.DataFrame:
    cols = {k: v for k, v in MSG_COLUMNS.items() if k in raw.columns}
    if not cols:
        return pd.DataFrame(columns=["orden", "fecha_msg", "asunto", "cuerpo"])
    df = raw[["orden"] + list(cols)].rename(columns=cols)
    df = df[df["fecha_msg"].astype(str).str.strip() != ""].copy()
    df["f_dt"] = pd.to_datetime(df["fecha_msg"], errors="coerce")
    df["texto"] = _strip_html(df["cuerpo"].fillna(""))
    return df.dropna(subset=["f_dt"])


# --- Deteccion ---------------------------------------------------------------

def _transiciones_tarifa(df_msgs: pd.DataFrame) -> pd.DataFrame:
    """Mensajes de cambio de tarifa, con el sentido de la transicion."""
    if df_msgs.empty:
        return pd.DataFrame(columns=["orden", "f_dt", "hacia_gratis"])
    extracted = df_msgs["texto"].str.extract(TARIFF_CHANGE_RE)
    mask = extracted["destino"].notna()
    if not mask.any():
        return pd.DataFrame(columns=["orden", "f_dt", "hacia_gratis"])
    df = df_msgs.loc[mask, ["orden", "f_dt"]].copy()
    df["hacia_gratis"] = extracted.loc[mask, "destino"].map(_is_free_tariff)
    df["desde_gratis"] = extracted.loc[mask, "origen"].map(_is_free_tariff)
    # Un cambio entre dos tarifas gratuitas no mueve el estado.
    return df[df["hacia_gratis"] != df["desde_gratis"]]


def _eventos_estado(df_logs: pd.DataFrame, df_msgs: pd.DataFrame) -> pd.DataFrame:
    """Linea de tiempo de entradas y salidas del servicio gratuito."""
    partes = []
    if not df_logs.empty:
        arch = df_logs[df_logs["log"] == ARCHIVED_LOG][["orden", "f_dt"]].copy()
        arch["entra"], arch["metodo"] = True, "log_archivada"
        desarch = df_logs[df_logs["log"] == UNARCHIVED_LOG][["orden", "f_dt"]].copy()
        desarch["entra"], desarch["metodo"] = False, "log_desarchivada"
        partes += [arch, desarch]

    trans = _transiciones_tarifa(df_msgs)
    if not trans.empty:
        t = trans[["orden", "f_dt"]].copy()
        t["entra"] = trans["hacia_gratis"].to_numpy()
        t["metodo"] = "cambio_tarifa"
        partes.append(t)

    partes = [p for p in partes if not p.empty]
    if not partes:
        return pd.DataFrame(columns=["orden", "f_dt", "entra", "metodo"])
    return pd.concat(partes, ignore_index=True).sort_values(["orden", "f_dt"])


def _primer_intento_cero(df_msgs: pd.DataFrame) -> pd.Series:
    if df_msgs.empty:
        return pd.Series(dtype="datetime64[ns]")
    cero = df_msgs[df_msgs["texto"].str.contains(ZERO_INVOICE_RE, na=False)]
    if cero.empty:
        return pd.Series(dtype="datetime64[ns]")
    return cero.groupby("orden")["f_dt"].min()


def detect_free_start(
    df_subs: pd.DataFrame,
    df_logs: pd.DataFrame,
    df_msgs: pd.DataFrame,
    corte: Optional[pd.Timestamp] = None,
) -> pd.DataFrame:
    """
    Devuelve `df_subs` con `fecha_gratuito`, `metodo`, `confianza`,
    `siempre_gratuito` y `fecha_evidencia` (la fecha cruda de la evidencia,
    antes de recortarla contra la fecha de inicio).
    """
    df = df_subs.copy()
    df["orden_producto"] = df["orden_producto"].astype(str).str.strip()
    f_ini = pd.to_datetime(df["fecha_inicio"], errors="coerce")
    prox_factura = pd.to_datetime(df.get("fecha_factura"), errors="coerce")

    if corte is None:
        fechas = [s for s in (df_logs.get("f_dt"), df_msgs.get("f_dt")) if s is not None and len(s)]
        corte = max(s.max() for s in fechas) if fechas else pd.Timestamp.utcnow().normalize()

    # 1-2. Ultima entrada al servicio gratuito que no fue revertida.
    eventos = _eventos_estado(df_logs, df_msgs)
    entrada_fecha: dict[str, pd.Timestamp] = {}
    entrada_metodo: dict[str, str] = {}
    for orden, f_dt, entra, metodo in eventos[["orden", "f_dt", "entra", "metodo"]].itertuples(index=False):
        if entra:
            entrada_fecha[orden], entrada_metodo[orden] = f_dt, metodo
        else:
            entrada_fecha.pop(orden, None)
            entrada_metodo.pop(orden, None)

    evento_fecha = df["orden_producto"].map(entrada_fecha)
    evento_metodo = df["orden_producto"].map(entrada_metodo)

    # 3. Primer intento de facturacion en cero.
    cero = df["orden_producto"].map(_primer_intento_cero(df_msgs))

    # 4. Facturacion congelada en el pasado.
    congelada = prox_factura.where(prox_factura < corte)

    # 3 y 4 son cotas superiores: nos quedamos con la mas antigua de las dos.
    cota = pd.concat([cero, congelada], axis=1).min(axis=1)
    cota_metodo = np.where(
        cero.notna() & (cero <= congelada.fillna(pd.Timestamp.max)),
        "factura_cero",
        "facturacion_detenida",
    )

    fecha = evento_fecha.copy()
    metodo = evento_metodo.copy()
    usa_cota = fecha.isna() & cota.notna()
    fecha = fecha.mask(usa_cota, cota)
    metodo = metodo.mask(usa_cota, pd.Series(cota_metodo, index=df.index))

    sin_evidencia = fecha.isna()
    fecha = fecha.fillna(f_ini)
    metodo = metodo.fillna("sin_evidencia")

    df["fecha_evidencia"] = fecha.dt.strftime("%Y-%m-%d %H:%M:%S")
    # Nunca puede ser gratuita antes de existir.
    fecha = fecha.where(fecha >= f_ini, f_ini)
    df["fecha_gratuito"] = fecha.dt.strftime("%Y-%m-%d %H:%M:%S")
    df["metodo"] = metodo
    df["confianza"] = metodo.map(METODO_CONFIANZA).fillna("baja")
    df["siempre_gratuito"] = (sin_evidencia | (fecha <= f_ini)).map({True: "true", False: "false"})
    return df


# --- Persistencia ------------------------------------------------------------

def import_gratis_csv(csv_path: str) -> int:
    """Importa el export de planes gratuitos y guarda la deteccion en la BD."""
    df_subs, df_logs, df_msgs = parse_gratis_csv(csv_path)
    df_free = detect_free_start(df_subs, df_logs, df_msgs)

    for col in FREE_TABLE_COLUMNS:
        if col not in df_free.columns:
            df_free[col] = None
    df_free = df_free[FREE_TABLE_COLUMNS]
    for col in df_free.columns:
        df_free[col] = df_free[col].astype(str).replace(["nan", "None", "<NA>", ""], None)

    db = DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Tabla propia y siempre reconstruida desde el CSV: se rehace entera.
            cur.execute(
                sql.SQL("DROP TABLE IF EXISTS {t}").format(
                    t=sql.Identifier(DB_SCHEMA, TableNames.SUBSCRIPTIONS_FREE)
                )
            )
            cur.execute(
                sql.SQL("CREATE TABLE {t} ({fields})").format(
                    t=sql.Identifier(DB_SCHEMA, TableNames.SUBSCRIPTIONS_FREE),
                    fields=sql.SQL(", ").join(
                        sql.SQL("{} text").format(sql.Identifier(c)) for c in FREE_TABLE_COLUMNS
                    ),
                )
            )
        conn.commit()

    db.copy_dataframe(df_free, TableNames.SUBSCRIPTIONS_FREE)
    return len(df_free)


def load_free_subs(db: DBConnector) -> pd.DataFrame:
    """Lee la base de planes gratuitos; vacia si aun no se ha importado."""
    try:
        df = db.read_table(TableNames.SUBSCRIPTIONS_FREE)
    except Exception:
        return pd.DataFrame(columns=FREE_TABLE_COLUMNS)
    if df.empty:
        return pd.DataFrame(columns=FREE_TABLE_COLUMNS)
    df.columns = df.columns.str.lower()
    df["orden_producto"] = df["orden_producto"].astype(str).str.strip()
    return df


def summarize_detection(df_free: pd.DataFrame) -> pd.DataFrame:
    """Resumen por metodo de deteccion, para revision humana."""
    resumen = (
        df_free.groupby(["metodo", "confianza"])
        .agg(
            suscripciones=("orden_producto", "count"),
            desde=("fecha_gratuito", "min"),
            hasta=("fecha_gratuito", "max"),
        )
        .reset_index()
        .sort_values("suscripciones", ascending=False)
    )
    return resumen
