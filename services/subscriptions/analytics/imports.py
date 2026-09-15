"""Importacion de los exports de suscripciones y de logs.

El de suscripciones se guarda dos veces: `subscriptions-b` conserva el detalle
linea a linea y `subscriptions` una fila por orden, ya consolidada. Las dos
tablas se truncan en cada carga: **no son un historico**.

Lo que hace especial a este importador es la comprobacion del catalogo. El
export trae varias lineas por orden -el plan, el router, la instalacion- y solo
una de ellas es el producto; si ninguna esta catalogada, antes la orden se
guardaba sin producto y la perdida no se notaba hasta meses despues, en el
reporte de la reguladora. Hoy la importacion se detiene antes de escribir nada.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from psycopg2 import sql

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import nombres_reconocidos, plan_names, productos_ignorados

from .config import SUBS_ACTIVO_ALIASES, SUBS_COLUMN_MAPPING

SUBSCRIPTIONS_COLUMN_MAPPING = {**SUBS_COLUMN_MAPPING, **SUBS_ACTIVO_ALIASES}

SUBSCRIPTIONS_METADATA_COLS = [
    "cliente", "ci", "sucursal", "zona", "municipio",
    "tipo", "estado", "campanna", "fecha_factura", "fecha_inicio",
    "tarifa", "total", "producto", "telefono", "phone", "phone2", "vendedor",
    "activo",
]

LOGS_COLUMN_MAPPING = {
    "Logs de Cambios/Suscripción": "orden",
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado",
}

LOGS_REQUIRED_COLS = ["orden", "fecha_log", "log", "estado"]

def _blank_to_nan(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte en NaN las celdas vacias o de solo espacios.

    Se recorre columna por columna a proposito: `DataFrame.apply` entrega
    Series completas y no celdas, asi que la version anterior (un `isinstance`
    sobre el valor) nunca convertia nada. Sin esto el `ffill` por orden no
    rellena, el `dropna` no descarta las lineas sin referencia y `groupby.first`
    se queda con la cadena vacia en lugar del primer valor real.
    """
    out = df.copy()
    for col in out.columns:
        if out[col].dtype != object:
            continue
        vacias = out[col].notna() & (out[col].astype(str).str.strip() == "")
        if vacias.any():
            out.loc[vacias, col] = np.nan
    return out


class CatalogoVacio(RuntimeError):
    """No hay ni un plan registrado.

    Se distingue de `ProductosSinCatalogo` a proposito: culpar al fichero de lo
    que es un problema de configuracion mandaba a buscar en el sitio
    equivocado. Un catalogo vacio no se arregla cambiando el export.
    """


class ProductosSinCatalogo(RuntimeError):
    """El export trae ordenes cuyo producto no esta en el catalogo.

    Lleva encima lo que necesita el cliente para resolverlo sin volver a subir
    el fichero a ciegas: que productos son y cuantas ordenes arrastra cada uno.
    """

    def __init__(self, productos: list[dict[str, Any]], ordenes: int):
        self.productos = productos
        self.ordenes = ordenes
        nombres = ", ".join(p["nombre"] for p in productos[:5])
        if len(productos) > 5:
            nombres += f" (+{len(productos) - 5} mas)"
        super().__init__(
            f"{len(productos)} producto(s) no estan en el catalogo y afectan a "
            f"{ordenes} orden(es): {nombres}."
        )


def _first_matching_plan(values):
    """El primer valor de la columna que el catalogo reconozca como plan.

    Es lo que elige el producto de una orden entre sus varias lineas.
    """
    plan_set = nombres_reconocidos()
    for v in values.dropna().unique():
        if v in plan_set:
            return v
    return None


def _verificar_catalogo(df_local: pd.DataFrame) -> None:
    """Aborta la importacion si alguna orden entra sin producto catalogado.

    El export trae varias lineas por orden —el plan, el router, la instalacion—
    y `_first_matching_plan` se queda con la primera que este en el catalogo.
    Cuando no lo esta ninguna, la orden se guardaba sin producto y la perdida
    no se notaba hasta meses despues, en el reporte de la reguladora.

    Se comprueba **antes** del truncate: si esto levanta, no se escribio nada.

    Una orden sin ninguna linea de producto no se reporta: no hay nombre que
    registrar, asi que pasa igual que antes.
    """
    if not plan_names():
        raise CatalogoVacio(
            "El catalogo de planes esta vacio. Cargalo desde Subscriptions -> "
            "Catalogos antes de importar."
        )

    columnas = {"orden_producto", "producto"}
    if not columnas.issubset(df_local.columns):
        return

    lineas = df_local.loc[:, ["orden_producto", "producto"]].dropna(subset=["producto"])
    if lineas.empty:
        return

    reconocidos = nombres_reconocidos()
    con_plan = set(
        lineas.loc[lineas["producto"].isin(reconocidos), "orden_producto"]
    )
    huerfanas = lineas[~lineas["orden_producto"].isin(con_plan)]

    # Lo que alguien ya declaro que nunca sera un plan deja de contar como
    # candidato: si no, cada router e instalacion bloquearia toda importacion.
    candidatos = huerfanas[~huerfanas["producto"].isin(productos_ignorados())]
    if candidatos.empty:
        return

    conteo = (
        candidatos.groupby("producto")["orden_producto"]
        .nunique()
        .sort_values(ascending=False)
    )
    productos = [
        {"nombre": str(nombre), "ordenes": int(n)} for nombre, n in conteo.items()
    ]
    raise ProductosSinCatalogo(
        productos, int(candidatos["orden_producto"].nunique())
    )


def productos_fuera_de_catalogo() -> list[dict[str, Any]]:
    """Productos ya importados que hoy no estan en el catalogo.

    La importacion garantiza que toda orden entra con un plan catalogado, pero
    un plan se puede borrar despues, y los datos cargados antes de que esa
    comprobacion existiera pueden no tener ninguno. El analisis lo vuelve a
    mirar antes de gastar minutos calculando una respuesta que ya seria mala.
    """
    db = DBConnector()
    if not db.tabla_existe(TableNames.SUBSCRIPTIONS):
        return []

    df = db.query(
        f"""
        SELECT producto, COUNT(DISTINCT orden_producto) AS ordenes
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE producto IS NOT NULL AND producto <> ''
        GROUP BY producto
        """
    )
    if df.empty:
        return []

    conocidos = nombres_reconocidos() | productos_ignorados()
    fuera = df[~df["producto"].isin(conocidos)]
    return [
        {"nombre": str(row["producto"]), "ordenes": int(row["ordenes"])}
        for _, row in fuera.iterrows()
    ]


def import_subscriptions_csv(csv_path: str) -> int:
    """Carga el export de suscripciones y devuelve cuantas ordenes quedaron.

    Consolida las lineas por orden, **verifica el catalogo antes de tocar la base**
    y reemplaza por completo `subscriptions-b` (detalle) y `subscriptions`
    (consolidado).

    Levanta `ProductosSinCatalogo` o `CatalogoVacio` sin haber escrito nada.
    """
    # Lectura segura: dtype=str, encoding utf-8-sig (BOM de Excel) y low_memory=False
    df_local = pd.read_csv(
        csv_path, 
        dtype=str, 
        keep_default_na=False, 
        low_memory=False, 
        encoding="utf-8-sig"
    )
    df_local.rename(columns=SUBSCRIPTIONS_COLUMN_MAPPING, inplace=True)

    if not df_local.empty:
        df_local = df_local[
            ~df_local["orden_producto"]
            .astype(str)
            .str.contains(
                "Líneas de la orden/Referencia de la orden",
                na=False,
            )
        ]

    expected_cols = set(SUBSCRIPTIONS_COLUMN_MAPPING.values())
    df_local = df_local[
        [c for c in df_local.columns if c in expected_cols]
    ]

    df_local = _blank_to_nan(df_local)
    # Lineas del export sin referencia de orden: no pertenecen a ninguna
    # suscripcion y agrupadas formarian una fila fantasma con orden vacia.
    df_local = df_local.dropna(subset=["orden_producto"])

    # `activo` solo existe en los exports nuevos: se trabaja con lo que venga.
    meta_cols = [c for c in SUBSCRIPTIONS_METADATA_COLS if c in df_local.columns]

    df_local[meta_cols] = (
        df_local.groupby("orden_producto")[meta_cols]
        .ffill()
    )

    agg_rules = {col: "first" for col in meta_cols}
    if "producto" in df_local.columns:
        agg_rules["producto"] = _first_matching_plan

    df_consolidated = df_local.groupby(
        "orden_producto", as_index=False
    ).agg(agg_rules)
    df_consolidated = df_consolidated.dropna(subset=["orden_producto"])

    for col in df_consolidated.columns:
        df_consolidated[col] = (
            df_consolidated[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )
    for col in df_local.columns:
        df_local[col] = (
            df_local[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )

    # Antes de crear, truncar o copiar nada: si algo no esta catalogado, la
    # importacion no llega a empezar y la tabla anterior sigue intacta.
    _verificar_catalogo(df_local)

    db_tool = DBConnector()

    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            for t_name, d_frame in [
                (TableNames.SUBSCRIPTIONS_B, df_local),
                (TableNames.SUBSCRIPTIONS, df_consolidated),
            ]:
                cols_def = [
                    sql.SQL("{} text").format(sql.Identifier(c))
                    for c in d_frame.columns
                ]
                cur.execute(
                    sql.SQL(
                        "CREATE TABLE IF NOT EXISTS"
                        " {schema_table} ({fields})"
                    ).format(
                        schema_table=sql.Identifier(DB_SCHEMA, t_name),
                        fields=sql.SQL(", ").join(cols_def),
                    )
                )
                # El export puede traer columnas nuevas (p. ej. `activo`) sobre
                # una tabla ya creada: se agregan antes de copiar.
                for col in d_frame.columns:
                    cur.execute(
                        sql.SQL(
                            "ALTER TABLE {schema_table}"
                            " ADD COLUMN IF NOT EXISTS {c} text"
                        ).format(
                            schema_table=sql.Identifier(DB_SCHEMA, t_name),
                            c=sql.Identifier(col),
                        )
                    )
                cur.execute(
                    sql.SQL("TRUNCATE TABLE {schema_table}").format(
                        schema_table=sql.Identifier(DB_SCHEMA, t_name)
                    )
                )
            conn.commit()

    db_tool.copy_dataframe(df_local, TableNames.SUBSCRIPTIONS_B)
    db_tool.copy_dataframe(df_consolidated, TableNames.SUBSCRIPTIONS)

    return len(df_consolidated)


def import_logs_csv(csv_path: str) -> int:
    """Carga el export de logs y reemplaza `subscriptions-logs`.

    Exige las cuatro columnas del formato (`orden`, `fecha_log`, `log`, `estado`).
    """
    # Misma lectura segura que el export de suscripciones.
    df_logs = pd.read_csv(
        csv_path, 
        dtype=str, 
        keep_default_na=False, 
        low_memory=False, 
        encoding="utf-8-sig"
    )
    df_logs.rename(columns=LOGS_COLUMN_MAPPING, inplace=True)

    missing_cols = [
        c for c in LOGS_REQUIRED_COLS if c not in df_logs.columns
    ]
    if missing_cols:
        raise ValueError(
            f"El CSV no contiene las columnas requeridas: {missing_cols}"
        )

    df_logs = _blank_to_nan(df_logs)
    for col in df_logs.columns:
        df_logs[col] = (
            df_logs[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )

    db_tool = DBConnector()
    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            col_defs = [
                sql.SQL("{} text").format(sql.Identifier(c))
                for c in df_logs.columns
            ]
            cur.execute(
                sql.SQL(
                    "CREATE TABLE IF NOT EXISTS"
                    " {schema_table} ({fields})"
                ).format(
                    schema_table=sql.Identifier(DB_SCHEMA, TableNames.SUBSCRIPTIONS_LOGS),
                    fields=sql.SQL(", ").join(col_defs),
                )
            )
            cur.execute(
                sql.SQL("TRUNCATE TABLE {schema_table}").format(
                    schema_table=sql.Identifier(
                        DB_SCHEMA, TableNames.SUBSCRIPTIONS_LOGS
                    )
                )
            )
        conn.commit()
    db_tool.copy_dataframe(df_logs, TableNames.SUBSCRIPTIONS_LOGS)

    return len(df_logs)