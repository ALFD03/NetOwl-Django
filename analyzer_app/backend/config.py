"""
Módulo de configuración global del backend de ChurnRateAnalyzer.

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
# Subconjunto de orígenes auditables para reactivaciones (churn y 30 días)
AUDIT_REACT_ORIGINS = {"6_churn", "8_30days"}
# Texto exacto del evento de corte por factura impaga en los logs
CORTE_IMPAGADO_EVENT = "corte automatico por factura impaga"
