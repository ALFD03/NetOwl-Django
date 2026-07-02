"""
Funciones utilitarias para parseo de datos.

Dependencias esperadas:
- `pandas`: Manejo y validación de datos tabulares.
- `config.DATE_FORMATS`: Lista de formatos de fecha a probar.
- La función `parse_date` intenta convertir un valor a `datetime`
  probando múltiples formatos definidos en la configuración.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any, Optional

import pandas as pd

from .config import DATE_FORMATS


def parse_date(value: Any) -> Optional[datetime]:
    """
    Parsea un valor a objeto datetime probando múltiples formatos.

    Estrategia:
    1. Retorna None si el valor es nulo o cadena vacía.
    2. Prueba cada formato en DATE_FORMATS hasta encontrar uno que funcione.
    3. Si ninguno coincide, delega en `pd.to_datetime` con `errors="coerce"`.

    Args:
        value: Valor a parsear (cadena, número o timestamp).

    Returns:
        Objeto datetime si se pudo parsear, None en caso contrario.
    """
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    # Itera sobre los formatos definidos en configuración
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    # Fallback: pandas parsea formatos no convencionales
    return pd.to_datetime(text, errors="coerce")
