"""
Módulo de inicialización del paquete `backend`.

Dependencias esperadas:
- `config`: Constantes de configuración (esquema BD, formatos de fecha, estados, orígenes de reactivación).
- `utils`: Funciones auxiliares de normalización de texto y parseo de fechas.
- `models`: Clase `Periodo` que encapsula un rango de fechas de análisis.
- `database`: Clase `DBConnector` que maneja la conexión y operaciones con PostgreSQL.
- `analyzer`: Clase `ChurnRateAnalyzer` que ejecuta el cálculo de tasa de churn.

Exporta todos los símbolos públicos para que estén disponibles
desde `from analyzer_app.backend import ...`.
"""

from .config import (
    DB_SCHEMA, DATE_FORMATS, ACTIVE_STATE, EXCLUDED_STATE,
    VALID_REACT_ORIGINS, AUDIT_REACT_ORIGINS, CORTE_IMPAGADO_EVENT,
    SUBS_STATE_TO_LOG_MAP,
)
from .utils import normalize_text, parse_date
from .models import Periodo
from .database import DBConnector
from .analyzer import ChurnRateAnalyzer

__all__ = [
    "DB_SCHEMA", "DATE_FORMATS", "ACTIVE_STATE", "EXCLUDED_STATE",
    "VALID_REACT_ORIGINS", "AUDIT_REACT_ORIGINS", "CORTE_IMPAGADO_EVENT",
    "SUBS_STATE_TO_LOG_MAP",
    "normalize_text", "parse_date",
    "Periodo", "DBConnector", "ChurnRateAnalyzer",
]
