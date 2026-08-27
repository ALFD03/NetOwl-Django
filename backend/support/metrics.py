# NetOwl-Django/backend/support/metrics.py

from __future__ import annotations
import math
import pandas as pd
from dataclasses import dataclass
from typing import Any, Dict, Iterator, Tuple

from backend.support.config import MIN_DURACION_HORAS

def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


def _compute_stats_for_series(series: pd.Series) -> Dict[str, float]:
    """
    Estadísticos de una serie de duraciones en horas.

    Solo entran duraciones de al menos `MIN_DURACION_HORAS` (1 minuto). Por
    debajo de ese umbral no hay un tiempo de servicio que medir: son acciones
    masivas de Odoo que asignan y cierran en el mismo segundo, o fechas
    ausentes. Contarlas hundía el promedio y la mediana e inflaba el % que
    excede el promedio.

    `muestra` expone cuántos tickets sí se pudieron medir, para poder juzgar la
    cobertura del cálculo desde la interfaz.
    """
    s = pd.to_numeric(series, errors="coerce").dropna()
    s = s[s >= MIN_DURACION_HORAS]
    n = len(s)

    if n == 0:
        return {
            "promedio": 0.0, "mediana": 0.0, "min": 0.0, "p25": 0.0, "p75": 0.0, "max": 0.0,
            "std": 0.0, "pct_excede_promedio": 0.0, "muestra": 0,
        }

    promedio = float(s.mean())
    mediana = float(s.median())
    std_val = float(s.std(ddof=0)) if n > 1 else 0.0

    return {
        "promedio": round(promedio, 2),
        "mediana": round(mediana, 2),
        "min": round(float(s.min()), 2),
        "p25": round(float(s.quantile(0.25)), 2),
        "p75": round(float(s.quantile(0.75)), 2),
        "max": round(float(s.max()), 2),
        "std": round(std_val, 2),
        "pct_excede_promedio": round(float((s > promedio).sum() / n) * 100, 2),
        "muestra": n,
    }


def _hours_between(df: pd.DataFrame, col_inicio: str, col_fin: str) -> pd.Series:
    """
    Diferencia en horas entre dos columnas de fecha, sin rellenos.

    Los tickets a los que les falta cualquiera de las dos fechas quedan como NaN
    y `_compute_stats_for_series` los descarta. Nunca se sustituyen por 0 ni se
    recortan a 0: una duración negativa es un error de captura, no un cierre
    instantáneo, y también se descarta.
    """
    if df.empty or col_inicio not in df.columns or col_fin not in df.columns:
        return pd.Series(dtype=float)

    t_inicio = pd.to_datetime(df[col_inicio], errors="coerce")
    t_fin = pd.to_datetime(df[col_fin], errors="coerce")

    return (t_fin - t_inicio).dt.total_seconds() / 3600.0


def _prefixed(stats: Dict[str, float], medida: str) -> Dict[str, Any]:
    """Aplana un bloque de estadísticos a las claves planas que guarda la BD."""
    return {
        f"tiempo_medio_{medida}_horas": stats["promedio"],
        f"tiempo_mediana_{medida}_horas": stats["mediana"],
        f"tiempo_min_{medida}_horas": stats["min"],
        f"tiempo_p25_{medida}_horas": stats["p25"],
        f"tiempo_p75_{medida}_horas": stats["p75"],
        f"tiempo_max_{medida}_horas": stats["max"],
        f"tiempo_std_{medida}_horas": stats["std"],
        f"pct_excede_promedio_{medida}": stats["pct_excede_promedio"],
        f"muestra_{medida}": stats["muestra"],
    }


@dataclass(frozen=True)
class PeriodCohort:
    """
    Las dos particiones de la cohorte de un periodo, agrupadas para poder
    filtrarlas a la vez.

    Las dimensiones jerárquicas (grupo → sucursal → zona → tipo → razón) van
    recortando la cohorte nivel a nivel, y todas las particiones tienen que
    recortarse igual. `filter` lo hace de una sola pasada, en vez de repetir el
    mismo `df[df[col] == v]` una vez por dataframe y por nivel.
    """

    # Partición de TASAS: exige que el cierre caiga dentro del periodo.
    # Las tres últimas suman exactamente `creados`.
    creados: pd.DataFrame
    resueltos: pd.DataFrame
    cancelados: pd.DataFrame
    rezagados: pd.DataFrame

    # Partición de TIEMPOS: sin filtro por mes de cierre.
    resueltos_tiempo: pd.DataFrame
    cerrados_tiempo: pd.DataFrame

    def _frames(self) -> Tuple[pd.DataFrame, ...]:
        return (self.creados, self.resueltos, self.cancelados, self.rezagados,
                self.resueltos_tiempo, self.cerrados_tiempo)

    def filter(self, columna: str, valor: Any) -> "PeriodCohort":
        """La misma cohorte restringida a las filas con `columna == valor`."""
        def sub(df: pd.DataFrame) -> pd.DataFrame:
            if df.empty or columna not in df.columns:
                return df.iloc[0:0]
            return df[df[columna] == valor]

        return PeriodCohort(*(sub(df) for df in self._frames()))

    def valores(self, columna: str) -> set:
        """
        Valores presentes en la columna a lo largo de toda la cohorte.

        Se unen las cuatro particiones de tasas porque juntas son `creados`; las
        de tiempos son subconjuntos suyos y no aportan valores nuevos.
        """
        vistos: set = set()
        for df in (self.creados, self.resueltos, self.cancelados, self.rezagados):
            if not df.empty and columna in df.columns:
                vistos.update(df[columna].unique())
        return vistos

    def desglosar(self, columna: str) -> Iterator[Tuple[Any, "PeriodCohort"]]:
        """Itera (valor, sub-cohorte) por cada valor distinto de la columna."""
        for valor in self.valores(columna):
            yield valor, self.filter(columna, valor)


def _duracion_total(df: pd.DataFrame) -> pd.Series:
    """
    Duración total en horas tal y como la reporta Odoo (creación → cierre).

    Se lee el campo en vez de restar las dos fechas porque coincide al 100% con
    el cálculo y no pierde muestra: la resta deja fuera los tickets sin fecha de
    asignación, este campo los conserva.
    """
    if df.empty or "duracion_total_horas" not in df.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(df["duracion_total_horas"], errors="coerce")


def _con_asignacion(df: pd.DataFrame) -> pd.DataFrame:
    """Tickets que llegaron a tener una primera asignación."""
    if df.empty or "primera_fecha_asignada" not in df.columns:
        return df
    return df[pd.to_datetime(df["primera_fecha_asignada"], errors="coerce").notna()]


def compute_metrics_for_period(cohorte: PeriodCohort) -> Dict[str, Any]:
    """
    Métricas de un periodo sobre la cohorte de tickets *creados* en él.

    Hay dos particiones de la misma cohorte porque las tasas y los tiempos no
    responden a la misma pregunta:

      * **Tasas** — `resueltos` / `cancelados` / `rezagados` exigen que
        el cierre caiga dentro del periodo. Suman exactamente `creados`, así
        que los tres porcentajes reparten el 100%. Un ticket de julio cerrado en
        agosto cuenta como rezagado de julio, que es lo correcto: en julio no se
        cerró.

      * **Tiempos** — `resueltos_tiempo` y `cerrados_tiempo` NO filtran por
        mes de cierre. Ese mismo ticket sí aporta sus horas al MTTR, porque el
        tiempo que tardó es real. Filtrarlo dejaba fuera justo a los más lentos
        y hundía artificialmente la media.

    Sobre ellos se miden seis variantes, cruce de dos fórmulas y dos poblaciones:

                        │ Resueltos              │ Resueltos + Cancelados
        ────────────────┼────────────────────────┼────────────────────────
        asignación →    │ `cierre`               │ `cierre_global`
        creación →      │ `cierre_total`         │ `cierre_total_global`
        1ª respuesta    │ `primera_respuesta`    │ `primera_respuesta_global`
    """
    df_resueltos_tiempo = cohorte.resueltos_tiempo
    df_cerrados_tiempo = cohorte.cerrados_tiempo

    total_creados = len(cohorte.creados)
    total_resueltos = len(cohorte.resueltos)
    total_cancelados = len(cohorte.cancelados)
    total_rezagados = len(cohorte.rezagados)

    universo = total_creados if total_creados > 0 else 1

    metrics: Dict[str, Any] = {
        "total_tickets": total_creados,
        "tickets_resueltos": total_resueltos,
        "tickets_cancelados": total_cancelados,
        "tickets_rezagados": total_rezagados,
        "pct_resueltos": round((total_resueltos / universo) * 100, 2),
        "pct_cancelados": round((total_cancelados / universo) * 100, 2),
        "pct_rezagados": round((total_rezagados / universo) * 100, 2),
    }

    # Cierre desde la primera asignación: mide solo la gestión del técnico,
    # sin la espera en cola. Deja fuera lo que nunca se asignó.
    for medida, poblacion in (
        ("cierre", df_resueltos_tiempo),
        ("cierre_global", df_cerrados_tiempo),
    ):
        metrics.update(_prefixed(
            _compute_stats_for_series(
                _hours_between(poblacion, "primera_fecha_asignada", "ultima_actualizacion_etapa")
            ),
            medida,
        ))

    # Cierre desde la creación: el proceso completo, cola incluida. La
    # diferencia con la medida anterior es la espera antes de asignar.
    for medida, poblacion in (
        ("cierre_total", df_resueltos_tiempo),
        ("cierre_total_global", df_cerrados_tiempo),
    ):
        metrics.update(_prefixed(_compute_stats_for_series(_duracion_total(poblacion)), medida))

    # Primera respuesta = primera asignación − creación, sobre los tickets que
    # llegaron a asignarse. Sin la antigua sustitución por
    # `ultima_actualizacion_etapa`, que convertía el cierre de un ticket nunca
    # asignado en una "respuesta" de cientos de horas.
    for medida, poblacion in (
        ("primera_respuesta", df_resueltos_tiempo),
        ("primera_respuesta_global", df_cerrados_tiempo),
    ):
        metrics.update(_prefixed(
            _compute_stats_for_series(
                _hours_between(_con_asignacion(poblacion), "creado_el", "primera_fecha_asignada")
            ),
            medida,
        ))

    # Alias heredado: el dashboard y `support_cierre_historico` ya guardaban la
    # primera respuesta bajo este nombre cuando solo existía el promedio.
    metrics["tiempo_promedio_primera_respuesta_horas"] = metrics["tiempo_medio_primera_respuesta_horas"]

    return _clean_nan(metrics)
