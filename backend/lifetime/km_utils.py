from __future__ import annotations
from typing import Any, Dict, List, Optional

import pandas as pd
from lifelines import KaplanMeierFitter


def compute_km(
    durations: pd.Series,
    events: pd.Series,
    label: str = "",
) -> Dict[str, Any]:
    """
    Compute Kaplan-Meier survival curve with 95 % confidence intervals.
    Standalone version extracted from ChurnRateAnalyzer._compute_km.
    """
    if events.sum() == 0 or len(durations) < 2:
        return {
            "mediana": None, "p25": None, "p75": None,
            "n_total": int(len(durations)),
            "n_evento": 0, "n_censurado": int(len(durations)),
            "curva": [],
        }

    kmf = KaplanMeierFitter()
    kmf.fit(durations, event_observed=events, label=label)

    sf = kmf.survival_function_
    ci = kmf.confidence_interval_survival_function_
    et = kmf.event_table

    curve: List[Dict[str, Any]] = []
    for t, row in sf.iterrows():
        t_int = int(t)
        s = float(row.iloc[0])
        if t in ci.index:
            ci_low = float(ci.loc[t].iloc[0])
            ci_high = float(ci.loc[t].iloc[1])
        else:
            ci_low = ci_high = s
        n_risk = int(et.at[t, "at_risk"]) if t in et.index else 0
        n_ev = int(et.at[t, "observed"]) if t in et.index else 0
        curve.append({
            "tiempo": t_int,
            "sup": round(s, 6),
            "ci_low": round(ci_low, 6),
            "ci_high": round(ci_high, 6),
            "n_riesgo": n_risk,
            "n_eventos": n_ev,
        })

    p25 = p50 = p75 = None
    for t, row in sf.iterrows():
        s = float(row.iloc[0])
        if p25 is None and s <= 0.75:
            p25 = int(t)
        if p50 is None and s <= 0.50:
            p50 = int(t)
        if p75 is None and s <= 0.25:
            p75 = int(t)

    return {
        "mediana": float(p50) if p50 is not None else None,
        "p25": p25,
        "p75": p75,
        "n_total": int(len(durations)),
        "n_evento": int(events.sum()),
        "n_censurado": int((1 - events).sum()),
        "curva": curve,
    }
