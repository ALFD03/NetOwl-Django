"""
Módulo de inicialización del paquete `backend`.

Dependencias esperadas:
- `config`: Constantes de configuración (esquema BD, formatos de fecha, estados, orígenes de reactivación).
- `utils`: Funciones auxiliares de normalización de texto y parseo de fechas.
- `models`: Clase `Periodo` que encapsula un rango de fechas de análisis.
- `database`: Clase `DBConnector` que maneja la conexión y operaciones con PostgreSQL.
- `subscriptions`: Subpaquete con la lógica del módulo de suscripciones (churn, imports, data API, lifetime).

Exporta todos los símbolos públicos para que estén disponibles
desde `from backend import ...`.
"""

from .config import (
    DB_SCHEMA, DATE_FORMATS, ACTIVE_STATE, EXCLUDED_STATE,
    VALID_REACT_ORIGINS, CORTE_IMPAGADO_EVENT,
    SUBS_STATE_TO_LOG_MAP, TableNames,
)
from .utils import parse_date
from .models import Periodo
from .database import DBConnector
from .subscriptions import MetricsAnalyzer

__all__ = [
    "DB_SCHEMA", "DATE_FORMATS", "ACTIVE_STATE", "EXCLUDED_STATE",
    "VALID_REACT_ORIGINS", "CORTE_IMPAGADO_EVENT",
    "SUBS_STATE_TO_LOG_MAP", "TableNames",
    "parse_date",
    "Periodo", "DBConnector", "MetricsAnalyzer",
]
