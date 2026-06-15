from __future__ import annotations
import json
from typing import Any, Dict
import pandas as pd
from ...database import DBConnector
from . import lifecycle, dimensions as dim_module
from .loader import load_data, build_clean_logs


def run_lifecycle_analysis(db=None) -> Dict[str, Any]:
    """Ejecuta el analisis de ciclo de vida completo.

    Carga datos, construye periodos, calcula metricas globales y
    por dimension, y persiste todo.

    Returns:
        Dict con metricas calculadas.
    """
    if db is None:
        db = DBConnector()
    subs, l1, l2 = load_data(db)
    logs = build_clean_logs(l1, l2)
    periods = lifecycle.build_lifecycle_periods(subs, logs)
    metrics = lifecycle.compute_metrics(periods)

    if not periods.empty:
        periods_out = periods.copy()
        for col in ["f_inicio", "f_fin"]:
            periods_out[col] = periods_out[col].astype(str)
        db.save_historico(periods_out, "lifetime_periodos", "global", "lifetime")

    metrics_flat: Dict[str, Any] = {}
    for k, v in metrics.items():
        if k in ("curva_activo", "curva_reactivacion"):
            continue
        if isinstance(v, dict):
            metrics_flat[k] = json.dumps(v)
        else:
            metrics_flat[k] = v
    metrics_flat["curva_activo_json"] = json.dumps(metrics.get("curva_activo", []))
    metrics_flat["curva_reactivacion_json"] = json.dumps(metrics.get("curva_reactivacion", []))
    df_metrics = pd.DataFrame([metrics_flat])
    db.save_historico(df_metrics, "lifetime_metricas", "global", "lifetime")

    dim_df = dim_module.compute_dimension_metrics(subs, periods)
    if not dim_df.empty:
        db.save_historico(dim_df, "lifetime_dimensiones", "global", "lifetime")

    print(f"\nLIFECYCLE ANALYSIS COMPLETE")
    print(f"  Suscriptores analizados: {metrics.get('suscriptores_totales', 0)}")
    print(f"  Nunca inactivos: {metrics.get('suscriptores_nunca_inactivos', 0)}")
    print(f"  Periodos activo registrados: {len(periods[periods['tipo']=='activo']) if not periods.empty else 0}")
    print(f"  Periodos cancelado registrados: {len(periods[periods['tipo']=='cancelado']) if not periods.empty else 0}")
    print(f"  Vida activa - mediana: {metrics.get('mediana_activo', 'N/A')} d | prom: {metrics.get('promedio_activo', 'N/A')} d")
    print(f"  Reactivacion - mediana: {metrics.get('mediana_reactivacion', 'N/A')} d | prom: {metrics.get('promedio_reactivacion', 'N/A')} d | n={metrics.get('n_total_reactivacion', 0)}")
    print(f"  Ciclos por sub: {metrics.get('ciclos_por_suscriptor', {})}")
    print(f"  Dimensiones calculadas: {len(dim_df) if not dim_df.empty else 0} filas")

    return metrics
