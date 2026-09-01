from __future__ import annotations
import os
import warnings

from dotenv import load_dotenv

load_dotenv()
warnings.filterwarnings("ignore", category=UserWarning)

DB_SCHEMA = os.getenv("DB_SCHEMA")

DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
]

ACTIVE_STATE = "3_progress"
INACTIVE_STATES = {"4_paused", "6_churn", "8_30days"}
VALID_REACT_ORIGINS = {"4_paused", "6_churn", "8_30days"}
CORTE_IMPAGADO_EVENT = "corte automatico por factura impaga"

# Clientes migrados a un servicio gratuito: no son activos ni bajas.
FREE_STATE = "9_free"
ARCHIVED_EVENT = "suscripcion archivada"
UNARCHIVED_EVENT = "suscripcion desarchivada"

EXCLUDED_STATE = "0_other"

SUBS_STATE_TO_LOG_MAP = {
    "en progreso": "3_progress",
    "cancelado": "6_churn",
    "en pausa": "4_paused",
    "mas de 30 dias suspendidos": "8_30days",
    "cotizacion": "0_other",
    "instalacion": "0_other",
}


class TableNames:
    CRM_CLIENTS = "crm_clients"
    CRM_LOGS = "crm_logs"
    CRM_CIERRE_HISTORICO = "crm_cierre_historico"
    CRM_METRICAS_GLOBALES = "crm_metricas_globales"
    CRM_DIMENSIONES_HISTORICO = "crm_dimensiones_historico"
    ANALYZER_ACTIVOS_CIERRE = "analyzer_activos_cierre"
    ANALYZER_REACTIVACIONES = "analyzer_reactivaciones"
    ANALYZER_BAJAS_DETALLADAS = "analyzer_bajas_detalladas"
    ANALYZER_CORTE_IMPAGADO = "analyzer_corte_impagado"
    ANALYZER_CIERRE_HISTORICO = "analyzer_cierre_historico"
    ANALYZER_INACTIVOS_DETALLADOS = "analyzer_inactivos_detallados"
    ANALYZER_CLIENTES_GRATUITOS = "analyzer_clientes_gratuitos"
    ANALYZER_CHURN_DIMENSIONES = "analyzer_churn_dimensiones"
    ANALYZER_DAY_METRICS = "analyzer_day_metrics"
    LIFETIME_PERIODOS = "lifetime_periodos"
    LIFETIME_METRICAS = "lifetime_metricas"
    LIFETIME_DIMENSIONES = "lifetime_dimensiones"
    SUBSCRIPTIONS = "subscriptions"
    SUBSCRIPTIONS_B = "subscriptions-b"
    SUBSCRIPTIONS_LOGS = "subscriptions-logs"
    SUBSCRIPTIONS_LOGS_V15 = "subscriptions-logs-v15"
    SUBSCRIPTIONS_FREE = "subscriptions_gratis"
    SUPPORT_TICKETS = "support_tickets"
    SUPPORT_METRICAS_GLOBALES = "support_metricas_globales"
    SUPPORT_DIMENSIONES_HISTORICO = "support_dimensiones_historico"
    SUPPORT_CIERRE_HISTORICO = "support_cierre_historico"
