#!/usr/bin/env python
"""Comprueba que el recorrido acumulativo del log da lo mismo que la referencia.

`EstadoAcumulado` (analytics/analyzer/metrics_calc.py) responde "estado a la
fecha X" recorriendo el historico una sola vez, en lugar de filtrarlo y
reagruparlo en cada corte como hace `get_state_at`. Es entre 10 y 11 veces mas
rapido para un mes completo, pero toca el calculo de churn: si alguien cambia el
orden del frame de logs, o el desempate entre un log real y su sintetico del
mismo segundo, los numeros cambian sin que nada falle.

Este script es la red bajo ese cambio. No necesita base de datos ni Vault:
genera logs sinteticos con los casos dificiles y compara las dos
implementaciones fila a fila, y ademas recorre un mes entero con el analyzer
real por los dos caminos comparando cada metrica del resumen.

    python scripts/verificar_estado_acumulado.py

No es una bateria de pruebas del proyecto (no la hay): es una comprobacion
puntual, para ejecutar a mano cuando se toque el analyzer.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.models import Periodo  # noqa: E402
from services.subscriptions.analytics.analyzer import dimensions, metrics_calc  # noqa: E402
from services.subscriptions.analytics.analyzer.analyzer import MetricsAnalyzer  # noqa: E402

ESTADOS = ["3_progress", "4_paused", "6_churn", "8_30days", "9_free"]
ZONAS = ["Norte", "Sur", "Este"]
SUCURSALES = ["Centro", "Playa"]


def construir_logs(rng, n_ordenes=400, max_logs=8):
    filas = []
    for i in range(n_ordenes):
        orden = f"ORD{i:05d}"
        for _ in range(rng.integers(1, max_logs)):
            dia = int(rng.integers(1, 90))
            # Muchas fechas repetidas a proposito: los empates son justo donde
            # se juega la equivalencia.
            segundo = int(rng.integers(0, 3)) * 3600
            filas.append({
                "orden": orden,
                "f_dt": pd.Timestamp("2025-01-01") + pd.Timedelta(days=dia, seconds=segundo),
                "estado": ESTADOS[int(rng.integers(0, len(ESTADOS)))],
                "_sintetico": False,
            })
            # Sintetico en el mismo instante: debe ganar el desempate.
            if rng.random() < 0.15:
                filas.append({
                    "orden": orden,
                    "f_dt": pd.Timestamp("2025-01-01") + pd.Timedelta(days=dia, seconds=segundo),
                    "estado": ESTADOS[int(rng.integers(0, len(ESTADOS)))],
                    "_sintetico": True,
                })

    df = pd.DataFrame(filas)
    # Misma preparacion que hace rules.apply_log_rules antes de entregarlo.
    return df.sort_values(["orden", "f_dt"]).reset_index(drop=True)


def comparar(df, fechas, estado, strictly_before):
    acumulado = metrics_calc.EstadoAcumulado(df)
    fallos = 0
    for fecha in fechas:
        esperado = metrics_calc.get_state_at(df, fecha, estado, strictly_before)
        obtenido = acumulado.en_estado(fecha, estado, strictly_before)
        if not esperado.reset_index(drop=True).equals(obtenido.reset_index(drop=True)):
            fallos += 1
            print(f"  DIFERENCIA en {fecha} estado={estado} strict={strictly_before}")
            print(f"    referencia: {len(esperado)} filas / acumulado: {len(obtenido)} filas")
    return fallos


def datos(n_ordenes=3000, semilla=11):
    rng = np.random.default_rng(semilla)
    ordenes = [f"ORD{i:06d}" for i in range(n_ordenes)]

    subs = pd.DataFrame({
        "orden": ordenes,
        "f_ini_dt": pd.Timestamp("2024-01-01")
        + pd.to_timedelta(rng.integers(0, 700, n_ordenes), unit="D"),
        "total": rng.uniform(10, 90, n_ordenes).round(2),
        "estado": rng.choice(ESTADOS, n_ordenes),
        "zona": rng.choice(ZONAS, n_ordenes),
        "sucursal": rng.choice(SUCURSALES, n_ordenes),
        "municipio": rng.choice(["A", "B"], n_ordenes),
        "campanna": rng.choice(["c1", "c2"], n_ordenes),
        "producto": rng.choice(["p1", "p2"], n_ordenes),
        "archivado": False,
    })
    subs["zona_sucursal"] = subs["zona"] + " - " + subs["sucursal"]

    filas = []
    for orden in ordenes:
        for _ in range(int(rng.integers(1, 10))):
            filas.append({
                "orden": orden,
                "f_dt": pd.Timestamp("2024-06-01")
                + pd.to_timedelta(int(rng.integers(0, 500)), unit="D"),
                "estado": ESTADOS[int(rng.integers(0, len(ESTADOS)))],
                "log_norm": rng.choice(["reactivacion del servicio", "nota", "corte automatico por factura impaga"]),
                "nota": "n",
                "estado_origen": None,
            })
    logs = pd.DataFrame(filas).sort_values(["orden", "f_dt"]).reset_index(drop=True)
    logs["estado_origen"] = logs.groupby("orden", sort=False)["estado"].shift(1)
    return subs, logs


def montar(subs, logs, acumulativo):
    """Analyzer con los datos ya cargados, por uno de los dos caminos."""
    an = MetricsAnalyzer(db=None, periodo=Periodo.build("2025-06-01"))
    an.df_subs_full = subs
    an.df_clean_logs = logs
    an._ordens_con_activity = set(
        logs.loc[logs["estado"] == "3_progress", "orden"].to_numpy()
    )
    an._react_cand = None
    an._corte_cand = None
    an._dim_prepared = dimensions.prepare_subs_dims(None, subs)
    an._state_cache = {}
    an._inactivos_cache = None
    # Sin `_estados`, el analyzer cae al camino de referencia (`get_state_at`).
    # Es exactamente la bifurcacion que queremos comparar.
    if acumulativo:
        an._estados = metrics_calc.EstadoAcumulado(logs)
    return an


def comprobar_cortes_sueltos() -> int:
    """Las dos implementaciones, corte a corte, sobre logs con empates."""
    rng = np.random.default_rng(20260909)
    fallos = 0

    for _ in range(5):
        df = construir_logs(rng)
        inicio = pd.Timestamp("2025-02-01")
        dias = [pd.Timestamp(f"2025-02-{d:02d} 23:59:59") for d in range(1, 29)]
        # El cierre del mes va primero: es lo que provoca el unico retroceso
        # del cursor en una ejecucion real.
        secuencia = [dias[-1], *dias]

        for estado in ("3_progress", "9_free"):
            fallos += comparar(df, [inicio], estado, True)
            fallos += comparar(df, secuencia, estado, False)

        acumulado = metrics_calc.EstadoAcumulado(df)
        esperado = metrics_calc.last_log_per_orden(df[df["f_dt"] < inicio])
        obtenido = acumulado.ultimos(inicio, strictly_before=True)
        if not esperado.reset_index(drop=True).equals(obtenido.reset_index(drop=True)):
            fallos += 1
            print("  DIFERENCIA en ultimos()")

    # Limites: log vacio y una fecha anterior a todo el historico.
    vacio = pd.DataFrame(columns=["orden", "f_dt", "estado"])
    vacio["f_dt"] = pd.to_datetime(vacio["f_dt"])
    ac = metrics_calc.EstadoAcumulado(vacio)
    assert ac.en_estado(pd.Timestamp("2025-01-01"), "3_progress").empty
    assert ac.ultimos(pd.Timestamp("2025-01-01")).empty

    df = construir_logs(rng, n_ordenes=50)
    ac = metrics_calc.EstadoAcumulado(df)
    antes = pd.Timestamp("2024-01-01")
    assert len(ac.en_estado(antes, "3_progress", False)) == 0

    return fallos


def comprobar_mes_completo() -> int:
    """Un mes entero con el analyzer real, metrica a metrica."""
    subs, logs = datos()
    print(f"  {len(subs):,} suscripciones / {len(logs):,} logs")

    nuevo = montar(subs, logs, acumulativo=True)
    viejo = montar(subs, logs, acumulativo=False)

    fallos = 0
    for dia in range(1, 31):
        periodo = Periodo.build("2025-06-01", f"2025-06-{dia:02d}")
        r_nuevo = nuevo._compute(periodo)["summary"]
        r_viejo = viejo._compute(periodo)["summary"]
        for clave in r_viejo:
            if r_nuevo[clave] != r_viejo[clave]:
                fallos += 1
                print(f"  dia {dia:02d} {clave}: referencia={r_viejo[clave]} nuevo={r_nuevo[clave]}")

    # Y las dimensiones, que es donde vive la cache de mapas de DimsPreparadas.
    periodo = Periodo.build("2025-06-01", "2025-06-30")
    c_n, c_v = nuevo._compute(periodo), viejo._compute(periodo)

    def dims_de(c, preparadas):
        return dimensions.aggregate_dimensions(
            None, periodo, c["act_ini"], c["act_fin"], c["nuevos"], c["df_bajas"],
            c["df_inactivos"], c["df_react_all"], c["df_corte_impagado"],
            df_react_not_in_ini=c["df_react_not_in_ini"], df_subs_full=subs,
            df_free_fin=c["free_fin"], df_free_periodo=c["df_free_periodo"],
            df_free_retorno=c["df_free_retorno"], persist=False, prepared=preparadas,
        )

    filas_n = dims_de(c_n, nuevo._dim_prepared)
    filas_v = dims_de(c_v, dimensions.prepare_subs_dims(None, subs))
    if filas_n != filas_v:
        fallos += 1
        print("  DIFERENCIA en las filas de dimensiones")
    else:
        print(f"  {len(filas_n)} filas de dimensiones identicas")

    return fallos


def main() -> None:
    print("Cortes sueltos (empates, sinteticos, limites):")
    fallos = comprobar_cortes_sueltos()
    print("  sin diferencias" if fallos == 0 else f"  {fallos} diferencias")

    print("\nMes completo con el analyzer real:")
    fallos += comprobar_mes_completo()

    print()
    if fallos == 0:
        print("OK: el recorrido acumulativo da exactamente lo mismo que la referencia.")
    else:
        print(f"FALLOS: {fallos}")
        sys.exit(1)


if __name__ == "__main__":
    main()
