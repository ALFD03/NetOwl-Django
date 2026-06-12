from __future__ import annotations
import concurrent.futures


def load_data(db):
    """Carga las tres tablas fuente desde la base de datos en paralelo.

    Returns:
        (df_subs_raw, df_logs, df_logs_v15): DataFrames con datos crudos.
    """
    print("Sincronizando con base de datos...")
    subs_cols = ["Orden_Producto", "fecha_inicio", "Total", "Estado"]
    logs_cols = ["orden", "fecha_log", "log", "estado"]
    logs_v15_cols = ["orden", "tipo", "categoria", "fecha"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_subs = executor.submit(db.read_table, "Subscripciones", subs_cols)
        future_logs = executor.submit(db.read_table, "Subscripciones-logs", logs_cols)
        future_logs_v15 = executor.submit(db.read_table, "Subscripciones-logs-v15", logs_v15_cols)

        return (
            future_subs.result(),
            future_logs.result(),
            future_logs_v15.result(),
        )
