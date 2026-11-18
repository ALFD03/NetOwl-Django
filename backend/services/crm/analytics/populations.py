"""Las poblaciones de un periodo de CRM, y el corte por dia.

El analisis mensual y las metricas diarias hacen exactamente lo mismo: partir
la base en creadas, ganadas, perdidas y pendientes, anadir la poblacion en
riesgo y los movimientos, y pasarselo todo a `compute_crm_metrics_for_period`.
La unica diferencia es donde se pone el corte -el mes entero o el dia N-, asi
que las dos rutas comparten este modulo y nadie duplica la definicion de que es
una oportunidad ganada.

**Que significa el corte del dia N.** Es el acumulado del mes hasta ese dia, la
misma lectura que la barra de suscripciones: lo creado hasta ese dia, lo cerrado
hasta ese dia y los movimientos registrados hasta ese dia. Una oportunidad que
cerro el 20 aparece como pendiente en el corte del 15, porque el 15 lo estaba.

**Lo que el corte no puede deshacer es `etapa_actual`.** Es el estado de hoy, no
el de aquel dia: `crm_clients` guarda un estado, no su historia. Se usa solo
para distinguir una ganada de una pendiente ya cerrada, de modo que el sesgo se
limita a las oportunidades cuyo cierre aun no habia ocurrido en el corte, que
por eso mismo ya cuentan como pendientes. Las estancias en curso siguen
midiendose contra AHORA, igual que en el analisis mensual (ver
`compute_stage_stays`).

**El corte del ultimo dia no siempre es identico al cierre del mes**, y no es un
error: una oportunidad de enero que se perdio en marzo cuenta como perdida en el
cierre -la efectividad cobra el fallo donde ocurrio- y como pendiente en el corte
del 31 de enero, porque el 31 de enero seguia viva. La barra responde "que se
veia ese dia"; el cierre responde "como acabo el mes".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

import pandas as pd

from core.config import TableNames
from core.database import DBConnector
from core.tables import ensure_tables

from . import tables
from .config import STAGE8_KEY
from .metrics.core import compute_crm_metrics_for_period
from .metrics.timing import compute_stage_stays

logger = logging.getLogger(__name__)

# Estado neutro de la columna `ganado`: el que el loader asigna a todo lo que no
# se ha ganado ni perdido todavia.
PENDING = "pendiente"


def _normalize_id(series: pd.Series) -> pd.Series:
    """El id de una oportunidad como texto comparable.

    El CSV lo trae a veces como número, y pandas lo lee como float: `4213` se
    convierte en `"4213.0"` y deja de cuadrar con el `id` de la oportunidad.
    """
    txt = series.astype(str).str.strip()
    # Sólo el caso del entero leído como float: un id alfanumérico que acabe en
    # `.0` de verdad no se toca.
    return txt.str.replace(r"^(\d+)\.0$", r"\1", regex=True)


@dataclass(frozen=True)
class CrmData:
    """La base de CRM ya preparada, comun a todos los periodos.

    Se construye una sola vez por ejecucion: deduplicar oportunidades, resolver
    a que oportunidad pertenece cada movimiento y medir las estancias en curso
    son pasos que necesitan el historial completo, no el de un mes.
    """

    df_clients: pd.DataFrame
    df_logs: pd.DataFrame
    df_stays: pd.DataFrame
    # Un unico reloj para toda la ejecucion: si cada periodo tomase el suyo, dos
    # meses de la misma corrida medirian sus estancias abiertas contra instantes
    # distintos.
    now: pd.Timestamp

    @property
    def empty(self) -> bool:
        return self.df_clients.empty

    def periods(self) -> list[str]:
        """Los meses con oportunidades creadas, del mas reciente al mas antiguo."""
        if self.df_clients.empty:
            return []
        return sorted(
            self.df_clients.dropna(subset=["periodo_creacion"])["periodo_creacion"]
            .unique()
            .tolist(),
            reverse=True,
        )


def prepare_data(db: DBConnector) -> CrmData:
    """Carga y normaliza la base de CRM: oportunidades, movimientos y estancias."""
    # En una instalación nueva el análisis puede llegar antes que la primera importación.
    ensure_tables(db, *tables.ALL)

    df_clients = db.read_table(TableNames.CRM_CLIENTS)
    df_logs = db.read_table(TableNames.CRM_LOGS)

    if df_clients.empty:
        return CrmData(df_clients, df_logs, pd.DataFrame(), pd.Timestamp.now())

    # Una oportunidad repetida en la tabla ensancharía todos los cruces con los
    # logs y contaría cada movimiento tantas veces como copias tenga.
    n_before = len(df_clients)
    df_clients = df_clients.drop_duplicates(subset=["id"], keep="last")
    if len(df_clients) != n_before:
        logger.warning(
            "CRM: %d oportunidades duplicadas por `id` descartadas de %d.",
            n_before - len(df_clients), n_before,
        )

    # Fecha y periodo de cada hito. La fecha se guarda aparte del periodo porque
    # es la que permite cortar por dia; el periodo, en texto `YYYY-MM`, es lo que
    # compara el resto del analisis.
    dt_creation = pd.to_datetime(df_clients["creado_el"], errors="coerce")
    dt_close = pd.to_datetime(df_clients["fecha_cierre"], errors="coerce")
    df_clients["dt_creacion"] = dt_creation
    df_clients["dt_cierre"] = dt_close
    df_clients["periodo_creacion"] = dt_creation.dt.strftime("%Y-%m")
    df_clients["periodo_cierre"] = dt_close.dt.strftime("%Y-%m")

    if not df_logs.empty and "created_at_log" in df_logs.columns:
        dt_log = pd.to_datetime(df_logs["created_at_log"], errors="coerce")
        df_logs["dt_log"] = dt_log
        df_logs["periodo_log"] = dt_log.dt.strftime("%Y-%m")

        # `Iniciativa/ID` (`entrada_id`) ES el id de la oportunidad a la que
        # pertenece el movimiento: es el campo con el que se verifica de quién
        # es cada log. `client_id` no viene en la fila del log —el cargador lo
        # arrastra hacia abajo desde la fila padre del CSV de Odoo
        # (`crm_loader.py`)—, así que sólo queda de respaldo por si alguna
        # iniciativa no resuelve a una oportunidad cargada.
        opportunity_ids = set(df_clients["id"].astype(str).str.strip())
        if "entrada_id" in df_logs.columns:
            declared = _normalize_id(df_logs["entrada_id"])
        else:
            declared = pd.Series("", index=df_logs.index)

        resolves = declared.isin(opportunity_ids)
        df_logs["oportunidad_id"] = declared.where(
            resolves, _normalize_id(df_logs["client_id"])
        )

        n_unresolved = int((~resolves).sum())
        if n_unresolved:
            logger.warning(
                "CRM: %d de %d logs traen una Iniciativa/ID que no corresponde a "
                "ninguna oportunidad cargada; se atribuyen por el id arrastrado "
                "del CSV. Si el número es alto, revisa el formato del campo.",
                n_unresolved, len(df_logs),
            )

        # El motivo de devolución vive en la oportunidad y las reglas de
        # efectividad lo leen desde el log. Se renombra la clave porque ambas
        # tablas tienen `id` y el merge renombraría el del log a `id_x`,
        # dejando sin desempate el orden de los movimientos.
        df_logs = df_logs.merge(
            df_clients[["id", "devolver_oportunidad"]].rename(columns={"id": "oportunidad_id"}),
            on="oportunidad_id",
            how="left",
        )
    else:
        df_logs["dt_log"] = pd.Series(dtype="datetime64[ns]")
        df_logs["periodo_log"] = pd.Series(dtype=str)
        df_logs["oportunidad_id"] = pd.Series(dtype=str)

    # Estancias que todavía no han producido una salida. Se calculan una sola vez
    # sobre toda la base —necesitan el historial completo para saber cuándo entró
    # cada oportunidad a su etapa actual— y luego se reparten por periodo.
    now = pd.Timestamp.now()
    df_stays = compute_stage_stays(df_clients, df_logs, now)

    return CrmData(df_clients, df_logs, df_stays, now)


def _opportunities_at_risk(df_clients: pd.DataFrame, period: str) -> pd.DataFrame:
    """Oportunidades con vida en el periodo.

    Vivas = creadas en el periodo o antes, y todavía sin cerrar cuando empezó.
    Los periodos son `YYYY-MM`, así que la comparación de textos ya es
    cronológica y no hace falta volver a las fechas.

    Una oportunidad sin `periodo_cierre` sigue abierta y cuenta en todos los
    meses desde que se creó; una cerrada cuenta hasta el mes de su cierre
    incluido, porque ese mes todavía se trabajó. De ahí sale la propiedad que
    hace útil esta métrica: como `creado_el` y `fecha_cierre` son hechos ya
    escritos, el denominador de un mes cerrado no vuelve a moverse.
    """
    if df_clients.empty or "periodo_creacion" not in df_clients.columns:
        return pd.DataFrame(columns=df_clients.columns)

    born = df_clients["periodo_creacion"].notna() & (df_clients["periodo_creacion"] <= period)
    close = df_clients.get("periodo_cierre")
    if close is None:
        still_alive = pd.Series(True, index=df_clients.index)
    else:
        still_alive = close.isna() | (close >= period)
    return df_clients[born & still_alive].copy()


def _to_end_of_day(until: date) -> pd.Timestamp:
    """El ultimo instante del dia de corte: el dia N entra entero."""
    return pd.Timestamp(until) + pd.Timedelta(days=1) - pd.Timedelta(nanoseconds=1)


def _base_at_cutoff(data: CrmData, until: date | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """La base tal y como estaba al cerrar el dia `hasta`.

    Lo posterior al corte no ha pasado: las oportunidades creadas despues no
    existen, los movimientos posteriores no se han registrado y los cierres
    posteriores se deshacen -la oportunidad vuelve a estar abierta-.
    """
    if until is None:
        return data.df_clients, data.df_logs

    cap = _to_end_of_day(until)

    # Una fecha ilegible no es una fecha futura: la fila se queda, igual que se
    # queda en el analisis del mes. Descartarla haria que el corte del dia 31 no
    # coincidiera con el cierre por una razon que nada tiene que ver con el dia.
    creation = data.df_clients["dt_creacion"]
    df_clients = data.df_clients[creation.isna() | (creation <= cap)].copy()
    if not df_clients.empty:
        future = df_clients["dt_cierre"].notna() & (df_clients["dt_cierre"] > cap)
        df_clients.loc[future, "dt_cierre"] = None
        df_clients.loc[future, "fecha_cierre"] = None
        df_clients.loc[future, "periodo_cierre"] = None
        df_clients.loc[future, "ganado"] = PENDING

    if data.df_logs.empty or "dt_log" not in data.df_logs.columns:
        return df_clients, data.df_logs
    log = data.df_logs["dt_log"]
    return df_clients, data.df_logs[log.isna() | (log <= cap)].copy()


@dataclass(frozen=True)
class CrmPopulations:
    """Las poblaciones de un periodo (o de un dia suyo), listas para medir.

    Existe para que el total del mes y cada rebanada dimensional recorran
    exactamente el mismo camino: `filter_by` devuelve otra instancia y `metrics`
    es la misma funcion en los dos casos.
    """

    period: str
    created: pd.DataFrame
    won: pd.DataFrame
    lost: pd.DataFrame
    pending: pd.DataFrame
    logs_e8: pd.DataFrame
    logs: pd.DataFrame
    clients: pd.DataFrame
    history: pd.DataFrame
    close_losses: pd.DataFrame
    stays: pd.DataFrame
    at_risk: pd.DataFrame
    now: pd.Timestamp

    @property
    def empty(self) -> bool:
        """Sin creadas, ganadas, perdidas ni pendientes no hay fila que emitir."""
        return (
            self.created.empty and self.won.empty
            and self.lost.empty and self.pending.empty
        )

    def metrics(self) -> dict[str, Any]:
        """El bloque de metricas de estas poblaciones."""
        return compute_crm_metrics_for_period(
            self.created, self.won, self.lost, self.pending,
            self.logs_e8, self.logs, self.clients, self.history,
            self.close_losses, self.stays, self.now, self.at_risk,
        )

    def values(self, dim: str) -> list[str]:
        """Los valores distintos de una dimension presentes en el periodo."""
        found: set[str] = set()
        for df in (self.created, self.won, self.lost, self.pending, self.clients):
            if df.empty or dim not in df.columns:
                continue
            vals = df[dim].dropna().astype(str).str.strip()
            found.update(vals[~vals.isin(["", "nan", "None", "<NA>"])].unique())
        return sorted(found)

    def filter_by(self, dim: str, value: str) -> CrmPopulations:
        """La misma foto recortada a un valor dimensional.

        Los movimientos se recortan por la oportunidad a la que pertenecen
        (`oportunidad_id`, resuelto al preparar los datos): es lo que ata cada
        log a su sucursal, campana y vendedor. La poblacion en riesgo tambien se
        recorta: el riesgo de devolucion de una sucursal se mide contra lo que
        esa sucursal tenia vivo, no contra la base entera.
        """
        def by_dim(df: pd.DataFrame) -> pd.DataFrame:
            if df.empty or dim not in df.columns:
                return df.iloc[0:0]
            return df[df[dim].astype(str).str.strip() == value]

        clients = by_dim(self.clients)
        ids = set(clients["id"].astype(str).to_numpy()) if not clients.empty else set()

        def by_logs(df: pd.DataFrame) -> pd.DataFrame:
            if df.empty:
                return df
            col = "oportunidad_id" if "oportunidad_id" in df.columns else "client_id"
            return df[df[col].astype(str).isin(ids)]

        # Las estancias sin salida viven en `crm_clients`, no en la rebanada de
        # creados: se recortan por cliente igual que los logs.
        stays = (
            self.stays[self.stays["client_id"].astype(str).isin(ids)]
            if not self.stays.empty
            else self.stays
        )

        return replace(
            self,
            created=by_dim(self.created),
            won=by_dim(self.won),
            lost=by_dim(self.lost),
            pending=by_dim(self.pending),
            logs_e8=by_logs(self.logs_e8),
            logs=by_logs(self.logs),
            clients=clients,
            history=by_logs(self.history),
            close_losses=by_dim(self.close_losses),
            stays=stays,
            at_risk=by_dim(self.at_risk),
        )


def build_populations(
    data: CrmData, period: str, until: date | None = None
) -> CrmPopulations | None:
    """Parte la base en las poblaciones del periodo, o `None` si no creo nada.

    Con `hasta` el corte es el acumulado del mes hasta ese dia; sin el, el mes
    entero.
    """
    df_clients, df_logs = _base_at_cutoff(data, until)
    if df_clients.empty:
        return None

    # A. Creados en el periodo
    df_created = df_clients[df_clients["periodo_creacion"] == period].copy()
    if df_created.empty:
        return None

    # B. Ganados: creados en el periodo, ganados, instalados y cerrados en el.
    mask_won = (
        (df_created["ganado"] == "ganado")
        & (df_created["etapa_actual"] == "etapa_7_instalados")
        & (df_created["periodo_cierre"] == period)
    )
    df_won = df_created[mask_won].copy()

    # C. Perdidos: creados en el periodo y cerrados como perdidos en el.
    mask_lost = (
        (df_created["ganado"] == "perdido")
        & (df_created["periodo_cierre"] == period)
    )
    df_lost = df_created[mask_lost].copy()

    # D. Pendientes: creados en el periodo cuyo cierre no ocurrio en el.
    df_pending = df_created[~mask_won & ~mask_lost].copy()

    # E. Movimientos del periodo.
    df_logs_p = df_logs[df_logs["periodo_log"] == period].copy() if not df_logs.empty else pd.DataFrame()
    df_logs_e8_p = (
        df_logs_p[df_logs_p["nueva_etapa"] == STAGE8_KEY].copy()
        if not df_logs_p.empty else pd.DataFrame()
    )

    # E1. Población en riesgo: todo lo que tuvo vida en el periodo, no sólo lo
    # que se creó en él. Es el denominador del riesgo de devolución, y arrastra
    # a las oportunidades abiertas de meses anteriores, que son la mayor parte
    # de lo que el embudo gestiona cualquier mes dado. El de `df_created` es una
    # cohorte: mezclado con el numerador del mes daba tasas que podían pasar del
    # 100%.
    df_at_risk = _opportunities_at_risk(df_clients, period)

    # Historial completo de los clientes que se movieron en el periodo: la
    # efectividad necesita saber cómo terminaron, aunque cierren más tarde.
    if not df_logs_p.empty:
        df_hist_p = df_logs[df_logs["client_id"].isin(set(df_logs_p["client_id"]))].copy()
    else:
        df_hist_p = pd.DataFrame()

    # E2. Pérdidas cerradas en el periodo. A diferencia de `df_perdidos`, aquí no
    # se exige que la oportunidad se haya creado en el mismo mes: la efectividad
    # cobra el fallo en el mes en que la oportunidad murió, y el 43% de las
    # pérdidas cierra en un mes distinto al de creación.
    df_close_losses = df_clients[
        (df_clients["ganado"] == "perdido") & (df_clients["periodo_cierre"] == period)
    ].copy()

    # E3. Estancias cuya entrada a la etapa cae en el periodo. Es la cara oculta
    # de los movimientos: lo que entró y todavía no ha salido.
    df_perm_p = _period_stays(data.df_stays, period, until)

    return CrmPopulations(
        period=period,
        created=df_created,
        won=df_won,
        lost=df_lost,
        pending=df_pending,
        logs_e8=df_logs_e8_p,
        logs=df_logs_p,
        clients=df_clients,
        history=df_hist_p,
        close_losses=df_close_losses,
        stays=df_perm_p,
        at_risk=df_at_risk,
        now=data.now,
    )


def _period_stays(
    df_stays: pd.DataFrame, period: str, until: date | None
) -> pd.DataFrame:
    """Las estancias que entraron a su etapa dentro del periodo (y del corte)."""
    if df_stays.empty:
        return pd.DataFrame()
    sub = df_stays[df_stays["periodo_entrada"] == period]
    if until is not None and "fecha_entrada" in sub.columns:
        sub = sub[sub["fecha_entrada"] <= _to_end_of_day(until)]
    return sub.copy()
