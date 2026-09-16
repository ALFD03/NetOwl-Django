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
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
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
    "periodo_creacion", "periodo_cierre", "dt_creacion", "dt_cierre",
    "es_resuelto", "es_cancelado", "es_cerrado", "es_rezagado",
]

# Columnas que `build_cohort` añade, y que sí dependen del periodo analizado.
COHORT_COLUMNS = ["nacido_en_periodo", "cerrado_en_periodo"]


def classify_tickets(df: pd.DataFrame) -> pd.DataFrame:
    """
    Añade al DataFrame de tickets las columnas derivadas del desenlace.

    Se hace una sola vez sobre la tabla completa, no por periodo: las reglas de
    etapa y la relación creación/cierre no dependen del mes que se analice.
    """
    out = df.copy()

    # La fecha se guarda aparte del periodo porque es la que permite cortar por
    # dia; el periodo, en texto `YYYY-MM`, es lo que compara el resto del modulo.
    out["dt_creacion"] = pd.to_datetime(out["creado_el"], errors="coerce")
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
    Los tickets de un periodo, ya clasificados.

    Un solo DataFrame: las poblaciones de cada medida salen de las columnas
    booleanas, y `filter` recorta una única tabla al bajar de nivel dimensional.
    """

    periodo: str
    df: pd.DataFrame

    def filter(self, columna: str, valor: Any) -> PeriodCohort:
        """La misma cohorte restringida a las filas con `columna == valor`."""
        if self.df.empty or columna not in self.df.columns:
            return PeriodCohort(self.periodo, self.df.iloc[0:0])
        return PeriodCohort(self.periodo, self.df[self.df[columna] == valor])

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
    """
    nacidos = df_all["periodo_creacion"] == periodo
    cerrados = df_all["es_cerrado"] & (df_all["periodo_cierre"] == periodo)

    if hasta is not None:
        # El día del corte entra entero.
        tope = pd.Timestamp(hasta) + pd.Timedelta(days=1) - pd.Timedelta(nanoseconds=1)
        nacidos = nacidos & (df_all["dt_creacion"] <= tope)
        cerrados = cerrados & (df_all["dt_cierre"] <= tope)

    df = df_all[nacidos | cerrados].copy()
    df["nacido_en_periodo"] = nacidos[nacidos | cerrados]
    df["cerrado_en_periodo"] = cerrados[nacidos | cerrados]

    return PeriodCohort(periodo, df)


def periodos_disponibles(df_all: pd.DataFrame) -> list[str]:
    """
    Todos los meses con actividad, de más reciente a más antiguo.

    Se unen los meses de creación y los de cierre: un mes en el que no nació
    nada pero sí se cerró arrastre sigue teniendo un reporte que dar.
    """
    creados = df_all["periodo_creacion"].dropna()
    cerrados = df_all.loc[df_all["es_cerrado"], "periodo_cierre"].dropna()
    return sorted(set(creados) | set(cerrados), reverse=True)
