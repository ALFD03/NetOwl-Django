from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
import pandas as pd
from .conf_config import DATE_FORMATS

import pandas as pd

from .conf_config import DATE_FORMATS


def parse_date(value: Any) -> Optional[datetime]:
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return pd.to_datetime(text, errors="coerce")

def normalize_text(value: Any) -> str:
    """
    Normaliza texto para búsquedas y comparaciones seguras:
    Remueve acentos, tildes, caracteres especiales, y colapsa espacios.
    """
    if pd.isna(value) or value is None:
        return ""
    import unicodedata
    import re
    
    # 1. Minúsculas y limpieza de extremos
    text = str(value).strip().lower()
    
    # 2. Quitar acentos/tildes de forma nativa
    text = (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("utf-8")
    )
    
    # 3. Remover caracteres especiales y de puntuación
    text = re.sub(r"[^a-z0-9\s]", "", text)
    
    # 4. Unificar espacios múltiples a espacio simple
    text = re.sub(r"\s+", " ", text).strip()
    
    return text
