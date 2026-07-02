"""
Módulo de configuración global del backend de MetricsAnalyzer.

Dependencias esperadas:
- `python-dotenv`: Carga variables de entorno desde un archivo `.env`.
- Variables de entorno: `SCHEMA` (esquema de BD, por defecto "public").
- No requiere conexión a base de datos; solo define constantes.

Define constantes usadas por los demás módulos del paquete:
nombre del esquema BD, formatos de fecha aceptados, estados de
suscripción, orígenes válidos para reactivaciones y el evento
de corte por impago.
"""

from __future__ import annotations
import os
import warnings

from dotenv import load_dotenv

# Carga las variables definidas en el archivo .env (si existe)
load_dotenv()
# Suprime advertencias de usuario que no afectan la ejecución
warnings.filterwarnings("ignore", category=UserWarning)

# Esquema de base de datos donde residen las tablas
DB_SCHEMA = os.getenv("SCHEMA", "public")

# Formatos de fecha/hora intentados al parsear cadenas
DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
]

# Estado que identifica una suscripción activa
ACTIVE_STATE = "3_progress"
# Estados considerados como inactivos (susceptibles de reactivación)
INACTIVE_STATES = {"4_paused", "6_churn", "8_30days"}
# Estados desde los cuales se permite una reactivación
VALID_REACT_ORIGINS = {"4_paused", "6_churn", "8_30days"}
# Texto exacto del evento de corte por factura impaga en los logs
CORTE_IMPAGADO_EVENT = "corte automatico por factura impaga"

# Estado que marca suscripciones excluidas (Cotizacion, Instalacion)
EXCLUDED_STATE = "0_other"

# Mapeo de estados de suscripcion a estados de log (formato normalizado)
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
    SUBSCRIPCIONES = "Subscripciones"
    SUBSCRIPCIONES_B = "Subscripciones-b"
    SUBSCRIPCIONES_LOGS = "Subscripciones-logs"
    SUBSCRIPCIONES_LOGS_V15 = "Subscripciones-logs-v15"
