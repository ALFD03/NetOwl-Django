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
    E8_IMPUTACION_MIN_MUESTRA,
    EFECTIVIDAD_REGLAS,
    ETAPA8_ATRIBUCION,
    ETAPA8_ATRIBUCION_FALLBACK,
    ETAPA8_EXCEPTION_MOTIVOS,
    ETAPA8_KEY,
    PERDIDA_ATRIBUCION_MOTIVO,
    PERDIDA_ATRIBUCION_POR_ETAPA,
    PERDIDA_EXCEPTION_MOTIVOS,
    PERDIDA_POR_MOTIVO_ETAPAS,
    RETORNO_ATRIBUCION,
)

logger = logging.getLogger(__name__)

DESENLACE_EXITO = "success"
DESENLACE_DEVUELTO = "devuelto"
DESENLACE_RETORNO = "return"

# Marca del reparto estimado: ningún ciclo concreto lo tiene, es un agregado.
_SIN_DUENO = "__excluido__"

_COLUMNAS_REQUERIDAS = ("client_id", "etapa_anterior", "nueva_etapa", "created_at_log")
_COLUMNAS_CICLO = ("client_id", "forward_to", "desenlace", "culpable")

# Distingue "esta etapa no tiene regla para el motivo" de "la regla no exige
# destino de avance".
_SIN_REGLA = object()


def _fila_vacia(fila: str) -> dict[str, Any]:
    """Fila neutra: la etapa no registró ciclos ni pérdidas en el periodo."""
    return {
        "etapa": fila,
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

def _preparar_historial(
    df_periodo: pd.DataFrame,
    df_historial: pd.DataFrame | None,
) -> pd.DataFrame | None:
    """Ordena el historial y marca en `_en_periodo` las filas del periodo.

    `df_historial` debe traer las mismas oportunidades que `df_periodo` con
    todos sus movimientos; de ahí se leen los desenlaces que caen fuera del
    periodo. Si no llega, o no trae la clave `id`, se mira sólo el periodo.
    """
    if df_periodo is None or df_periodo.empty:
        return None

    faltantes = [c for c in _COLUMNAS_REQUERIDAS if c not in df_periodo.columns]
    if faltantes:
        logger.warning("Efectividad: faltan columnas %s en los logs del periodo", faltantes)
        return None

    usa_historial = (
        df_historial is not None
        and not df_historial.empty
        and "id" in df_historial.columns
        and "id" in df_periodo.columns
    )
    if usa_historial:
        base = df_historial.copy()
        base["_en_periodo"] = base["id"].isin(set(df_periodo["id"]))
    else:
        if df_historial is not None and not df_historial.empty:
            logger.warning(
                "Efectividad: el historial no trae la columna 'id'; los desenlaces "
                "se resolverán sólo dentro del periodo."
            )
        base = df_periodo.copy()
        base["_en_periodo"] = True

    sin_fecha = int(base["created_at_log"].isna().sum())
    if sin_fecha:
        # Sin fecha no se puede ordenar el movimiento ni saber qué vino después.
        logger.warning("Efectividad: %s movimientos sin fecha quedaron fuera del cálculo", sin_fecha)
        base = base[base["created_at_log"].notna()]

    if base.empty:
        return None

    orden = ["client_id", "created_at_log"]
    if "id" in base.columns:
        # Desempate estable cuando dos movimientos comparten fecha.
        orden.append("id")
    return base.sort_values(orden, kind="mergesort")


def _clasificar_ciclos(
    hist: pd.DataFrame,
    regla: dict[str, Any],
    fila_devolucion: pd.Series,
) -> pd.DataFrame:
    """Un ciclo por cada salida hacia adelante ocurrida en el periodo.

    Sin deduplicar por cliente: si la misma oportunidad salió cuatro veces de la
    etapa, son cuatro ciclos y cada uno responde por cómo terminó.
    """
    term_map = regla["term_map"]

    # Desenlace posterior a cada movimiento, sobre todo el historial del cliente.
    terminal = hist["nueva_etapa"].where(hist["nueva_etapa"].isin(list(term_map))).map(term_map)
    proximo = terminal.groupby(hist["client_id"], sort=False).bfill()

    avanza = (
        hist["etapa_anterior"].isin(regla["origen"])
        & hist["nueva_etapa"].isin(regla["forward"])
        & hist["_en_periodo"]
    )
    if not avanza.any():
        return pd.DataFrame(columns=list(_COLUMNAS_CICLO))

    # Quién paga la devolución que cerró el ciclo, si es que lo cerró una.
    culpable = fila_devolucion.groupby(hist["client_id"], sort=False).bfill()

    return pd.DataFrame(
        {
            "client_id": hist.loc[avanza, "client_id"].astype(str).to_numpy(),
            "forward_to": hist.loc[avanza, "nueva_etapa"].to_numpy(),
            "desenlace": proximo[avanza].to_numpy(),
            "culpable": culpable[avanza].to_numpy(),
        }
    )


# --- Motivos ----------------------------------------------------------------

def _tabla_motivos(reglas: list[dict[str, Any]], clave_fila: str) -> dict[str, str]:
    """Aplana un catálogo de motivos a `motivo normalizado -> fila`."""
    tabla: dict[str, str] = {}
    for regla in reglas:
        for motivo in regla["motivos"]:
            tabla.setdefault(normalize_text(motivo), regla[clave_fila])
    return tabla


def _reglas_devolucion() -> tuple[list[str], dict[str, dict[str, Any]]]:
    """Orden de prioridad y motivos aceptados por cada etapa."""
    orden: list[str] = []
    por_etapa: dict[str, dict[str, Any]] = defaultdict(dict)
    for regla in ETAPA8_ATRIBUCION:
        etapa = regla["etapa"]
        if etapa not in orden:
            orden.append(etapa)
        for motivo in regla["motivos"]:
            por_etapa[etapa][normalize_text(motivo)] = regla.get("forward_to")
    return orden, por_etapa


def _atribuible(etapa: str, motivo: str, destino: Any, reglas: dict[str, dict[str, Any]]) -> bool:
    """¿La etapa responde por esta devolución?"""
    requerido = reglas.get(etapa, {}).get(motivo, _SIN_REGLA)
    if requerido is _SIN_REGLA:
        return False
    if requerido is None:
        return destino is not None
    if isinstance(requerido, (list, tuple, set)):
        return destino in requerido
    return destino == requerido


# --- Atribución de pérdidas -------------------------------------------------

def atribuir_perdidas(df_perdidas: pd.DataFrame | None) -> dict[str, str | None]:
    """Decide qué fila paga cada oportunidad perdida.

    Devuelve `client_id -> fila` (o `None` cuando la pérdida no es imputable).
    Quien murió dentro del embudo lo paga la etapa donde murió; quien murió en
    la etapa 8 se resuelve por motivo, porque la etapa 8 no es de nadie.
    """
    if df_perdidas is None or df_perdidas.empty or "etapa_actual" not in df_perdidas.columns:
        return {}

    por_perdida = _tabla_motivos(PERDIDA_ATRIBUCION_MOTIVO, "fila")
    por_devolucion = _tabla_motivos(ETAPA8_ATRIBUCION, "etapa")
    excepciones = {normalize_text(m) for m in PERDIDA_EXCEPTION_MOTIVOS}
    excepciones |= {normalize_text(m) for m in ETAPA8_EXCEPTION_MOTIVOS}

    columnas = df_perdidas.columns
    col_perdida = "motivo_perdida" if "motivo_perdida" in columnas else None
    col_devolucion = "devolver_oportunidad" if "devolver_oportunidad" in columnas else None

    atribucion: dict[str, str | None] = {}
    for row in df_perdidas.itertuples(index=False):
        cid = str(row.id)
        etapa = row.etapa_actual

        if etapa not in PERDIDA_POR_MOTIVO_ETAPAS:
            atribucion[cid] = PERDIDA_ATRIBUCION_POR_ETAPA.get(etapa, ETAPA8_ATRIBUCION_FALLBACK)
            continue

        # Murió en la etapa 8: manda el motivo. Primero el de pérdida, que es la
        # decisión final sobre la oportunidad; si no dice nada, el de devolución,
        # que explica por qué llegó hasta ahí.
        m_perdida = normalize_text(getattr(row, col_perdida)) if col_perdida else ""
        m_devolucion = normalize_text(getattr(row, col_devolucion)) if col_devolucion else ""
        if m_perdida in excepciones or (not m_perdida and m_devolucion in excepciones):
            atribucion[cid] = None
            continue

        fila = por_perdida.get(m_perdida) or por_devolucion.get(m_devolucion)
        atribucion[cid] = fila or ETAPA8_ATRIBUCION_FALLBACK

    desconocidas = {f for f in atribucion.values() if f is not None} - set(EFECTIVIDAD_REGLAS)
    if desconocidas:
        logger.warning("Efectividad: pérdidas atribuidas a filas inexistentes %s", sorted(desconocidas))
    return atribucion


# --- Atribución de devoluciones --------------------------------------------

def _destinos_de_avance(hist: pd.DataFrame) -> dict[tuple[str, str], str]:
    """`(cliente, etapa) -> primer destino al que la etapa lo mandó`.

    Es lo que comparan las reglas de ETAPA8_ATRIBUCION: un motivo técnico sólo
    es culpa de factibilidad si fue factibilidad quien mandó al cliente adelante.
    """
    destinos: dict[tuple[str, str], str] = {}
    for cid, etapa, destino in zip(hist["client_id"], hist["etapa_anterior"], hist["nueva_etapa"]):
        destinos.setdefault((str(cid), etapa), destino)
    return destinos


def atribuir_devoluciones(hist: pd.DataFrame, etapa_actual: dict[str, str]) -> pd.Series:
    """Fila responsable de cada devolución a la etapa 8, alineada con `hist`.

    Sólo las devoluciones cuya oportunidad sigue en la etapa 8 traen motivo
    legible; ésas se resuelven con ETAPA8_ATRIBUCION. Las demás quedan en NaN
    —no se sabe de quién son— y el cálculo las estima después.
    `_SIN_DUENO` marca los motivos de excepción, que no paga nadie.
    """
    es_devolucion = hist["nueva_etapa"] == ETAPA8_KEY
    fila = pd.Series(pd.NA, index=hist.index, dtype="object")
    if not es_devolucion.any():
        return fila

    orden, reglas = _reglas_devolucion()
    excepciones = {normalize_text(m) for m in ETAPA8_EXCEPTION_MOTIVOS}
    col_motivo = "devolver_oportunidad" if "devolver_oportunidad" in hist.columns else None
    if col_motivo is None:
        return fila

    destinos = _destinos_de_avance(hist)
    sub = hist.loc[es_devolucion]
    valores = []
    for cid, motivo_bruto in zip(sub["client_id"], sub[col_motivo]):
        cid = str(cid)
        # El motivo sólo es fiable mientras la oportunidad no se haya movido.
        if etapa_actual.get(cid) != ETAPA8_KEY:
            valores.append(pd.NA)
            continue
        motivo = normalize_text(motivo_bruto)
        if not motivo:
            valores.append(pd.NA)
        elif motivo in excepciones:
            valores.append(_SIN_DUENO)
        else:
            valores.append(next(
                (e for e in orden if _atribuible(e, motivo, destinos.get((cid, e)), reglas)),
                ETAPA8_ATRIBUCION_FALLBACK,
            ))
    fila.loc[es_devolucion] = valores
    return fila


# --- Cálculo principal ------------------------------------------------------

def _columna_cliente(df: pd.DataFrame | None, col: str) -> dict[str, str]:
    if df is None or df.empty or col not in df.columns or "id" not in df.columns:
        return {}
    return {str(cid): str(v) for cid, v in zip(df["id"], df[col])}


def _solo_perdidos(df_clientes: pd.DataFrame | None) -> pd.DataFrame:
    """Oportunidades hoy perdidas, con lo necesario para atribuirlas."""
    if df_clientes is None or df_clientes.empty or "ganado" not in df_clientes.columns:
        return pd.DataFrame()
    return df_clientes[df_clientes["ganado"] == "perdido"]


def _destinos_penalizados(origenes: list[str]) -> set[str]:
    """Destinos cuyo retorno penaliza a la etapa que envió al cliente."""
    return {r["forward_to"] for r in RETORNO_ATRIBUCION if r["etapa"] in origenes}


def compute_efectividad(
    df_periodo: pd.DataFrame,
    df_historial: pd.DataFrame | None = None,
    df_clientes: pd.DataFrame | None = None,
    df_perdidas: pd.DataFrame | None = None,
) -> list[dict[str, Any]]:
    """Efectividad de cada fila de `EFECTIVIDAD_REGLAS` para un periodo.

    Argumentos:
        df_periodo:   movimientos del periodo.
        df_historial: los mismos clientes con todo su historial de movimientos.
        df_clientes:  estado actual (`id`, `ganado`, `etapa_actual`).
        df_perdidas:  oportunidades con `fecha_cierre` en el periodo y
                      `ganado = 'perdido'`, con `etapa_actual` y los motivos.

    Devuelve siempre una fila por etapa, aunque no haya habido movimiento.
    """
    perdidas_por_fila: dict[str, set[str]] = defaultdict(set)
    for cid, fila in atribuir_perdidas(df_perdidas).items():
        if fila is not None:
            perdidas_por_fila[fila].add(cid)

    hist = _preparar_historial(df_periodo, df_historial)
    if hist is None:
        # Sin movimientos una etapa todavía puede cargar con pérdidas del mes.
        resultados = []
        for fila in EFECTIVIDAD_REGLAS:
            r = _fila_vacia(fila)
            r["perdidas_atribuidas"] = len(perdidas_por_fila.get(fila, ()))
            r["fallidos"] = r["total_salidas"] = r["clientes"] = r["perdidas_atribuidas"]
            r["ciclos_por_cliente"] = 1.0 if r["clientes"] else 0.0
            resultados.append(r)
        return resultados

    ganado = _columna_cliente(df_clientes, "ganado")
    etapa_actual = _columna_cliente(df_clientes, "etapa_actual")
    perdidos = {cid for cid, g in ganado.items() if g == "perdido"}
    # La misma atribución sobre todas las pérdidas conocidas, cierren cuando
    # cierren: distingue "la paga otra etapa" de "la paga ésta, pero otro mes".
    perdidas_totales = atribuir_perdidas(_solo_perdidos(df_clientes))
    fila_devolucion = atribuir_devoluciones(hist, etapa_actual)

    resultados: list[dict[str, Any]] = []
    sin_motivo_por_fila: dict[str, int] = {}
    for fila, regla in EFECTIVIDAD_REGLAS.items():
        r = _fila_vacia(fila)
        ciclos = _clasificar_ciclos(hist, regla, fila_devolucion)
        cargadas = perdidas_por_fila.get(fila, set())
        sin_motivo_por_fila[fila] = 0

        if not ciclos.empty:
            cid = ciclos["client_id"]
            desenlace = ciclos["desenlace"]
            culpable = ciclos["culpable"]
            paga_aqui = cid.isin(cargadas)

            exito = desenlace == DESENLACE_EXITO
            retorno = desenlace == DESENLACE_RETORNO
            devuelto = desenlace == DESENLACE_DEVUELTO
            abierto = desenlace.isna()

            # Un retorno lo paga la etapa que mandó al cliente hacia un destino
            # que debía resolver y no resolvió.
            penalizado = retorno & ciclos["forward_to"].isin(_destinos_penalizados(regla["origen"]))
            # La devolución la paga quien diga el motivo, no siempre el origen.
            con_motivo = devuelto & culpable.notna()

            r["exitosos"] = int(exito.sum())
            r["retornos_penalizados"] = int(penalizado.sum())
            r["retornan"] = int(retorno.sum()) - r["retornos_penalizados"]
            r["devoluciones_atribuidas"] = int((con_motivo & (culpable == fila)).sum())
            r["devoluciones_otra_fila"] = int((con_motivo & (culpable != fila)).sum())
            sin_motivo_por_fila[fila] = int((devuelto & culpable.isna()).sum())

            # Ciclos abiertos: se cobran si la pérdida es de esta fila y de este
            # mes; si no, se reportan fuera del denominador.
            pendiente_aqui = cid.map(lambda c: perdidas_totales.get(c) == fila)
            perdida_ajena = abierto & ~paga_aqui & cid.isin(perdidos)
            r["perdidas_otro_periodo"] = int((perdida_ajena & pendiente_aqui).sum())
            r["perdidas_otra_fila"] = int((perdida_ajena & ~pendiente_aqui).sum())
            r["sin_resolver"] = int((abierto & ~paga_aqui & ~cid.isin(perdidos)).sum())

            # Una oportunidad que llegó a instalarse y se dio de baja después no
            # es un fallo del embudo de venta: se reporta, pero no se cobra.
            ya_instalados = cargadas & set(cid[exito])
            r["perdidas_tras_instalar"] = len(ya_instalados)
            cargadas = cargadas - ya_instalados

            r["clientes"] = int(cid.nunique())
            r["ciclos_por_cliente"] = round(len(ciclos) / r["clientes"], 2)

        r["perdidas_atribuidas"] = len(cargadas)
        resultados.append(r)

    # Las devoluciones sin motivo legible se estiman con la tasa de culpa que la
    # propia fila muestra en las que sí lo traen. Si no tiene muestra suficiente
    # se usa la tasa global. Va en su propio campo: es estimación, no dato.
    conocidas = sum(r["devoluciones_atribuidas"] + r["devoluciones_otra_fila"] for r in resultados)
    tasa_global = sum(r["devoluciones_atribuidas"] for r in resultados) / conocidas if conocidas else 0.0

    for r in resultados:
        pendientes = sin_motivo_por_fila.get(r["etapa"], 0)
        if pendientes:
            muestra = r["devoluciones_atribuidas"] + r["devoluciones_otra_fila"]
            tasa = (
                r["devoluciones_atribuidas"] / muestra
                if muestra >= E8_IMPUTACION_MIN_MUESTRA
                else tasa_global
            )
            r["devoluciones_sin_motivo"] = pendientes
            r["devoluciones_estimadas"] = int(round(pendientes * tasa))

        r["fallidos"] = (
            r["retornos_penalizados"]
            + r["devoluciones_atribuidas"]
            + r["devoluciones_estimadas"]
            + r["perdidas_atribuidas"]
        )
        total = r["exitosos"] + r["fallidos"] + r["retornan"]
        r["total_salidas"] = total
        r["efectividad_pct"] = round(r["exitosos"] / total * 100, 2) if total else 0.0

    return resultados
