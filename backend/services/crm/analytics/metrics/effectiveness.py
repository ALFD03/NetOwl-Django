"""Efectividad por fila del embudo de CRM.

**La unidad es la transición, no el cliente.** Cada vez que una oportunidad sale
de la etapa hacia adelante se abre un ciclo, y ese ciclo termina bien o mal. Un
cliente que pasó cuatro veces por factibilidad antes de instalar deja tres
ciclos fallidos y uno bueno: contar por cliente único diría "instaló, 100%" y
escondería justo lo que hay que ver, porque casi todos acaban instalando.

Dos fuentes, con alcances distintos, y conviene no confundirlas:

* `crm_logs` guarda **movimientos** entre etapas. Es historia completa y
  auditable: avances, retornos, devoluciones a la etapa 8 (con la etapa de
  origen) e instalaciones.
* `crm_clients` guarda el **estado actual**. La pérdida sólo existe aquí: no hay
  ningún movimiento a "perdido" en el log, así que una oportunidad que cayó en
  perdido y volvió a salir no deja rastro. Igual con los motivos:
  `devolver_oportunidad` sólo se lee mientras la oportunidad siga en la etapa 8,
  y `motivo_perdida` mientras siga perdida.

Desenlace de un ciclo, leído sobre todo el historial del cliente:

    exitoso   llegó a instalarse sin volver
    retorno   volvió a la etapa: hubo que repetir el trabajo
    devuelto  salió del embudo a la etapa 8
    perdido   la oportunidad se dio de baja (viene del estado, no del log)

Quién paga cada fallo:

* el **retorno** lo paga la etapa que mandó al cliente hacia adelante;
* la **devolución** la paga la etapa que indica su motivo. El motivo sólo es
  legible en un tercio de los casos —los que siguen en la etapa 8—, así que el
  resto se estima con la tasa de culpa que la propia fila muestra en los ciclos
  donde sí se puede leer. Es una estimación y viaja en su propio campo,
  `devoluciones_estimadas`, separada del dato duro;
* la **pérdida** la paga la etapa donde murió la oportunidad, salvo si murió en
  la etapa 8, que no es de nadie y se resuelve por motivo. Se cobra una sola
  vez, en el periodo de su `fecha_cierre`.

Invariantes del resultado:

    total_salidas = exitosos + fallidos + retornan
    fallidos      = retornos_penalizados + devoluciones_atribuidas
                    + devoluciones_estimadas + perdidas_atribuidas
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import pandas as pd

from core.utils import normalize_text

from ..config import (
    COMEBACK_ATTRIBUTION,
    E8_IMPUTATION_MIN_SAMPLE,
    EFFECTIVENESS_RULES,
    LOSS_ATTRIBUTION_BY_STAGE,
    LOSS_ATTRIBUTION_REASON,
    LOSS_BY_REASON_STAGES,
    LOSS_EXCEPTION_REASONS,
    STAGE8_ATTRIBUTION,
    STAGE8_ATTRIBUTION_FALLBACK,
    STAGE8_EXCEPTION_REASONS,
    STAGE8_KEY,
)

logger = logging.getLogger(__name__)

OUTCOME_SUCCESS = "success"
OUTCOME_RETURNED = "devuelto"
OUTCOME_COMEBACK = "return"

# Marca del reparto estimado: ningún ciclo concreto lo tiene, es un agregado.
_NO_OWNER = "__excluido__"

_REQUIRED_COLUMNS = ("client_id", "etapa_anterior", "nueva_etapa", "created_at_log")
_CYCLE_COLUMNS = ("client_id", "forward_to", "desenlace", "culpable")

# Distingue "esta etapa no tiene regla para el motivo" de "la regla no exige
# destino de avance".
_NO_RULE = object()


def _empty_row(stage_row: str) -> dict[str, Any]:
    """Fila neutra: la etapa no registró ciclos ni pérdidas en el periodo."""
    return {
        "etapa": stage_row,
        "total_salidas": 0,
        "exitosos": 0,
        "fallidos": 0,
        "retornan": 0,
        "efectividad_pct": 0.0,
        # Desglose de `fallidos`
        "retornos_penalizados": 0,
        "devoluciones_atribuidas": 0,
        "devoluciones_estimadas": 0,
        "perdidas_atribuidas": 0,
        # Fuera del denominador
        "sin_resolver": 0,
        "devoluciones_otra_fila": 0,
        "devoluciones_sin_motivo": 0,
        "perdidas_otra_fila": 0,
        "perdidas_otro_periodo": 0,
        "perdidas_tras_instalar": 0,
        # Cuánto trabajo repetido hay detrás de los ciclos
        "clientes": 0,
        "ciclos_por_cliente": 0.0,
    }


# --- Preparación de los movimientos ----------------------------------------

def _prepare_history(
    df_period: pd.DataFrame,
    df_history: pd.DataFrame | None,
) -> pd.DataFrame | None:
    """Ordena el historial y marca en `_en_periodo` las filas del periodo.

    `df_historial` debe traer las mismas oportunidades que `df_period` con
    todos sus movimientos; de ahí se leen los desenlaces que caen fuera del
    periodo. Si no llega, o no trae la clave `id`, se mira sólo el periodo.
    """
    if df_period is None or df_period.empty:
        return None

    missing = [c for c in _REQUIRED_COLUMNS if c not in df_period.columns]
    if missing:
        logger.warning("Efectividad: faltan columnas %s en los logs del periodo", missing)
        return None

    uses_history = (
        df_history is not None
        and not df_history.empty
        and "id" in df_history.columns
        and "id" in df_period.columns
    )
    if uses_history:
        base = df_history.copy()
        base["_en_periodo"] = base["id"].isin(set(df_period["id"]))
    else:
        if df_history is not None and not df_history.empty:
            logger.warning(
                "Efectividad: el historial no trae la columna 'id'; los desenlaces "
                "se resolverán sólo dentro del periodo."
            )
        base = df_period.copy()
        base["_en_periodo"] = True

    without_date = int(base["created_at_log"].isna().sum())
    if without_date:
        # Sin fecha no se puede ordenar el movimiento ni saber qué vino después.
        logger.warning("Efectividad: %s movimientos sin fecha quedaron fuera del cálculo", without_date)
        base = base[base["created_at_log"].notna()]

    if base.empty:
        return None

    order = ["client_id", "created_at_log"]
    if "id" in base.columns:
        # Desempate estable cuando dos movimientos comparten fecha.
        order.append("id")
    return base.sort_values(order, kind="mergesort")


def _classify_cycles(
    hist: pd.DataFrame,
    rule: dict[str, Any],
    return_row: pd.Series,
) -> pd.DataFrame:
    """Un ciclo por cada salida hacia adelante ocurrida en el periodo.

    Sin deduplicar por cliente: si la misma oportunidad salió cuatro veces de la
    etapa, son cuatro ciclos y cada uno responde por cómo terminó.
    """
    term_map = rule["term_map"]

    # Desenlace posterior a cada movimiento, sobre todo el historial del cliente.
    terminal = hist["nueva_etapa"].where(hist["nueva_etapa"].isin(list(term_map))).map(term_map)
    upcoming = terminal.groupby(hist["client_id"], sort=False).bfill()

    advances = (
        hist["etapa_anterior"].isin(rule["origen"])
        & hist["nueva_etapa"].isin(rule["forward"])
        & hist["_en_periodo"]
    )
    if not advances.any():
        return pd.DataFrame(columns=list(_CYCLE_COLUMNS))

    # Quién paga la devolución que cerró el ciclo, si es que lo cerró una.
    culprit = return_row.groupby(hist["client_id"], sort=False).bfill()

    return pd.DataFrame(
        {
            "client_id": hist.loc[advances, "client_id"].astype(str).to_numpy(),
            "forward_to": hist.loc[advances, "nueva_etapa"].to_numpy(),
            "desenlace": upcoming[advances].to_numpy(),
            "culpable": culprit[advances].to_numpy(),
        }
    )


# --- Motivos ----------------------------------------------------------------

def _reasons_table(rules: list[dict[str, Any]], row_key: str) -> dict[str, str]:
    """Aplana un catálogo de motivos a `motivo normalizado -> fila`."""
    table: dict[str, str] = {}
    for rule in rules:
        for reason in rule["motivos"]:
            table.setdefault(normalize_text(reason), rule[row_key])
    return table


def _return_rules() -> tuple[list[str], dict[str, dict[str, Any]]]:
    """Orden de prioridad y motivos aceptados por cada etapa."""
    order: list[str] = []
    by_stage: dict[str, dict[str, Any]] = defaultdict(dict)
    for rule in STAGE8_ATTRIBUTION:
        stage = rule["etapa"]
        if stage not in order:
            order.append(stage)
        for reason in rule["motivos"]:
            by_stage[stage][normalize_text(reason)] = rule.get("forward_to")
    return order, by_stage


def _attributable(stage: str, reason: str, target: Any, rules: dict[str, dict[str, Any]]) -> bool:
    """¿La etapa responde por esta devolución?"""
    requerido = rules.get(stage, {}).get(reason, _NO_RULE)
    if requerido is _NO_RULE:
        return False
    if requerido is None:
        return target is not None
    if isinstance(requerido, (list, tuple, set)):
        return target in requerido
    return target == requerido


# --- Atribución de pérdidas -------------------------------------------------

def attribute_lost(df_lost: pd.DataFrame | None) -> dict[str, str | None]:
    """Decide qué fila paga cada oportunidad perdida.

    Devuelve `client_id -> fila` (o `None` cuando la pérdida no es imputable).
    Quien murió dentro del embudo lo paga la etapa donde murió; quien murió en
    la etapa 8 se resuelve por motivo, porque la etapa 8 no es de nadie.
    """
    if df_lost is None or df_lost.empty or "etapa_actual" not in df_lost.columns:
        return {}

    by_loss = _reasons_table(LOSS_ATTRIBUTION_REASON, "fila")
    by_return = _reasons_table(STAGE8_ATTRIBUTION, "etapa")
    exceptions = {normalize_text(m) for m in LOSS_EXCEPTION_REASONS}
    exceptions |= {normalize_text(m) for m in STAGE8_EXCEPTION_REASONS}

    columns = df_lost.columns
    lost_col = "motivo_perdida" if "motivo_perdida" in columns else None
    return_col = "devolver_oportunidad" if "devolver_oportunidad" in columns else None

    attribution: dict[str, str | None] = {}
    for row in df_lost.itertuples(index=False):
        cid = str(row.id)
        stage = row.etapa_actual

        if stage not in LOSS_BY_REASON_STAGES:
            attribution[cid] = LOSS_ATTRIBUTION_BY_STAGE.get(stage, STAGE8_ATTRIBUTION_FALLBACK)
            continue

        # Murió en la etapa 8: manda el motivo. Primero el de pérdida, que es la
        # decisión final sobre la oportunidad; si no dice nada, el de devolución,
        # que explica por qué llegó hasta ahí.
        m_lost = normalize_text(getattr(row, lost_col)) if lost_col else ""
        m_return = normalize_text(getattr(row, return_col)) if return_col else ""
        if m_lost in exceptions or (not m_lost and m_return in exceptions):
            attribution[cid] = None
            continue

        stage_row = by_loss.get(m_lost) or by_return.get(m_return)
        attribution[cid] = stage_row or STAGE8_ATTRIBUTION_FALLBACK

    unknown = {f for f in attribution.values() if f is not None} - set(EFFECTIVENESS_RULES)
    if unknown:
        logger.warning("Efectividad: pérdidas atribuidas a filas inexistentes %s", sorted(unknown))
    return attribution


# --- Atribución de devoluciones --------------------------------------------

def _advance_targets(hist: pd.DataFrame) -> dict[tuple[str, str], str]:
    """`(cliente, etapa) -> primer destino al que la etapa lo mandó`.

    Es lo que comparan las reglas de ETAPA8_ATRIBUCION: un motivo técnico sólo
    es culpa de factibilidad si fue factibilidad quien mandó al cliente adelante.
    """
    targets: dict[tuple[str, str], str] = {}
    for cid, stage, target in zip(hist["client_id"], hist["etapa_anterior"], hist["nueva_etapa"]):
        targets.setdefault((str(cid), stage), target)
    return targets


def attribute_returns(hist: pd.DataFrame, current_stage: dict[str, str]) -> pd.Series:
    """Fila responsable de cada devolución a la etapa 8, alineada con `hist`.

    Sólo las devoluciones cuya oportunidad sigue en la etapa 8 traen motivo
    legible; ésas se resuelven con ETAPA8_ATRIBUCION. Las demás quedan en NaN
    —no se sabe de quién son— y el cálculo las estima después.
    `_NO_OWNER` marca los motivos de excepción, que no paga nadie.
    """
    is_return = hist["nueva_etapa"] == STAGE8_KEY
    stage_row = pd.Series(pd.NA, index=hist.index, dtype="object")
    if not is_return.any():
        return stage_row

    order, rules = _return_rules()
    exceptions = {normalize_text(m) for m in STAGE8_EXCEPTION_REASONS}
    col_reason = "devolver_oportunidad" if "devolver_oportunidad" in hist.columns else None
    if col_reason is None:
        return stage_row

    targets = _advance_targets(hist)
    sub = hist.loc[is_return]
    values = []
    for cid, raw_reason in zip(sub["client_id"], sub[col_reason]):
        cid = str(cid)
        # El motivo sólo es fiable mientras la oportunidad no se haya movido.
        if current_stage.get(cid) != STAGE8_KEY:
            values.append(pd.NA)
            continue
        reason = normalize_text(raw_reason)
        if not reason:
            values.append(pd.NA)
        elif reason in exceptions:
            values.append(_NO_OWNER)
        else:
            values.append(next(
                (e for e in order if _attributable(e, reason, targets.get((cid, e)), rules)),
                STAGE8_ATTRIBUTION_FALLBACK,
            ))
    stage_row.loc[is_return] = values
    return stage_row


# --- Cálculo principal ------------------------------------------------------

def _client_column(df: pd.DataFrame | None, col: str) -> dict[str, str]:
    """La columna con la que un frame se ata a su oportunidad."""
    if df is None or df.empty or col not in df.columns or "id" not in df.columns:
        return {}
    return {str(cid): str(v) for cid, v in zip(df["id"], df[col])}


def _only_lost(df_clients: pd.DataFrame | None) -> pd.DataFrame:
    """Oportunidades hoy perdidas, con lo necesario para atribuirlas."""
    if df_clients is None or df_clients.empty or "ganado" not in df_clients.columns:
        return pd.DataFrame()
    return df_clients[df_clients["ganado"] == "perdido"]


def _penalized_targets(sources: list[str]) -> set[str]:
    """Destinos cuyo retorno penaliza a la etapa que envió al cliente."""
    return {r["forward_to"] for r in COMEBACK_ATTRIBUTION if r["etapa"] in sources}


def compute_effectiveness(
    df_period: pd.DataFrame,
    df_history: pd.DataFrame | None = None,
    df_clients: pd.DataFrame | None = None,
    df_lost: pd.DataFrame | None = None,
) -> list[dict[str, Any]]:
    """Efectividad de cada fila de `EFFECTIVENESS_RULES` para un periodo.

    Argumentos:
        df_periodo:   movimientos del periodo.
        df_historial: los mismos clientes con todo su historial de movimientos.
        df_clientes:  estado actual (`id`, `ganado`, `etapa_actual`).
        df_perdidas:  oportunidades con `fecha_cierre` en el periodo y
                      `ganado = 'perdido'`, con `etapa_actual` y los motivos.

    Devuelve siempre una fila por etapa, aunque no haya habido movimiento.
    """
    losses_per_row: dict[str, set[str]] = defaultdict(set)
    for cid, stage_row in attribute_lost(df_lost).items():
        if stage_row is not None:
            losses_per_row[stage_row].add(cid)

    hist = _prepare_history(df_period, df_history)
    if hist is None:
        # Sin movimientos una etapa todavía puede cargar con pérdidas del mes.
        results = []
        for stage_row in EFFECTIVENESS_RULES:
            r = _empty_row(stage_row)
            r["perdidas_atribuidas"] = len(losses_per_row.get(stage_row, ()))
            r["fallidos"] = r["total_salidas"] = r["clientes"] = r["perdidas_atribuidas"]
            r["ciclos_por_cliente"] = 1.0 if r["clientes"] else 0.0
            results.append(r)
        return results

    won = _client_column(df_clients, "ganado")
    current_stage = _client_column(df_clients, "etapa_actual")
    lost = {cid for cid, g in won.items() if g == "perdido"}
    # La misma atribución sobre todas las pérdidas conocidas, cierren cuando
    # cierren: distingue "la paga otra etapa" de "la paga ésta, pero otro mes".
    total_losses = attribute_lost(_only_lost(df_clients))
    return_row = attribute_returns(hist, current_stage)

    results: list[dict[str, Any]] = []
    without_reason_by_row: dict[str, int] = {}
    for stage_row, rule in EFFECTIVENESS_RULES.items():
        r = _empty_row(stage_row)
        cycles = _classify_cycles(hist, rule, return_row)
        loaded = losses_per_row.get(stage_row, set())
        without_reason_by_row[stage_row] = 0

        if not cycles.empty:
            cid = cycles["client_id"]
            outcome = cycles["desenlace"]
            culprit = cycles["culpable"]
            paid_here = cid.isin(loaded)

            success = outcome == OUTCOME_SUCCESS
            comeback = outcome == OUTCOME_COMEBACK
            returned = outcome == OUTCOME_RETURNED
            is_open = outcome.isna()

            # Un retorno lo paga la etapa que mandó al cliente hacia un destino
            # que debía resolver y no resolvió.
            penalized = comeback & cycles["forward_to"].isin(_penalized_targets(rule["origen"]))
            # La devolución la paga quien diga el motivo, no siempre el origen.
            with_reason = returned & culprit.notna()

            r["exitosos"] = int(success.sum())
            r["retornos_penalizados"] = int(penalized.sum())
            r["retornan"] = int(comeback.sum()) - r["retornos_penalizados"]
            r["devoluciones_atribuidas"] = int((with_reason & (culprit == stage_row)).sum())
            r["devoluciones_otra_fila"] = int((with_reason & (culprit != stage_row)).sum())
            without_reason_by_row[stage_row] = int((returned & culprit.isna()).sum())

            # Ciclos abiertos: se cobran si la pérdida es de esta fila y de este
            # mes; si no, se reportan fuera del denominador.
            pending_here = cid.map(lambda c: total_losses.get(c) == stage_row)
            foreign_loss = is_open & ~paid_here & cid.isin(lost)
            r["perdidas_otro_periodo"] = int((foreign_loss & pending_here).sum())
            r["perdidas_otra_fila"] = int((foreign_loss & ~pending_here).sum())
            r["sin_resolver"] = int((is_open & ~paid_here & ~cid.isin(lost)).sum())

            # Una oportunidad que llegó a instalarse y se dio de baja después no
            # es un fallo del embudo de venta: se reporta, pero no se cobra.
            already_installed = loaded & set(cid[success])
            r["perdidas_tras_instalar"] = len(already_installed)
            loaded = loaded - already_installed

            r["clientes"] = int(cid.nunique())
            r["ciclos_por_cliente"] = round(len(cycles) / r["clientes"], 2)

        r["perdidas_atribuidas"] = len(loaded)
        results.append(r)

    # Las devoluciones sin motivo legible se estiman con la tasa de culpa que la
    # propia fila muestra en las que sí lo traen. Si no tiene muestra suficiente
    # se usa la tasa global. Va en su propio campo: es estimación, no dato.
    known = sum(r["devoluciones_atribuidas"] + r["devoluciones_otra_fila"] for r in results)
    global_rate = sum(r["devoluciones_atribuidas"] for r in results) / known if known else 0.0

    for r in results:
        pending = without_reason_by_row.get(r["etapa"], 0)
        if pending:
            sample = r["devoluciones_atribuidas"] + r["devoluciones_otra_fila"]
            rate = (
                r["devoluciones_atribuidas"] / sample
                if sample >= E8_IMPUTATION_MIN_SAMPLE
                else global_rate
            )
            r["devoluciones_sin_motivo"] = pending
            r["devoluciones_estimadas"] = int(round(pending * rate))

        r["fallidos"] = (
            r["retornos_penalizados"]
            + r["devoluciones_atribuidas"]
            + r["devoluciones_estimadas"]
            + r["perdidas_atribuidas"]
        )
        total = r["exitosos"] + r["fallidos"] + r["retornan"]
        r["total_salidas"] = total
        r["efectividad_pct"] = round(r["exitosos"] / total * 100, 2) if total else 0.0

    return results
