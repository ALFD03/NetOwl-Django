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

import numpy as np
import pandas as pd

from core.config import TableNames
from core.database import DBConnector
from core.exports import ExportSpec, read_export
from core.tables import DATE, TIMESTAMP, replace

from .config import SUBS_COLUMN_MAPPING
from .tables import FREE_PLANS

# --- Columnas del export -----------------------------------------------------

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

FREE_PLANS_EXPORT = ExportSpec(
    label="planes gratuitos",
    columns={**SUBS_COLUMN_MAPPING, **LOG_COLUMNS, **MSG_COLUMNS},
    required=(
        "Líneas de la orden/Referencia de la orden", "Tarifa", "Fecha de inicio", "Próxima Fecha de Factura",
        "Mensajes/Creado el", "Mensajes/Contenidos",
    ),
    types={"fecha_inicio": DATE, "fecha_factura": DATE, "fecha_log": TIMESTAMP, "fecha_msg": TIMESTAMP},
)

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



def _is_free_tariff(value: object) -> bool:
    """Si el nombre de la tarifa la declara gratuita."""
    return FREE_TARIFF_TOKEN in str(value or "").lower()


def _strip_html(series: pd.Series) -> pd.Series:
    """Quita las etiquetas HTML del cuerpo de un mensaje del chatter."""
    return (
        series.str.replace(r"<[^>]+>", " ", regex=True)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def parse_free_plans_csv(csv_path: str):
    """Desdobla el export agrupado de Odoo en (suscripciones, logs, mensajes)."""
    raw = read_export(csv_path, FREE_PLANS_EXPORT)
    # Las filas de continuación vienen sin referencia: heredan la de arriba.
    raw["orden"] = raw["orden_producto"].ffill()
    raw = raw.dropna(subset=["orden"])
    return _consolidate_subs(raw), _extract_logs(raw), _extract_msgs(raw)


def _consolidate_subs(raw: pd.DataFrame) -> pd.DataFrame:
    """Una fila por suscripción con el primer valor no vacío de cada campo, priorizando la línea de tarifa gratuita."""
    fields = [c for c in SUBS_COLUMN_MAPPING.values() if c in raw.columns and c != "orden_producto"]
    df = raw[["orden", *fields]].copy()
    df["_es_gratis"] = df["tarifa"].map(_is_free_tariff) if "tarifa" in df else False
    df = df.sort_values(["orden", "_es_gratis"], ascending=[True, False])
    return df.groupby("orden", as_index=False)[fields].first().rename(columns={"orden": "orden_producto"})


def _extract_logs(raw: pd.DataFrame) -> pd.DataFrame:
    """Los logs de cambio del export, con su fecha."""
    df = raw.reindex(columns=["orden", *LOG_COLUMNS.values()]).dropna(subset=["fecha_log"])
    return df.assign(f_dt=df["fecha_log"])


def _extract_msgs(raw: pd.DataFrame) -> pd.DataFrame:
    """Los mensajes del chatter, con su fecha y el cuerpo en texto plano."""
    df = raw.reindex(columns=["orden", *MSG_COLUMNS.values()]).dropna(subset=["fecha_msg"])
    return df.assign(f_dt=df["fecha_msg"], texto=_strip_html(df["cuerpo"].fillna("").astype(str)))


# --- Deteccion ---------------------------------------------------------------

def _tariff_transitions(df_msgs: pd.DataFrame) -> pd.DataFrame:
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


def _state_events(df_logs: pd.DataFrame, df_msgs: pd.DataFrame) -> pd.DataFrame:
    """Linea de tiempo de entradas y salidas del servicio gratuito."""
    partes = []
    if not df_logs.empty:
        arch = df_logs[df_logs["log"] == ARCHIVED_LOG][["orden", "f_dt"]].copy()
        arch["entra"], arch["metodo"] = True, "log_archivada"
        desarch = df_logs[df_logs["log"] == UNARCHIVED_LOG][["orden", "f_dt"]].copy()
        desarch["entra"], desarch["metodo"] = False, "log_desarchivada"
        partes += [arch, desarch]

    trans = _tariff_transitions(df_msgs)
    if not trans.empty:
        t = trans[["orden", "f_dt"]].copy()
        t["entra"] = trans["hacia_gratis"].to_numpy()
        t["metodo"] = "cambio_tarifa"
        partes.append(t)

    partes = [p for p in partes if not p.empty]
    if not partes:
        return pd.DataFrame(columns=["orden", "f_dt", "entra", "metodo"])
    return pd.concat(partes, ignore_index=True).sort_values(["orden", "f_dt"])


def _first_zero_attempt(df_msgs: pd.DataFrame) -> pd.Series:
    """Primera factura por importe cero de cada suscripcion.

    Es una cota superior: en esa fecha la suscripcion ya era gratuita, aunque
    pudiera serlo desde antes.
    """
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
    corte: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """
    Devuelve `df_subs` con `fecha_gratuito`, `metodo`, `confianza`,
    `siempre_gratuito` y `fecha_evidencia` (la fecha cruda de la evidencia,
    antes de recortarla contra la fecha de inicio).
    """
    df = df_subs.copy()
    df["orden_producto"] = df["orden_producto"].astype(str).str.strip()
    f_ini = pd.to_datetime(df["fecha_inicio"], errors="coerce")
    next_invoice = pd.to_datetime(df.get("fecha_factura"), errors="coerce")

    if corte is None:
        fechas = [s for s in (df_logs.get("f_dt"), df_msgs.get("f_dt")) if s is not None and len(s)]
        corte = max(s.max() for s in fechas) if fechas else pd.Timestamp.utcnow().normalize()

    # 1-2. Ultima entrada al servicio gratuito que no fue revertida.
    eventos = _state_events(df_logs, df_msgs)
    entry_date: dict[str, pd.Timestamp] = {}
    method_entry: dict[str, str] = {}
    for orden, f_dt, entra, metodo in eventos[["orden", "f_dt", "entra", "metodo"]].itertuples(index=False):
        if entra:
            entry_date[orden], method_entry[orden] = f_dt, metodo
        else:
            entry_date.pop(orden, None)
            method_entry.pop(orden, None)

    event_date = df["orden_producto"].map(entry_date)
    evento_metodo = df["orden_producto"].map(method_entry)

    # 3. Primer intento de facturacion en cero.
    cero = df["orden_producto"].map(_first_zero_attempt(df_msgs))

    # 4. Facturacion congelada en el pasado.
    congelada = next_invoice.where(next_invoice < corte)

    # 3 y 4 son cotas superiores: nos quedamos con la mas antigua de las dos.
    cota = pd.concat([cero, congelada], axis=1).min(axis=1)
    cota_metodo = np.where(
        cero.notna() & (cero <= congelada.fillna(pd.Timestamp.max)),
        "factura_cero",
        "facturacion_detenida",
    )

    fecha = event_date.copy()
    metodo = evento_metodo.copy()
    usa_cota = fecha.isna() & cota.notna()
    fecha = fecha.mask(usa_cota, cota)
    metodo = metodo.mask(usa_cota, pd.Series(cota_metodo, index=df.index))

    sin_evidencia = fecha.isna()
    fecha = fecha.fillna(f_ini)
    metodo = metodo.fillna("sin_evidencia")

    df["fecha_evidencia"] = fecha
    # Nunca puede ser gratuita antes de existir.
    fecha = fecha.where(fecha >= f_ini, f_ini)
    df["fecha_gratuito"] = fecha
    df["metodo"] = metodo
    df["confianza"] = metodo.map(METODO_CONFIANZA).fillna("baja")
    df["siempre_gratuito"] = sin_evidencia | (fecha <= f_ini)
    return df


# --- Persistencia ------------------------------------------------------------

def import_free_plans(csv_path: str) -> int:
    """Importa el export de planes gratuitos y reemplaza la detección guardada."""
    df_free = detect_free_start(*parse_free_plans_csv(csv_path))
    with DBConnector().transaction() as cur:
        return replace(cur, FREE_PLANS, df_free)


def load_free_subs(db: DBConnector) -> pd.DataFrame:
    """Lee la base de planes gratuitos; vacía si aún no se ha importado."""
    if not db.table_exists(TableNames.SUBSCRIPTIONS_FREE):
        return pd.DataFrame(columns=list(FREE_PLANS.columns))
    df = db.read_table(TableNames.SUBSCRIPTIONS_FREE)
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
