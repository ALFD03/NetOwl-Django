from __future__ import annotations
import os
import warnings

from dotenv import load_dotenv

load_dotenv()
warnings.filterwarnings("ignore", category=UserWarning)

# El esquema no es un secreto y cambia según el entorno (prod / pruebas),
# por eso vive en el .env junto a VAULT_PATH y no dentro del secreto.
DB_SCHEMA = os.getenv("DB_SCHEMA", "public")

DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
]

ACTIVE_STATE = "3_progress"
INACTIVE_STATES = {"4_paused", "6_churn", "8_30days"}
VALID_REACT_ORIGINS = {"4_paused", "6_churn", "8_30days"}
CORTE_IMPAGADO_EVENT = "corte automatico por factura impaga"

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
    CRM_METRICAS_GLOBALES = "crm_metricas_globales"
    CRM_DIMENSIONES_HISTORICO = "crm_dimensiones_historico"
    ANALYZER_ACTIVOS_CIERRE = "analyzer_activos_cierre"
    ANALYZER_REACTIVACIONES = "analyzer_reactivaciones"
    ANALYZER_BAJAS_DETALLADAS = "analyzer_bajas_detalladas"
    ANALYZER_CORTE_IMPAGADO = "analyzer_corte_impagado"
    ANALYZER_CIERRE_HISTORICO = "analyzer_cierre_historico"
    ANALYZER_INACTIVOS_DETALLADOS = "analyzer_inactivos_detallados"
    ANALYZER_CHURN_DIMENSIONES = "analyzer_churn_dimensiones"
    LIFETIME_PERIODOS = "lifetime_periodos"
    LIFETIME_METRICAS = "lifetime_metricas"
    LIFETIME_DIMENSIONES = "lifetime_dimensiones"
    SUBSCRIPTIONS = "subscriptions"
    SUBSCRIPTIONS_B = "subscriptions-b"
    SUBSCRIPTIONS_LOGS = "subscriptions-logs"
    SUBSCRIPTIONS_LOGS_V15 = "subscriptions-logs-v15"
    SUPPORT_TICKETS = "support_tickets"
    SUPPORT_METRICAS_GLOBALES = "support_metricas_globales"
    SUPPORT_DIMENSIONES_HISTORICO = "support_dimensiones_historico"
    SUPPORT_CIERRE_HISTORICO = "support_cierre_historico"
