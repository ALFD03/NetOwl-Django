"""El reporte mensual que se declara a la reguladora (ETA).

Se calcula sobre **los activos al cierre de un mes** y produce las matrices que
pide la reguladora: internet por tecnologia, tipo de persona y estado, con
todos sus cruces; television; transporte de datos; y la penetracion por rango
de velocidad.

La clasificacion de cada suscripcion se resuelve con esta prioridad:
**excepcion individual -> plan del catalogo**. Lo que no resuelva sale como
`unmapped_elements` para que alguien lo decida.

El catalogo es la unica fuente de la clasificacion de un plan.

Ademas de las matrices, el reporte lleva los **formularios** que se declaran:
una fila por producto declarado, con su velocidad, su renta y su consumo
teorico. Los arma `eta_forms.py` y se guardan con el reporte, de modo que un
periodo bloqueado exporta lo que se declaro y no lo que saldria hoy.
"""

# --- START OF FILE backend/subscriptions/eta_report.py ---
from __future__ import annotations

import json
import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from core.config import CANCELLED_PLAN, DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import estados as catalog_states
from core.fixtures import planes, regulatory_plans, zonas
from core.tables import ensure

from .bcv import RateUnavailable, fetch_month_rate
from .config import (
    NON_RESIDENTIAL_PLANS,
    PERSON_DEFAULT,
    PERSON_MAP,
    PLAN_DEDICADO,
    PLAN_TRANSPORTE,
    TECH_DEFAULT,
    TECH_MAP,
)
from .eta_forms import build_forms, synthesized_name
from .queries import get_periods
from .tables import ETA_MONTHLY_REPORT, ETA_ORDER_CONFIG


def normalize_tech(val: str) -> str:
    """Colapsa la tecnologia comercial a alambrico/inalambrico."""
    if not val: return TECH_DEFAULT
    val_clean = str(val).strip().upper()
    return TECH_MAP.get(val_clean, TECH_DEFAULT)

def normalize_person(val: str) -> str:
    """Colapsa el tipo de titular a persona natural/juridica."""
    if not val: return PERSON_DEFAULT
    val_clean = str(val).strip().lower()
    return PERSON_MAP.get(val_clean, PERSON_DEFAULT)

logger = logging.getLogger(__name__)


def _text(valor: Any) -> str:
    """Un campo de texto que puede venir nulo o como `NaN` de pandas."""
    if valor is None or (isinstance(valor, float) and math.isnan(valor)):
        return ""
    texto = str(valor).strip()
    return "" if texto.lower() in ("nan", "none", "null", "<na>") else texto


def _number(valor: Any, default: float = 0.0) -> float:
    """Un campo numerico que puede venir nulo, vacio o como `NaN`.

    Se comprueba el resultado y no el tipo de entrada: la columna llega de
    psycopg2 como `Decimal`, y `Decimal("NaN")` pasa el `float()` sin excepcion.
    Ese `NaN` acaba en el `json.dumps` del reporte, que lo escribe como `NaN`
    literal y revienta el `JSON.parse` del navegador.
    """
    if valor is None:
        return default
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return default
    return numero if math.isfinite(numero) else default


def _regulatory_from_fixture(fx: dict[str, Any] | None) -> dict[str, Any] | None:
    """El plan regulador que sirve `core/fixtures`, en la forma del formulario.

    `fixtures` sirve diccionarios con las claves planas de la epoca JSON
    (`name`, `type`, `datas`...); los formularios trabajan con nombres
    explicitos. La traduccion vive aqui y no en el modelo porque es el consumo,
    no el catalogo, lo que decide como se llaman los campos.
    """
    if not fx:
        return None
    return {
        "nombre": str(fx.get("name") or "").strip(),
        "tecnologia": str(fx.get("type") or "RF").strip(),
        "tipo_persona": str(fx.get("people") or "nat").strip(),
        "datas_mbps": _number(fx.get("datas")),
        "precio": _number(fx.get("price")),
        "tiene_tv": str(fx.get("TV")).strip().lower() == "true",
        "es_transporte": bool(fx.get("es_transporte", False)),
    }


def _resolve_regulatory(
    cfg: dict[str, Any],
    regulatory_catalog: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Con que fila del formulario se declara esta suscripcion.

    Un plan del catalogo comercial trae el suyo asignado. El internet dedicado
    y el transporte no: cada contrato tiene su velocidad y su tarifa, y se
    declaran agrupados por velocidad bajo un nombre sintetizado. Si alguien
    registra un plan regulador con ese mismo nombre gana el del catalogo, que
    es la forma de corregir la renta o la tecnologia de un grupo entero sin
    tocar orden por orden.

    Devolver `None` no rompe nada: la suscripcion sigue contando en las
    matrices del reporte y solo queda fuera de los formularios, que es
    exactamente lo que significa un plan todavia sin agrupar.
    """
    asignado = cfg.get("regulador")
    if asignado and asignado.get("nombre"):
        return asignado

    es_transporte = bool(cfg.get("es_transporte", False))
    if not (es_transporte or cfg.get("es_dedicado", False)):
        return None

    mbps = _number(cfg.get("datas_mbps"))
    nombre = synthesized_name(mbps, es_transporte=es_transporte)

    from_catalog = regulatory_catalog.get(nombre)
    if from_catalog:
        return from_catalog

    return {
        "nombre": nombre,
        "tecnologia": str(cfg.get("tecnologia") or "FTTH").strip(),
        "tipo_persona": str(cfg.get("tipo_persona") or "PYME").strip(),
        "datas_mbps": mbps,
        "precio": _number(cfg.get("precio")),
        "tiene_tv": bool(cfg.get("tiene_tv", False)),
        "es_transporte": es_transporte,
    }


class ETAReportManager:
    """Calcula, guarda y parametriza el reporte de la reguladora.

    Un periodo se puede **bloquear**: a partir de ahi se sirve el JSON guardado en
    vez de recalcular, para que un mes ya declarado no cambie porque los datos de
    origen se hayan movido.
    """

    def __init__(self, db: DBConnector):
        self.db = db
        self._ensure_tables_exist()

    def _ensure_tables_exist(self):
        """Las tablas de configuración por orden y del reporte mensual, al día."""
        with self.db.transaction() as cur:
            ensure(cur, ETA_ORDER_CONFIG)
            ensure(cur, ETA_MONTHLY_REPORT)

    def get_lock_status(self, periodo: str) -> bool:
        """Si el periodo esta bloqueado (congelado)."""
        df = self.db.query(
            f"SELECT esta_bloqueado FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT} WHERE periodo_reporte = %s",
            params=[periodo]
        )
        return not df.empty and bool(df.iloc[0]["esta_bloqueado"])

    def set_lock_status(self, periodo: str, lock: bool) -> None:
        """Bloquea o desbloquea un periodo."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT} (periodo_reporte, esta_bloqueado)
                    VALUES (%s, %s)
                    ON CONFLICT (periodo_reporte) DO UPDATE SET esta_bloqueado = EXCLUDED.esta_bloqueado
                    """,
                    [periodo, lock]
                )
            conn.commit()

    def get_bcv_rate(self, periodo: str) -> tuple[float, str]:
        """La tasa con que se declara el periodo, y de donde salio.

        Se guarda por periodo y no como ajuste global porque la renta se
        declara a la tasa del mes: recalcular un mes viejo con la tasa de hoy
        daria cifras que no son las que se declararon. `0` significa "todavia
        sin fijar", no "cero bolivares", y el exportador lo distingue.

        La fuente viaja con la cifra porque una tasa a secas no dice si la
        consulto el sistema o la escribio alguien, y son dos cosas que se
        revisan distinto.
        """
        df = self.db.query(
            f"""
            SELECT tasa_bcv, tasa_fuente
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT}
            WHERE periodo_reporte = %s
            """,
            params=[periodo],
        )
        if df.empty:
            return 0.0, ""
        fila = df.iloc[0]
        return _number(fila["tasa_bcv"]), _text(fila.get("tasa_fuente"))

    def set_bcv_rate(self, periodo: str, tasa: float, fuente: str = "") -> None:
        """Fija la tasa del periodo. No toca el reporte ya calculado."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT}
                        (periodo_reporte, tasa_bcv, tasa_fuente)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (periodo_reporte) DO UPDATE SET
                        tasa_bcv = EXCLUDED.tasa_bcv,
                        tasa_fuente = EXCLUDED.tasa_fuente
                    """,
                    [periodo, tasa, fuente],
                )
            conn.commit()

    def fetch_bcv_rate(self, periodo: str) -> tuple[float, str]:
        """Consulta la tasa del mes al BCV y la guarda, pisando lo que hubiera.

        Es la que hay detras del boton de volver a consultar. Deja subir
        `RateUnavailable`: quien la llama decide si eso rompe la peticion o
        solo se avisa.
        """
        tasa, fuente = fetch_month_rate(periodo)
        self.set_bcv_rate(periodo, tasa, fuente)
        return tasa, fuente

    def ensure_bcv_rate(self, periodo: str) -> tuple[float, str, str]:
        """La tasa del periodo, consultandola la primera vez que haga falta.

        Devuelve `(tasa, fuente, aviso)`. Solo se sale a la red cuando no hay
        nada guardado: la tasa del dia 1 de un mes pasado ya no cambia, asi que
        una vez consultada no se vuelve a preguntar. Eso hace que una tasa
        escrita a mano tampoco se pise sola — para eso esta `fetch_bcv_rate`.

        **No propaga el fallo.** Esto se llama desde la peticion que pinta el
        reporte, y que el servicio de tasas este caido no puede dejar sin
        reporte a nadie: se devuelve el aviso y las rentas salen vacias, que es
        lo mismo que pasaba antes de que hubiera consulta automatica.
        """
        tasa, fuente = self.get_bcv_rate(periodo)
        if tasa > 0:
            return tasa, fuente, ""

        try:
            tasa, fuente = self.fetch_bcv_rate(periodo)
        except RateUnavailable as e:
            logger.warning("No se pudo obtener la tasa del BCV para %s: %s", periodo, e)
            return 0.0, "", str(e)

        return tasa, fuente, ""

    def _report_rate(self, periodo: str) -> dict[str, Any]:
        """Las tres claves de la tasa que viajan con el reporte.

        Se consulta aqui —al servir el reporte— y no en un comando aparte
        porque es el unico momento en que se sabe que periodo interesa. Como
        `ensure_bcv_rate` solo sale a la red la primera vez, esto es una
        consulta por periodo en toda la vida del entorno, no una por visita.
        """
        tasa, fuente, aviso = self.ensure_bcv_rate(periodo)
        return {"tasa_bcv": tasa, "tasa_bcv_fuente": fuente, "tasa_bcv_aviso": aviso}

    def save_sub_individual_config(self, orden: str, config: dict[str, Any]) -> None:
        """Guarda o actualiza la parametrización individual de una suscripción."""
        order_clean = str(orden).strip()
        if not order_clean:
            return

        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_CONFIG_SUBS} 
                    (orden, cliente, producto, reportar, tecnologia, tipo_persona, tiene_tv, datas_mbps, es_transporte, es_dedicado, precio, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (orden) DO UPDATE SET
                        cliente = EXCLUDED.cliente,
                        producto = EXCLUDED.producto,
                        reportar = EXCLUDED.reportar,
                        tecnologia = EXCLUDED.tecnologia,
                        tipo_persona = EXCLUDED.tipo_persona,
                        tiene_tv = EXCLUDED.tiene_tv,
                        datas_mbps = EXCLUDED.datas_mbps,
                        es_transporte = EXCLUDED.es_transporte,
                        es_dedicado = EXCLUDED.es_dedicado,
                        precio = EXCLUDED.precio,
                        updated_at = NOW()
                    """,
                    [
                        order_clean, 
                        str(config.get("cliente", "")).strip(), 
                        str(config.get("producto", "")).strip(),
                        bool(config.get("reportar", True)), 
                        str(config.get("tecnologia", "FTTH")).strip(),
                        str(config.get("tipo_persona", "pyme")).strip(), 
                        bool(config.get("tiene_tv", False)),
                        float(config.get("datas_mbps", 0.0)), 
                        bool(config.get("es_transporte", False)),
                        bool(config.get("es_dedicado", False)),
                        # El catalogo comercial no puede dar la renta de estos
                        # contratos: cada enlace dedicado negocia la suya, y es
                        # el unico dato con que se declara su renta basica.
                        float(config.get("precio", 0.0)),
                    ]
                )
            conn.commit()


    def _load_mappings(self) -> tuple[dict[str, dict], dict[str, str], dict[str, dict]]:
        """Planes del catalogo, zonas mapeadas y configuraciones individuales.

        El catalogo es la unica fuente de la clasificacion de un plan; si se
        declara a la reguladora lo dice `Plan.declarar_en_eta`.
        """
        zones_map = {
            z["name"].strip().lower(): z.get("Estado", "Desconocido").strip()
            for z in zonas()
        }

        plans_map: dict[str, dict] = {}
        for p in planes():
            name = p["name"].strip()
            try:
                datas_mbps = float(p.get("datas") or "0")
            except ValueError:
                datas_mbps = 0.0

            plans_map[name] = {
                "reportar": bool(p.get("declarar_en_eta", True)),
                "regulador": _regulatory_from_fixture(p.get("regulador")),
                "tecnologia": p.get("type", "RF").strip(),
                "tipo_persona": p.get("people", "nat").strip().lower(),
                "tiene_tv": str(p.get("TV")).strip().lower() == "true",
                "datas_mbps": datas_mbps,
                "es_transporte": name == PLAN_TRANSPORTE,
                "es_dedicado": name == PLAN_DEDICADO,
            }

        # `Cancelado` no es un plan y por eso no esta en el catalogo, pero lo
        # llevan miles de suscripciones que siguen apareciendo en un cierre.
        # Dejarlo fuera del mapa las convertiria en planes sin clasificar y
        # bloquearia el reporte entero, asi que entra con la misma
        # clasificacion vacia que tenia en el JSON.
        plans_map.setdefault(CANCELLED_PLAN, {
            "reportar": True,
            "regulador": None,
            "tecnologia": "",
            "tipo_persona": "",
            "tiene_tv": False,
            "datas_mbps": 0.0,
            "es_transporte": False,
            "es_dedicado": False,
        })

        individual_map = {}
        df_custom_subs = self.db.read_table(TableNames.ANALYZER_ETA_CONFIG_SUBS)
        if not df_custom_subs.empty:
            for _, row in df_custom_subs.iterrows():
                individual_map[str(row["orden"])] = {
                    "reportar": bool(row["reportar"]),
                    "tecnologia": str(row["tecnologia"]),
                    "tipo_persona": str(row["tipo_persona"]),
                    "tiene_tv": bool(row["tiene_tv"]),
                    "datas_mbps": float(row["datas_mbps"]),
                    "es_transporte": bool(row["es_transporte"]),
                    "es_dedicado": bool(row["es_dedicado"]),
                    "precio": _number(row.get("precio")),
                    # Un contrato individual no cuelga del catalogo comercial,
                    # asi que su fila del formulario se sintetiza por velocidad
                    # (ver `_resolve_regulatory`).
                    "regulador": None,
                }

        return plans_map, zones_map, individual_map

    def calculate_eta_report(self, periodo: str, force_recalc: bool = False) -> dict[str, Any]:
        """Calcula el reporte completo generando las 10 matrices requeridas."""
        is_locked = self.get_lock_status(periodo)
        individual_configs = self.get_configured_individual_subs()

        if is_locked and not force_recalc:
            df_saved = self.db.query(
                f"SELECT reporte_data FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT} WHERE periodo_reporte = %s",
                params=[periodo]
            )
            if not df_saved.empty and df_saved.iloc[0]["reporte_data"]:
                data = df_saved.iloc[0]["reporte_data"]
                res_dict = json.loads(data) if isinstance(data, str) else data
                res_dict["esta_bloqueado"] = True
                res_dict["individual_configs"] = individual_configs
                # La tasa viaja aparte del reporte guardado: se puede corregir
                # despues de bloquear el periodo sin recalcular nada, porque
                # los formularios guardan el precio en divisa y la conversion
                # se hace al exportar.
                res_dict.update(self._report_rate(periodo))
                return res_dict

        # 1. Cierre de Activos Únicos del mes (58,839 suscriptores)
        # La tabla de cierres la crea el analisis mensual la primera vez que
        # termina: en un entorno recien estrenado no existe todavia, y eso no
        # es un fallo sino la misma respuesta que un cierre vacio.
        if not self.db.table_exists(TableNames.ANALYZER_ACTIVE_AT_CLOSE):
            return {
                "status": "empty",
                "message": f"No hay cierre para {periodo}",
                "individual_configs": individual_configs,
            }

        df_active = self.db.query(
            f"""
            SELECT DISTINCT orden 
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_ACTIVE_AT_CLOSE} 
            WHERE periodo_reporte LIKE %s
            """,
            params=[f"{periodo}%"]
        )
        if df_active.empty:
            return {"status": "empty", "message": f"No hay cierre para {periodo}", "individual_configs": individual_configs}

        # Asegurar unicidad absoluta en activos
        df_active = df_active.drop_duplicates(subset=["orden"])

        # 2. Cargar metadata consolidada por orden (1 sola fila por contrato)
        df_subs = self.db.query(
            f"""
            SELECT orden_producto, producto, cliente, zona, sucursal 
            FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS}
            WHERE orden_producto IS NOT NULL AND orden_producto != ''
            """
        )
        # ✅ DEDUPLICAR METADATA POR ORDEN (Evita duplicar líneas de equipos/routers)
        df_subs = df_subs.drop_duplicates(subset=["orden_producto"], keep="first")
        
        # Cruce exacto 1 a 1
        df_base = df_active.merge(df_subs, left_on="orden", right_on="orden_producto", how="left")

        # 3. Respaldo histórico en subscriptions-b para los que no tengan producto en la tabla actual
        missing_mask = df_base["producto"].isna()
        missing_orders = df_base.loc[missing_mask, "orden"].tolist()
        
        if missing_orders:
            df_hist = self.db.read_table_filtered(
                TableNames.SUBSCRIPTIONS_B,
                filter_column="orden_producto",
                filter_values=missing_orders,
                columns=["orden_producto", "producto", "cliente", "zona", "sucursal"]
            )
            if not df_hist.empty:
                df_hist = df_hist.drop_duplicates(subset=["orden_producto"], keep="first").set_index("orden_producto")
                for idx, r in df_base[missing_mask].iterrows():
                    ord_id = r["orden"]
                    if ord_id in df_hist.index:
                        df_base.at[idx, "producto"] = df_hist.loc[ord_id, "producto"]
                        df_base.at[idx, "cliente"] = df_hist.loc[ord_id, "cliente"]
                        df_base.at[idx, "zona"] = df_hist.loc[ord_id, "zona"]
                        df_base.at[idx, "sucursal"] = df_hist.loc[ord_id, "sucursal"]

        # ✅ GARANTÍA TOTAL: 1 sola fila por cada suscriptor activo
        df_base = df_base.drop_duplicates(subset=["orden"], keep="first")

        # 4. Mapeos
        plans_map, zones_map, individual_map = self._load_mappings()
        regulatory_catalog = {
            r["nombre"]: r
            for r in (_regulatory_from_fixture(fx) for fx in regulatory_plans())
            if r and r["nombre"]
        }
        unmapped_plans, unmapped_subs = [], []
        rows_processed = []

        for _, row in df_base.iterrows():
            ord_id = str(row["orden"]).strip()

            raw_prod = row.get("producto")
            if pd.isna(raw_prod) or str(raw_prod).strip().lower() in ("nan", "none", "null", "<na>", ""):
                prod_name = None
            else:
                prod_name = str(raw_prod).strip()

            raw_cli = row.get("cliente")
            cli_name = str(raw_cli).strip() if pd.notna(raw_cli) and str(raw_cli).strip().lower() not in ("nan", "none", "null") else "Cliente Histórico"

            raw_zone = row.get("zona")
            zone_name = str(raw_zone).strip() if pd.notna(raw_zone) and str(raw_zone).strip().lower() not in ("nan", "none", "null") else "Sin Zona"
            estado = zones_map.get(zone_name.lower(), "Otros / Desconocido")

            if ord_id in individual_map:
                cfg = individual_map[ord_id]
                # Una excepcion individual sobre un plan normal —ni dedicado ni
                # transporte— no tiene grupo propio: se declara con el mismo
                # regulador que su plan del catalogo.
                if prod_name in plans_map:
                    cfg = {**cfg, "regulador": plans_map[prod_name].get("regulador")}
            elif prod_name in plans_map and prod_name not in NON_RESIDENTIAL_PLANS:
                cfg = plans_map[prod_name]
            elif not prod_name:
                unmapped_subs.append({
                    "orden": ord_id,
                    "cliente": cli_name,
                    "producto": "Suscripción histórica sin producto"
                })
                continue
            elif any(word in prod_name.lower() for word in ["dedicado", "transporte", "l2"]):
                unmapped_subs.append({
                    "orden": ord_id,
                    "cliente": cli_name,
                    "producto": prod_name
                })
                continue
            else:
                unmapped_plans.append(prod_name)
                continue

            if not cfg.get("reportar", True):
                continue

            tech_str = normalize_tech(cfg.get("tecnologia"))
            pers_str = normalize_person(cfg.get("tipo_persona"))

            rows_processed.append({
                "orden": ord_id,
                "producto": prod_name or "",
                "regulador": _resolve_regulatory(cfg, regulatory_catalog),
                "estado": estado,
                "tecnologia": tech_str,
                "tipo_persona": pers_str,
                "tiene_tv": bool(cfg.get("tiene_tv", False)),
                "datas_mbps": float(cfg.get("datas_mbps", 0.0)),
                "es_transporte": bool(cfg.get("es_transporte", False))
            })

        clean_unmapped_plans = [p for p in set(unmapped_plans) if p and p.lower() != 'nan']

        if clean_unmapped_plans or unmapped_subs:
            return {
                "status": "unmapped_elements",
                "unmapped_plans": clean_unmapped_plans,
                "unmapped_subs": unmapped_subs,
                "individual_configs": individual_configs,
                "periodo": periodo
            }

        # 5. Cálculo de matrices con base limpia 1 a 1
        #
        # La deduplicacion se hace antes de construir el DataFrame porque la
        # fila lleva el plan regulador como diccionario, y eso es un valor que
        # no tiene sentido meter en una columna de pandas: lo consumen los
        # formularios, no las matrices.
        vistos: set[str] = set()
        form_rows: list[dict[str, Any]] = []
        for fila in rows_processed:
            if fila["orden"] in vistos:
                continue
            vistos.add(fila["orden"])
            form_rows.append(fila)

        without_regulatory = sorted({
            fila["producto"] for fila in form_rows
            if not fila["regulador"] and fila["producto"]
        })

        df_rep = pd.DataFrame(
            [{k: v for k, v in f.items() if k not in ("regulador", "producto")}
             for f in form_rows]
        )
        if df_rep.empty:
            return {"status": "empty", "message": "No hay datos reportables", "individual_configs": individual_configs}

        # `== True` no es redundante aqui: sobre una Series de pandas es una
        # comparacion elemento a elemento que devuelve la mascara booleana.
        # Escribirlo como prueba de verdad daria el valor de verdad de la
        # Series entera, que pandas rechaza.
        df_transporte = df_rep[df_rep["es_transporte"] == True].copy()  # noqa: E712
        df_main = df_rep[df_rep["es_transporte"] == False].copy()  # noqa: E712
        df_net = df_main[df_main["tecnologia"].isin(["Inalámbrico", "Alámbrico"])].copy()
        df_tv = df_main[df_main["tiene_tv"] == True].copy()  # noqa: E712

        final_report = {
            "status": "success",
            "periodo": periodo,
            "esta_bloqueado": is_locked,
            "total_muestreado": int(len(df_rep)),
            "individual_configs": individual_configs,
            "transporte_metrics": int(len(df_transporte)),

            # --- FORMULARIOS DE LA REGULADORA ---
            # Una fila por producto declarado, que es otra pregunta distinta de
            # la que responden las matrices de abajo. Se guardan con el reporte
            # para que un periodo bloqueado sirva los formularios que se
            # declararon y no los que saldrian hoy.
            "formularios": build_forms(form_rows, catalog_states()),
            # Planes que cuentan en las matrices pero no tienen con que
            # declararse: les falta asignar un plan regulador en el catalogo.
            "planes_sin_regulador": without_regulatory,
            
            # --- MATRICES DE INTERNET ---
            "net_metrics": {
                "total": int(len(df_net)),
                "por_tecnologia": df_net.groupby("tecnologia").size().to_dict(),
                "por_persona": df_net.groupby("tipo_persona").size().to_dict(),
                "por_estado": df_net.groupby("estado").size().to_dict(),
                "por_tecnologia_persona": {f"{k[0]} | {k[1]}": int(v) for k, v in df_net.groupby(["tecnologia", "tipo_persona"]).size().to_dict().items()},
                "por_estado_tecnologia": {f"{k[0]} | {k[1]}": int(v) for k, v in df_net.groupby(["estado", "tecnologia"]).size().to_dict().items()},
                "por_estado_persona": {f"{k[0]} | {k[1]}": int(v) for k, v in df_net.groupby(["estado", "tipo_persona"]).size().to_dict().items()},
                "por_estado_tecnologia_persona": {f"{k[0]} | {k[1]} | {k[2]}": int(v) for k, v in df_net.groupby(["estado", "tecnologia", "tipo_persona"]).size().to_dict().items()}
            },
            
            # --- MATRICES DE TV ---
            "tv_metrics": {
                "total": int(len(df_tv)),
                "por_estado": df_tv.groupby("estado").size().to_dict(),
                "por_persona": df_tv.groupby("tipo_persona").size().to_dict(),
                "por_estado_persona": {f"{k[0]} | {k[1]}": int(v) for k, v in df_tv.groupby(["estado", "tipo_persona"]).size().to_dict().items()}
            }
        }

        # 6. Penetración de velocidades
        bins = [0.0, 2.0, 10.0, 30.0, 100.0, 1000.0, np.inf]
        labels = [
            "De 256 Kbps a < 2 Mbps", "De 2 Mbps a < 10 Mbps", "De 10 Mbps a < 30 Mbps",
            "De 30 Mbps a < 100 Mbps", "De 100 Mbps a < 1 Gbps", "De 1 Gbps en adelante"
        ]
        df_net["rango_velocidad"] = pd.cut(df_net["datas_mbps"], bins=bins, labels=labels, right=False)
        speed_grouped = df_net.groupby(["rango_velocidad", "tecnologia"], observed=False).size().unstack(fill_value=0)
        
        speed_res = {}
        for r in labels:
            speed_res[r] = {
                "Alámbrico": int(speed_grouped.at[r, "Alámbrico"]) if "Alámbrico" in speed_grouped.columns else 0,
                "Inalámbrico": int(speed_grouped.at[r, "Inalámbrico"]) if "Inalámbrico" in speed_grouped.columns else 0,
                "total": int(speed_grouped.loc[r].sum())
            }
        final_report["speed_metrics"] = speed_res

        # 7. Persistencia
        if not is_locked:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_MONTHLY_REPORT} (periodo_reporte, reporte_data, fecha_calculo) 
                        VALUES (%s, %s, NOW()) 
                        ON CONFLICT (periodo_reporte) DO UPDATE SET reporte_data = EXCLUDED.reporte_data, fecha_calculo = NOW()
                        """,
                        [periodo, json.dumps(final_report)]
                    )
                conn.commit()

        # Fuera del `json.dumps` de arriba a proposito: la tasa no forma parte
        # del reporte congelado, se corrige aparte.
        final_report.update(self._report_rate(periodo))
        return final_report
    
    def get_discovered_unmapped_plans(self) -> list[str]:
        """Busca productos en la tabla de suscripciones que no tienen configuración ETA."""
        plans_config, _, _ = self._load_mappings()
        
        # Buscamos todos los productos únicos que tenemos en la base de datos de suscripciones
        df_products = self.db.query(f"SELECT DISTINCT producto FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS} WHERE producto IS NOT NULL AND producto != ''")
        all_products = df_products["producto"].tolist()
        
        # Filtramos: aquellos que no son corporativos (porque esos se gestionan por orden)
        # y que no están en el mapeo de planes ya clasificados
        discovered = []
        for p in all_products:
            p_clean = p.strip()
            is_special = any(word in p_clean.lower() for word in ["dedicado", "transporte", "l2"])
            if not is_special and p_clean not in plans_config:
                discovered.append(p_clean)
        
        return sorted(discovered)

    def get_configured_individual_subs(self) -> list[dict[str, Any]]:
        """Retorna las suscripciones individuales parametrizadas sanitizadas."""
        df = self.db.read_table(TableNames.ANALYZER_ETA_CONFIG_SUBS)
        if df.empty:
            return []
        
        records = []
        for _, row in df.iterrows():
            raw_cli = row.get("cliente")
            cli_name = str(raw_cli).strip() if pd.notna(raw_cli) and str(raw_cli).strip().lower() not in ("nan", "none", "null") else ""
            
            raw_prod = row.get("producto")
            prod_name = str(raw_prod).strip() if pd.notna(raw_prod) and str(raw_prod).strip().lower() not in ("nan", "none", "null") else ""

            raw_tec = row.get("tecnologia")
            tec_name = str(raw_tec).strip() if pd.notna(raw_tec) and str(raw_tec).strip().lower() not in ("nan", "none", "null") else "FTTH"

            raw_pers = row.get("tipo_persona")
            pers_name = str(raw_pers).strip() if pd.notna(raw_pers) and str(raw_pers).strip().lower() not in ("nan", "none", "null") else "pyme"

            try:
                mbps = float(row.get("datas_mbps")) if pd.notna(row.get("datas_mbps")) else 0.0
                if pd.isna(mbps): mbps = 0.0
            except (ValueError, TypeError):
                mbps = 0.0

            records.append({
                "orden": str(row["orden"]),
                "cliente": cli_name,
                "producto": prod_name,
                "reportar": bool(row.get("reportar", True)),
                "tecnologia": tec_name,
                "tipo_persona": pers_name,
                "tiene_tv": bool(row.get("tiene_tv", False)),
                "datas_mbps": mbps,
                "es_transporte": bool(row.get("es_transporte", False)),
                "es_dedicado": bool(row.get("es_dedicado", False)),
                "precio": _number(row.get("precio")),
                "updated_at": str(row["updated_at"]) if pd.notna(row.get("updated_at")) else None
            })
        return records
    
    def get_discovered_unmapped_subs(self) -> list[dict[str, Any]]:
        """Detecta solo las órdenes que realmente requieren configuración individual."""
        plans_map, _, individual_map = self._load_mappings()
        
        df_subs = self.db.query(f"""
            SELECT DISTINCT orden_producto as orden, cliente, producto, sucursal, zona
            FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS}
            WHERE orden_producto IS NOT NULL AND orden_producto != ''
        """)
        if df_subs.empty:
            return []

        pending_subs = []
        for _, row in df_subs.iterrows():
            ord_id = str(row["orden"]).strip()
            
            raw_prod = row.get("producto")
            prod_name = str(raw_prod).strip() if pd.notna(raw_prod) and str(raw_prod).strip().lower() not in ("nan", "none", "null") else ""
            
            # ✅ REGLA: Si ya está en planes_map (como 'Pyme FTTH 100 Mbps'), NO es un pendiente individual
            if prod_name in plans_map and prod_name not in NON_RESIDENTIAL_PLANS:
                continue

            # ✅ Solo marcar como individual si ya está guardado, o si es Dedicado/Transporte o no tiene producto
            is_dedicated = any(w in prod_name.lower() for w in ["dedicado", "transporte", "l2"]) or not prod_name
            
            if is_dedicated and ord_id not in individual_map:
                raw_cli = row.get("cliente")
                cli_name = str(raw_cli).strip() if pd.notna(raw_cli) and str(raw_cli).strip().lower() not in ("nan", "none", "null") else "Sin Nombre"
                
                raw_suc = row.get("sucursal")
                suc_name = str(raw_suc).strip() if pd.notna(raw_suc) and str(raw_suc).strip().lower() not in ("nan", "none", "null") else ""
                
                raw_zone = row.get("zona")
                zone_name = str(raw_zone).strip() if pd.notna(raw_zone) and str(raw_zone).strip().lower() not in ("nan", "none", "null") else ""

                pending_subs.append({
                    "orden": ord_id,
                    "cliente": cli_name,
                    "producto": prod_name or "Sin producto (Histórico)",
                    "sucursal": suc_name,
                    "zona": zone_name
                })
        return pending_subs
    
    def get_all_known_plans(self) -> list[dict[str, Any]]:
        """Planes del catalogo, para el desplegable de la ficha individual."""
        plans_map, _, _ = self._load_mappings()
        result = []
        for name, cfg in sorted(plans_map.items()):
            result.append({
                "name": name,
                "tecnologia": cfg.get("tecnologia", "FTTH"),
                "tipo_persona": cfg.get("tipo_persona", "nat"),
                "datas_mbps": cfg.get("datas_mbps", 0),
                "tiene_tv": cfg.get("tiene_tv", False),
                "es_transporte": cfg.get("es_transporte", False),
                "es_dedicado": cfg.get("es_dedicado", False)
            })
        return result
    
    def delete_sub_individual_config(self, orden: str) -> None:
        """Elimina la configuración individual de una orden."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_CONFIG_SUBS} WHERE orden = %s",
                    [orden]
                )
            conn.commit()
    def get_config_page_data(self, periodo: str | None = None) -> dict[str, Any]:
        """Todo lo que necesita la pagina de parametrizacion del reporte ETA.

        Calcular el reporte es lo que descubre los planes y suscripciones sin
        mapear; si ese calculo no reporta ninguno se cae a la deteccion directa
        contra la tabla de suscripciones. La vista encadenaba estas cinco
        llamadas y ese "si no hay, busca de la otra forma" a mano.
        """
        available_periods = sorted(
            {p[:7] for p in get_periods()}, reverse=True
        )
        if not periodo and available_periods:
            periodo = available_periods[0]

        unmapped_plans: list[Any] = []
        unmapped_subs: list[Any] = []
        if periodo:
            report_data = self.calculate_eta_report(periodo, force_recalc=True)
            if report_data.get("status") == "unmapped_elements":
                unmapped_plans = report_data.get("unmapped_plans", [])
                unmapped_subs = report_data.get("unmapped_subs", [])

        if not unmapped_plans:
            unmapped_plans = self.get_discovered_unmapped_plans()
        if not unmapped_subs:
            unmapped_subs = self.get_discovered_unmapped_subs()

        return {
            "individualConfigs": self.get_configured_individual_subs() or [],
            "discoveredPlans": unmapped_plans or [],
            "discoveredSubs": unmapped_subs or [],
            "allKnownPlans": self.get_all_known_plans() or [],
            "currentPeriod": periodo or "",
            "periods": available_periods,
        }
