"""Utilidades de datos compartidas por los tres dominios.

Fechas, normalizacion de texto, validacion de CSV, limpieza previa a
serializar a JSON y captura de la consola de un analisis. Nada de esto
pertenece a un dominio concreto y todo estaba repetido en varios.
"""

from __future__ import annotations

import io
import json
import math
import re
from collections.abc import Iterable, Mapping
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from datetime import datetime
from typing import Any

import pandas as pd

from .config import DATE_FORMATS

# Un periodo es siempre "YYYY-MM". Las vistas lo recibian sin validar: en
# `imports/jobs.py` solo se comprobaba `len(...) == 7`, asi que cualquier
# cadena de siete caracteres acababa escrita como `periodo_reporte` en las
# tablas de resultados; y en el reporte ETA llegaba a un `LIKE %s` construido
# como f"{periodo}%", donde `?period=%` hacia que el informe agregase todos los
# periodos calculados de golpe en vez de un mes.
RE_PERIOD = re.compile(r"\d{4}-(?:0[1-9]|1[0-2])")

# Techo de la lista de periodos que admite una consulta. Las vistas la
# construyen partiendo `?periods=` por comas sin ningun limite, y esa lista se
# convierte en un `IN (...)` con un marcador por elemento: sin tope, una sola
# peticion podia pedir cien mil.
MAX_PERIODS_PER_QUERY = 60


def is_period(value: Any) -> bool:
    """Si `value` tiene la forma "YYYY-MM" con un mes real."""
    return isinstance(value, str) and RE_PERIOD.fullmatch(value.strip()) is not None


def clean_periods(raw: str | None) -> list[str] | None:
    """Convierte un `?periods=a,b,c` en una lista validada y acotada.

    Devuelve None cuando no se pidio ninguno, que es lo que las consultas
    interpretan como "todos". Descarta en silencio lo que no tenga forma de
    periodo: el parametro lo escribe la interfaz, y un valor invalido es ruido,
    no algo que el usuario pueda corregir.
    """
    if not raw:
        return None
    periods = [p.strip() for p in raw.split(",") if is_period(p)]
    if not periods:
        return None
    return periods[:MAX_PERIODS_PER_QUERY]


def request_int(
    request, key: str, default: int | None = None,
    min_value: int | None = None, max_value: int | None = None,
) -> int | None:
    """Lee un entero de la query string sin reventar si no lo es.

    `int(request.GET.get(...))` a pelo devolvia un 500 ante `?day=abc`, y un
    `?limit=-1` llegaba hasta Postgres como `LIMIT -1`. Las vistas HTML ya lo
    hacian bien; eran sus gemelas JSON las que no.
    """
    raw = request.GET.get(key)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    if min_value is not None:
        value = max(value, min_value)
    if max_value is not None:
        value = min(value, max_value)
    return value


def parse_date(value: Any) -> datetime | None:
    """Convierte a `datetime` probando los formatos conocidos en orden.

    Los exports de Odoo mezclan formatos (`YYYY-MM-DD`, `DD/MM/YYYY`, con hora y
    sin ella), asi que se recorre `DATE_FORMATS` y solo despues se cede a
    `pd.to_datetime`, que es mas lento y mas permisivo. Devuelve `None` para
    vacios y `NaT` para lo que nadie sabe leer.
    """
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
    import re
    import unicodedata
    
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

def zero_nulls(df: pd.DataFrame) -> pd.DataFrame:
    """Las columnas numéricas con los nulos en 0: un entero con algún NULL llega de Postgres como `NaN`."""
    numeric = df.select_dtypes("number").columns
    return df.fillna({c: 0 for c in numeric}) if len(numeric) else df


def typed_records(
    df: pd.DataFrame,
    *,
    texts: Iterable[str] = (),
    ints: Iterable[str] = (),
    floats: Iterable[str] = (),
    rename: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Las filas de `df` como dicts, cada columna en su tipo y sin nulos.

    Una columna que falta (un cierre viejo que no la calculaba) sale en `""` o
    en 0. `rename` cambia la clave de salida de una columna.
    """
    out = pd.DataFrame(index=df.index)
    for col in texts:
        out[col] = df[col].astype(str) if col in df else ""
    for col, kind in [*((c, "int") for c in ints), *((c, "float") for c in floats)]:
        values = pd.to_numeric(df[col], errors="coerce").fillna(0) if col in df else 0
        out[col] = pd.Series(values, index=df.index).astype(kind)
    return out.rename(columns=dict(rename or {})).to_dict("records")


def _clean_json(obj: Any, nan_value: Any) -> Any:
    """Implementacion compartida de la limpieza previa a serializar a JSON.

    Ademas de los NaN/Inf normaliza los tipos que arrastra pandas (escalares de
    numpy y Timestamps), que `json.dumps` no sabe serializar. Antes esto estaba
    reimplementado cuatro veces, cada copia cubriendo un subconjunto distinto.
    """
    if isinstance(obj, dict):
        return {k: _clean_json(v, nan_value) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean_json(v, nan_value) for v in obj]
    # Antes que nada los escalares de numpy: np.float64 hereda de float, asi
    # que si se comprobara `isinstance(obj, float)` primero saldria de aqui sin
    # convertirse a tipo nativo y `json.dumps` acabaria reventando con el.
    if type(obj).__module__ == "numpy" and hasattr(obj, "item"):
        obj = obj.item()
    if isinstance(obj, float):
        return nan_value if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, pd.Timestamp):
        # ISO 8601, que es exactamente lo que emitia DjangoJSONEncoder cuando
        # estos Timestamps le llegaban sin limpiar. Con `str()` saldria con un
        # espacio en vez de la "T" y cambiaria el formato en el cliente.
        return obj.isoformat()
    if isinstance(obj, pd.DatetimeIndex):
        return [t.isoformat() for t in obj]
    return obj


def clean_json_props(obj: Any) -> Any:
    """Reemplaza NaN/Inf por 0.0 en cualquier estructura destinada a JSON.

    `json.dumps` los emite como `NaN`/`Infinity`, que `JSON.parse` rechaza: el
    JSON llega roto al cliente.
    """
    return _clean_json(obj, 0.0)


def clean_json_nullable(obj: Any) -> Any:
    """Como `clean_json_props`, pero deja los NaN como `null` en vez de 0.

    Para las metricas donde 0 no es "sin dato" sino un valor con significado
    propio: la mediana de una curva de supervivencia que no se puede calcular
    debe llegar al grafico como null, porque un 0 se leeria como que todos los
    suscriptores se dieron de baja de inmediato.
    """
    if obj is not None and not isinstance(obj, (dict, list, tuple, str)):
        try:
            if pd.isna(obj):
                return None
        except (TypeError, ValueError):
            pass
    return _clean_json(obj, None)


def parse_jsonb(val: Any) -> Any:
    """Decodifica una columna JSONB que psycopg2 puede entregar ya parseada.

    Segun el driver y el tipo declarado de la columna, un JSONB llega como
    dict/list o como la cadena sin parsear. Lo que no sea JSON valido se
    devuelve tal cual, que es lo que hacian las dos copias que habia de esto.
    """
    if val is None or isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


@contextmanager
def capture_console(buffer=None):
    """Captura lo que el analisis imprime, para devolverlo como log al cliente.

    Los analizadores narran su progreso por stdout y las vistas lo reenvian al
    navegador como "salida de consola". Las cuatro apps repetian el mismo par
    de `redirect_stdout`/`redirect_stderr` sobre un StringIO.

    Uso::

        with capture_console() as salida:
            analyzer.run()
        return JsonResponse({"log_output": salida.getvalue()})

    `buffer` permite pasar un StringIO propio. Lo usan las tareas de Celery con
    `services.imports.jobs.JobConsole`, que ademas de acumular va volcando el
    log a la fila del job para que la interfaz lo lea mientras corre.
    """
    buffer = io.StringIO() if buffer is None else buffer
    with redirect_stdout(buffer), redirect_stderr(buffer):
        yield buffer
