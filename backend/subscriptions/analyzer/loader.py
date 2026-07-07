from __future__ import annotations
import concurrent.futures
from ...conf_config import TableNames


def load_data(db):
    print("Sincronizando con base de datos...")
    subs_cols = ["orden_producto", "fecha_inicio", "total", "estado"]
    logs_cols = ["orden", "fecha_log", "log", "estado"]
    logs_v15_cols = ["orden", "tipo", "categoria", "fecha"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_subs = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS, subs_cols)
        future_logs = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS_LOGS, logs_cols)
        future_logs_v15 = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS_LOGS_V15, logs_v15_cols)

        return (
            future_subs.result(),
            future_logs.result(),
            future_logs_v15.result(),
        )
