from __future__ import annotations
import unicodedata
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd

from .config import DATE_FORMATS


def normalize_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value)
    text = (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    return text.lower().strip()


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
