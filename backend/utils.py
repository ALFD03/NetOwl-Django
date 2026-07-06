from __future__ import annotations
from datetime import datetime
from typing import Any, Optional

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
