"""Riesgo de que una oportunidad pase por la etapa 8 durante un periodo.

**Es una tasa de riesgo mensual, no una probabilidad de cohorte.** La pregunta
que responde es "de todo lo que estuvo vivo este mes, ¿qué proporción se cayó a
la etapa 8?":

    pct_devueltos_e8 = transiciones a la etapa 8 ocurridas en P
                       ────────────────────────────────────────
                       oportunidades con vida en P

Vivo en P = creada en P o antes, y todavía sin cerrar al empezar P. Entran por
tanto las que vienen arrastradas de meses anteriores, que son las que el embudo
está gestionando de verdad.

La razón de medirlo así, y no siguiendo a la cohorte de creación hasta su
desenlace, es que **un mes cerrado no vuelve a cambiar**: tanto el numerador
(movimientos con fecha en P) como el denominador (fechas de creación y cierre)
son hechos ya escritos. Sólo se mueven los meses todavía activos. Una métrica de
cohorte obligaría a reprocesar el pasado cada vez que llegan datos nuevos.

**No toda devolución es del embudo.** Los motivos de ETAPA8_EXCEPTION_MOTIVOS
—el cliente no contesta, espera su router— son ajenos a la gestión y ya se
excluyen en la efectividad; aquí se excluyen igual, para que las dos métricas
hablen de la misma población.

El problema es que el motivo sólo es legible mientras la oportunidad siga en la
etapa 8 (`devolver_oportunidad` se sobrescribe al moverse), y dos tercios de las
devoluciones históricas no lo traen. Descartarlas sesgaría el número y contarlas
todas como gestión lo inflaría, así que se aplica **el mismo algoritmo de
imputación que la efectividad**: la fracción de devoluciones sin motivo que son
de gestión se estima con la tasa observada en las que sí lo traen, condicionada
a la etapa de origen del movimiento (el log siempre la conserva). Si un origen
no llega a `E8_IMPUTACION_MIN_MUESTRA` casos legibles se usa la tasa global, y
si no hay ninguno legible no se excluye nada: sin evidencia de excepción, la
devolución cuenta.

La parte estimada viaja en su propio campo (`e8_devueltos_estimados`), separada
del dato duro, igual que `devoluciones_estimadas` en la efectividad. Es también
lo único de esta métrica que sí se mueve con el tiempo: a medida que las
oportunidades salen de la etapa 8 y pierden su motivo, la exclusión pasa de
observada a estimada. El total bruto no cambia; el reparto entre gestión y
excepción se afina.

Invariantes del resultado:

    count_devueltos_e8_bruto = count_devueltos_e8 + e8_devueltos_excepcion
    count_devueltos_e8       = observadas de gestión + e8_devueltos_estimados
    count_devueltos_e8_bruto = e8_devueltos_con_motivo + e8_devueltos_sin_motivo
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Tuple

import pandas as pd

from core.utils import normalize_text
from ..config import (
    E8_IMPUTACION_MIN_MUESTRA,
    ETAPA8_EXCEPTION_MOTIVOS,
    ETAPA8_KEY,
)

_VACIOS = ["", "nan", "None", "<NA>"]
_SIN_ESPECIFICAR = "Sin Especificar"


def _motivos_excepcion() -> set[str]:
    return {normalize_text(m) for m in ETAPA8_EXCEPTION_MOTIVOS}


def _clave_oportunidad(df: pd.DataFrame) -> str:
    """Columna con la que un log se ata a su oportunidad.

    `oportunidad_id` la resuelve el análisis contra `Iniciativa/ID`; `client_id`
    es el respaldo por si el log llega sin pasar por ahí.
    """
    return "oportunidad_id" if "oportunidad_id" in df.columns else "client_id"


def _serie_normalizada(serie: pd.Series) -> pd.Series:
    """Texto legible de una columna de motivos, con los vacíos unificados."""
    txt = serie.fillna(_SIN_ESPECIFICAR).astype(str).str.strip()
    return txt.replace(_VACIOS, _SIN_ESPECIFICAR)


def compute_distribucion_perdidos(df_perdidos: pd.DataFrame) -> List[Dict[str, Any]]:
    if df_perdidos.empty or "motivo_perdida" not in df_perdidos.columns:
        return []

    motivos = _serie_normalizada(df_perdidos["motivo_perdida"])

    total = len(motivos)
    if total == 0:
        return []

    counts = motivos.value_counts()
    result = []
    for motivo, count in counts.items():
        result.append({
            "motivo": motivo,
            "total": int(count),
            "pct": round((int(count) / total) * 100, 2),
        })
    return result


def compute_distribucion_etapa8(
    df_logs_e8: pd.DataFrame,
    df_clients: pd.DataFrame
) -> List[Dict[str, Any]]:
    """Motivos de las oportunidades que se devolvieron en el periodo.

    `excepcion` marca los motivos que la probabilidad excluye por ser ajenos a
    la gestión, para que la tabla explique de dónde sale la diferencia entre
    `count_devueltos_e8_bruto` y `count_devueltos_e8`.
    """
    if df_logs_e8.empty:
        return []

    clave = _clave_oportunidad(df_logs_e8)
    cids = df_logs_e8[clave].dropna().astype(str).str.strip().unique()
    if len(cids) == 0:
        return []

    df_subset = df_clients[df_clients["id"].astype(str).str.strip().isin(cids)]
    if df_subset.empty or "devolver_oportunidad" not in df_subset.columns:
        return []

    motivos = _serie_normalizada(df_subset["devolver_oportunidad"])

    total = len(motivos)
    if total == 0:
        return []

    excepciones = _motivos_excepcion()
    counts = motivos.value_counts()
    result = []
    for motivo, count in counts.items():
        result.append({
            "motivo": motivo,
            "total": int(count),
            "pct": round((int(count) / total) * 100, 2),
            "excepcion": normalize_text(motivo) in excepciones,
        })
    return result


# --- Riesgo de devolución ---------------------------------------------------

def _resultado_vacio(total: int) -> Dict[str, Any]:
    """Periodo sin devoluciones: el riesgo es 0, no un hueco."""
    return {
        "total_en_riesgo": total,
        "count_devueltos_e8": 0,
        "pct_devueltos_e8": 0.0,
        "count_devueltos_e8_bruto": 0,
        "pct_devueltos_e8_bruto": 0.0,
        "e8_devueltos_excepcion": 0,
        "e8_devueltos_con_motivo": 0,
        "e8_devueltos_sin_motivo": 0,
        "e8_devueltos_estimados": 0,
        "e8_clientes_devueltos": 0,
        "e8_reincidentes": 0,
    }


def _tasas_de_gestion(
    con_motivo: Dict[str, int],
    de_gestion: Dict[str, int],
) -> Tuple[Dict[str, float], float]:
    """Tasa de devoluciones que sí son de gestión, por etapa de origen.

    Devuelve el mapa por origen y la tasa global de respaldo. Sin ninguna
    devolución legible la tasa es 1.0: no hay evidencia de excepción, así que no
    se excluye nada. Es la dirección conservadora —no esconder devoluciones—,
    la contraria a inventar exclusiones que nadie ha observado.
    """
    total_legible = sum(con_motivo.values())
    tasa_global = sum(de_gestion.values()) / total_legible if total_legible else 1.0

    tasas = {}
    for origen, muestra in con_motivo.items():
        tasas[origen] = (
            de_gestion[origen] / muestra
            if muestra >= E8_IMPUTACION_MIN_MUESTRA
            else tasa_global
        )
    return tasas, tasa_global


def _mapas_de_cliente(df_clients: pd.DataFrame) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """`etapa_actual` y `devolver_oportunidad` por id, como texto comparable."""
    if df_clients is None or df_clients.empty or "id" not in df_clients.columns:
        return {}, {}
    ids = df_clients["id"].astype(str).str.strip()
    etapa = (
        dict(zip(ids, df_clients["etapa_actual"]))
        if "etapa_actual" in df_clients.columns else {}
    )
    motivo = (
        dict(zip(ids, df_clients["devolver_oportunidad"]))
        if "devolver_oportunidad" in df_clients.columns else {}
    )
    return etapa, motivo


def compute_probabilidad_etapa8(
    df_en_riesgo: pd.DataFrame,
    df_logs_e8: pd.DataFrame,
    df_clients: pd.DataFrame,
) -> Dict[str, Any]:
    """Riesgo de caer a la etapa 8 durante el periodo.

    Argumentos:
        df_en_riesgo: oportunidades con vida en el periodo —creadas en él o
                      arrastradas de meses anteriores y todavía sin cerrar—. Es
                      el denominador.
        df_logs_e8:   transiciones a la etapa 8 **con fecha en el periodo**. Es
                      el numerador, ya depurado de motivos ajenos a la gestión.
        df_clients:   estado actual (`id`, `etapa_actual`, `devolver_oportunidad`),
                      de donde se lee el motivo de cada devolución.
    """
    total = len(df_en_riesgo)
    if total == 0 or df_logs_e8 is None or df_logs_e8.empty:
        return _resultado_vacio(total)

    clave = _clave_oportunidad(df_logs_e8)
    # El numerador se recorta a la población del denominador: un movimiento de
    # una oportunidad que no consta viva en el periodo no puede sumar riesgo
    # sobre una base que no la incluye.
    en_riesgo = set(df_en_riesgo["id"].astype(str).str.strip())
    sub = df_logs_e8[df_logs_e8[clave].astype(str).str.strip().isin(en_riesgo)]
    if sub.empty:
        return _resultado_vacio(total)

    cids = sub[clave].astype(str).str.strip()
    transiciones = len(sub)
    clientes = int(cids.nunique())
    reincidentes = int((cids.value_counts() > 1).sum())

    # El motivo vive en la oportunidad, no en el log, y sólo es fiable mientras
    # ésta siga en la etapa 8: en cuanto se mueve, Odoo lo sobrescribe.
    etapa_actual, motivo_por_cliente = _mapas_de_cliente(df_clients)

    excepciones = _motivos_excepcion()
    con_motivo: Dict[str, int] = defaultdict(int)
    de_gestion: Dict[str, int] = defaultdict(int)
    sin_motivo: Dict[str, int] = defaultdict(int)

    origenes = (
        sub["etapa_anterior"] if "etapa_anterior" in sub.columns
        else pd.Series([""] * transiciones, index=sub.index)
    )
    for cid, origen in zip(cids, origenes):
        origen = str(origen) if pd.notna(origen) else ""
        motivo = normalize_text(motivo_por_cliente.get(cid))
        legible = etapa_actual.get(cid) == ETAPA8_KEY and motivo != ""
        if not legible:
            sin_motivo[origen] += 1
            continue
        con_motivo[origen] += 1
        if motivo not in excepciones:
            de_gestion[origen] += 1

    tasas, tasa_global = _tasas_de_gestion(con_motivo, de_gestion)
    estimadas = int(round(sum(
        n * tasas.get(origen, tasa_global) for origen, n in sin_motivo.items()
    )))

    observadas_gestion = sum(de_gestion.values())
    count_gestion = observadas_gestion + estimadas

    return {
        "total_en_riesgo": total,
        "count_devueltos_e8": count_gestion,
        "pct_devueltos_e8": round(count_gestion / total * 100, 2),
        "count_devueltos_e8_bruto": transiciones,
        "pct_devueltos_e8_bruto": round(transiciones / total * 100, 2),
        "e8_devueltos_excepcion": transiciones - count_gestion,
        "e8_devueltos_con_motivo": sum(con_motivo.values()),
        "e8_devueltos_sin_motivo": sum(sin_motivo.values()),
        "e8_devueltos_estimados": estimadas,
        "e8_clientes_devueltos": clientes,
        "e8_reincidentes": reincidentes,
    }
