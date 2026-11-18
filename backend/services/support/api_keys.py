"""Claves en inglés de `/api/support/` (ver `services/config/api/keys.py`).

Las dimensiones (`zona`, `sucursal`, `asignado_a`, `creado_por`,
`grupo_trabajo`) y los desgloses (`tipo_solicitud`, `razon_falla`,
`solucion_falla`) no se traducen: son valores guardados en la columna
`dimension` y el cliente indexa por ellos.
"""

from services.config.api import KeyMap

from .analytics.config import SUPPORT_TIME_MEASURES, TIME_STATS

MEASURES = {
    "cierre_creado_resuelto": "close_created_resolved",
    "cierre_creado_cancelado": "close_created_cancelled",
    "cierre_creado_cerrados": "close_created_closed",
    "cierre_asignado_resuelto": "close_assigned_resolved",
    "cierre_asignado_cancelado": "close_assigned_cancelled",
    "cierre_asignado_cerrados": "close_assigned_closed",
    "asignacion": "assignment",
    "escalamiento": "escalation",
}
STATS = {"medio": "mean", "mediana": "median", "min": "min", "p25": "p25", "p75": "p75", "max": "max", "std": "std"}

TIME_KEYS = {
    **{f"tiempo_{s}_{m}_horas": f"time_{STATS[s]}_{MEASURES[m]}_hours" for s in TIME_STATS for m in SUPPORT_TIME_MEASURES},
    **{f"muestra_{m}": f"sample_{MEASURES[m]}" for m in SUPPORT_TIME_MEASURES},
    **{f"pct_excede_promedio_{m}": f"pct_over_avg_{MEASURES[m]}" for m in SUPPORT_TIME_MEASURES},
}

VOLUME_KEYS = {
    f"{prefix}_{es}{suffix_es}": f"{prefix}_{en}{suffix_en}"
    for prefix in ("tickets", "pct")
    for es, en in (("resueltos", "resolved"), ("cancelados", "cancelled"), ("escalados", "escalated"))
    for suffix_es, suffix_en in (("", ""), ("_periodo", "_in_period"), ("_arrastre", "_carryover"))
}

SUPPORT_KEYS = KeyMap(TIME_KEYS, VOLUME_KEYS, {
    "tickets_creados": "tickets_created",
    "tickets_cerrados": "tickets_closed",
    "tickets_recibidos_escalados": "tickets_received_escalated",
    "tickets_rezagados": "tickets_lagging",
    "pct_recibidos_escalados": "pct_received_escalated",
    "pct_rezagados": "pct_lagging",
    "pct_excede_promedio": "pct_over_avg",
    "composicion_cola_horas": "queue_hours",
    "composicion_pausa_horas": "pause_hours",
    "composicion_gestion_horas": "handling_hours",
    "composicion_sin_clasificar_horas": "unclassified_hours",
    "muestra_composicion": "composition_sample",
    "muestra": "sample",
    "medio": "mean",
    "mediana": "median",
    "periodos_evaluados": "evaluated_periods",
    "periodo_reporte": "report_period",
    "periodo": "period",
    "periodo_mes": "month",
    "resumen_global": "global_summary",
    "por_grupo_trabajo": "by_work_group",
    "historico_tendencias": "trend_history",
    "historico": "history",
    "abiertos": "open",
    "grupos": "groups",
    "global_grupos": "global_groups",
    "incidencia_zonas": "zone_incidence",
    "metricas": "metrics",
    "departamento": "department",
    "tecnologia": "technology",
    "total_suscriptores": "total_subscribers",
    "tasa_incidencia_pct": "incidence_rate_pct",
    "mttr_promedio": "mttr_avg",
    "dia": "day",
    "dias_disponibles": "available_days",
    "serie": "series",
    "serie_grupos": "group_series",
    "resumen": "summary",
    "por_asignado": "by_assignee",
    "por_etapa": "by_stage",
    "por_grupo": "by_group",
    "por_tipo_solicitud": "by_request_type",
    "por_zona": "by_zone",
    # Tickets abiertos (`flow.get_open_tickets`).
    "ahora": "now",
    "escalados": "escalated",
    "escalado": "is_escalated",
    "edad": "age",
    "edad_h": "age_h",
    "edad_max": "age_max",
    "edad_media": "age_mean",
    "edad_mediana": "age_median",
    "en_etapa": "in_stage",
    "en_etapa_h": "in_stage_h",
    "en_etapa_media": "in_stage_mean",
    "en_etapa_mediana": "in_stage_median",
    "en_atc": "in_atc",
    "en_soporte": "in_support",
    "en_soporte_desde_escalamiento": "in_support_since_escalation",
    "antiguedad": "aging",
    "tramo": "bucket",
    "lista": "items",
    "lista_limite": "items_limit",
    "creado": "opened_at",
    "etapa": "stage",
    "etapa_actual": "current_stage",
    "equipo": "team",
    "equipo_actual": "current_team",
    "tipo": "type",
    "tipo_actual": "current_type",
    "es_escalamiento": "is_escalation",
    "logs_hasta": "logs_until",
    "desfasados": "stale",
    "ultimo": "last",
    # Directorio de usuarios y catálogo de etapas.
    "nombre": "name",
    "nombre_odoo": "odoo_name",
    "nombre_completo": "full_name",
    "apellido": "last_name",
    "departamento_id": "department_id",
    "departamentos": "departments",
    "fecha_ingreso": "start_date",
    "fecha_egreso": "end_date",
    "activo": "active",
    "historial": "timeline",
    "desde": "since",
    "asignados": "assigned",
    "creados": "created",
    "sufijo": "suffix",
    "usuarios": "users",
    "pendientes": "pending",
    "trasBaja": "afterChurn",
    "nuevoUsuario": "newUser",
    "etapas": "stages",
    "equipos": "teams",
    "tipos": "types",
    "nuevaEtapa": "newStage",
    "registro": "record",
    "desgloses": "breakdowns",
    "valor": "value",
    "accion": "action",
    "fecha": "date",
    "etapasCierre": "closeStages",
    "etapaEscalamiento": "escalationStage",
})
