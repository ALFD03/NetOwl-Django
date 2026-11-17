"""Las tablas de soporte: las que llena la importación y las del análisis.

`support_ticket_flujo` no está aquí: la rehace entera una consulta
(`CREATE TABLE … AS`) en cada análisis (ver `flujo.py`).
"""

from __future__ import annotations

from core.config import TableNames
from core.tables import INT32, JSON, NUMERIC, SERIAL, TEXT, TIMESTAMP, Table, register

TICKETS = Table(
    TableNames.SUPPORT_TICKETS,
    {
        "id": SERIAL, "ticket_sequence": TEXT, "cliente": TEXT, "etapa": TEXT, "grupo_trabajo": TEXT,
        "asignado_a": TEXT, "creado_por": TEXT, "sucursal": TEXT, "zona": TEXT, "tipo_solicitud": TEXT,
        "razon_falla": TEXT, "solucion_falla": TEXT, "creado_el": TIMESTAMP, "primera_fecha_asignada": TIMESTAMP,
        "ultima_actualizacion_etapa": TIMESTAMP, "duracion_total_horas": NUMERIC,
    },
    primary_key=("id",),
    indexes=(("creado_el",), ("ultima_actualizacion_etapa",)),
)
# Se suman lotes: cada log entra una sola vez, por su id de Odoo.
TICKET_LOGS = Table(
    TableNames.SUPPORT_TICKET_LOGS,
    {
        "log_id": TEXT, "ticket_sequence": TEXT, "creado_el": TIMESTAMP, "etapa_anterior": TEXT,
        "etapa_nueva": TEXT, "duracion_horas": NUMERIC, "importado_en": TIMESTAMP,
    },
    primary_key=("log_id",),
    indexes=(("ticket_sequence", "creado_el"), ("creado_el",)),
    defaults={"importado_en": "now()"},
)
CLOSE_HISTORY = Table(
    TableNames.SUPPORT_CIERRE_HISTORICO,
    {"id": SERIAL, "periodo_reporte": TEXT, "metricas": JSON, "updated_at": TIMESTAMP},
    primary_key=("id",),
    unique=("periodo_reporte",),
    defaults={"updated_at": "now()"},
)
DIMENSION_HISTORY = Table(
    TableNames.SUPPORT_DIMENSIONES_HISTORICO,
    {
        "id": SERIAL, "periodo_reporte": TEXT, "grupo_trabajo": TEXT, "dimension": TEXT, "valor": TEXT,
        "metricas": JSON, "updated_at": TIMESTAMP,
    },
    primary_key=("id",),
    indexes=(("periodo_reporte", "dimension"),),
    defaults={"updated_at": "now()"},
)
GLOBAL_METRICS = Table(
    TableNames.SUPPORT_METRICAS_GLOBALES,
    {
        "id": INT32, "resumen_global": JSON, "por_grupo_trabajo": JSON, "periodos_evaluados": INT32,
        "updated_at": TIMESTAMP,
    },
    primary_key=("id",),
    defaults={"id": "1", "periodos_evaluados": "0", "updated_at": "now()"},
)
DAY_METRICS = Table(
    TableNames.SUPPORT_DAY_METRICS,
    {"periodo_reporte": TEXT, **{f"dia{d}": JSON for d in range(1, 32)}},
    unique=("periodo_reporte",),
)

ALL = (TICKETS, TICKET_LOGS, CLOSE_HISTORY, GLOBAL_METRICS, DIMENSION_HISTORY, DAY_METRICS)
register(*ALL)
