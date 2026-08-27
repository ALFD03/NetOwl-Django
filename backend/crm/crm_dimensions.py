from __future__ import annotations
import json
import logging
import pandas as pd
from ..database import DBConnector
from ..conf_config import DB_SCHEMA, TableNames
from .crm_config import DIMENSIONES
from .metrics.core import compute_crm_metrics_for_period

logger = logging.getLogger(__name__)


def save_crm_dimensiones_periodo(
    db: DBConnector,
    periodo: str,
    df_creados: pd.DataFrame,
    df_ganados: pd.DataFrame,
    df_perdidos: pd.DataFrame,
    df_pendientes: pd.DataFrame,
    df_logs_e8: pd.DataFrame,
    df_logs_all: pd.DataFrame,
    df_clients: pd.DataFrame,
    df_logs_hist: pd.DataFrame | None = None,
    df_perdidas_cierre: pd.DataFrame | None = None,
):
    rows_to_insert = []

    for dim in DIMENSIONES:
        # Extraer todos los valores únicos presentes en este periodo para la dimensión
        valores = set()
        for df in [df_creados, df_ganados, df_perdidos, df_pendientes, df_clients]:
            if not df.empty and dim in df.columns:
                vals = df[dim].dropna().astype(str).str.strip()
                vals = vals[~vals.isin(["", "nan", "None", "<NA>"])]
                valores.update(vals.unique())

        for val in sorted(valores):
            # Filtrar DataFrames para el valor específico de la dimensión
            def _filter_dim(df: pd.DataFrame) -> pd.DataFrame:
                if df.empty or dim not in df.columns:
                    return pd.DataFrame()
                return df[df[dim].astype(str).str.strip() == val]

            cr_d = _filter_dim(df_creados)
            ga_d = _filter_dim(df_ganados)
            pe_d = _filter_dim(df_perdidos)
            pn_d = _filter_dim(df_pendientes)
            cl_d = _filter_dim(df_clients)

            # Para los logs, filtramos por los clientes que pertenecen a este valor dimensional
            valid_cids = set(cl_d["id"].astype(str).to_numpy()) if not cl_d.empty else set()
            
            e8_d = df_logs_e8[df_logs_e8["client_id"].astype(str).isin(valid_cids)] if not df_logs_e8.empty else pd.DataFrame()
            lg_d = df_logs_all[df_logs_all["client_id"].astype(str).isin(valid_cids)] if not df_logs_all.empty else pd.DataFrame()
            # El historial se recorta a los mismos clientes: la efectividad lo
            # usa para resolver salidas que cierran en un periodo posterior.
            if df_logs_hist is not None and not df_logs_hist.empty:
                hs_d = df_logs_hist[df_logs_hist["client_id"].astype(str).isin(valid_cids)]
            else:
                hs_d = pd.DataFrame()

            if cr_d.empty and ga_d.empty and pe_d.empty and pn_d.empty:
                continue

            # Las pérdidas del mes se recortan a la misma rebanada dimensional.
            pc_d = _filter_dim(df_perdidas_cierre) if df_perdidas_cierre is not None else pd.DataFrame()

            m_dim = compute_crm_metrics_for_period(cr_d, ga_d, pe_d, pn_d, e8_d, lg_d, cl_d, hs_d, pc_d)
            ef_dim = m_dim.get("efectividad", [])

            rows_to_insert.append((
                periodo,
                dim,
                val,
                json.dumps(m_dim),
                json.dumps(ef_dim)
            ))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} WHERE periodo_reporte = %s",
                [periodo]
            )
            for p, dim, val, json_m, json_ef in rows_to_insert:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}
                    (periodo_reporte, dimension, valor, metricas, efectividad, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    """,
                    [p, dim, val, json_m, json_ef]
                )
        conn.commit()