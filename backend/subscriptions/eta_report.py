# --- START OF FILE backend/subscriptions/eta_report.py ---
from __future__ import annotations
import json
import pathlib
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Tuple, Optional
from ..database import DBConnector
from ..conf_config import DB_SCHEMA, TableNames

PLANES_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "Planes.json"
ZONAS_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "Zonas.json"

# Mapeos semánticos para el reporte reguladora
TECH_MAP = {"RF": "Inalámbrico", "FTTH": "Alámbrico", "GPON": "Alámbrico"}
PERSONA_MAP = {"nat": "Persona Natural", "pyme": "Persona Jurídica"}

class ETAReportManager:
    def __init__(self, db: DBConnector):
        self.db = db
        self._ensure_tables_exist()

    def _ensure_tables_exist(self):
        """Crea las tablas de persistencia para configuraciones globales e individuales."""
        statements = [
            f"""
            CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.analyzer_eta_config_planes (
                plan_name TEXT PRIMARY KEY,
                reportar BOOLEAN DEFAULT TRUE,
                tecnologia TEXT,
                tipo_persona TEXT,
                tiene_tv BOOLEAN DEFAULT FALSE,
                datas_mbps NUMERIC DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.analyzer_eta_config_subs_individual (
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
            CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.analyzer_eta_reporte_mensual (
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
        df = self.db.query(
            f"SELECT esta_bloqueado FROM {DB_SCHEMA}.analyzer_eta_reporte_mensual WHERE periodo_reporte = %s",
            params=[periodo]
        )
        return not df.empty and bool(df.iloc[0]["esta_bloqueado"])

    def set_lock_status(self, periodo: str, lock: bool) -> None:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.analyzer_eta_reporte_mensual (periodo_reporte, esta_bloqueado)
                    VALUES (%s, %s)
                    ON CONFLICT (periodo_reporte) DO UPDATE SET esta_bloqueado = EXCLUDED.esta_bloqueado
                    """,
                    [periodo, lock]
                )
            conn.commit()

    def save_plan_custom_config(self, plan_name: str, config: Dict[str, Any]) -> None:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.analyzer_eta_config_planes 
                    (plan_name, reportar, tecnologia, tipo_persona, tiene_tv, datas_mbps, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (plan_name) DO UPDATE SET
                        reportar = EXCLUDED.reportar,
                        tecnologia = EXCLUDED.tecnologia,
                        tipo_persona = EXCLUDED.tipo_persona,
                        tiene_tv = EXCLUDED.tiene_tv,
                        datas_mbps = EXCLUDED.datas_mbps,
                        updated_at = NOW()
                    """,
                    [plan_name, config["reportar"], config["tecnologia"], config["tipo_persona"], config["tiene_tv"], config["datas_mbps"]]
                )
            conn.commit()

    def save_sub_individual_config(self, orden: str, config: Dict[str, Any]) -> None:
        """Guarda la parametrización individual de una suscripción corporativa."""
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.analyzer_eta_config_subs_individual 
                    (orden, cliente, producto, reportar, tecnologia, tipo_persona, tiene_tv, datas_mbps, es_transporte, es_dedicado, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (orden) DO UPDATE SET
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
                        orden, config.get("cliente", ""), config.get("producto", ""),
                        config.get("reportar", True), config.get("tecnologia"),
                        config.get("tipo_persona"), config.get("tiene_tv", False),
                        config.get("datas_mbps", 0), config.get("es_transporte", False),
                        config.get("es_dedicado", False)
                    ]
                )
            conn.commit()

    def _load_mappings(self) -> Tuple[Dict[str, Dict], Dict[str, str], Dict[str, Dict]]:
        """Retorna planes globales, zonas mapeadas y configuraciones individuales de clientes."""
        zonas_map = {}
        if ZONAS_PATH.exists():
            with open(ZONAS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for z in data.get("zonas", []):
                    zonas_map[z["name"].strip().lower()] = z.get("Estado", "Desconocido").strip()

        planes_map = {}
        if PLANES_PATH.exists():
            with open(PLANES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for p in data.get("planes", []):
                    name = p["name"].strip()
                    try:
                        datas_mbps = float(p.get("datas") or "0")
                    except ValueError:
                        datas_mbps = 0.0

                    planes_map[name] = {
                        "reportar": True,
                        "tecnologia": p.get("type", "RF").strip(),
                        "tipo_persona": p.get("people", "nat").strip().lower(),
                        "tiene_tv": str(p.get("TV")).strip().lower() == "true",
                        "datas_mbps": datas_mbps,
                        "es_transporte": name == "Transporte de Datos",
                        "es_dedicado": name == "Internet Dedicado"
                    }

        df_custom_planes = self.db.read_table("analyzer_eta_config_planes")
        if not df_custom_planes.empty:
            for _, row in df_custom_planes.iterrows():
                planes_map[row["plan_name"]] = {
                    "reportar": bool(row["reportar"]),
                    "tecnologia": str(row["tecnologia"]),
                    "tipo_persona": str(row["tipo_persona"]),
                    "tiene_tv": bool(row["tiene_tv"]),
                    "datas_mbps": float(row["datas_mbps"]),
                    "es_transporte": row["plan_name"] == "Transporte de Datos",
                    "es_dedicado": row["plan_name"] == "Internet Dedicado"
                }

        individual_map = {}
        df_custom_subs = self.db.read_table("analyzer_eta_config_subs_individual")
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

    def calculate_eta_report(self, periodo: str, force_recalc: bool = False) -> Dict[str, Any]:
        """Calcula el reporte completo generando las 10 matrices requeridas."""
        
        # 1. FUENTE DE VERDAD: Estado de bloqueo e información guardada
        is_locked = self.get_lock_status(periodo)
        individual_configs = self.get_configured_individual_subs()

        if is_locked and not force_recalc:
            df_saved = self.db.query(
                f"SELECT reporte_data FROM {DB_SCHEMA}.analyzer_eta_reporte_mensual WHERE periodo_reporte = %s",
                params=[periodo]
            )
            if not df_saved.empty and df_saved.iloc[0]["reporte_data"]:
                data = df_saved.iloc[0]["reporte_data"]
                res_dict = json.loads(data) if isinstance(data, str) else data
                res_dict["esta_bloqueado"] = True
                res_dict["individual_configs"] = individual_configs
                return res_dict

        # 2. CARGA DE DATOS BASE (Cierre de Activos del mes)
        df_activos = self.db.query(
            f"SELECT distinct orden FROM {DB_SCHEMA}.{TableNames.ANALYZER_ACTIVOS_CIERRE} WHERE periodo_reporte LIKE %s",
            params=[f"{periodo}%"]
        )
        if df_activos.empty:
            return {"status": "empty", "message": f"No hay cierre para {periodo}", "individual_configs": individual_configs}

        # 3. CRUCE CON METADATOS (Usamos LEFT para detectar órdenes sin clasificar)
        df_subs = self.db.query(
            f"SELECT distinct orden_producto, producto, cliente, zona FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS}"
        )
        df_subs = df_subs.drop_duplicates(subset=["orden_producto"])
        df_base = df_activos.merge(df_subs, left_on="orden", right_on="orden_producto", how="left")

        # 4. CARGA DE MAPEOS (Zonas y Planes)
        planes_map, zonas_map, individual_map = self._load_mappings()
        unmapped_plans, unmapped_subs = [], []
        rows_processed = []

        # 5. CLASIFICACIÓN DE CADA REGISTRO
        for _, row in df_base.iterrows():
            ord_id = str(row["orden"]).strip()
            # Si el cruce falló, el producto/cliente será None, lo forzamos a 'Desconocido' para que se mapee
            prod_name = str(row.get("producto") or "SERVICIO DESCONOCIDO").strip()
            cli_name = str(row.get("cliente") or "CLIENTE SIN NOMBRE").strip()
            zona_name = str(row.get("zona") or "SIN ZONA").strip()
            estado = zonas_map.get(zona_name.lower(), "Otros / Desconocido")

            # A. ¿Es una suscripción corporativa configurada individualmente?
            if not prod_name:
                unmapped_subs.append({"orden": ord_id, "cliente": row.get("cliente"), "producto": "PRODUCTO NO DEFINIDO EN ODOO"})
                continue

            if ord_id in individual_map:
                cfg = individual_map[ord_id]
            elif any(word in prod_name.lower() for word in ["dedicado", "transporte", "l2"]):
                unmapped_subs.append({"orden": ord_id, "cliente": row.get("cliente"), "producto": prod_name})
                continue
            elif prod_name in planes_map:
                # AQUÍ: Si el plan existe en el mapa, lo procesamos
                cfg = planes_map[prod_name]
            else:
                # SI NO EXISTE EN EL MAPA, VA A LA LISTA DE FALTANTES
                unmapped_plans.append(prod_name)
                continue

            if not cfg["reportar"]: continue

            rows_processed.append({
                "orden": ord_id, "estado": estado,
                "tecnologia": TECH_MAP.get(cfg["tecnologia"], cfg["tecnologia"]),
                "tipo_persona": PERSONA_MAP.get(cfg["tipo_persona"], cfg["tipo_persona"]),
                "tiene_tv": cfg["tiene_tv"],
                "datas_mbps": cfg["datas_mbps"],
                "es_transporte": cfg.get("es_transporte", False)
            })

        # 6. RETORNO SI FALTAN CLASIFICACIONES
        if unmapped_plans or unmapped_subs:
            return {
                "status": "unmapped_elements",
                "unmapped_plans": list(set(unmapped_plans)),
                "unmapped_subs": unmapped_subs,
                "individual_configs": individual_configs,
                "periodo": periodo
            }

        # 7. CÁLCULO DE MÉTRICAS (PROCESAMIENTO DE LAS 10 MATRICES)
        df_rep = pd.DataFrame(rows_processed)
        if df_rep.empty:
            return {"status": "empty", "message": "No hay datos reportables", "individual_configs": individual_configs}

        df_transporte = df_rep[df_rep["es_transporte"] == True].copy()
        df_main = df_rep[df_rep["es_transporte"] == False].copy()
        df_net = df_main[df_main["tecnologia"].isin(["Inalámbrico", "Alámbrico"])].copy()
        df_tv = df_main[df_main["tiene_tv"] == True].copy()

        reporte_final = {
            "status": "success",
            "periodo": periodo,
            "esta_bloqueado": is_locked,
            "total_muestreado": int(len(df_main)),
            "individual_configs": individual_configs,
            "transporte_metrics": {"total": int(len(df_transporte))},
            
            # --- MATRICES DE INTERNET (7) ---
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
            
            # --- MATRICES DE TV (3) ---
            "tv_metrics": {
                "total": int(len(df_tv)),
                "por_estado": df_tv.groupby("estado").size().to_dict(),
                "por_persona": df_tv.groupby("tipo_persona").size().to_dict(),
                "por_estado_persona": {f"{k[0]} | {k[1]}": int(v) for k, v in df_tv.groupby(["estado", "tipo_persona"]).size().to_dict().items()}
            }
        }

        # 8. SECCION VELOCIDADES
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

        # 9. PERSISTENCIA
        if not is_locked:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"INSERT INTO {DB_SCHEMA}.analyzer_eta_reporte_mensual (periodo_reporte, reporte_data, fecha_calculo) VALUES (%s, %s, NOW()) ON CONFLICT (periodo_reporte) DO UPDATE SET reporte_data = EXCLUDED.reporte_data, fecha_calculo = NOW()",
                        [periodo, json.dumps(reporte_final)]
                    )
                conn.commit()

        return reporte_final
    
    def get_discovered_unmapped_plans(self) -> List[str]:
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

    def get_configured_individual_subs(self) -> List[Dict[str, Any]]:
        """Retorna las suscripciones individuales parametrizadas."""
        df = self.db.read_table("analyzer_eta_config_subs_individual")
        if df.empty:
            return []
        
        records = []
        for _, row in df.iterrows():
            records.append({
                "orden": str(row["orden"]),
                "cliente": str(row["cliente"]) if pd.notna(row["cliente"]) else "",
                "producto": str(row["producto"]) if pd.notna(row["producto"]) else "",
                "reportar": bool(row["reportar"]),
                "tecnologia": str(row["tecnologia"]) if pd.notna(row["tecnologia"]) else "",
                "tipo_persona": str(row["tipo_persona"]) if pd.notna(row["tipo_persona"]) else "",
                "tiene_tv": bool(row["tiene_tv"]),
                "datas_mbps": float(row["datas_mbps"]) if pd.notna(row["datas_mbps"]) else 0.0,
                "es_transporte": bool(row["es_transporte"]),
                "es_dedicado": bool(row["es_dedicado"]),
                "updated_at": str(row["updated_at"]) if pd.notna(row["updated_at"]) else None
            })
        return records