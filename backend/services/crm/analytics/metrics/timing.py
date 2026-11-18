"""Cuanto tarda el embudo: tiempos de cierre y permanencia por etapa.

Dos preguntas distintas y una trampa entre ellas. El log solo registra
**salidas**, asi que medir solo sobre el deja fuera exactamente los casos
lentos: los que siguen ahi. Por eso, junto al tiempo de salida de cada etapa,
se calcula aparte la estancia de lo que todavia no ha salido, y se publican las
dos cosas sin mezclarlas.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..config import (
    KEY_SALES_STAGES,
    STAGE8_KEY,
    STAGE_FLOW,
    STAGE_ORDER,
    STAGE_TIME_INSTANT_THRESHOLD_H,
    STAGE_TIME_MIN_DURATION_H,
    STAGE_TIME_MIN_SAMPLE,
    STAGE_TIME_WINSOR_P,
    STAGES_WITHOUT_WAIT,
)


def _compute_stats_distribution(series: pd.Series) -> dict[str, float]:
    """Promedio, mediana, percentiles y dispersion de una serie de horas.

    Incluye `pct_excede_promedio`, que es lo que delata una distribucion con cola:
    si muy pocos casos superan la media, la media la esta marcando la cola.
    """
    s = series.dropna()
    s = s[s >= 0]
    n = len(s)

    if n == 0:
        return {
            "promedio": 0.0,
            "mediana": 0.0,
            "p25": 0.0,
            "p75": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std": 0.0,
            "pct_excede_promedio": 0.0,
        }

    average = float(s.mean())
    median = float(s.median())
    p25 = float(s.quantile(0.25))
    p75 = float(s.quantile(0.75))
    min_val = float(s.min())
    max_val = float(s.max())
    std_val = float(s.std(ddof=0)) if n > 1 else 0.0

    pct_above_avg = round(float((s > average).sum() / n) * 100, 2)

    return {
        "promedio": round(average, 2),
        "mediana": round(median, 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "min": round(min_val, 2),
        "max": round(max_val, 2),
        "std": round(std_val, 2),
        "pct_excede_promedio": pct_above_avg,
    }


def _total_duration(df: pd.DataFrame) -> pd.Series:
    """La columna de duración del DataFrame, o una serie vacía si no la trae."""
    if df.empty or "duracion_total_horas" not in df.columns:
        return pd.Series(dtype=float)
    return df["duracion_total_horas"]


def compute_close_times(
    df_won: pd.DataFrame,
    df_lost: pd.DataFrame
) -> dict[str, dict[str, float]]:
    """Las tres distribuciones de duración de una cohorte.

    `cierre` es el universo cerrado —ganados y perdidos juntos—, no el promedio
    de las otras dos: una cohorte con muchas más pérdidas que instalaciones pesa
    hacia la pérdida, que es justo lo que hace comparable el dato entre periodos.
    Los pendientes quedan fuera: todavía no tienen duración de cierre.
    """
    won_dur = _total_duration(df_won)
    lost_dur = _total_duration(df_lost)
    close_duration = pd.concat([won_dur, lost_dur], ignore_index=True)

    return {
        "instalacion": _compute_stats_distribution(won_dur),
        "perdida": _compute_stats_distribution(lost_dur),
        "cierre": _compute_stats_distribution(close_duration),
    }


# --- Tiempo por etapa -------------------------------------------------------

_FLOW_INDEX = {e: i for i, e in enumerate(STAGE_FLOW)}


def _winsorized_mean(s: pd.Series) -> tuple[float, float, int]:
    """Promedio con la cola superior recortada al percentil de configuración.

    Devuelve `(promedio, corte, n_recortados)`. El caso extremo no se descarta
    —seguiría contando en `total_movimientos` y falsearía la muestra— sino que
    entra valiendo el corte, así que el promedio sigue estando sobre las N
    salidas reales de la etapa.
    """
    if s.empty:
        return 0.0, 0.0, 0

    cutoff = float(s.quantile(STAGE_TIME_WINSOR_P))
    n_trimmed = int((s > cutoff).sum())
    return float(s.clip(upper=cutoff).mean()), cutoff, n_trimmed


def _classify_move(source: str, target: Any) -> str:
    """El sentido de una salida de etapa, desde el punto de vista del embudo.

    La etapa 8 va después de la 7 en `STAGE_ORDER`, así que el orden por sí solo
    leería una devolución como un avance: el destino se resuelve primero por
    nombre y sólo después por posición dentro de `STAGE_FLOW`.
    """
    if not isinstance(target, str) or target not in STAGE_ORDER:
        return "otro"
    if target == STAGE8_KEY:
        return "devolucion"

    i_source = _FLOW_INDEX.get(source)
    i_target = _FLOW_INDEX.get(target)
    if i_source is None or i_target is None:
        # Etapas 9, 10 y `perdido`: la oportunidad sale del embudo sin avanzar
        # ni volver a una cola de trabajo anterior.
        return "otro"

    return "avance" if i_target > i_source else "retorno"


def _stats_outcome(group: pd.DataFrame, direction: str, total: int) -> dict[str, float]:
    """Promedio, mediana y peso de un desenlace dentro de una etapa."""
    sub = group.loc[group["sentido"] == direction, "duracion_horas"]
    n = len(sub)
    if n == 0:
        return {"movimientos": 0, "pct": 0.0, "promedio_horas": 0.0, "mediana_horas": 0.0}

    return {
        "movimientos": n,
        "pct": round(n / total * 100, 2) if total > 0 else 0.0,
        "promedio_horas": round(float(sub.mean()), 2),
        "mediana_horas": round(float(sub.median()), 2),
    }




def compute_stage_stays(
    df_clients: pd.DataFrame,
    df_logs: pd.DataFrame,
    now: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Cuánto lleva en su etapa cada oportunidad que no ha salido de ella.

    El log sólo registra salidas, así que medir sólo sobre él deja fuera
    exactamente los casos lentos: los que siguen ahí. Esta función los recupera
    midiendo la estancia en curso contra un corte:

    - con `fecha_cierre`, la oportunidad murió (o se ganó) dentro de la etapa y
      el corte es esa fecha: la estancia está terminada y el dato no se mueve;
    - sin `fecha_cierre`, la oportunidad sigue viva y el corte es AHORA, así que
      el dato envejece en cada ejecución. Es lo que se quiere —tres días
      estancado son tres días— pero implica que reanalizar un mes antiguo no
      devuelve el mismo número que la vez anterior.

    La entrada a la etapa se toma del último movimiento hacia ella; si no hay
    log —una oportunidad que nunca se movió— se cae a `ultima_actualizacion` y
    de ahí a `creado_el`.

    Devuelve una fila por oportunidad con `client_id`, `etapa`, `horas`,
    `cerrada`, `periodo_entrada` y `fecha_entrada`, para que el análisis la
    reparta por periodo y por dimensión igual que reparte los logs.
    `fecha_entrada` es lo que permite además recortarla por día, que es lo que
    necesitan los cortes diarios del periodo.
    """
    columns = [
        "client_id", "etapa", "horas", "cerrada", "periodo_entrada", "fecha_entrada",
    ]
    if df_clients.empty or not {"id", "etapa_actual"} <= set(df_clients.columns):
        return pd.DataFrame(columns=columns)

    now = now if now is not None else pd.Timestamp.now()

    measurable_stages = [e for e in STAGE_ORDER if e not in STAGES_WITHOUT_WAIT]
    df = df_clients[df_clients["etapa_actual"].isin(measurable_stages)].copy()
    if df.empty:
        return pd.DataFrame(columns=columns)

    df["client_id"] = df["id"].astype(str)

    # Entrada a la etapa actual: el movimiento más reciente que la tiene como
    # destino. Por construcción no puede haber una salida posterior —habría
    # cambiado `etapa_actual`—, así que esta estancia no solapa con ninguna de
    # las que ya miden los logs.
    log_entry = pd.Series(pd.NaT, index=df.index)
    # La llegada se busca por la oportunidad que el log declara en su
    # Iniciativa/ID; `client_id` sólo cubre los logs anteriores a esa
    # resolución.
    col_op = "oportunidad_id" if "oportunidad_id" in df_logs.columns else "client_id"
    if not df_logs.empty and {col_op, "nueva_etapa", "created_at_log"} <= set(df_logs.columns):
        arrivals = df_logs[[col_op, "nueva_etapa", "created_at_log"]].copy()
        arrivals = arrivals.rename(columns={col_op: "client_id"})
        arrivals["client_id"] = arrivals["client_id"].astype(str)
        arrivals = arrivals[arrivals["created_at_log"].notna()]

        last = (
            arrivals.groupby(["client_id", "nueva_etapa"])["created_at_log"]
            .max()
            .rename("entrada_log")
            .reset_index()
        )
        df = df.merge(
            last,
            left_on=["client_id", "etapa_actual"],
            right_on=["client_id", "nueva_etapa"],
            how="left",
        )
        log_entry = df["entrada_log"]

    entry = pd.to_datetime(log_entry, errors="coerce")
    for backup in ("ultima_actualizacion", "creado_el"):
        if backup in df.columns:
            entry = entry.fillna(pd.to_datetime(df[backup], errors="coerce"))

    close = (
        pd.to_datetime(df["fecha_cierre"], errors="coerce")
        if "fecha_cierre" in df.columns
        else pd.Series(pd.NaT, index=df.index)
    )
    cutoff = close.fillna(now)

    hours = (cutoff - entry).dt.total_seconds() / 3600

    out = pd.DataFrame({
        "client_id": df["client_id"],
        "etapa": df["etapa_actual"],
        "horas": hours,
        "cerrada": close.notna(),
        "periodo_entrada": entry.dt.strftime("%Y-%m"),
        "fecha_entrada": entry,
    })

    # Una estancia negativa es un cierre anterior a la entrada a la etapa: ruido
    # de captura, no un dato que se pueda promediar.
    return out[out["horas"].notna() & (out["horas"] >= 0)].reset_index(drop=True)


def _stats_tenure(sub: pd.DataFrame) -> dict[str, Any]:
    """Las estancias sin salida de una etapa, abiertas y cerradas por separado."""
    n = len(sub)
    if n == 0:
        return {
            "total": 0,
            "abiertas": 0,
            "cerradas_en_etapa": 0,
            "promedio_horas": 0.0,
            "promedio_ajustado_horas": 0.0,
            "mediana_horas": 0.0,
            "p75_horas": 0.0,
            "max_horas": 0.0,
        }

    h = sub["horas"]
    stats = _compute_stats_distribution(h)
    adjusted_average, _, _ = _winsorized_mean(h)
    n_closed = int(sub["cerrada"].sum())

    return {
        "total": n,
        # Envejecen contra el reloj: es la parte del dato que cambia entre
        # ejecuciones.
        "abiertas": n - n_closed,
        # Terminadas contra su fecha de cierre: reproducibles.
        "cerradas_en_etapa": n_closed,
        "promedio_horas": stats["promedio"],
        "promedio_ajustado_horas": round(adjusted_average, 2),
        "mediana_horas": stats["mediana"],
        "p75_horas": stats["p75"],
        "max_horas": stats["max"],
    }


def _stats_combined(
    departures: pd.Series,
    stays: pd.Series,
    cutoff_iso: str | None,
) -> dict[str, Any]:
    """Salidas y estancias en curso juntas: la cifra sin sesgo de supervivencia.

    Es la respuesta a "cuánto tarda esta etapa" que no deja fuera lo lento por
    el hecho de seguir ahí. Las dos partes son disjuntas —una estancia terminada
    tiene su movimiento de salida y la que no ha terminado no lo tiene—, así que
    se concatenan sin doble conteo.
    """
    everything = pd.concat([departures, stays], ignore_index=True)
    n = len(everything)
    if n == 0:
        return {
            "total": 0,
            "promedio_horas": 0.0,
            "promedio_ajustado_horas": 0.0,
            "mediana_horas": 0.0,
            "p75_horas": 0.0,
            "pct_sin_salida": 0.0,
            "corte": cutoff_iso,
        }

    stats = _compute_stats_distribution(everything)
    adjusted_average, _, _ = _winsorized_mean(everything)

    return {
        "total": n,
        "promedio_horas": stats["promedio"],
        "promedio_ajustado_horas": round(adjusted_average, 2),
        "mediana_horas": stats["mediana"],
        "p75_horas": stats["p75"],
        # Cuánto de la cifra viene de oportunidades que todavía no han salido.
        "pct_sin_salida": round(len(stays) / n * 100, 2),
        "corte": cutoff_iso,
    }


def _dedupe_moves(df: pd.DataFrame) -> pd.DataFrame:
    """Un movimiento por fila, sin perder ninguno.

    El análisis cruza los logs con los clientes para leer el motivo de
    devolución, y un cruce que se ensanche contaría el mismo movimiento dos
    veces. La clave para desduplicar es la del propio log (`id`, la primaria de
    `crm_logs`).

    OJO: `entrada_id` NO sirve. Es el `Entradas de Tiempo/Iniciativa/ID` del CSV
    de Odoo, que es el id de la oportunidad: se repite en cada uno de sus
    movimientos, así que usarlo dejaría una única transición por oportunidad.

    Sin clave propia se cae a la identidad completa del movimiento, que puede
    borrar dos transiciones legítimamente idénticas —mismo origen, mismo
    destino, mismo instante y misma duración— pero es lo más fino disponible.
    """
    if "id" in df.columns:
        return df.drop_duplicates(subset=["id"])

    identity = [
        c
        for c in ("oportunidad_id", "client_id", "etapa_anterior", "nueva_etapa",
                  "created_at_log", "duracion_horas")
        if c in df.columns
    ]
    return df.drop_duplicates(subset=identity) if identity else df


def compute_time_by_stage(
    df_logs: pd.DataFrame,
    df_stays: pd.DataFrame | None = None,
    now: pd.Timestamp | None = None,
) -> list[dict[str, Any]]:
    """Cuánto tarda una oportunidad en salir de cada etapa.

    La cifra principal es la media simple de las salidas de la etapa: la suma de
    `duracion_horas` de todos los movimientos que salen de ella, dividida entre
    el número de esos movimientos. Se publican `tiempo_total_horas` y
    `total_movimientos` para poder auditarla contra el log.

    La medida base son los movimientos, agrupados por `etapa_anterior`: la
    duración que trae el log es el tiempo que la oportunidad pasó en la etapa de
    la que sale. Sobre eso:

    - Se descartan los orígenes que no son cola de trabajo (`STAGES_WITHOUT_WAIT`)
      y cualquier etapa fuera del catálogo, que antes entraban como un grupo
      `desconocido` sin significado.
    - Se descartan los movimientos de duración exactamente 0 (por debajo de
      `STAGE_TIME_MIN_DURATION_H`, un minuto): son dos escrituras del mismo
      instante, no una estancia, y sólo inflan el divisor. Van a
      `movimientos_nulos`. Un movimiento corto pero real —minutos, media hora—
      sí cuenta entero: es tiempo que la oportunidad pasó en la etapa.
    - Se deduplica por la clave del propio log (`id`), NO por `entrada_id`:
      `entrada_id` es el `Iniciativa/ID` del CSV, que es el id de la oportunidad
      y por tanto se repite en todos sus movimientos. Deduplicar por él dejaría
      una sola transición por oportunidad.
    - Junto al promedio crudo se publica uno ajustado (winsorizado), porque el
      crudo lo domina la cola de oportunidades olvidadas meses en una etapa.
    - Cada etapa se desglosa por desenlace: el tiempo hasta avanzar, hasta
      volver atrás y hasta acabar devuelto a la etapa 8 son tres cosas distintas
      y mezclarlas es lo que hacía ilegible el número.

    `df_stays` (de `compute_stage_stays`) no entra en la cifra
    principal: se publica al lado, en `permanencia`, como contexto. Sólo salir
    de una etapa genera log, así que el promedio de salidas no ve lo que sigue
    atascado; `permanencia` dice cuánto es eso y cuánto lleva, sin mezclarlo con
    el tiempo medido. `combinado` conserva las dos poblaciones juntas para quien
    quiera la lectura sin sesgo de supervivencia.

    Una etapa donde nadie ha salido todavía sí produce fila: su tiempo son sus
    estancias en curso, y es justo la etapa que el cálculo anterior ocultaba.
    """
    cutoff_iso = (now if now is not None else pd.Timestamp.now()).isoformat(timespec="minutes")

    measurable_stages = [e for e in STAGE_ORDER if e not in STAGES_WITHOUT_WAIT]

    df_valid = pd.DataFrame()
    n_nulls_by_stage: dict[str, int] = {}
    if not df_logs.empty and "duracion_horas" in df_logs.columns:
        df = _dedupe_moves(df_logs)

        in_catalog = df[
            df["duracion_horas"].notna() & df["etapa_anterior"].isin(measurable_stages)
        ].copy()

        # Duración cero: dos escrituras del mismo instante, no una estancia. Se
        # cuentan por etapa para poder reportarlas, pero no entran ni al
        # numerador ni al divisor del promedio. Desde un minuto, el movimiento
        # cuenta entero por corto que sea.
        is_stay = in_catalog["duracion_horas"] >= STAGE_TIME_MIN_DURATION_H
        n_nulls_by_stage = (
            in_catalog.loc[~is_stay, "etapa_anterior"].value_counts().to_dict()
        )
        df_valid = in_catalog[is_stay].copy()

    if not df_valid.empty:
        if "nueva_etapa" in df_valid.columns:
            df_valid["sentido"] = [
                _classify_move(source, target)
                for source, target in zip(df_valid["etapa_anterior"], df_valid["nueva_etapa"])
            ]
        else:
            df_valid["sentido"] = "otro"

    df_perm = (
        df_stays
        if df_stays is not None and not df_stays.empty
        else pd.DataFrame(columns=["client_id", "etapa", "horas", "cerrada"])
    )
    df_perm = df_perm[df_perm["etapa"].isin(measurable_stages)]

    # Marco vacío bien formado: una etapa que sólo tiene estancias en curso pasa
    # igualmente por el desglose por desenlace, que necesita las columnas.
    without_exits = (
        df_valid.iloc[0:0]
        if not df_valid.empty
        else pd.DataFrame(columns=["client_id", "duracion_horas", "sentido"])
    )

    exits_by_stage = (
        dict(tuple(df_valid.groupby("etapa_anterior", sort=False))) if not df_valid.empty else {}
    )
    perm_by_stage = dict(tuple(df_perm.groupby("etapa", sort=False))) if not df_perm.empty else {}

    stage_order_map = {e: i for i, e in enumerate(STAGE_ORDER)}
    records = []

    # Las etapas que sólo aportaron movimientos de duración cero también
    # producen fila: sin ellas la etapa desaparecería del informe sin decir por
    # qué, y el motivo (todo su movimiento fue instantáneo) es la lectura.
    for stage in set(exits_by_stage) | set(perm_by_stage) | set(n_nulls_by_stage):
        group = exits_by_stage.get(stage, without_exits)
        perm = perm_by_stage.get(stage, df_perm.iloc[0:0])

        h = group["duracion_horas"] if not group.empty else pd.Series(dtype=float)
        n = len(h)

        stats = _compute_stats_distribution(h)
        adjusted_average, cutoff, n_trimmed = _winsorized_mean(h)
        n_snapshots = int((h < STAGE_TIME_INSTANT_THRESHOLD_H).sum())
        n_nulls = int(n_nulls_by_stage.get(stage, 0))

        # `oportunidad_id` lo resuelve el análisis desde `entrada_id`
        # (Iniciativa/ID del log); `client_id` queda como respaldo.
        col_op = "oportunidad_id" if "oportunidad_id" in group.columns else "client_id"
        exit_ids = set(group[col_op].astype(str)) if col_op in group.columns else set()
        ids_perm = set(perm["client_id"].astype(str)) if not perm.empty else set()
        # Una oportunidad puede haber salido de la etapa y haber vuelto a entrar,
        # así que las dos poblaciones se unen en vez de sumarse.
        n_opportunities = len(exit_ids | ids_perm) or n

        tenure = _stats_tenure(perm)
        combined = _stats_combined(
            h,
            perm["horas"] if not perm.empty else pd.Series(dtype=float),
            cutoff_iso,
        )

        records.append({
            "etapa": stage,
            "es_clave": stage in KEY_SALES_STAGES,
            "total_movimientos": n,
            "total_oportunidades": n_opportunities,
            "movimientos_por_oportunidad": (
                round(n / n_opportunities, 2) if n_opportunities > 0 else 0.0
            ),
            # La muestra que sostiene la cifra principal son las salidas: es lo
            # que se suma y se divide.
            "muestra_suficiente": n >= STAGE_TIME_MIN_SAMPLE,

            # Numerador y denominador del promedio, publicados aparte para que
            # la cifra sea auditable contra el log sin rehacer el cálculo.
            "tiempo_total_horas": round(float(h.sum()), 2) if n > 0 else 0.0,
            "tiempo_promedio_horas": stats["promedio"],
            "tiempo_promedio_ajustado_horas": round(adjusted_average, 2),
            "tiempo_corte_outlier_horas": round(cutoff, 2),
            "total_outliers": n_trimmed,
            "pct_outliers": round(n_trimmed / n * 100, 2) if n > 0 else 0.0,

            "tiempo_mediana_horas": stats["mediana"],
            "tiempo_p25_horas": stats["p25"],
            "tiempo_p75_horas": stats["p75"],
            "tiempo_min_horas": stats["min"],
            "tiempo_max_horas": stats["max"],
            "tiempo_std_horas": stats["std"],
            "pct_excede_promedio": stats["pct_excede_promedio"],

            # Movimientos casi instantáneos: correcciones de etapa y cargas
            # masivas que no son gestión pero sí hunden el promedio. Cuentan en
            # el promedio —son tiempo real—, se reportan para leerlo con reserva.
            "movimientos_instantaneos": n_snapshots,
            "pct_instantaneos": round(n_snapshots / n * 100, 2) if n > 0 else 0.0,

            # Descartados por durar exactamente 0: fuera del promedio, contados
            # aquí para que la diferencia con el log sea explicable.
            "movimientos_nulos": n_nulls,

            "avance": _stats_outcome(group, "avance", n),
            "retorno": _stats_outcome(group, "retorno", n),
            "devolucion": _stats_outcome(group, "devolucion", n),

            "permanencia": tenure,
            "combinado": combined,
        })

    records.sort(key=lambda r: stage_order_map.get(r["etapa"], 999))
    return records
