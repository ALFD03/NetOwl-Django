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

        # Cargar mapeos de planes globales de DB
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

        # Cargar configuraciones individuales (Suscripciones Corporativas)
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
        # FUENTE DE VERDAD ABSOLUTA: Consultar el estado de bloqueo directamente desde la columna DB
        is_locked = self.get_lock_status(periodo)

        if is_locked and not force_recalc:
            df_saved = self.db.query(
                f"SELECT reporte_data FROM {DB_SCHEMA}.analyzer_eta_reporte_mensual WHERE periodo_reporte = %s",
                params=[periodo]
            )
            if not df_saved.empty and df_saved.iloc[0]["reporte_data"]:
                data = df_saved.iloc[0]["reporte_data"]
                res_dict = json.loads(data) if isinstance(data, str) else data
                res_dict["esta_bloqueado"] = True
                return res_dict

        df_activos = self.db.query(
            f"SELECT distinct orden FROM {DB_SCHEMA}.{TableNames.ANALYZER_ACTIVOS_CIERRE} WHERE periodo_reporte LIKE %s",
            params=[f"{periodo}%"]
        )
        if df_activos.empty:
            return {"status": "empty", "message": f"No hay cierre de activos calculado para el mes {periodo}"}

        df_subs = self.db.query(
            f"SELECT distinct orden_producto, producto, cliente, zona FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS}"
        )
        df_subs = df_subs.drop_duplicates(subset=["orden_producto"])

        df_base = df_activos.merge(df_subs, left_on="orden", right_on="orden_producto", how="inner")

        planes_map, zonas_map, individual_map = self._load_mappings()

        unmapped_plans = []
        unmapped_subs = []

        for _, row in df_base.iterrows():
            ord_id = str(row["orden"])
            prod_name = str(row["producto"]).strip()
            cli_name = str(row["cliente"]).strip()

            if prod_name in ("Internet Dedicado", "Transporte de Datos"):
                if ord_id not in individual_map:
                    unmapped_subs.append({
                        "orden": ord_id,
                        "cliente": cli_name,
                        "producto": prod_name
                    })
            else:
                if prod_name not in planes_map:
                    unmapped_plans.append(prod_name)

        if unmapped_plans or unmapped_subs:
            return {
                "status": "unmapped_elements",
                "message": "Se requiere parametrización de elementos antes de generar el reporte.",
                "unmapped_plans": list(set(unmapped_plans)),
                "unmapped_subs": unmapped_subs
            }

        rows_processed = []
        for _, row in df_base.iterrows():
            ord_id = str(row["orden"])
            prod_name = str(row["producto"]).strip()
            zona_name = str(row["zona"]).strip()
            estado = zonas_map.get(zona_name.lower(), "Desconocido")

            if ord_id in individual_map:
                cfg = individual_map[ord_id]
            else:
                cfg = planes_map[prod_name]

            if not cfg["reportar"]:
                continue

            rows_processed.append({
                "orden": ord_id,
                "estado": estado,
                "tecnologia": TECH_MAP.get(cfg["tecnologia"], cfg["tecnologia"]),
                "tipo_persona": PERSONA_MAP.get(cfg["tipo_persona"], cfg["tipo_persona"]),
                "tiene_tv": cfg["tiene_tv"],
                "datas_mbps": cfg["datas_mbps"],
                "es_transporte": cfg["es_transporte"],
                "es_dedicado": cfg["es_dedicado"]
            })

        df_rep = pd.DataFrame(rows_processed)
        if df_rep.empty:
            return {"status": "empty", "message": "No se encontraron registros reportables para este mes."}

        df_transporte = df_rep[df_rep["es_transporte"] == True].copy()
        df_main = df_rep[df_rep["es_transporte"] == False].copy()

        transporte_metrics = {
            "total": int(len(df_transporte)),
            "por_estado": df_transporte.groupby("estado").size().to_dict() if not df_transporte.empty else {},
            "por_persona": df_transporte.groupby("tipo_persona").size().to_dict() if not df_transporte.empty else {},
            "por_tecnologia": df_transporte.groupby("tecnologia").size().to_dict() if not df_transporte.empty else {}
        }

        df_tv = df_main[df_main["tiene_tv"] == True].copy()
        tv_metrics = {
            "total": int(len(df_tv)),
            "por_estado": {k: int(v) for k, v in df_tv.groupby("estado").size().to_dict().items()},
            "por_persona": {k: int(v) for k, v in df_tv.groupby("tipo_persona").size().to_dict().items()},
            "por_estado_persona": {
                f"{k[0]} - {k[1]}": int(v) for k, v in df_tv.groupby(["estado", "tipo_persona"]).size().to_dict().items()
            }
        }

        df_net = df_main[df_main["tecnologia"].isin(["Inalámbrico", "Alámbrico"])].copy()
        net_metrics = {
            "total": int(len(df_net)),
            "por_tecnologia": {k: int(v) for k, v in df_net.groupby("tecnologia").size().to_dict().items()},
            "por_persona": {k: int(v) for k, v in df_net.groupby("tipo_persona").size().to_dict().items()},
            "por_tecnologia_persona": {
                f"{k[0]} - {k[1]}": int(v) for k, v in df_net.groupby(["tecnologia", "tipo_persona"]).size().to_dict().items()
            },
            "por_estado": {k: int(v) for k, v in df_net.groupby("estado").size().to_dict().items()},
            "por_estado_tecnologia": {
                f"{k[0]} - {k[1]}": int(v) for k, v in df_net.groupby(["estado", "tecnologia"]).size().to_dict().items()
            },
            "por_estado_persona": {
                f"{k[0]} - {k[1]}": int(v) for k, v in df_net.groupby(["estado", "tipo_persona"]).size().to_dict().items()
            },
            "por_estado_tecnologia_persona": {
                f"{k[0]} - {k[1]} - {k[2]}": int(v) for k, v in df_net.groupby(["estado", "tecnologia", "tipo_persona"]).size().to_dict().items()
            }
        }

        bins = [0.0, 2.0, 10.0, 30.0, 100.0, 1000.0, np.inf]
        labels = [
            "Desde 256 Kbps a menos de 2 Mbps",
            "Desde 2 Mbps a menos de 10 Mbps",
            "Desde 10 Mbps a menos de 30 Mbps",
            "Desde 30 Mbps a menos de 100 Mbps",
            "Desde 100 Mbps a menos de 1 Gbps",
            "Desde 1 Gbps en adelante"
        ]
        df_net["rango_velocidad"] = pd.cut(df_net["datas_mbps"], bins=bins, labels=labels, right=False)
        speed_grouped = df_net.groupby(["rango_velocidad", "tecnologia"], observed=False).size().unstack(fill_value=0)

        speed_metrics = {}
        for r_name in labels:
            speed_metrics[r_name] = {}
            for tech in ["Inalámbrico", "Alámbrico"]:
                speed_metrics[r_name][tech] = int(speed_grouped.at[r_name, tech]) if tech in speed_grouped.columns else 0
            speed_metrics[r_name]["total"] = sum(speed_metrics[r_name].values())

        reporte_final = {
            "status": "success",
            "periodo": periodo,
            "esta_bloqueado": is_locked,
            "tv_metrics": tv_metrics,
            "net_metrics": net_metrics,
            "speed_metrics": speed_metrics,
            "transporte_metrics": transporte_metrics,
            "total_muestreado": int(len(df_main))
        }

        if not is_locked:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        INSERT INTO {DB_SCHEMA}.analyzer_eta_reporte_mensual (periodo_reporte, reporte_data, fecha_calculo)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (periodo_reporte) DO UPDATE SET 
                            reporte_data = EXCLUDED.reporte_data,
                            fecha_calculo = NOW()
                        """,
                        [periodo, json.dumps(reporte_final)]
                    )
                conn.commit()

        return reporte_final

    def get_configured_individual_subs(self) -> List[Dict[str, Any]]:
        """Retorna las suscripciones individuales parametrizadas con tipados seguros para JSON."""
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
# --- END OF FILE backend/subscriptions/eta_report.py ---