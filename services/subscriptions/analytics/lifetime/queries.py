"""Lectura de los resultados del analisis de supervivencia.

Las curvas viajan en la base como JSON dentro de una columna de texto, asi que
aqui se deshacen y se les da la forma que consume el grafico. Los nulos se
conservan como `null` y no como 0: una mediana que no se puede calcular no es
"todos se dieron de baja de inmediato".
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.config import TableNames
from core.database import DBConnector
from core.utils import clean_json_nullable

logger = logging.getLogger(__name__)


def get_lifecycle_results(db=None) -> dict[str, Any]:
    """Las metricas globales del ultimo analisis, con las curvas ya parseadas."""
    if db is None:
        db = DBConnector()
    try:
        df = db.read_table(TableNames.LIFETIME_METRICAS)
        if df.empty:
            return {}
        
        # Tomar la última fila y convertir a diccionario nativo
        row_raw = df.iloc[-1].to_dict()
        result = {}

        for col, val in row_raw.items():
            if col in ("curva_activo_json", "curva_reactivacion_json"):
                key = col.replace("_json", "")
                try:
                    result[key] = json.loads(val) if val else []
                except (json.JSONDecodeError, TypeError):
                    result[key] = []
            elif col == "ciclos_por_suscriptor":
                try:
                    result[col] = json.loads(val) if val else {}
                except (json.JSONDecodeError, TypeError):
                    result[col] = {}
            elif col in ("periodo_reporte", "metodo_calculo"):
                continue
            else:
                result[col] = clean_json_nullable(val)
        return result
    except Exception:
        logger.exception("Error en query de lifecycle results")
        return {}

def get_lifetime_dimensiones(dim: str | None = None, db=None) -> dict[str, Any]:
    """Las metricas por dimension, indexadas por dimension y valor."""
    if db is None:
        db = DBConnector()
    try:
        df = db.read_table(TableNames.LIFETIME_DIMENSIONES)
        if df.empty:
            return {}
        if dim:
            df = df[df["dimension"] == dim]
            
        result = {}
        for _, row in df.iterrows():
            d = str(row.get("dimension", ""))
            v = str(row.get("valor", ""))
            if d not in result:
                result[d] = {}
                
            result[d][v] = {
                "mediana_activo": clean_json_nullable(row.get("mediana_activo")),
                "p25_activo": clean_json_nullable(row.get("p25_activo")),
                "p75_activo": clean_json_nullable(row.get("p75_activo")),
                "n_total_activo": int(row.get("n_total_activo") or 0),
                "n_evento_activo": int(row.get("n_evento_activo") or 0),
                "promedio_reactivacion": clean_json_nullable(row.get("promedio_reactivacion")),
                "mediana_reactivacion": clean_json_nullable(row.get("mediana_reactivacion")),
                "curva_activo": json.loads(row.get("curva_activo_json") or "[]"),
                "curva_reactivacion": json.loads(row.get("curva_reactivacion_json") or "[]"),
            }
        return result
    except Exception:
        logger.exception("Error en query de dimensiones lifetime")
        return {}


# La UI nombra una dimension "campana" pero en la base la columna es
# "campanna"; el resto coincide. El mapa existe para no filtrar hacia la base
# un valor arbitrario venido de la query string.
DIMENSION_ALIASES = {
    "zona": "zona",
    "sucursal": "sucursal",
    "municipio": "municipio",
    "campana": "campanna",
    "producto": "producto",
    "zona_sucursal": "zona_sucursal",
}


def get_survival_curves_by_dimension(dim: str | None) -> dict[str, dict[str, Any]]:
    """Curvas de supervivencia agrupadas por valor de una dimension.

    Aplana el resultado de `get_lifetime_dimensiones` a la forma que consume el
    grafico: `{"activo": {valor: curva}, "reactivacion": {valor: curva}}`.
    Los valores sin curva no se incluyen. Una dimension desconocida devuelve la
    estructura vacia en vez de fallar.
    """
    vacio: dict[str, dict[str, Any]] = {"activo": {}, "reactivacion": {}}
    db_dim = DIMENSION_ALIASES.get(dim or "")
    if not db_dim:
        return vacio

    try:
        dim_data = get_lifetime_dimensiones(db_dim)
    except Exception:
        logger.exception("Error leyendo las curvas de la dimension %s", dim)
        return vacio

    curvas = {"activo": {}, "reactivacion": {}}
    for valores in dim_data.values():
        for valor, info in valores.items():
            if info.get("curva_activo"):
                curvas["activo"][valor] = info["curva_activo"]
            if info.get("curva_reactivacion"):
                curvas["reactivacion"][valor] = info["curva_reactivacion"]
    return curvas


def get_survival_report(dim: str | None = None) -> dict[str, Any]:
    """Payload completo de la pagina de supervivencia.

    Reune la curva global, sus estadisticos y, si se pide, el desglose por
    dimension. La tasa de censura y el tiempo maximo se calculan aqui y no en
    la vista: son parte de la metrica, no del transporte HTTP.
    """
    lc = get_lifecycle_results()
    if not lc:
        return {
            "periodo": "global",
            "curva_activo": [],
            "curva_reactivacion": [],
            "stats": {},
            "curvas_dimension": {"activo": {}, "reactivacion": {}},
        }

    curva_activo = lc.get("curva_activo", []) or []
    total = lc.get("n_total_activo", 0)
    n_censurado = lc.get("n_censurado_activo", 0)

    return {
        "periodo": "global",
        "curva_activo": curva_activo,
        "curva_reactivacion": lc.get("curva_reactivacion", []),
        "stats": {
            "mediana_activo": lc.get("mediana_activo"),
            "promedio_activo": lc.get("promedio_activo"),
            "p25_activo": lc.get("p25_activo"),
            "p75_activo": lc.get("p75_activo"),
            "mediana_reactivacion": lc.get("mediana_reactivacion"),
            "p25_reactivacion": lc.get("p25_reactivacion"),
            "p75_reactivacion": lc.get("p75_reactivacion"),
            "promedio_reactivacion": lc.get("promedio_reactivacion"),
            "total_suscriptores": total,
            "total_eventos": lc.get("n_evento_activo", 0),
            "n_censurado_activo": n_censurado,
            "tasa_censura": round(n_censurado / total, 4) if total and total > 0 else None,
            "tiempo_maximo": max((p["tiempo"] for p in curva_activo), default=None),
        },
        "curvas_dimension": get_survival_curves_by_dimension(dim),
    }
