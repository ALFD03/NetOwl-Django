"""El analisis de CRM: recorre los periodos y persiste sus metricas.

Por cada mes construye las cuatro poblaciones (creadas, ganadas, perdidas y
pendientes), la poblacion en riesgo y los movimientos, llama al calculo de
metricas y guarda el resultado. Al final recalcula el promedio global.

Quien parte la base en esas poblaciones es `populations.py`, compartido con las
metricas diarias: el corte del mes y el corte del dia N tienen que significar lo
mismo, y para eso no puede haber dos definiciones de que es una ganada.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from core.database import DBConnector
from core.tables import upsert

from . import tables
from .day_metrics import build_crm_day_metrics
from .dimensions import build_crm_dimension_rows, save_dimensions
from .metrics import average_closes
from .populations import build_populations, prepare_data

logger = logging.getLogger(__name__)


# Columnas escalares de `crm_cierre_historico`, en el mismo orden en que se
# insertan. La lista se derivaba a mano en tres sitios —columnas, marcadores y
# valores— y cada métrica nueva obligaba a cuadrar los tres; aquí se declara una
# vez y el SQL se construye a partir de ella. El nombre de la columna es la
# clave de la métrica.
_CLOSE_COLUMNS = (
    "total_oportunidades", "ganados", "perdidos", "pendientes",
    "pct_instalacion", "pct_perdida", "pct_pendientes",

    # Devoluciones a la etapa 8. `count`/`pct` son el riesgo depurado
    # —transiciones del mes sobre lo que estuvo vivo, sin motivos de excepción—
    # y las demás columnas son el desglose que lo explica.
    "count_devueltos_e8", "pct_devueltos_e8",
    "count_devueltos_e8_bruto", "pct_devueltos_e8_bruto",
    "e8_devueltos_excepcion", "e8_devueltos_con_motivo",
    "e8_devueltos_sin_motivo", "e8_devueltos_estimados",
    "e8_clientes_devueltos", "e8_reincidentes", "total_en_riesgo",

    "horas_promedio_inst", "horas_mediana_inst", "horas_p25_inst", "horas_p75_inst",
    "horas_min_inst", "horas_max_inst", "horas_std_inst", "pct_excede_prom_inst",
    "horas_promedio_perd", "horas_mediana_perd", "horas_p25_perd", "horas_p75_perd",
    "horas_min_perd", "horas_max_perd", "horas_std_perd", "pct_excede_prom_perd",
    "horas_promedio_cierre", "horas_mediana_cierre", "horas_p25_cierre", "horas_p75_cierre",
    "horas_min_cierre", "horas_max_cierre", "horas_std_cierre", "pct_excede_prom_cierre",
)

# Columnas JSONB: una fila por etapa, no caben como escalar.
_CLOSE_JSON_COLUMNS = ("efectividad", "tiempo_por_etapa")


def _save_close(db: DBConnector, period: str, m: dict) -> None:
    """Guarda (o actualiza) la fila de cierre de un periodo.

    Se indexa con `m[c]` y no con `.get`: una métrica declarada y no calculada
    debe reventar, no escribir un NULL silencioso en el histórico.
    """
    row = {
        "periodo_reporte": period,
        **{c: m[c] for c in _CLOSE_COLUMNS},
        **{c: m.get(c, []) for c in _CLOSE_JSON_COLUMNS},
    }
    with db.transaction() as cur:
        upsert(cur, tables.CLOSE_HISTORY, [row])


def _save_global(db: DBConnector, global_summary: dict, time_by_stage: list, effectiveness: list) -> None:
    """Guarda la fila única con el promedio de todos los periodos."""
    row = {"id": 1, "resumen_global": global_summary, "tiempo_por_etapa": time_by_stage, "efectividad": effectiveness}
    with db.transaction() as cur:
        upsert(cur, tables.GLOBAL_METRICS, [row])


def run_crm_analysis(
    period_str: str | None = None,
    progress: Callable[[int, int, str], None] | None = None,
) -> dict:
    """Recalcula CRM: un periodo concreto, o todos los que tengan oportunidades.

    La preparacion de la base -deduplicar, resolver a que oportunidad pertenece
    cada movimiento, medir las estancias en curso contra un mismo reloj- se hace
    una sola vez; despues, por cada periodo, se calcula y guarda el cierre, su
    desglose dimensional y el corte de cada uno de sus dias.

    Los dias salen de la misma base ya preparada: es la lectura de `crm_clients`
    y `crm_logs` lo que cuesta, no el corte. `progreso(hechos, total, etiqueta)`
    es lo que alimenta la barra de la interfaz mientras los recorre.
    """
    db = DBConnector()
    data = prepare_data(db)

    if data.empty:
        print("⚠️ No hay oportunidades de CRM para analizar.")
        return {"status": "empty", "message": "No hay datos cargados."}

    single_month = bool(period_str and len(period_str) == 7)
    target_periods = [period_str] if single_month else data.periods()

    print(f"\n📊 PROCESANDO CRM ANALYTICS PARA {len(target_periods)} PERIODO(S)...")
    all_summaries = {}

    for p in target_periods:
        pop = build_populations(data, p)
        if pop is None:
            continue

        m = pop.metrics()

        _save_close(db, p, m)
        save_dimensions(db, p, build_crm_dimension_rows(pop))
        # Solo del mes pedido: recorrer los dias de todo el historico son
        # treinta y un cortes por cada mes que haya, y nadie lanza un analisis
        # global esperando eso. El cierre de cada mes si se recalcula entero.
        if single_month:
            build_crm_day_metrics(p, db=db, data=data, progress=progress)

        all_summaries[p] = m

    # 4. Calcular promedio acumulado global
    if all_summaries:
        global_avg_summary = average_closes(list(all_summaries.values()))

        # Último conjunto de efectividad y tiempos por etapa
        last_summary = list(all_summaries.values())[0]
        _save_global(
            db,
            global_avg_summary,
            last_summary.get("tiempo_por_etapa", []),
            last_summary.get("efectividad", [])
        )

    print("✅ ANÁLISIS DE CRM COMPLETADO CON ÉXITO.\n")
    return all_summaries