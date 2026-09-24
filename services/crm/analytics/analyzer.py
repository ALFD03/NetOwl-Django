"""El analisis de CRM: recorre los periodos y persiste sus metricas.

Por cada mes construye las cuatro poblaciones (creadas, ganadas, perdidas y
pendientes), la poblacion en riesgo y los movimientos, llama al calculo de
metricas y guarda el resultado. Al final recalcula el promedio global.

Quien parte la base en esas poblaciones es `poblaciones.py`, compartido con las
metricas diarias: el corte del mes y el corte del dia N tienen que significar lo
mismo, y para eso no puede haber dos definiciones de que es una ganada.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector

from .day_metrics import build_crm_day_metrics
from .dimensions import build_crm_dimension_rows, save_crm_dimensiones_periodo
from .poblaciones import construir_poblaciones, preparar_datos

logger = logging.getLogger(__name__)


# Columnas escalares de `crm_cierre_historico`, en el mismo orden en que se
# insertan. La lista se derivaba a mano en tres sitios —columnas, marcadores y
# valores— y cada métrica nueva obligaba a cuadrar los tres; aquí se declara una
# vez y el SQL se construye a partir de ella. El nombre de la columna es la
# clave de la métrica.
_COLUMNAS_CIERRE = (
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
_COLUMNAS_CIERRE_JSON = ("efectividad", "tiempo_por_etapa")


def _save_crm_cierre_historico(db: DBConnector, periodo: str, m: dict):
    """Guarda (o actualiza) la fila de cierre de un periodo.

    Las columnas se derivan de `_COLUMNAS_CIERRE`, declarada una sola vez. Se
    indexa con `m[c]` y no con `.get`: una metrica declarada y no calculada debe
    reventar, no escribir un NULL silencioso en el historico.
    """
    columnas = ("periodo_reporte", *_COLUMNAS_CIERRE, *_COLUMNAS_CIERRE_JSON)
    marcadores = ", ".join(["%s"] * len(columnas))
    updates = ",\n                    ".join(
        f"{c} = EXCLUDED.{c}" for c in columnas if c != "periodo_reporte"
    )
    valores = [
        periodo,
        # `m[c]`, no `.get`: una métrica que se declare aquí y no se calcule
        # debe reventar, no escribir un NULL silencioso en el histórico.
        *[m[c] for c in _COLUMNAS_CIERRE],
        *[json.dumps(m.get(c, [])) for c in _COLUMNAS_CIERRE_JSON],
    ]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} (
                    {", ".join(columnas)}, updated_at
                )
                VALUES ({marcadores}, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    {updates},
                    updated_at = NOW()
                """,
                valores,
            )
        conn.commit()


def _save_global_crm_metrics(db: DBConnector, resumen_global: dict, tiempo_por_etapa: list, efectividad: list):
    """Guarda la fila unica con el promedio de todos los periodos."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} (id, resumen_global, tiempo_por_etapa, efectividad, updated_at)
                VALUES (1, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    resumen_global = EXCLUDED.resumen_global,
                    tiempo_por_etapa = EXCLUDED.tiempo_por_etapa,
                    efectividad = EXCLUDED.efectividad,
                    updated_at = NOW()
                """,
                [json.dumps(resumen_global), json.dumps(tiempo_por_etapa), json.dumps(efectividad)]
            )
        conn.commit()


def run_crm_analysis(
    periodo_str: str | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
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
    datos = preparar_datos(db)

    if datos.vacio:
        print("⚠️ No hay oportunidades de CRM para analizar.")
        return {"status": "empty", "message": "No hay datos cargados."}

    un_solo_mes = bool(periodo_str and len(periodo_str) == 7)
    periodos_target = [periodo_str] if un_solo_mes else datos.periodos()

    print(f"\n📊 PROCESANDO CRM ANALYTICS PARA {len(periodos_target)} PERIODO(S)...")
    all_summaries = {}

    for p in periodos_target:
        pob = construir_poblaciones(datos, p)
        if pob is None:
            continue

        m = pob.metricas()

        _save_crm_cierre_historico(db, p, m)
        save_crm_dimensiones_periodo(db, p, build_crm_dimension_rows(pob))
        # Solo del mes pedido: recorrer los dias de todo el historico son
        # treinta y un cortes por cada mes que haya, y nadie lanza un analisis
        # global esperando eso. El cierre de cada mes si se recalcula entero.
        if un_solo_mes:
            build_crm_day_metrics(p, db=db, datos=datos, progreso=progreso)

        all_summaries[p] = m

    # 4. Calcular promedio acumulado global
    if all_summaries:
        df_sum = pd.DataFrame(list(all_summaries.values()))

        resumen_global_avg = {
            "total_oportunidades_promedio": round(float(df_sum["total_oportunidades"].mean()), 2),
            "ganados_promedio": round(float(df_sum["ganados"].mean()), 2),
            "perdidos_promedio": round(float(df_sum["perdidos"].mean()), 2),
            "pendientes_promedio": round(float(df_sum["pendientes"].mean()), 2),
            "pct_instalacion_promedio": round(float(df_sum["pct_instalacion"].mean()), 2),
            "pct_perdida_promedio": round(float(df_sum["pct_perdida"].mean()), 2),
            "pct_pendientes_promedio": round(float(df_sum["pct_pendientes"].mean()), 2),
            "count_devueltos_e8_promedio": round(float(df_sum["count_devueltos_e8"].mean()), 2),
            "pct_devueltos_e8_promedio": round(float(df_sum["pct_devueltos_e8"].mean()), 2),
            "pct_devueltos_e8_bruto_promedio": round(float(df_sum["pct_devueltos_e8_bruto"].mean()), 2),

            # Tiempos Instalación
            "horas_promedio_inst": round(float(df_sum["horas_promedio_inst"].mean()), 2),
            "horas_mediana_inst": round(float(df_sum["horas_mediana_inst"].mean()), 2),
            "pct_excede_prom_inst": round(float(df_sum["pct_excede_prom_inst"].mean()), 2),

            # Tiempos Pérdida
            "horas_promedio_perd": round(float(df_sum["horas_promedio_perd"].mean()), 2),
            "horas_mediana_perd": round(float(df_sum["horas_mediana_perd"].mean()), 2),
            "pct_excede_prom_perd": round(float(df_sum["pct_excede_prom_perd"].mean()), 2),

            # Tiempo de Cierre
            "horas_promedio_cierre": round(float(df_sum["horas_promedio_cierre"].mean()), 2),
            "horas_mediana_cierre": round(float(df_sum["horas_mediana_cierre"].mean()), 2),
            "pct_excede_prom_cierre": round(float(df_sum["pct_excede_prom_cierre"].mean()), 2),
        }

        # Último conjunto de efectividad y tiempos por etapa
        ultimo_resumen = list(all_summaries.values())[0]
        _save_global_crm_metrics(
            db,
            resumen_global_avg,
            ultimo_resumen.get("tiempo_por_etapa", []),
            ultimo_resumen.get("efectividad", [])
        )

    print("✅ ANÁLISIS DE CRM COMPLETADO CON ÉXITO.\n")
    return all_summaries