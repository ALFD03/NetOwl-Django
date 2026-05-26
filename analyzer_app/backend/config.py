from __future__ import annotations
import os
import warnings

from dotenv import load_dotenv

load_dotenv()
warnings.filterwarnings("ignore", category=UserWarning)

DB_SCHEMA = os.getenv("SCHEMA", "public")

DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
]

ACTIVE_STATE = "3_progress"
INACTIVE_STATES = {"4_paused", "6_churn", "8_30days"}
VALID_REACT_ORIGINS = {"4_paused", "6_churn", "8_30days"}
AUDIT_REACT_ORIGINS = {"6_churn", "8_30days"}
CORTE_IMPAGADO_EVENT = "corte automatico por factura impaga"
