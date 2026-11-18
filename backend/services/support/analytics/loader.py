"""Importación del export de tickets de soporte.

Solo `support_tickets` se rehace en cada importación; las tablas de resultados
guardan los periodos ya evaluados y las reescribe el análisis, periodo a periodo.

Odoo no siempre nombra igual las columnas (caja, acentos, género del campo,
sub-campo de un relacional): la resolución tolerante de `ExportSpec` y los
alias de `SUPPORT_CSV_COLUMN_ALIASES` lo absorben, y si falta una obligatoria
el error lista las cabeceras que sí trae.
"""

from __future__ import annotations

from core.database import DBConnector
from core.exports import ExportSpec, read_export
from core.tables import FLOAT, TIMESTAMP, replace

from .config import (
    SUPPORT_CSV_COLUMN_ALIASES,
    SUPPORT_CSV_COLUMN_MAP,
    SUPPORT_TEXT_COLUMNS,
    SUPPORT_TICKET_COLUMNS,
)
from .tables import TICKETS

TICKETS_EXPORT = ExportSpec(
    label="soporte",
    columns=SUPPORT_CSV_COLUMN_MAP,
    required=(
        "Secuencia ID del ticket", "Etapa", "Equipo de soporte al cliente", "Asignado a", "Creado por",
        "Creado el", "Última actualización de la etapa",
    ),
    aliases=SUPPORT_CSV_COLUMN_ALIASES,
    types={
        "creado_el": TIMESTAMP, "primera_fecha_asignada": TIMESTAMP, "ultima_actualizacion_etapa": TIMESTAMP,
        # Vacía se queda en NULL: un 0 sería un cierre instantáneo falso.
        "duracion_total_horas": FLOAT,
    },
    blanks=("false",),
)

# Valor visible de una dimensión vacía. Las columnas de texto son claves de
# agrupación: un vacío tiene que colapsar en un solo valor, o la misma zona o
# el mismo técnico se partirían en varias filas del reporte.
UNSPECIFIED = "Sin Especificar"


def import_tickets(csv_path: str) -> int:
    """Reemplaza `support_tickets` con el export y devuelve cuántos tickets quedaron."""
    df = read_export(csv_path, TICKETS_EXPORT).dropna(subset=["ticket_sequence"])
    df = df.reindex(columns=SUPPORT_TICKET_COLUMNS)
    df[SUPPORT_TEXT_COLUMNS] = df[SUPPORT_TEXT_COLUMNS].fillna(UNSPECIFIED)
    with DBConnector().transaction() as cur:
        return replace(cur, TICKETS, df)


def odoo_fields() -> list[dict]:
    """Las cabeceras del export de soporte que lee la importación."""
    return TICKETS_EXPORT.fields()
