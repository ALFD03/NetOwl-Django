from __future__ import annotations
import math
from datetime import datetime
from typing import Any, Optional
from typing import Iterable

import pandas as pd
from .conf_config import DATE_FORMATS

import pandas as pd
import csv

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

def validate_csv_structure(file_path: str, required_headers: Iterable[str], delimiter: str = ",") -> tuple[bool, str | None]:
    """
    Verifica rápidamente si un archivo CSV tiene las columnas obligatorias.
    Retorna (True, None) si es válido, o (False, "mensaje de error") si falla.
    """
    try:
        # Abrimos con utf-8-sig para omitir automáticamente el BOM de Excel
        with open(file_path, "r", encoding="utf-8-sig", errors="ignore") as f:
            # Leer solo los primeros 2048 bytes para analizar el formato sin cargar todo a memoria
            sample = f.read(2048)
            f.seek(0)
            
            if not sample.strip():
                return False, "El archivo está vacío."
            
            # Detectar el delimitador automáticamente (soporta comas y punto y coma)
            try:
                dialect = csv.Sniffer().sniff(sample)
                actual_delimiter = dialect.delimiter
            except Exception:
                actual_delimiter = delimiter
                
            reader = csv.reader(f, delimiter=actual_delimiter)
            headers = next(reader, None)
            
            if not headers:
                return False, "No se pudieron leer las cabeceras del archivo."
            
            # Normalizar cabeceras para una comparación segura (minúsculas y sin espacios)
            normalized_headers = {h.strip().lower() for h in headers if h}
            normalized_required = {r.strip().lower() for r in required_headers}
            
            missing = normalized_required - normalized_headers
            if missing:
                missing_original = [r for r in required_headers if r.strip().lower() in missing]
                return False, f"Estructura inválida. Columnas faltantes: {', '.join(missing_original)}"
            
            return True, None
    except Exception as e:
        return False, f"No es un archivo CSV válido: {str(e)}"


def clean_json_props(obj: Any) -> Any:
    """Reemplaza NaN/Inf por 0.0 en cualquier estructura destinada a JSON.

    `json.dumps` los emite como `NaN`/`Infinity`, que `JSON.parse` rechaza: el
    payload de Inertia llega roto y la página se renderiza vacía.
    """
    if isinstance(obj, float):
        return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: clean_json_props(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_json_props(v) for v in obj]
    return obj
