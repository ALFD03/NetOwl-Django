"""Importación del export de CRM.

El export de Odoo viene agrupado: una fila por oportunidad y, debajo, sus
movimientos con la referencia en blanco. Aquí se desdobla en dos tablas -las
oportunidades y sus movimientos- leyendo por bloques, porque el fichero no cabe
cómodamente en memoria.
"""

from __future__ import annotations

import re

import pandas as pd

from core.database import DBConnector
from core.exports import ExportSpec, iter_export
from core.tables import FLOAT, TIMESTAMP, append, to_bool, truncate
from core.utils import normalize_text

from .config import CLIENT_FIELDS, CSV_COLUMN_MAP, REQUIRED_CRM_HEADERS, STAGE_MAP, WON_STATES
from .tables import CLIENTS, LOGS

CRM_EXPORT = ExportSpec(
    label="CRM",
    columns=CSV_COLUMN_MAP,
    required=tuple(REQUIRED_CRM_HEADERS),
    types={
        "creado_el": TIMESTAMP, "fecha_cierre": TIMESTAMP, "ultima_actualizacion": TIMESTAMP,
        "duracion_total_horas": FLOAT, "entradas_de_tiempo_duracion_horas": FLOAT,
        "entradas_de_tiempo_creado_el": TIMESTAMP,
    },
)

_LOG_COLUMNS = {
    "client_id": "client_id",
    "entradas_de_tiempo_iniciativa_id": "entrada_id",
    "entradas_de_tiempo_etapa_anterior": "etapa_anterior",
    "entradas_de_tiempo_nueva_etapa": "nueva_etapa",
    "entradas_de_tiempo_duracion_horas": "duracion_horas",
    "entradas_de_tiempo_creado_el": "created_at_log",
}

_STAGE_BY_NUMBER = {
    1: "etapa_1_contacto", 2: "etapa_2_recepcion", 3: "etapa_3_factibilidad", 4: "etapa_4_adecuaciones",
    5: "etapa_5_gpi", 6: "etapa_6_contratistas", 7: "etapa_7_instalados", 8: "etapa_8_devueltos",
    9: "etapa_9_disponibles", 10: "etapa_10_proyectos",
}
_STAGE_BY_WORD = [
    (("contacto",), "etapa_1_contacto"),
    (("recepcion",), "etapa_2_recepcion"),
    (("factibilidad", "evaluacion"), "etapa_3_factibilidad"),
    (("adecuacion", "red optica"), "etapa_4_adecuaciones"),
    (("gpi", "planificacion"), "etapa_5_gpi"),
    (("contratista",), "etapa_6_contratistas"),
    (("instalado",), "etapa_7_instalados"),
    (("devuelto",), "etapa_8_devueltos"),
    (("disponible", "otra fecha"), "etapa_9_disponibles"),
    (("proyecto",), "etapa_10_proyectos"),
    (("perdido",), "perdido"),
]


def canonical_stage(value: object) -> str:
    """La clave canónica de una etapa de Odoo: por nombre exacto, por número o por palabra."""
    if value is None or pd.isna(value) or not str(value).strip():
        return "desconocido"
    text = str(value).strip()
    if text in STAGE_MAP:
        return STAGE_MAP[text]
    number = re.match(r"^(\d+)", text)
    if number and int(number.group(1)) in _STAGE_BY_NUMBER:
        return _STAGE_BY_NUMBER[int(number.group(1))]
    norm = normalize_text(text)
    for words, stage in _STAGE_BY_WORD:
        if any(w in norm for w in words):
            return stage
    return "desconocido"


def _stages(series: pd.Series) -> pd.Series:
    """`canonical_stage` sobre los valores únicos de la serie."""
    return series.map({v: canonical_stage(v) for v in series.dropna().unique()}).fillna("desconocido")


def split_chunk(df: pd.DataFrame, prev_client: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, str | None]:
    """Parte un bloque del export en `(oportunidades, movimientos, último id)`.

    La referencia de la oportunidad solo aparece en su primera fila, así que se
    arrastra hacia abajo; `prev_client` continúa ese arrastre entre bloques.
    """
    ids = df["id"].copy()
    if prev_client and len(ids) and pd.isna(ids.iloc[0]):
        ids.iloc[0] = prev_client
    df = df.assign(client_id=ids.ffill())
    last = df["client_id"].iloc[-1] if len(df) and pd.notna(df["client_id"].iloc[-1]) else prev_client

    clients = df[df["id"].notna()].reindex(columns=CLIENT_FIELDS).drop_duplicates(subset=["id"])
    clients["etapa_actual"] = _stages(clients["etapa"])
    clients["activo"] = to_bool(clients["activo"])
    won = clients["ganado"].astype(str).str.strip().str.lower()
    clients["ganado"] = won.where(won.isin(WON_STATES), "pendiente")

    logs = df[df["entradas_de_tiempo_iniciativa_id"].notna() & df["client_id"].notna()]
    logs = logs.reindex(columns=list(_LOG_COLUMNS)).rename(columns=_LOG_COLUMNS)
    logs["etapa_anterior"] = _stages(logs["etapa_anterior"])
    logs["nueva_etapa"] = _stages(logs["nueva_etapa"])
    return clients, logs, last


def import_crm(csv_path: str) -> tuple[int, int]:
    """Reemplaza `crm_clients` y `crm_logs` con el export. Devuelve `(oportunidades, movimientos)`.

    Vaciado y carga de todos los bloques van en una sola transacción: un fallo
    a mitad del fichero deja las tablas como estaban.
    """
    clients_total = logs_total = 0
    with DBConnector().transaction() as cur:
        truncate(cur, CLIENTS)
        truncate(cur, LOGS)
        last = None
        for chunk in iter_export(csv_path, CRM_EXPORT, chunksize=50_000):
            clients, logs, last = split_chunk(chunk, last)
            clients_total += append(cur, CLIENTS, clients)
            logs_total += append(cur, LOGS, logs)
    return clients_total, logs_total


def odoo_fields() -> list[dict]:
    """Las cabeceras del export de Odoo CRM que lee la importación."""
    return CRM_EXPORT.fields()
