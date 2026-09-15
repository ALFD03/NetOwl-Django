"""El reporte mensual que se declara a la reguladora (ETA).

Se calcula sobre **los activos al cierre de un mes** y produce las matrices que
pide la reguladora: internet por tecnologia, tipo de persona y estado, con
todos sus cruces; television; transporte de datos; y la penetracion por rango
de velocidad.

La clasificacion de cada suscripcion se resuelve con esta prioridad:
**excepcion individual -> plan del catalogo**. Lo que no resuelva sale como
`unmapped_elements` para que alguien lo decida.

El catalogo es la unica fuente de la clasificacion de un plan. Antes habia una
segunda, `analyzer_eta_config_planes`, que pisaba a la primera: el mismo plan
podia estar clasificado de dos formas y ganaba la que nadie miraba. Esa capa ya
no existe.
"""

# --- START OF FILE backend/subscriptions/eta_report.py ---
from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from core.config import DB_SCHEMA, PLAN_CANCELADO, TableNames
from core.database import DBConnector
from core.fixtures import planes, zonas

from .config import (
    PERSONA_DEFAULT,
    PERSONA_MAP,
    PLAN_DEDICADO,
    PLAN_TRANSPORTE,
    PLANES_NO_RESIDENCIALES,
    TECH_DEFAULT,
    TECH_MAP,
)
from .queries import get_periodos


def normalize_tech(val: str) -> str:
    """Colapsa la tecnologia comercial a alambrico/inalambrico."""
    if not val: return TECH_DEFAULT
    val_clean = str(val).strip().upper()
    return TECH_MAP.get(val_clean, TECH_DEFAULT)

def normalize_persona(val: str) -> str:
    """Colapsa el tipo de titular a persona natural/juridica."""
    if not val: return PERSONA_DEFAULT
    val_clean = str(val).strip().lower()
    return PERSONA_MAP.get(val_clean, PERSONA_DEFAULT)

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
        """Crea las tablas de persistencia para configuraciones globales e individuales."""
        # `analyzer_eta_config_planes` ya no aparece aqui: guardaba una segunda
        # copia —con prioridad— de la clasificacion de cada plan, y un plan se
        # clasifica en un solo sitio, el catalogo. La tabla sigue en la base de
        # datos, vacia y sin leer.
        statements = [
            f"""
            CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.ANALYZER_ETA_CONFIG_SUBS} (
                orden TEXT PRIMARY KEY,
                cliente TEXT,
                producto TEXT,
                reportar BOOLEAN DEFAULT TRUE,
                tecnologia TEXT,
                tipo_persona TEXT,
                tiene_tv BOOLEAN DEFAULT FALSE,
                datas_mbps NUMERIC DEFAULT 0,
                es_transporte BOOLEAN DEFAULT FALSE,
                es_dedicado BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.ANALYZER_ETA_REPORTE_MENSUAL} (
                periodo_reporte TEXT PRIMARY KEY,
                reporte_data JSONB,
                esta_bloqueado BOOLEAN DEFAULT FALSE,
                fecha_calculo TIMESTAMP DEFAULT NOW()
            )
            """
        ]
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                for stmt in statements:
                    cur.execute(stmt)
            conn.commit()

    def get_lock_status(self, periodo: str) -> bool:
        """Si el periodo esta bloqueado (congelado)."""
        df = self.db.query(
            f"SELECT esta_bloqueado FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_REPORTE_MENSUAL} WHERE periodo_reporte = %s",
            params=[periodo]
        )
        return not df.empty and bool(df.iloc[0]["esta_bloqueado"])

    def set_lock_status(self, periodo: str, lock: bool) -> None:
        """Bloquea o desbloquea un periodo."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_REPORTE_MENSUAL} (periodo_reporte, esta_bloqueado)
                    VALUES (%s, %s)
                    ON CONFLICT (periodo_reporte) DO UPDATE SET esta_bloqueado = EXCLUDED.esta_bloqueado
                    """,
                    [periodo, lock]
                )
            conn.commit()

    def save_sub_individual_config(self, orden: str, config: dict[str, Any]) -> None:
        """Guarda o actualiza la parametrización individual de una suscripción."""
        orden_clean = str(orden).strip()
        if not orden_clean:
            return

        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_CONFIG_SUBS} 
                    (orden, cliente, producto, reportar, tecnologia, tipo_persona, tiene_tv, datas_mbps, es_transporte, es_dedicado, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
                        updated_at = NOW()
                    """,
                    [
                        orden_clean, 
                        str(config.get("cliente", "")).strip(), 
                        str(config.get("producto", "")).strip(),
                        bool(config.get("reportar", True)), 
                        str(config.get("tecnologia", "FTTH")).strip(),
                        str(config.get("tipo_persona", "pyme")).strip(), 
                        bool(config.get("tiene_tv", False)),
                        float(config.get("datas_mbps", 0.0)), 
                        bool(config.get("es_transporte", False)),
                        bool(config.get("es_dedicado", False))
                    ]
                )
            conn.commit()


    def _load_mappings(self) -> tuple[dict[str, dict], dict[str, str], dict[str, dict]]:
        """Planes del catalogo, zonas mapeadas y configuraciones individuales.

        El catalogo es la unica fuente de la clasificacion de un plan. Antes
        habia una segunda, `analyzer_eta_config_planes`, que pisaba a la
        primera: el mismo plan podia estar clasificado de dos formas y ganaba
        la que nadie miraba. Lo que el catalogo no tenia —si el plan se declara
        o no a la reguladora— es hoy `Plan.declarar_en_eta`.
        """
        zonas_map = {
            z["name"].strip().lower(): z.get("Estado", "Desconocido").strip()
            for z in zonas()
        }

        planes_map: dict[str, dict] = {}
        for p in planes():
            name = p["name"].strip()
            try:
                datas_mbps = float(p.get("datas") or "0")
            except ValueError:
                datas_mbps = 0.0

            planes_map[name] = {
                "reportar": bool(p.get("declarar_en_eta", True)),
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
        planes_map.setdefault(PLAN_CANCELADO, {
            "reportar": True,
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
                    "es_dedicado": bool(row["es_dedicado"])
                }

        return planes_map, zonas_map, individual_map

    def calculate_eta_report(self, periodo: str, force_recalc: bool = False) -> dict[str, Any]:
        """Calcula el reporte completo generando las 10 matrices requeridas."""
        is_locked = self.get_lock_status(periodo)
        individual_configs = self.get_configured_individual_subs()

        if is_locked and not force_recalc:
            df_saved = self.db.query(
                f"SELECT reporte_data FROM {DB_SCHEMA}.{TableNames.ANALYZER_ETA_REPORTE_MENSUAL} WHERE periodo_reporte = %s",
                params=[periodo]
            )
            if not df_saved.empty and df_saved.iloc[0]["reporte_data"]:
                data = df_saved.iloc[0]["reporte_data"]
                res_dict = json.loads(data) if isinstance(data, str) else data
                res_dict["esta_bloqueado"] = True
                res_dict["individual_configs"] = individual_configs
                return res_dict

        # 1. Cierre de Activos Únicos del mes (58,839 suscriptores)
        # La tabla de cierres la crea el analisis mensual la primera vez que
        # termina: en un entorno recien estrenado no existe todavia, y eso no
        # es un fallo sino la misma respuesta que un cierre vacio.
        if not self.db.tabla_existe(TableNames.ANALYZER_ACTIVOS_CIERRE):
            return {
                "status": "empty",
                "message": f"No hay cierre para {periodo}",
                "individual_configs": individual_configs,
            }

        df_activos = self.db.query(
            f"""
            SELECT DISTINCT orden 
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_ACTIVOS_CIERRE} 
            WHERE periodo_reporte LIKE %s
            """,
            params=[f"{periodo}%"]
        )
        if df_activos.empty:
            return {"status": "empty", "message": f"No hay cierre para {periodo}", "individual_configs": individual_configs}

        # Asegurar unicidad absoluta en activos
        df_activos = df_activos.drop_duplicates(subset=["orden"])

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
        df_base = df_activos.merge(df_subs, left_on="orden", right_on="orden_producto", how="left")

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
        planes_map, zonas_map, individual_map = self._load_mappings()
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

            raw_zona = row.get("zona")
            zona_name = str(raw_zona).strip() if pd.notna(raw_zona) and str(raw_zona).strip().lower() not in ("nan", "none", "null") else "Sin Zona"
            estado = zonas_map.get(zona_name.lower(), "Otros / Desconocido")

            if ord_id in individual_map:
                cfg = individual_map[ord_id]
            elif prod_name in planes_map and prod_name not in PLANES_NO_RESIDENCIALES:
                cfg = planes_map[prod_name]
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
            pers_str = normalize_persona(cfg.get("tipo_persona"))

            rows_processed.append({
                "orden": ord_id,
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
        df_rep = pd.DataFrame(rows_processed).drop_duplicates(subset=["orden"], keep="first")
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

        reporte_final = {
            "status": "success",
            "periodo": periodo,
            "esta_bloqueado": is_locked,
            "total_muestreado": int(len(df_rep)),
            "individual_configs": individual_configs,
            "transporte_metrics": int(len(df_transporte)),
            
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
        reporte_final["speed_metrics"] = speed_res

        # 7. Persistencia
        if not is_locked:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        INSERT INTO {DB_SCHEMA}.{TableNames.ANALYZER_ETA_REPORTE_MENSUAL} (periodo_reporte, reporte_data, fecha_calculo) 
                        VALUES (%s, %s, NOW()) 
                        ON CONFLICT (periodo_reporte) DO UPDATE SET reporte_data = EXCLUDED.reporte_data, fecha_calculo = NOW()
                        """,
                        [periodo, json.dumps(reporte_final)]
                    )
                conn.commit()

        return reporte_final
    
    def get_discovered_unmapped_plans(self) -> list[str]:
        """Busca productos en la tabla de suscripciones que no tienen configuración ETA."""
        planes_config, _, _ = self._load_mappings()
        
        # Buscamos todos los productos únicos que tenemos en la base de datos de suscripciones
        df_products = self.db.query(f"SELECT DISTINCT producto FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS} WHERE producto IS NOT NULL AND producto != ''")
        all_products = df_products["producto"].tolist()
        
        # Filtramos: aquellos que no son corporativos (porque esos se gestionan por orden)
        # y que no están en el mapeo de planes ya clasificados
        discovered = []
        for p in all_products:
            p_clean = p.strip()
            is_special = any(word in p_clean.lower() for word in ["dedicado", "transporte", "l2"])
            if not is_special and p_clean not in planes_config:
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
                "updated_at": str(row["updated_at"]) if pd.notna(row.get("updated_at")) else None
            })
        return records
    
    def get_discovered_unmapped_subs(self) -> list[dict[str, Any]]:
        """Detecta solo las órdenes que realmente requieren configuración individual."""
        planes_map, _, individual_map = self._load_mappings()
        
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
            if prod_name in planes_map and prod_name not in PLANES_NO_RESIDENCIALES:
                continue

            # ✅ Solo marcar como individual si ya está guardado, o si es Dedicado/Transporte o no tiene producto
            is_dedicated = any(w in prod_name.lower() for w in ["dedicado", "transporte", "l2"]) or not prod_name
            
            if is_dedicated and ord_id not in individual_map:
                raw_cli = row.get("cliente")
                cli_name = str(raw_cli).strip() if pd.notna(raw_cli) and str(raw_cli).strip().lower() not in ("nan", "none", "null") else "Sin Nombre"
                
                raw_suc = row.get("sucursal")
                suc_name = str(raw_suc).strip() if pd.notna(raw_suc) and str(raw_suc).strip().lower() not in ("nan", "none", "null") else ""
                
                raw_zona = row.get("zona")
                zona_name = str(raw_zona).strip() if pd.notna(raw_zona) and str(raw_zona).strip().lower() not in ("nan", "none", "null") else ""

                pending_subs.append({
                    "orden": ord_id,
                    "cliente": cli_name,
                    "producto": prod_name or "Sin producto (Histórico)",
                    "sucursal": suc_name,
                    "zona": zona_name
                })
        return pending_subs
    
    def get_all_known_plans(self) -> list[dict[str, Any]]:
        """Planes del catalogo, para el desplegable de la ficha individual."""
        planes_map, _, _ = self._load_mappings()
        result = []
        for name, cfg in sorted(planes_map.items()):
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
        periodos_disponibles = sorted(
            {p[:7] for p in get_periodos()}, reverse=True
        )
        if not periodo and periodos_disponibles:
            periodo = periodos_disponibles[0]

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
            "periods": periodos_disponibles,
        }
