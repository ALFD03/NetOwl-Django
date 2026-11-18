"""Las tablas de CRM: las que llena la importación y las del análisis."""

from __future__ import annotations

from core.config import TableNames
from core.tables import BOOL, INT32, JSON, NUMERIC, SERIAL, TEXT, TIMESTAMP, Table, register

CLIENTS = Table(
    TableNames.CRM_CLIENTS,
    {
        "id": TEXT, "oportunidad": TEXT, "cliente": TEXT, "cliente_municipio": TEXT, "campana": TEXT,
        "sucursal": TEXT, "vendedor": TEXT, "medio": TEXT, "medio_supervisor": TEXT, "equipo_ventas": TEXT,
        "etapa": TEXT, "etapa_actual": TEXT, "motivo_perdida": TEXT, "devolver_oportunidad": TEXT, "ganado": TEXT,
        "activo": BOOL, "creado_el": TIMESTAMP, "fecha_cierre": TIMESTAMP, "ultima_actualizacion": TIMESTAMP,
        "duracion_total_horas": NUMERIC, "created_at": TIMESTAMP, "updated_at": TIMESTAMP,
    },
    primary_key=("id",),
    indexes=(("etapa_actual",), ("ganado",), ("creado_el",), ("campana", "sucursal", "vendedor")),
    defaults={"created_at": "now()", "updated_at": "now()"},
)
LOGS = Table(
    TableNames.CRM_LOGS,
    {
        "id": SERIAL, "client_id": TEXT, "entrada_id": TEXT, "etapa_anterior": TEXT, "nueva_etapa": TEXT,
        "duracion_horas": NUMERIC, "created_at_log": TIMESTAMP, "created_at": TIMESTAMP,
    },
    primary_key=("id",),
    indexes=(("client_id",), ("created_at_log",), ("nueva_etapa",), ("etapa_anterior", "nueva_etapa")),
    defaults={"created_at": "now()"},
)

_TIMES = [
    f"{measure}_{outcome}"
    for outcome in ("inst", "perd", "cierre")
    for measure in ("horas_promedio", "horas_mediana", "horas_p25", "horas_p75", "horas_min", "horas_max",
                    "horas_std", "pct_excede_prom")
]
_E8_COUNTS = [
    "total_en_riesgo", "count_devueltos_e8_bruto", "e8_devueltos_excepcion", "e8_devueltos_con_motivo",
    "e8_devueltos_sin_motivo", "e8_devueltos_estimados", "e8_clientes_devueltos", "e8_reincidentes",
]

CLOSE_HISTORY = Table(
    TableNames.CRM_CLOSE_HISTORY,
    {
        "id": SERIAL, "periodo_reporte": TEXT, "total_oportunidades": INT32, "ganados": INT32, "perdidos": INT32,
        "pendientes": INT32, "pct_instalacion": NUMERIC, "pct_perdida": NUMERIC, "pct_pendientes": NUMERIC,
        "count_devueltos_e8": INT32, "pct_devueltos_e8": NUMERIC, **{c: NUMERIC for c in _TIMES},
        "efectividad": JSON, "tiempo_por_etapa": JSON, "updated_at": TIMESTAMP,
        **{c: INT32 for c in _E8_COUNTS}, "pct_devueltos_e8_bruto": NUMERIC,
    },
    primary_key=("id",),
    unique=("periodo_reporte",),
    defaults={"updated_at": "now()"},
)
GLOBAL_METRICS = Table(
    TableNames.CRM_GLOBAL_METRICS,
    {"id": INT32, "resumen_global": JSON, "tiempo_por_etapa": JSON, "efectividad": JSON, "updated_at": TIMESTAMP},
    primary_key=("id",),
    defaults={"id": "1", "updated_at": "now()"},
)
DIMENSION_HISTORY = Table(
    TableNames.CRM_DIMENSIONES_HISTORICO,
    {
        "id": SERIAL, "periodo_reporte": TEXT, "dimension": TEXT, "valor": TEXT, "metricas": JSON,
        "efectividad": JSON, "updated_at": TIMESTAMP,
    },
    primary_key=("id",),
    indexes=(("periodo_reporte", "dimension"),),
    defaults={"updated_at": "now()"},
)
DAY_METRICS = Table(
    TableNames.CRM_DAY_METRICS,
    {"periodo_reporte": TEXT, **{f"dia{d}": JSON for d in range(1, 32)}},
    unique=("periodo_reporte",),
)

ALL = (CLIENTS, LOGS, CLOSE_HISTORY, GLOBAL_METRICS, DIMENSION_HISTORY, DAY_METRICS)
register(*ALL)
