# NetOwl-Django/backend/support/analyzer.py

from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import RESOLVED_STAGES, CANCELED_STAGES, SUPPORT_CIERRE_COLUMNS
from backend.support.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)


def _save_global_support_metrics(db: DBConnector, global_m: dict, grupos_m: dict):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} (id, resumen_global, por_grupo_trabajo, updated_at)
                VALUES (1, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    resumen_global = EXCLUDED.resumen_global,
                    por_grupo_trabajo = EXCLUDED.por_grupo_trabajo,
                    updated_at = NOW()
                """,
                [json.dumps(global_m), json.dumps(grupos_m)]
            )
        conn.commit()


def _save_support_cierre_historico_global(db: DBConnector, periodo: str, global_m: dict):
    columns = ["periodo_reporte"] + SUPPORT_CIERRE_COLUMNS
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in SUPPORT_CIERRE_COLUMNS)
    values = [periodo] + [global_m.get(c, 0) for c in SUPPORT_CIERRE_COLUMNS]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                ({", ".join(columns)}, updated_at)
                VALUES ({", ".join(["%s"] * len(columns))}, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    {updates},
                    updated_at = NOW()
                """,
                values
            )
        conn.commit()


def _save_support_dimensiones_periodo(
    db: DBConnector, periodo: str,
    df_creados: pd.DataFrame, df_resueltos: pd.DataFrame,
    df_cancelados: pd.DataFrame, df_rezagados: pd.DataFrame
):
    """Guarda las dimensiones jerárquicas multinivel respetando la clasificación del periodo."""
    rows_to_insert = []

    todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(
        set(df_resueltos["grupo_trabajo"].unique())
    ).union(set(df_cancelados["grupo_trabajo"].unique())).union(set(df_rezagados["grupo_trabajo"].unique()))
    
    for grupo in todos_grupos:
        df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo] if not df_creados.empty else pd.DataFrame()
        df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo] if not df_resueltos.empty else pd.DataFrame()
        df_can_g = df_cancelados[df_cancelados["grupo_trabajo"] == grupo] if not df_cancelados.empty else pd.DataFrame()
        df_rez_g = df_rezagados[df_rezagados["grupo_trabajo"] == grupo] if not df_rezagados.empty else pd.DataFrame()
        
        # 1. Nivel Grupo de Trabajo Global
        m_g = compute_metrics_for_period(df_cr_g, df_re_g, df_can_g, df_rez_g)
        rows_to_insert.append((periodo, "grupo_trabajo", str(grupo), "Todas", "Todas", str(grupo), json.dumps(m_g)))

        # 2. Nivel Sucursal a nivel de Grupo
        sucs_cr = set(df_cr_g["sucursal"].unique()) if (not df_cr_g.empty and "sucursal" in df_cr_g.columns) else set()
        sucs_re = set(df_re_g["sucursal"].unique()) if (not df_re_g.empty and "sucursal" in df_re_g.columns) else set()
        sucs_can = set(df_can_g["sucursal"].unique()) if (not df_can_g.empty and "sucursal" in df_can_g.columns) else set()
        sucs_rez = set(df_rez_g["sucursal"].unique()) if (not df_rez_g.empty and "sucursal" in df_rez_g.columns) else set()

        for suc in sucs_cr.union(sucs_re).union(sucs_can).union(sucs_rez):
            df_cr_s = df_cr_g[df_cr_g["sucursal"] == suc] if not df_cr_g.empty else pd.DataFrame()
            df_re_s = df_re_g[df_re_g["sucursal"] == suc] if not df_re_g.empty else pd.DataFrame()
            df_can_s = df_can_g[df_can_g["sucursal"] == suc] if not df_can_g.empty else pd.DataFrame()
            df_rez_s = df_rez_g[df_rez_g["sucursal"] == suc] if not df_rez_g.empty else pd.DataFrame()

            m_s = compute_metrics_for_period(df_cr_s, df_re_s, df_can_s, df_rez_s)
            rows_to_insert.append((periodo, "sucursal", str(grupo), "Todas", "Todas", str(suc), json.dumps(m_s)))

        # 3. Nivel Zona - Sucursal a nivel de Grupo
        zs_cr = set(df_cr_g["zona_sucursal"].unique()) if (not df_cr_g.empty and "zona_sucursal" in df_cr_g.columns) else set()
        zs_re = set(df_re_g["zona_sucursal"].unique()) if (not df_re_g.empty and "zona_sucursal" in df_re_g.columns) else set()
        zs_can = set(df_can_g["zona_sucursal"].unique()) if (not df_can_g.empty and "zona_sucursal" in df_can_g.columns) else set()
        zs_rez = set(df_rez_g["zona_sucursal"].unique()) if (not df_rez_g.empty and "zona_sucursal" in df_rez_g.columns) else set()

        for zs in zs_cr.union(zs_re).union(zs_can).union(zs_rez):
            df_cr_zs = df_cr_g[df_cr_g["zona_sucursal"] == zs] if not df_cr_g.empty else pd.DataFrame()
            df_re_zs = df_re_g[df_re_g["zona_sucursal"] == zs] if not df_re_g.empty else pd.DataFrame()
            df_can_zs = df_can_g[df_can_g["zona_sucursal"] == zs] if not df_can_g.empty else pd.DataFrame()
            df_rez_zs = df_rez_g[df_rez_g["zona_sucursal"] == zs] if not df_rez_g.empty else pd.DataFrame()

            m_zs = compute_metrics_for_period(df_cr_zs, df_re_zs, df_can_zs, df_rez_zs)
            rows_to_insert.append((periodo, "zona", str(grupo), "Todas", "Todas", str(zs), json.dumps(m_zs)))

        # 4. Nivel Tipos de Solicitud y Razones de Falla
        tipos = set(df_cr_g["tipo_solicitud"].unique()).union(set(df_re_g["tipo_solicitud"].unique())).union(set(df_can_g["tipo_solicitud"].unique())).union(set(df_rez_g["tipo_solicitud"].unique())) if not df_cr_g.empty or not df_re_g.empty else set()
        
        for tipo in tipos:
            df_cr_gt = df_cr_g[df_cr_g["tipo_solicitud"] == tipo] if not df_cr_g.empty else pd.DataFrame()
            df_re_gt = df_re_g[df_re_g["tipo_solicitud"] == tipo] if not df_re_g.empty else pd.DataFrame()
            df_can_gt = df_can_g[df_can_g["tipo_solicitud"] == tipo] if not df_can_g.empty else pd.DataFrame()
            df_rez_gt = df_rez_g[df_rez_g["tipo_solicitud"] == tipo] if not df_rez_g.empty else pd.DataFrame()

            m_gt = compute_metrics_for_period(df_cr_gt, df_re_gt, df_can_gt, df_rez_gt)
            rows_to_insert.append((periodo, "tipo_solicitud", str(grupo), str(tipo), "Todas", str(tipo), json.dumps(m_gt)))

            razones = set(df_cr_gt["razon_falla"].unique()).union(set(df_re_gt["razon_falla"].unique())).union(set(df_can_gt["razon_falla"].unique())).union(set(df_rez_gt["razon_falla"].unique())) if not df_cr_gt.empty or not df_re_gt.empty else set()
            for razon in razones:
                df_cr_gtr = df_cr_gt[df_cr_gt["razon_falla"] == razon] if not df_cr_gt.empty else pd.DataFrame()
                df_re_gtr = df_re_gt[df_re_gt["razon_falla"] == razon] if not df_re_gt.empty else pd.DataFrame()
                df_can_gtr = df_can_gt[df_can_gt["razon_falla"] == razon] if not df_can_gt.empty else pd.DataFrame()
                df_rez_gtr = df_rez_gt[df_rez_gt["razon_falla"] == razon] if not df_rez_gt.empty else pd.DataFrame()

                m_gtr = compute_metrics_for_period(df_cr_gtr, df_re_gtr, df_can_gtr, df_rez_gtr)
                rows_to_insert.append((periodo, "razon_falla", str(grupo), str(tipo), str(razon), str(razon), json.dumps(m_gtr)))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} WHERE periodo_reporte = %s",
                [periodo]
            )
            for p, dim, grupo, tipo, razon, val, json_m in rows_to_insert:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
                    (periodo_reporte, dimension, grupo_trabajo, tipo_solicitud, razon_falla, valor, metricas)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    [p, dim, grupo, tipo, razon, val, json_m]
                )
        conn.commit()


# Medidas de tiempo y su columna de muestra: promediar un periodo sin ninguna
# duración medible metería un 0 en la media, que es justo el sesgo que se
# corrigió a nivel de ticket. Los periodos con muestra 0 se excluyen.
_TIME_MEASURES = {
    "cierre": "muestra_cierre",
    "cierre_total": "muestra_cierre_total",
    "primera_respuesta": "muestra_primera_respuesta",
}

_VOLUME_FIELDS = ["total_tickets", "tickets_resueltos", "tickets_cancelados", "tickets_rezagados"]
_RATE_FIELDS = ["pct_resueltos", "pct_cancelados", "pct_rezagados"]


def _mean_of(df: pd.DataFrame, field: str, mask_field: str | None = None) -> float:
    """Media de `field`, restringida a las filas con muestra si se indica una."""
    if field not in df.columns:
        return 0.0

    serie = pd.to_numeric(df[field], errors="coerce")
    if mask_field and mask_field in df.columns:
        serie = serie[pd.to_numeric(df[mask_field], errors="coerce").fillna(0) > 0]

    serie = serie.dropna()
    return round(float(serie.mean()), 2) if not serie.empty else 0.0


def _average_periods(df: pd.DataFrame, volumen_como_promedio_mensual: bool) -> dict:
    """Promedia todos los periodos analizados en un único resumen acumulado."""
    sufijo = "_promedio_mensual" if volumen_como_promedio_mensual else ""
    avg = {f"{field}{sufijo}": _mean_of(df, field) for field in _VOLUME_FIELDS}
    avg.update({field: _mean_of(df, field) for field in _RATE_FIELDS})

    for medida, muestra in _TIME_MEASURES.items():
        for stat in ("medio", "mediana", "min", "p25", "p75", "max", "std"):
            key = f"tiempo_{stat}_{medida}_horas"
            avg[key] = _mean_of(df, key, muestra)
        for stat in ("promedio", "mediana"):
            key = f"pct_excede_{stat}_{medida}"
            avg[key] = _mean_of(df, key, muestra)
        avg[muestra] = _mean_of(df, muestra)

    avg["tiempo_promedio_primera_respuesta_horas"] = avg["tiempo_medio_primera_respuesta_horas"]
    return avg


def run_support_analysis(periodo_str: str | None = None) -> dict:
    db = DBConnector()
    df_all = db.read_table(TableNames.SUPPORT_TICKETS)
    
    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    df_all["periodo_creacion"] = pd.to_datetime(df_all["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_all["periodo_cierre"] = pd.to_datetime(df_all["ultima_actualizacion_etapa"], errors="coerce").dt.strftime("%Y-%m")
    
    df_all["etapa_clean"] = df_all["etapa"].astype(str).str.strip().str.lower()
    df_all["es_resuelto"] = df_all["etapa_clean"].isin(RESOLVED_STAGES)
    df_all["es_cancelado"] = df_all["etapa_clean"].isin(CANCELED_STAGES)

    # Crear columna zona_sucursal
    z = df_all["zona"].fillna("Sin Zona").astype(str).str.strip()
    s = df_all["sucursal"].fillna("Sin Sucursal").astype(str).str.strip()
    df_all["zona_sucursal"] = z + " - " + s

    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        # Solo periodos de creación: la cohorte de un mes son sus tickets creados,
        # así que un mes sin altas no tiene nada que reportar.
        p_creados = df_all.dropna(subset=["periodo_creacion"])["periodo_creacion"].unique().tolist()
        periodos_target = sorted(set(p_creados), reverse=True)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S)...")

    all_summaries = {}

    for p in periodos_target:
        # Las cuatro particiones son cohorte de creación: todo lo que se mide en
        # el mes P nació en el mes P. Así resueltos + cancelados + rezagados
        # suman exactamente los creados y los porcentajes reparten el 100%.
        mask_creados = df_all["periodo_creacion"] == p
        mask_cerrado_en_p = df_all["periodo_cierre"] == p

        # 1. Creados en el mes P
        mask_resueltos = mask_creados & df_all["es_resuelto"] & mask_cerrado_en_p
        mask_cancelados = mask_creados & df_all["es_cancelado"] & mask_cerrado_en_p

        # 3. Rezagados: creados en P cuya fecha de cierre NO cae en P — porque
        #    cerraron más tarde o porque siguen abiertos. Ya no arrastran los
        #    tickets de meses anteriores, que antes se recontaban en cada periodo.
        mask_rezagados = mask_creados & ~mask_resueltos & ~mask_cancelados

        df_creados = df_all[mask_creados].copy()
        df_resueltos = df_all[mask_resueltos].copy()
        df_cancelados = df_all[mask_cancelados].copy()
        df_rezagados = df_all[mask_rezagados].copy()

        if df_creados.empty:
            continue

        global_m = compute_metrics_for_period(df_creados, df_resueltos, df_cancelados, df_rezagados)
        
        grupos_m = {}
        todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(
            set(df_resueltos["grupo_trabajo"].unique())
        ).union(set(df_cancelados["grupo_trabajo"].unique())).union(set(df_rezagados["grupo_trabajo"].unique()))
        
        for grupo in todos_grupos:
            df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo] if not df_creados.empty else pd.DataFrame()
            df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo] if not df_resueltos.empty else pd.DataFrame()
            df_can_g = df_cancelados[df_cancelados["grupo_trabajo"] == grupo] if not df_cancelados.empty else pd.DataFrame()
            df_rez_g = df_rezagados[df_rezagados["grupo_trabajo"] == grupo] if not df_rezagados.empty else pd.DataFrame()

            grupos_m[str(grupo)] = compute_metrics_for_period(df_cr_g, df_re_g, df_can_g, df_rez_g)

        _save_support_cierre_historico_global(db, p, global_m)
        _save_support_dimensiones_periodo(db, p, df_creados, df_resueltos, df_cancelados, df_rezagados)

        all_summaries[p] = {
            "global": global_m,
            "por_grupo": grupos_m
        }

    # Promedio acumulado
    if all_summaries:
        df_sum = pd.DataFrame([s["global"] for s in all_summaries.values()])
        resumen_global_avg = _average_periods(df_sum, volumen_como_promedio_mensual=True)

        grupo_records = []
        for p, summary in all_summaries.items():
            for g_name, g_m in summary["por_grupo"].items():
                g_copy = dict(g_m)
                g_copy["grupo_trabajo"] = g_name
                grupo_records.append(g_copy)

        por_grupo_avg = {}
        if grupo_records:
            df_g = pd.DataFrame(grupo_records)
            for g_name, df_g_sub in df_g.groupby("grupo_trabajo"):
                por_grupo_avg[g_name] = _average_periods(df_g_sub, volumen_como_promedio_mensual=False)

        _save_global_support_metrics(db, resumen_global_avg, por_grupo_avg)

    print("✅ ANÁLISIS DE SUPPORT COMPLETADO CON ÉXITO.\n")
    return all_summaries