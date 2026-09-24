# backend/support/cohorts.py
"""
Construcción de la cohorte de un periodo.

El módulo no calcula nada: sólo decide qué tickets entran en el periodo y deja
resueltas, como columnas booleanas, las preguntas que después usan las tasas y
las poblaciones de tiempo.

La cohorte es la unión de dos poblaciones —lo creado en el mes y lo cerrado en
el mes— y cada métrica recorta la suya con `poblacion()`. No hay universo que
elegir: el tiempo de cierre se mide sobre lo cerrado y el de asignación sobre lo
creado, siempre, porque es la única lectura que tiene sentido para cada uno.

**La cohorte lleva su instante de corte.** Es el "ahora" desde el que se mira:
el fin del día en un corte diario y el fin del mes en el cierre del mes. De él
salen dos columnas que las métricas no podrían derivar por su cuenta:
`asignado_al_corte` —la asignación, y sólo si ya había ocurrido— y
`cerrado_al_corte`. Sin eso el corte del día 15 medía la espera de un ticket
asignado el 20, que ese día todavía no se había asignado.

**Un mes cerrado da siempre lo mismo.** El corte no es la hora del cálculo sino
el final del periodo, así que nada de lo que ocurra después puede cambiar su
resultado: agosto analizado el 1 de septiembre y agosto analizado en diciembre
son el mismo número, aunque entre medias se haya asignado o cerrado lo que
quedaba abierto. Sólo el mes en curso se topa en el instante del cálculo, que es
todo lo que ha ocurrido de él.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import pandas as pd

from services.support.analytics.config import (
    CANCELED_STAGES,
    POB_CANCELADOS,
    POB_CERRADOS,
    POB_CREADOS,
    POB_RESUELTOS,
    RESOLVED_STAGES,
)

# Columnas derivadas que `classify_tickets` añade sobre la tabla completa.
DERIVED_COLUMNS = [
    "periodo_creacion", "periodo_cierre",
    "dt_creacion", "dt_asignacion", "dt_cierre",
    "es_resuelto", "es_cancelado", "es_cerrado", "es_rezagado",
]

# Columnas que `build_cohort` añade, y que sí dependen del periodo analizado.
COHORT_COLUMNS = [
    "nacido_en_periodo", "cerrado_en_periodo",
    "asignado_al_corte", "cerrado_al_corte",
]


def classify_tickets(df: pd.DataFrame) -> pd.DataFrame:
    """
    Añade al DataFrame de tickets las columnas derivadas del desenlace.

    Se hace una sola vez sobre la tabla completa, no por periodo: las reglas de
    etapa y la relación creación/cierre no dependen del mes que se analice.

    Las tres fechas se convierten aquí y sólo aquí. Es lo que permite que las
    métricas resten columnas ya parseadas en vez de llamar a `to_datetime` en
    cada sub-cohorte: un mes son treinta y un cortes × cientos de filas
    dimensionales, y eso era volver a parsear las mismas fechas cada vez.
    """
    out = df.copy()

    # La fecha se guarda aparte del periodo porque es la que permite cortar por
    # dia; el periodo, en texto `YYYY-MM`, es lo que compara el resto del modulo.
    out["dt_creacion"] = pd.to_datetime(out["creado_el"], errors="coerce")
    out["dt_asignacion"] = pd.to_datetime(
        out["primera_fecha_asignada"], errors="coerce"
    ) if "primera_fecha_asignada" in out.columns else pd.NaT
    out["dt_cierre"] = pd.to_datetime(out["ultima_actualizacion_etapa"], errors="coerce")
    out["periodo_creacion"] = out["dt_creacion"].dt.strftime("%Y-%m")
    out["periodo_cierre"] = out["dt_cierre"].dt.strftime("%Y-%m")

    etapa = out["etapa"].astype(str).str.strip().str.lower()
    out["es_resuelto"] = etapa.isin(RESOLVED_STAGES)
    out["es_cancelado"] = etapa.isin(CANCELED_STAGES)
    out["es_cerrado"] = out["es_resuelto"] | out["es_cancelado"]

    # Rezagado = no se cerró dentro de su propio mes de creación. Cubre por
    # igual al que sigue abierto y al que acabó cerrando más tarde, y por eso
    # la tasa de un mes antiguo no se desinfla sola con el tiempo.
    out["es_rezagado"] = ~out["es_cerrado"] | (out["periodo_creacion"] != out["periodo_cierre"])

    return out


@dataclass(frozen=True)
class PeriodCohort:
    """
    Los tickets de un periodo, ya clasificados, y el instante desde el que se
    miran.

    Un solo DataFrame: las poblaciones de cada medida salen de las columnas
    booleanas, y `filter` recorta una única tabla al bajar de nivel dimensional.

    `corte` es ese instante —fin del día en un corte diario, fin del mes en el
    cierre del mes— y es lo que cierra el reloj de los tickets que todavía no
    tienen asignación. Se propaga intacto a cada sub-cohorte: todas las filas
    dimensionales de un mismo corte tienen que medirse contra la misma hora.
    """

    periodo: str
    df: pd.DataFrame
    corte: pd.Timestamp = field(default_factory=pd.Timestamp.now)

    def filter(self, columna: str, valor: Any) -> PeriodCohort:
        """La misma cohorte restringida a las filas con `columna == valor`."""
        if self.df.empty or columna not in self.df.columns:
            return PeriodCohort(self.periodo, self.df.iloc[0:0], self.corte)
        return PeriodCohort(self.periodo, self.df[self.df[columna] == valor], self.corte)

    def valores(self, columna: str) -> list[str]:
        """Valores distintos de la columna, en orden alfabético estable."""
        if self.df.empty or columna not in self.df.columns:
            return []
        return sorted(str(v) for v in self.df[columna].dropna().unique())

    def desglosar(self, columna: str) -> Iterator[tuple[str, PeriodCohort]]:
        """Itera (valor, sub-cohorte) por cada valor distinto de la columna."""
        for valor in self.valores(columna):
            yield valor, self.filter(columna, valor)

    @property
    def empty(self) -> bool:
        """Si la cohorte no tiene ningun ticket."""
        return self.df.empty

    def poblacion(self, clave: str) -> pd.DataFrame:
        """La sub-tabla sobre la que se mide una métrica."""
        if self.df.empty:
            return self.df

        cerrado = self.df["cerrado_en_periodo"]
        if clave == POB_CERRADOS:
            return self.df[cerrado]
        if clave == POB_RESUELTOS:
            return self.df[cerrado & self.df["es_resuelto"]]
        if clave == POB_CANCELADOS:
            return self.df[cerrado & self.df["es_cancelado"]]
        if clave == POB_CREADOS:
            return self.df[self.df["nacido_en_periodo"]]
        raise ValueError(f"Población desconocida: {clave!r}")


def build_cohort(
    df_all: pd.DataFrame, periodo: str, hasta: date | None = None
) -> PeriodCohort:
    """
    Los tickets de un periodo: los que nacieron en él o los que cerraron en él.

    `df_all` tiene que venir de `classify_tickets`.

    Con `hasta` la cohorte es el acumulado del mes hasta ese día: sólo lo que
    nació o cerró hasta esa fecha, incluida. Un ticket que cerró el 20 sigue
    contando como creado el 3 en el corte del 15, pero todavía no como cerrado,
    que es exactamente lo que se veía ese día.

    Ese mismo día del corte es el `corte` de la cohorte —sin `hasta`, el final
    del periodo—, y con él se resuelven aquí las dos columnas que las métricas
    no pueden derivar solas:

      * `asignado_al_corte` — la primera asignación, **o nada si ocurrió
        después del corte**. Recortar la cohorte no bastaba: el ticket nacido
        el 3 y asignado el 20 entraba en el corte del 15 con una espera de
        diecisiete días que ese día aún no había pasado.
      * `cerrado_al_corte` — si a esa hora ya estaba cerrado, en el mes que
        sea. Es lo que separa al que sigue esperando asignación del que murió
        sin ella.

    Las dos son una comparación vectorizada sobre las filas ya recortadas, así
    que los treinta y un cortes de un mes no cuestan una pasada más.
    """
    nacidos = df_all["periodo_creacion"] == periodo
    cerrados = df_all["es_cerrado"] & (df_all["periodo_cierre"] == periodo)

    # Sin día de corte el "ahora" es el final del mes, no la hora del cálculo.
    # Es lo que hace que **un mes cerrado dé siempre lo mismo**: si el corte
    # fuera el momento de correr el análisis, la espera de un ticket que en
    # agosto seguía sin asignar crecería en cada reanálisis, y agosto valdría
    # una cosa el 1 de septiembre y otra en diciembre. Lo que pase después del
    # mes no puede cambiar el cierre del mes.
    #
    # El mes en curso es la única excepción, y por el mismo motivo: su final
    # todavía no ha ocurrido, así que se topa en el instante del cálculo para
    # no contar una espera que aún no ha pasado.
    corte = min(pd.Period(periodo, freq="M").end_time, pd.Timestamp.now())

    if hasta is not None:
        # El día del corte entra entero.
        corte = pd.Timestamp(hasta) + pd.Timedelta(days=1) - pd.Timedelta(nanoseconds=1)
        nacidos = nacidos & (df_all["dt_creacion"] <= corte)
        cerrados = cerrados & (df_all["dt_cierre"] <= corte)

    dentro = nacidos | cerrados
    df = df_all[dentro].copy()
    df["nacido_en_periodo"] = nacidos[dentro]
    df["cerrado_en_periodo"] = cerrados[dentro]
    df["asignado_al_corte"] = df["dt_asignacion"].where(df["dt_asignacion"] <= corte)
    df["cerrado_al_corte"] = df["es_cerrado"] & (df["dt_cierre"] <= corte)

    return PeriodCohort(periodo, df, corte)


def periodos_disponibles(df_all: pd.DataFrame) -> list[str]:
    """
    Todos los meses con actividad, de más reciente a más antiguo.

    Se unen los meses de creación y los de cierre: un mes en el que no nació
    nada pero sí se cerró arrastre sigue teniendo un reporte que dar.
    """
    creados = df_all["periodo_creacion"].dropna()
    cerrados = df_all.loc[df_all["es_cerrado"], "periodo_cierre"].dropna()
    return sorted(set(creados) | set(cerrados), reverse=True)
