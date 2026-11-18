"""Las tablas de suscripciones: las que llena la importación y las del análisis."""

from __future__ import annotations

from core.config import TableNames
from core.tables import BOOL, DATE, FLOAT, INT, JSON, NUMERIC, TEXT, TIMESTAMP, Table, register

_SUBSCRIPTION_COLUMNS = {
    "orden_producto": TEXT, "producto": TEXT, "cliente": TEXT, "ci": TEXT, "sucursal": TEXT, "zona": TEXT,
    "municipio": TEXT, "tipo": TEXT, "estado": TEXT, "campanna": TEXT, "fecha_factura": DATE,
    "fecha_inicio": DATE, "total": FLOAT, "tarifa": TEXT, "telefono": TEXT, "phone": TEXT, "phone2": TEXT,
    "vendedor": TEXT, "activo": BOOL, "medio": TEXT, "medio_supervisor": TEXT, "estado_factura": TEXT,
}

# --- Importación ---------------------------------------------------------------

# Una fila por orden, ya consolidada; se reemplaza entera en cada carga.
SUBSCRIPTIONS = Table(TableNames.SUBSCRIPTIONS, _SUBSCRIPTION_COLUMNS, indexes=(("orden_producto",),))
# El export línea a línea (plan, router, instalación…).
SUBSCRIPTION_LINES = Table(TableNames.SUBSCRIPTIONS_B, _SUBSCRIPTION_COLUMNS)
SUBSCRIPTION_LOGS = Table(
    TableNames.SUBSCRIPTIONS_LOGS,
    {"orden": TEXT, "fecha_log": TIMESTAMP, "log": TEXT, "estado": TEXT},
)
# Los logs de la versión 15 de Odoo: histórico fijo, sin importador.
SUBSCRIPTION_LOGS_V15 = Table(
    TableNames.SUBSCRIPTIONS_LOGS_V15,
    {"orden": TEXT, "tipo": TEXT, "categoria": TEXT, "fecha": TIMESTAMP},
)
FREE_PLANS = Table(
    TableNames.SUBSCRIPTIONS_FREE,
    {
        "orden_producto": TEXT, "cliente": TEXT, "fecha_inicio": DATE, "tarifa": TEXT, "fecha_factura": DATE,
        "fecha_gratuito": TIMESTAMP, "metodo": TEXT, "confianza": TEXT, "siempre_gratuito": BOOL,
        "fecha_evidencia": TIMESTAMP,
    },
)
INVOICES = Table(
    TableNames.SUBSCRIPTIONS_INVOICES,
    {
        "orden": TEXT, "numero": TEXT, "estado_factura_sub": TEXT, "estado": TEXT, "estado_pago": TEXT,
        "creado_el": TIMESTAMP, "fecha_pago": TIMESTAMP, "actualizado_el": TIMESTAMP, "producto": TEXT,
        "importado_el": TIMESTAMP,
    },
    indexes=(("orden",),),
)

# --- Análisis de churn (una partición por `periodo_reporte`) --------------------

_BY_PERIOD = (("periodo_reporte",),)

ACTIVE_AT_CLOSE = Table(
    TableNames.ANALYZER_ACTIVE_AT_CLOSE,
    {"orden": TEXT, "f_dt": TIMESTAMP, "estado": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)
REACTIVATIONS = Table(
    TableNames.ANALYZER_REACTIVACIONES,
    {"orden": TEXT, "fecha": TIMESTAMP, "estado_origen": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)
CHURNED = Table(
    TableNames.ANALYZER_CHURNED,
    {"orden": TEXT, "f_ini_dt": DATE, "estado": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)
UNPAID_CUTS = Table(
    TableNames.ANALYZER_UNPAID_CUTS,
    {"orden": TEXT, "fecha_corte": TIMESTAMP, "motivo_corte": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)
FREE_CLIENTS = Table(
    TableNames.ANALYZER_FREE_CLIENTS,
    {"orden": TEXT, "fecha_archivado": TIMESTAMP, "estado": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)
INACTIVE = Table(
    TableNames.ANALYZER_INACTIVE,
    {"orden": TEXT, "fecha_evento": TIMESTAMP, "estado_inactivo": TEXT, "periodo_reporte": TEXT},
    indexes=_BY_PERIOD,
)

# Las métricas del mes, enteras o tasas.
_COUNTS = [
    "activos_inicio", "activos_final", "bajas", "corte_impagado", "total_inactivos", "reactivaciones",
    "react_6_churn", "react_8_30days", "react_4_paused", "react_4_p", "react_4_h", "react_val",
    "adiciones_netas", "adiciones_brutas", "clientes_gratuitos", "gratuitos_nuevos", "gratuitos_retornados",
]
_RATES = [
    "crecimiento", "churn_neto_pct", "churn_bruto_pct", "porcentaje_suspensiones", "tasa_winback_pct",
    "tasa_aporte_react_pct", "indice_reemplazo_react_pct", "total_billing", "arpu",
]

CLOSE_HISTORY = Table(
    TableNames.ANALYZER_CLOSE_HISTORY,
    {
        "periodo": TEXT, "nuevos_mes": INT, "ingresos": INT,
        **{c: INT for c in _COUNTS}, **{c: FLOAT for c in _RATES},
        "periodo_reporte": TEXT,
    },
    indexes=_BY_PERIOD,
)
CHURN_DIMENSIONS = Table(
    TableNames.ANALYZER_CHURN_DIMENSIONES,
    {
        "dimension": TEXT, "valor": TEXT, "nuevos": INT,
        **{c: INT for c in _COUNTS}, **{c: FLOAT for c in _RATES},
        "periodo_reporte": TEXT,
    },
    indexes=_BY_PERIOD,
)
# Una fila por mes con el corte de cada día (`dia1`…`dia31`).
DAY_METRICS = Table(
    TableNames.ANALYZER_DAY_METRICS,
    {"periodo_reporte": TEXT, "activos_inicio": INT, **{f"dia{d}": JSON for d in range(1, 32)}},
    unique=("periodo_reporte",),
)

LIFETIME_CHURNED = Table(
    TableNames.LIFETIME_CHURNED,
    {
        "orden": TEXT, "f_ini": DATE, "f_ultima_activacion": DATE, "f_baja": DATE, "estado_cierre": TEXT,
        "dias_desde_instalacion": INT, "dias_ultimo_tramo": INT, "tramo_supuesto": BOOL, "zona": TEXT,
        "sucursal": TEXT, "municipio": TEXT, "campanna": TEXT, "zona_sucursal": TEXT, "mes_en_curso": BOOL,
        "fecha_corte": DATE, "periodo_reporte": TEXT, "metodo_calculo": TEXT,
    },
    indexes=(("periodo_reporte", "metodo_calculo"),),
)

# --- Reporte ETA ----------------------------------------------------------------

ETA_ORDER_CONFIG = Table(
    TableNames.ANALYZER_ETA_CONFIG_SUBS,
    {
        "orden": TEXT, "cliente": TEXT, "producto": TEXT, "reportar": BOOL, "tecnologia": TEXT,
        "tipo_persona": TEXT, "tiene_tv": BOOL, "datas_mbps": NUMERIC, "es_transporte": BOOL, "es_dedicado": BOOL,
        "updated_at": TIMESTAMP, "precio": NUMERIC,
    },
    primary_key=("orden",),
    defaults={
        "reportar": "true", "tiene_tv": "false", "datas_mbps": "0", "es_transporte": "false",
        "es_dedicado": "false", "precio": "0", "updated_at": "now()",
    },
)
ETA_MONTHLY_REPORT = Table(
    TableNames.ANALYZER_ETA_MONTHLY_REPORT,
    {
        "periodo_reporte": TEXT, "reporte_data": JSON, "esta_bloqueado": BOOL, "fecha_calculo": TIMESTAMP,
        "tasa_bcv": NUMERIC, "tasa_fuente": TEXT,
    },
    primary_key=("periodo_reporte",),
    defaults={"esta_bloqueado": "false", "fecha_calculo": "now()", "tasa_bcv": "0", "tasa_fuente": "''"},
)

register(
    SUBSCRIPTIONS, SUBSCRIPTION_LINES, SUBSCRIPTION_LOGS, SUBSCRIPTION_LOGS_V15, FREE_PLANS, INVOICES,
    ACTIVE_AT_CLOSE, REACTIVATIONS, CHURNED, UNPAID_CUTS, FREE_CLIENTS, INACTIVE, CLOSE_HISTORY,
    CHURN_DIMENSIONS, DAY_METRICS, LIFETIME_CHURNED, ETA_ORDER_CONFIG, ETA_MONTHLY_REPORT,
)
