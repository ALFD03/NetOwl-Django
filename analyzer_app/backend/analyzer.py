"""
Módulo principal de análisis de churn rate.

Dependencias esperadas:
- `config`: Constantes de estados (ACTIVE_STATE, INACTIVE_STATES),
            orígenes de reactivación (VALID_REACT_ORIGINS, AUDIT_REACT_ORIGINS)
            y texto del evento de corte por impago (CORTE_IMPAGADO_EVENT).
- `database.DBConnector`: Conexión a PostgreSQL para lectura/escritura de tablas.
- `models.Periodo`: Representación del período de análisis.
- `utils.parse_date`: Parseo de fechas desde texto.
- `pandas`: Manipulación intensiva de DataFrames.
- `concurrent.futures`: Carga paralela de tablas desde BD.

La clase `ChurnRateAnalyzer` orquesta todo el flujo:
1. Carga datos desde BD (3 tablas en paralelo).
2. Limpia y normaliza los datos (logs v1 y v15 se concatenan).
3. Calcula indicadores: activos inicio/fin, nuevos, bajas, reactivaciones,
   corte impagado, tiempos de vida.
4. Agrega por dimensiones (zona, sucursal, municipio, campaña, producto).
5. Persiste todos los resultados en tablas históricas.
"""

from __future__ import annotations
import concurrent.futures
from collections import defaultdict
from typing import Dict, List, Optional, Set

import pandas as pd

from .config import (
    ACTIVE_STATE,
    AUDIT_REACT_ORIGINS,
    CORTE_IMPAGADO_EVENT,
    EXCLUDED_STATE,
    INACTIVE_STATES,
    SUBS_STATE_TO_LOG_MAP,
    VALID_REACT_ORIGINS,
)
from .database import DBConnector
from .models import Periodo
from .utils import parse_date


class ChurnRateAnalyzer:
    """
    Analizador de tasa de churn para suscripciones.

    Encapsula toda la lógica de negocio: carga, limpieza, cálculo
    de métricas, agregación por dimensiones y persistencia.

    Uso típico:
        periodo = Periodo.build("2024-01-01", "2024-01-31")
        db = DBConnector()
        analyzer = ChurnRateAnalyzer(db, periodo)
        analyzer.run()
    """

    def __init__(self, db: DBConnector, periodo: Periodo):
        """
        Args:
            db: Conector a la base de datos PostgreSQL.
            periodo: Período de análisis (inicio y fin).
        """
        self.db = db
        self.periodo = periodo

    def load_data(self):
        """
        Carga las tres tablas fuente desde la base de datos en paralelo.

        Tablas cargadas:
        - `Subscripciones`: orden, fecha inicio y total.
        - `Subscripciones-logs`: logs v1 con orden, fecha, nota y estado.
        - `Subscripciones-logs-v15`: logs v15 con orden, tipo, categoría y fecha.

        Los DataFrames resultantes se almacenan como atributos de instancia:
        `df_subs_raw`, `df_logs`, `df_logs_v15`.
        """
        print("Sincronizando con base de datos...")

        # Columnas necesarias para cada tabla
        subs_cols = ["Orden_Producto", "fecha_inicio", "Total", "Estado"]
        logs_cols = ["orden", "fecha_log", "log", "estado"]
        logs_v15_cols = ["orden", "tipo", "categoria", "fecha"]
        # Ejecuta las tres lecturas concurrentemente para reducir latencia
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=3
        ) as executor:
            future_subs = executor.submit(
                self.db.read_table, "Subscripciones", subs_cols
            )
            future_logs = executor.submit(
                self.db.read_table, "Subscripciones-logs", logs_cols
            )
            future_logs_v15 = executor.submit(
                self.db.read_table,
                "Subscripciones-logs-v15",
                logs_v15_cols,
            )
            self.df_subs_raw = future_subs.result()
            self.df_logs = future_logs.result()
            self.df_logs_v15 = future_logs_v15.result()

    def build_clean_data(self):
        """
        Limpia y normaliza los datos crudos en un DataFrame unificado de logs.

        Operaciones:
        1. Normaliza columnas de suscripciones (minúsculas, rename).
        2. Convierte `total` a numérico y `f_ini` a datetime.
        3. Elimina duplicados de suscripciones por `orden`.
        4. Renombra columnas de logs v1 y v15 para unificarlas.
        5. Asigna estado a logs v15 según categoría.
        6. Concatena ambos conjuntos de logs en un solo DataFrame.
        7. Normaliza texto de notas (NFKD, ASCII, minúsculas).
        8. Calcula el estado origen de cada log (fila anterior del mismo orden).

        Atributos resultantes:
        - `df_subs_full`: Suscripciones limpias y sin duplicados.
        - `df_clean_logs`: Logs concatenados, ordenados y con estado origen.
        """
        df = self.df_subs_raw.copy()
        df.columns = df.columns.str.lower()
        df = df.rename(
            columns={
                "orden_producto": "orden",
                "fecha_inicio": "f_ini",
            }
        )
        # Limpieza de orden: elimina espacios y convierte a string
        df["orden"] = df["orden"].astype(str).str.strip()
        # Total a numérico, rellena NaN con 0
        df["total"] = pd.to_numeric(
            df["total"], errors="coerce"
        ).fillna(0.0)

        # Convierte fecha inicio a datetime; errores quedan como NaT
        df["f_ini_dt"] = pd.to_datetime(df["f_ini"], errors="coerce")

        # Normaliza estado de suscripcion y mapea a formato de log
        if "estado" in df.columns:
            df["estado"] = (
                df["estado"].astype(str)
                .str.normalize("NFKD")
                .str.encode("ascii", errors="ignore")
                .str.decode("utf-8")
                .str.lower()
                .str.strip()
            )
            df["estado"] = (
                df["estado"]
                .map(SUBS_STATE_TO_LOG_MAP)
                .fillna(EXCLUDED_STATE)
            )
        else:
            df["estado"] = EXCLUDED_STATE
        self.df_subs_full = df.drop_duplicates(subset=["orden"])

        # Normaliza logs v1: renombra columnas al estándar
        l1 = self.df_logs.rename(
            columns={
                "orden": "orden",
                "fecha_log": "fecha",
                "log": "nota",
                "estado": "estado",
            }
        )
        # Normaliza logs v15: mapea tipo → nota, categoria → cat
        l2 = self.df_logs_v15.rename(
            columns={
                "orden": "orden",
                "tipo": "nota",
                "categoria": "cat",
                "fecha": "fecha",
            }
        )
        # Asigna estado basado en categoría: "En progreso" → activo, "Cerrado" → churn
        l2["estado"] = (
            l2["cat"]
            .map(
                {
                    "En progreso": "3_progress",
                    "Cerrado": "6_churn",
                }
            )
            .fillna(l2["cat"])
        )

        # Concatena ambos DataFrames de logs
        combined = pd.concat([l1, l2], ignore_index=True, sort=False)
        combined["orden"] = combined["orden"].astype(str).str.strip()
        combined["estado"] = (
            combined["estado"].astype(str).str.strip().str.lower()
        )

        # Convierte columna de fecha a datetime
        combined["f_dt"] = pd.to_datetime(
            combined["fecha"], errors="coerce"
        )

        # Normaliza el texto de la nota: NFKD → ASCII → minúsculas
        combined["log_norm"] = (
            combined["nota"]
            .astype(str)
            .str.normalize("NFKD")
            .str.encode("ascii", errors="ignore")
            .str.decode("utf-8")
            .str.lower()
            .str.strip()
        )

        # Elimina filas sin orden o sin fecha, ordena por (orden, fecha)
        combined = (
            combined.dropna(subset=["orden", "f_dt"])
            .sort_values(["orden", "f_dt"])
        )
        # Estado origen: el estado de la fila anterior del mismo orden (para detectar transiciones)
        combined["estado_origen"] = combined.groupby("orden")[
            "estado"
        ].shift(1)
        self.df_clean_logs = combined

    def _apply_log_rules(self):
        """
        Aplica reglas de casos anomalos sobre la relacion suscripcion-log.

        Operaciones:
        1. Caso 3: Filtra logs que no tienen orden en Subscripciones.
        2. Excluye subs con estado EXCLUDED_STATE (Cotizacion/Instalacion).
        3. Caso 1 (vectorizado): Crea logs sinteticos para subs sin logs.
        4. Caso 2 (vectorizado): Crea log 3_progress si ultimo log es inactivo
           pero subs esta activa.
        5. Caso 4 (vectorizado): Crea log con estado de subs si ultimo log
           es 3_progress pero subs esta inactiva.

        Marca logs sinteticos con columna ``_sintetico`` y expone
        ``self._ordens_con_activity`` para filtrado de nuevos.
        """
        # --- Caso 3: solo logs cuyas ordenes existen en subs ---
        valid_ordens = set(self.df_subs_full["orden"])
        log_filtered = self.df_clean_logs[
            self.df_clean_logs["orden"].isin(valid_ordens)
        ].copy()
        log_filtered["_sintetico"] = False

        # --- Preparar container de filas sinteticas ---
        synth_parts = []

        # --- Caso 1: Subs sin logs en ninguna version ---
        ordenes_con_log = set(log_filtered["orden"])
        mask_no_logs = ~self.df_subs_full["orden"].isin(ordenes_con_log)
        df_no_logs = self.df_subs_full[mask_no_logs].copy()
        # Excluir 0_other (ya mapeados desde build_clean_data)
        df_no_logs = df_no_logs[df_no_logs["estado"] != EXCLUDED_STATE]

        if not df_no_logs.empty:
            # Fecha sintetica: f_ini_dt si existe, si no 1900-01-01
            df_no_logs["_synth_fecha"] = df_no_logs["f_ini_dt"].fillna(
                pd.Timestamp("1900-01-01")
            )
            df_no_logs["f_dt"] = df_no_logs["_synth_fecha"]
            df_no_logs["fecha"] = df_no_logs["f_dt"].dt.strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            df_no_logs["nota"] = "sintetico - sin logs historicos"
            df_no_logs["log_norm"] = "sintetico - sin logs historicos"
            # estado ya esta mapeado (3_progress, 6_churn, etc.)
            df_no_logs["estado_origen"] = None
            df_no_logs["_sintetico"] = True
            synth_parts.append(
                df_no_logs[
                    [
                        "orden",
                        "fecha",
                        "nota",
                        "estado",
                        "f_dt",
                        "log_norm",
                        "estado_origen",
                        "_sintetico",
                    ]
                ]
            )

        # --- Caso 2 y 4: Ultimo log inconsistente con estado de subs ---
        # Obtener ultimo log real (no sintetico) de cada orden
        idx_last = log_filtered.groupby("orden")["f_dt"].idxmax()
        df_last_logs = log_filtered.loc[idx_last, ["orden", "f_dt", "estado"]].copy()
        df_last_logs.columns = ["orden", "f_dt", "ultimo_estado_log"]

        merged = df_last_logs.merge(
            self.df_subs_full[["orden", "estado"]],
            on="orden",
            how="inner",
        )
        merged.columns = ["orden", "f_dt", "ultimo_estado_log", "estado_subs"]

        # --- Caso 2: ultimo log inactivo, subs activa ---
        mask_caso2 = (
            merged["ultimo_estado_log"].isin(INACTIVE_STATES)
            & (merged["estado_subs"] == ACTIVE_STATE)
        )
        df_caso2 = merged[mask_caso2].copy()
        if not df_caso2.empty:
            df_caso2["f_dt"] = df_caso2["f_dt"] + pd.Timedelta(seconds=1)
            df_caso2["fecha"] = df_caso2["f_dt"].dt.strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            df_caso2["nota"] = (
                "sintetico - ultimo log inactivo, sub activa"
            )
            df_caso2["log_norm"] = (
                "sintetico - ultimo log inactivo, sub activa"
            )
            df_caso2["estado"] = ACTIVE_STATE
            df_caso2["estado_origen"] = None
            df_caso2["_sintetico"] = True
            synth_parts.append(
                df_caso2[
                    [
                        "orden",
                        "fecha",
                        "nota",
                        "estado",
                        "f_dt",
                        "log_norm",
                        "estado_origen",
                        "_sintetico",
                    ]
                ]
            )

        # --- Caso 4: ultimo log activo, subs inactiva (no 0_other) ---
        mask_caso4 = (
            (merged["ultimo_estado_log"] == ACTIVE_STATE)
            & (merged["estado_subs"] != ACTIVE_STATE)
            & (merged["estado_subs"] != EXCLUDED_STATE)
        )
        df_caso4 = merged[mask_caso4].copy()
        if not df_caso4.empty:
            df_caso4["f_dt"] = df_caso4["f_dt"] + pd.Timedelta(seconds=1)
            df_caso4["fecha"] = df_caso4["f_dt"].dt.strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            df_caso4["nota"] = (
                "sintetico - ultimo log activo, sub inactiva"
            )
            df_caso4["log_norm"] = (
                "sintetico - ultimo log activo, sub inactiva"
            )
            df_caso4["estado"] = df_caso4["estado_subs"]
            df_caso4["estado_origen"] = None
            df_caso4["_sintetico"] = True
            synth_parts.append(
                df_caso4[
                    [
                        "orden",
                        "fecha",
                        "nota",
                        "estado",
                        "f_dt",
                        "log_norm",
                        "estado_origen",
                        "_sintetico",
                    ]
                ]
            )

        # --- Fusionar logs sinteticos con los reales ---
        if synth_parts:
            df_synth = pd.concat(synth_parts, ignore_index=True)
            self.df_clean_logs = pd.concat(
                [log_filtered, df_synth], ignore_index=True, sort=False
            )
        else:
            self.df_clean_logs = log_filtered

        self.df_clean_logs = self.df_clean_logs.sort_values(["orden", "f_dt"])
        # Recalcular estado_origen con shift sobre datos ordenados
        self.df_clean_logs["estado_origen"] = (
            self.df_clean_logs.groupby("orden")["estado"].shift(1)
        )

        # --- Identificar ordenes con al menos un log 3_progress ---
        self._ordens_con_activity = set(
            self.df_clean_logs[
                self.df_clean_logs["estado"] == ACTIVE_STATE
            ]["orden"]
        )

    def get_active_at(
        self, target_date, strictly_before: bool = False
    ) -> pd.DataFrame:
        """
        Obtiene las suscripciones activas en una fecha dada.

        Para cada orden, toma el último log hasta `target_date`;
        si ese log tiene estado activo (ACTIVE_STATE), la orden se incluye.

        Args:
            target_date: Fecha de referencia.
            strictly_before: Si True, usa `< target_date`; si False, `<= target_date`.

        Returns:
            DataFrame con columna `orden` de suscripciones activas en esa fecha.
        """
        # Filtra logs hasta la fecha indicada
        if strictly_before:
            filt = self.df_clean_logs[
                self.df_clean_logs["f_dt"] < target_date
            ]
        else:
            filt = self.df_clean_logs[
                self.df_clean_logs["f_dt"] <= target_date
            ]
        if filt.empty:
            return pd.DataFrame(columns=["orden"])
        # Último log de cada orden antes de la fecha
        idx = filt.groupby("orden")["f_dt"].idxmax()
        last_logs = filt.loc[idx]
        # Filtra solo aquellas cuyo último estado sea activo
        return last_logs[last_logs["estado"] == ACTIVE_STATE].copy()

    def get_reactivations(self, act_fin: pd.DataFrame) -> pd.DataFrame:
        """
        Identifica reactivaciones ocurridas dentro del período de análisis.

        Criterios:
        - Log contiene la palabra "reactivacion".
        - La reactivación ocurre entre fecha_inicio y fecha_final del período.
        - El estado origen debe ser uno de los válidos (VALID_REACT_ORIGINS).
        - Se excluyen órdenes que son nuevas en el período.
        - Solo se incluyen órdenes que están activas al final del período.

        Args:
            act_fin: DataFrame con órdenes activas al cierre del período.

        Returns:
            DataFrame con columnas `orden`, `fecha` y `estado_origen`.
        """
        df = self.df_clean_logs.copy()
        # Filtra logs que contengan "reactivacion" en la nota normalizada
        mask_react = df["log_norm"].str.contains("reactivacion", na=False)
        df_react = df[mask_react]
        # Redondea a minuto para eliminar duplicados cercanos
        df_react = df_react.assign(
            f_min=df_react["f_dt"].dt.floor("min")
        )
        df_react = df_react.drop_duplicates(subset=["orden", "f_min"])
        # Filtra por el rango de fechas del período
        df_react = df_react[
            (df_react["f_dt"] >= self.periodo.fecha_inicio)
            & (df_react["f_dt"] <= self.periodo.fecha_final)
        ]
        # Solo si el estado origen es válido para reactivación
        df_react = df_react[
            df_react["estado_origen"].isin(VALID_REACT_ORIGINS)
        ]
        df_react = df_react[["orden", "f_dt", "estado_origen"]].rename(
            columns={"f_dt": "fecha"}
        )
        # Suscripciones nuevas en el período (no son reactivaciones)
        nuevas = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= self.periodo.fecha_inicio)
            & (self.df_subs_full["f_ini_dt"] <= self.periodo.fecha_final)
        ]
        if not nuevas.empty:
            df_react = df_react[~df_react["orden"].isin(nuevas["orden"])]
        # Solo reactivaciones de órdenes que están activas al final
        if not df_react.empty:
            df_react = df_react[df_react["orden"].isin(act_fin["orden"])]
        return df_react

    def get_corte_impagado(self) -> pd.DataFrame:
        """
        Identifica eventos de corte por factura impaga en el período.

        Busca en los logs la nota que coincide exactamente con
        `CORTE_IMPAGADO_EVENT` y filtra por el rango de fechas del período.

        Returns:
            DataFrame con columnas `orden`, `fecha_corte` y `motivo_corte`.
        """
        df = self.df_clean_logs.copy()
        # Filtra logs que contengan el texto exacto de corte impago
        mask_corte = df["log_norm"].str.contains(
            CORTE_IMPAGADO_EVENT, na=False
        )
        df_corte = df[mask_corte]
        # Redondea a minuto para evitar duplicados cercanos
        df_corte = df_corte.assign(
            f_min=df_corte["f_dt"].dt.floor("min")
        )
        df_corte = df_corte.drop_duplicates(subset=["orden", "f_min"])
        # Filtra dentro del período de análisis
        df_corte = df_corte[
            (df_corte["f_dt"] >= self.periodo.fecha_inicio)
            & (df_corte["f_dt"] <= self.periodo.fecha_final)
        ]
        return df_corte[["orden", "f_dt", "nota"]].rename(
            columns={"f_dt": "fecha_corte", "nota": "motivo_corte"}
        )

    def run(self):
        """
        Ejecuta el análisis completo de churn para el período configurado.

        Flujo principal:
        1. Carga datos desde BD.
        2. Limpia y normaliza.
        3. Calcula activos al inicio y al final del período.
        4. Identifica suscripciones nuevas, inactivas y reactivaciones.
        5. Calcula métricas financieras (billing total, ARPU).
        6. Clasifica bajas (financieras vs operativas).
        7. Detecta cortes por impago.
        8. Persiste tablas maestras en BD.
        9. Genera resumen con indicadores calculados.
        10. Agrega por dimensiones geográficas y comerciales.
        11. Calcula tiempos de vida (días activo, días cancelado).
        """
        self.load_data()
        self.build_clean_data()
        self._apply_log_rules()
        periodo_label = self.periodo.label()

        # Activos al inicio del período (estrictamente antes)
        act_ini = self.get_active_at(
            self.periodo.fecha_inicio, strictly_before=True
        )
        # Activos al final del período (inclusive)
        act_fin = self.get_active_at(
            self.periodo.fecha_final, strictly_before=False
        )
        # Suscripciones nuevas que iniciaron dentro del período
        # Solo cuentan si tienen al menos un log 3_progress
        nuevos = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= self.periodo.fecha_inicio)
            & (
                self.df_subs_full["f_ini_dt"]
                <= self.periodo.fecha_final
            )
            & self.df_subs_full["orden"].isin(
                self._ordens_con_activity
            )
        ].copy()

        # Conjuntos de órdenes para operaciones de conjuntos rápidas
        set_ini: Set[str] = set(act_ini["orden"])
        set_fin: Set[str] = set(act_fin["orden"])
        set_nue: Set[str] = set(nuevos["orden"])

        # Inactivos: último estado antes del período en estados de inactividad
        last_logs = self.df_clean_logs[
            self.df_clean_logs["f_dt"] < self.periodo.fecha_inicio
        ]
        idx_inac = last_logs.groupby("orden")["f_dt"].idxmax()
        df_ultimo_estado = last_logs.loc[idx_inac]
        df_inactivos = df_ultimo_estado[
            df_ultimo_estado["estado"].isin(INACTIVE_STATES)
        ].copy()
        total_inactivos = len(df_inactivos)

        # Mapa de facturación por orden para calcular billing y ARPU
        billing_map = self.df_subs_full.set_index("orden")["total"]
        total_billing = round(
            billing_map.reindex(set_fin).fillna(0).sum(), 2
        )
        arpu = (
            round(total_billing / len(act_fin), 2)
            if len(act_fin) > 0
            else 0.0
        )

        # Reactivaciones dentro del período
        df_react_all = self.get_reactivations(act_fin)
        # Conteo por estado origen para el resumen
        counts_react: Dict[str, int] = {
            "4_paused": 0,
            "6_churn": 0,
            "8_30days": 0,
        }
        set_react_audit: Set[str] = set()
        if not df_react_all.empty:
            counts_react.update(
                df_react_all["estado_origen"].value_counts().to_dict()
            )
            set_react_audit = set(
                df_react_all[
                    df_react_all["estado_origen"].isin(
                        AUDIT_REACT_ORIGINS
                    )
                ]["orden"]
            )

        # Totales de reactivaciones del periodo (suma por estado de origen)
        n_react_unicas = sum(counts_react.values())
        n_react_6_8 = counts_react.get("6_churn", 0) + counts_react.get("8_30days", 0)

        # Cortes por factura impaga
        df_corte_impagado = self.get_corte_impagado()
        set_corte_impagado = (
            set(df_corte_impagado["orden"])
            if not df_corte_impagado.empty
            else set()
        )

        # Bajas netas: activos al inicio que no sobrevivieron
        sobrevivientes = set_fin - set_nue
        bajas_fin_netas_ids = set_ini - sobrevivientes

        # Ajuste por tamaño objetivo (no puede exceder activos iniciales)
        target_size = len(act_ini) - (len(act_fin) - len(nuevos))
        target_size = max(0, target_size)

        # DataFrame de bajas financieras, ordenado y limitado a target_size
        df_bajas_fin = self.df_subs_full[
            self.df_subs_full["orden"].isin(bajas_fin_netas_ids)
        ].copy()
        if "f_ini_dt" in df_bajas_fin.columns:
            df_bajas_fin = df_bajas_fin.sort_values(
                by=["f_ini_dt", "orden"], na_position="last"
            )
        else:
            df_bajas_fin = df_bajas_fin.sort_values(by=["orden"])
        df_bajas_fin = (
            df_bajas_fin.head(target_size).reset_index(drop=True)
        )
        bajas_fin_netas = len(df_bajas_fin)

        # Bajas operativas: órdenes que pasaron de activo a pausado/churn en el período
        # Se excluyen logs sinteticos (Casos 1, 2, 4) para no generar falsas transiciones
        mask = (
            ~self.df_clean_logs["_sintetico"]
            & ~self.df_clean_logs["orden"].isin(set_fin)
            & self.df_clean_logs["f_dt"].between(
                self.periodo.fecha_inicio, self.periodo.fecha_final
            )
            & (self.df_clean_logs["estado_origen"] == ACTIVE_STATE)
            & self.df_clean_logs["estado"].isin({"4_paused", "6_churn"})
        )
        candidates = self.df_clean_logs[mask]
        # Primer evento de baja de cada orden
        first_idx = candidates.groupby("orden")["f_dt"].idxmin()
        df_bajas_op = (
            candidates.loc[first_idx][
                ["orden", "f_dt", "nota"]
            ]
            .rename(columns={"f_dt": "fecha", "nota": "motivo"})
            .reset_index(drop=True)
        )
        if not df_bajas_op.empty:
            # Enriquece con datos de suscripción
            df_bajas_op = df_bajas_op.merge(
                self.df_subs_full, on="orden", how="left"
            )

        # Persiste tablas maestras
        self.db.save_historico(
            act_fin, "master_activos_cierre", periodo_label
        )
        self.db.save_historico(
            df_react_all, "master_reactivaciones", periodo_label
        )
        self.db.save_historico(
            df_bajas_fin,
            "master_bajas_detalladas",
            periodo_label,
            "Financiero",
        )
        self.db.save_historico(
            df_bajas_op,
            "master_bajas_detalladas",
            periodo_label,
            "Operativo",
        )
        self.db.save_historico(
            df_corte_impagado,
            "master_corte_impagado",
            periodo_label,
        )

        # Construye resumen de indicadores para ambos métodos (Operativo y Financiero)
        summary: List[Dict] = []
        for met, df_b in [
            ("Operativo", df_bajas_op),
            ("Financiero", df_bajas_fin),
        ]:
            b_netas = len(df_b)
            b_auditoria = b_netas + n_react_6_8

            summary.append(
                {
                    "periodo": periodo_label,
                    "metodo": met,
                    "activos_inicio": len(act_ini),
                    "activos_final": len(act_fin),
                    "nuevos_mes": len(set_nue),
                    "bajas_netas_balance": b_netas,
                    "bajas_brutas_auditoria": b_auditoria,
                    "react_6_churn": int(
                        counts_react.get("6_churn", 0)
                    ),
                    "react_8_30days": int(
                        counts_react.get("8_30days", 0)
                    ),
                    "react_4_paused": int(
                        counts_react.get("4_paused", 0)
                    ),
                    "churn_neto_pct": (
                        round((b_netas / len(act_ini) * 100), 4)
                        if len(act_ini) > 0
                        else 0
                    ),
                    "churn_bruto_pct": (
                        round((b_auditoria / len(act_ini) * 100), 4)
                        if len(act_ini) > 0
                        else 0
                    ),
                    "corte_impagado": len(set_corte_impagado),
                    "total_inactivos": total_inactivos,
                    "tasa_winback_pct": (
                        round(
                            (n_react_unicas / total_inactivos) * 100, 4
                        )
                        if total_inactivos > 0
                        else 0
                    ),
                    "total_billing": total_billing,
                    "arpu": arpu,
                    "reactivaciones": n_react_unicas,
                    "react_6_8": n_react_6_8,
                    "tasa_aporte_react_pct": (
                        round(
                            (n_react_6_8 / (len(set_nue) + n_react_6_8)) * 100, 4
                        )
                        if (len(set_nue) + n_react_6_8) > 0
                        else 0
                    ),
                    "indice_reemplazo_react_pct": (
                        round((n_react_6_8 / bajas_fin_netas) * 100, 4)
                        if bajas_fin_netas > 0
                        else 0
                    ),
                    "adiciones_brutas": len(set_nue) - bajas_fin_netas,
                    "adiciones_netas": (len(set_nue) + n_react_6_8) - bajas_fin_netas,
                }
            )

        # Persiste el resumen
        self.db.save_historico(
            pd.DataFrame(summary), "cierre_churn_historico", periodo_label
        )

        # Detalle de inactivos si existen
        if not df_inactivos.empty:
            detalle_inac = df_inactivos[["orden", "f_dt", "estado"]].rename(
                columns={"f_dt": "fecha_evento", "estado": "estado_inactivo"}
            )
            self.db.save_historico(
                detalle_inac, "master_inactivos_detallados", periodo_label
            )

        # Impresión de resultados en consola
        print(
            f"\nANÁLISIS COMPLETADO | Periodo: {periodo_label}"
        )
        print(
            f"Base Inicio: {len(act_ini)} | Nuevos: {len(set_nue)}"
            f" | Base Final: {len(act_fin)}"
        )
        print(
            f"FINANCIERO -> Balance Neto: {len(df_bajas_fin)}"
            f" | Auditoría: {summary[1]['bajas_brutas_auditoria']}"
        )
        print(
            f"OPERATIVO  -> Balance Neto: {len(df_bajas_op)}"
            f" | Auditoría: {summary[0]['bajas_brutas_auditoria']}"
        )
        print(
            f"CORTE IMPAGADO: {len(set_corte_impagado)}"
            " suscripciones afectadas"
        )
        print(
            f"INACTIVOS: {total_inactivos}"
            f" | Reactivaciones totales: {n_react_unicas}"
            f" | Tasa Winback: {summary[0]['tasa_winback_pct']}%"
        )

        # Agregación por dimensiones + tiempos de vida
        self.aggregate_dimensions(
            act_ini, act_fin, nuevos, df_bajas_fin,
            df_inactivos, df_react_all, df_corte_impagado,
            set_react_audit, self.calculate_lifetime_metrics()
        )

    def aggregate_dimensions(
        self,
        act_ini: pd.DataFrame,
        act_fin: pd.DataFrame,
        nuevos: pd.DataFrame,
        df_bajas_fin: pd.DataFrame,
        df_inactivos: pd.DataFrame,
        df_react_all: pd.DataFrame,
        df_corte_impagado: pd.DataFrame,
        set_react_audit: Set[str],
        df_lifecycle: pd.DataFrame,
    ):
        """
        Agrega los indicadores por cada dimensión (zona, sucursal, municipio, campaña, producto).

        Para cada dimensión:
        1. Lee la tabla de suscripciones completa para obtener el mapeo orden → valor.
        2. Cuenta activos inicio, activos fin, nuevos, bajas, inactivos, reactivaciones,
           cortes impago, etc. para cada valor de la dimensión.
        3. Calcula indicadores derivados: churn neto/bruto, tasas, billing, ARPU.
        4. Integra métricas de tiempos de vida (días activo promedio, días cancelado promedio).
        5. Persiste todo en `master_churn_dimensiones`.

        Args:
            act_ini: Activos al inicio del período.
            act_fin: Activos al final del período.
            nuevos: Suscripciones nuevas en el período.
            df_bajas_fin: Bajas según método financiero.
            df_inactivos: Suscripciones inactivas antes del período.
            df_react_all: Reactivaciones en el período.
            df_corte_impagado: Cortes por impago.
            set_react_audit: Conjunto de órdenes con reactivaciones auditables.
            df_lifecycle: DataFrame con métricas de ciclo de vida por orden.
        """
        import json
        import pathlib

        periodo_label = self.periodo.label()
        # Dimensiones a analizar
        DIMS = [
            "zona", "sucursal", "municipio", "campanna", "producto"
        ]

        # Lee tabla de suscripciones para obtener todas las columnas de dimensión
        df_subs = self.db.read_table("Subscripciones")
        df_subs.columns = df_subs.columns.str.lower()
        for c in ["orden_producto"] + DIMS:
            if c in df_subs.columns:
                df_subs[c] = df_subs[c].astype(str).str.strip()

        # Elimina duplicados de orden_producto para tener un mapeo 1:1
        df_subs_dedup = df_subs.drop_duplicates(subset=["orden_producto"])

        # Reactivaciones auditables (provenientes de churn o 30 días)
        df_react_audit = (
            df_react_all[
                df_react_all["estado_origen"].isin(AUDIT_REACT_ORIGINS)
            ]
            if not df_react_all.empty
            else pd.DataFrame()
        )

        # Separa reactivaciones por estado origen para conteo individual
        react_by_origin = {
            o: (
                df_react_all[df_react_all["estado_origen"] == o]["orden"]
                if not df_react_all.empty
                else pd.Series(dtype=str)
            )
            for o in ["6_churn", "8_30days", "4_paused"]
        }

        all_rows: List[Dict] = []

        for dim in DIMS:
            if dim not in df_subs.columns:
                continue

            # Valor por defecto cuando una orden no tiene la dimensión
            default = f"Sin {dim}"
            # Mapa: orden_producto → valor de la dimensión
            map_dict = (
                df_subs_dedup.dropna(subset=[dim])
                .set_index("orden_producto")[dim]
                .to_dict()
            )

            def cnt(df_ords):
                """
                Función interna que cuenta órdenes agrupadas por valor de dimensión.

                Args:
                    df_ords: DataFrame con columna 'orden'.

                Returns:
                    Dict {valor_dimensión: cantidad_de_órdenes}.
                """
                if df_ords is None or (
                    hasattr(df_ords, "empty") and df_ords.empty
                ):
                    return {}
                s = df_ords["orden"].astype(str).str.strip()
                return (
                    s.map(map_dict)
                    .fillna(default)
                    .value_counts()
                    .to_dict()
                )

            # Mapa de facturación global (total por orden_producto)
            billing_global = pd.to_numeric(
                df_subs_dedup.set_index("orden_producto")["total"],
                errors="coerce",
            ).fillna(0.0)

            # Cuenta cada conjunto por valor de dimensión
            d_act_ini = cnt(act_ini)
            d_act_fin = cnt(act_fin)
            d_nuevos = cnt(nuevos)
            d_bajas = cnt(df_bajas_fin)
            d_inact = cnt(df_inactivos)
            d_react = cnt(df_react_all)
            d_react_aud = cnt(df_react_audit)
            d_corte = cnt(df_corte_impagado)
            d_react_6 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["6_churn"]}
                )
            )
            d_react_8 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["8_30days"]}
                )
            )
            d_react_4 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["4_paused"]}
                )
            )

            # Métricas de ciclo de vida agrupadas por valor de dimensión
            lc = df_lifecycle.copy()
            lc["_dim"] = (
                lc["orden"]
                .astype(str)
                .str.strip()
                .map(map_dict)
                .fillna(default)
            )
            g_lc = lc.groupby("_dim")
            d_total = g_lc.size().to_dict()
            d_con_churn = g_lc["dias_activo"].count().to_dict()
            d_con_react = g_lc["dias_cancelado"].count().to_dict()
            d_prom_act = g_lc["dias_activo"].mean().to_dict()
            d_prom_can = g_lc["dias_cancelado"].mean().to_dict()

            # Todos los valores únicos presentes en cualquier conteo
            valores = sorted(
                set(
                    list(d_act_ini)
                    + list(d_act_fin)
                    + list(d_nuevos)
                    + list(d_bajas)
                    + list(d_inact)
                    + list(d_react)
                    + list(d_corte)
                    + list(d_react_6)
                    + list(d_react_8)
                    + list(d_react_4)
                    + list(d_total)
                )
            )

            # Para cada valor de la dimensión, calcula los indicadores
            for val in valores:
                a_ini = d_act_ini.get(val, 0)
                a_fin = d_act_fin.get(val, 0)
                nv = d_nuevos.get(val, 0)
                # Bajas netas = IDs reales del metodo financiero (mismos que cierre_churn_historico)
                bn = d_bajas.get(val, 0)
                bb = bn + d_react_aud.get(val, 0)
                inac = d_inact.get(val, 0)
                reac = d_react.get(val, 0)
                react_6_8_count = d_react_6.get(val, 0) + d_react_8.get(val, 0)

                # Calcula billing para las órdenes activas al final de este valor
                billing_val = 0
                if a_fin > 0 and not act_fin.empty:
                    ordens_fin = (
                        act_fin["orden"].astype(str).str.strip()
                    )
                    mask = (
                        ordens_fin.map(map_dict)
                        .fillna(default)
                        == val
                    )
                    billing_val = round(
                        billing_global.reindex(
                            ordens_fin[mask]
                        )
                        .fillna(0)
                        .sum(),
                        2,
                    )

                all_rows.append(
                    {
                        "dimension": dim,
                        "valor": val,
                        "activos_inicio": a_ini,
                        "activos_final": a_fin,
                        "nuevos": nv,
                        "bajas_netas": bn,
                        "churn_neto_pct": (
                            round((bn / a_ini) * 100, 4)
                            if a_ini > 0
                            else 0
                        ),
                        "bajas_brutas": bb,
                        "churn_bruto_pct": (
                            round((bb / a_ini) * 100, 4)
                            if a_ini > 0
                            else 0
                        ),
                        "react_6_churn": d_react_6.get(val, 0),
                        "react_8_30days": d_react_8.get(val, 0),
                        "react_4_paused": d_react_4.get(val, 0),
                        "total_inactivos": inac,
                        "reactivaciones": reac,
                        "react_6_8": react_6_8_count,
                        "tasa_aporte_react_pct": (
                            round(
                                (react_6_8_count / (nv + react_6_8_count)) * 100, 4
                            )
                            if (nv + react_6_8_count) > 0
                            else 0
                        ),
                        "indice_reemplazo_react_pct": (
                            round((react_6_8_count / bn) * 100, 4)
                            if bn > 0
                            else 0
                        ),
                        "adiciones_brutas": nv - bn,
                        "adiciones_netas": (nv + react_6_8_count) - bn,
                        "tasa_winback_pct": (
                            round((reac / inac) * 100, 4)
                            if inac > 0
                            else 0
                        ),
                        "corte_impagado": d_corte.get(val, 0),
                        "total_ordenes": d_total.get(val, 0),
                        "con_churn": d_con_churn.get(val, 0),
                        "con_reactivacion": d_con_react.get(val, 0),
                        "prom_dias_activo": (
                            round(d_prom_act.get(val, 0), 2)
                            if pd.notna(d_prom_act.get(val))
                            else 0
                        ),
                        "prom_dias_cancelado": (
                            round(d_prom_can.get(val, 0), 2)
                            if pd.notna(d_prom_can.get(val))
                        else 0
                    ),
                    "total_billing": billing_val,
                    "arpu": (
                        round(billing_val / a_fin, 2)
                        if a_fin > 0
                        else 0.0
                    ),
                }
                )

        # Persiste el resultado de dimensiones
        df_result = pd.DataFrame(all_rows)
        self.db.save_historico(
            df_result, "master_churn_dimensiones", periodo_label
        )

        dims_ok = [d for d in DIMS if d in df_subs.columns]
        print(
            f"\nDIMENSIONES | {len(dims_ok)} calculadas:"
            f" {', '.join(dims_ok)}"
            f" | {len(all_rows)} filas en master_churn_dimensiones"
        )

    def calculate_lifetime_metrics(self):
        """
        Calcula métricas de tiempo de vida de las suscripciones.

        Para cada orden que haya tenido al menos un evento de churn:
        - `dias_activo`: Días desde `f_ini_dt` hasta el primer churn.
        - `dias_cancelado`: Días desde el primer churn hasta la primera reactivación.

        También computa un resumen global (promedios) y persiste ambos:
        - `master_tiempos_vida`: Detalle por orden.
        - `master_tiempo_global`: Promedios globales.

        Returns:
            DataFrame con detalle de tiempos de vida por orden.
        """
        periodo_label = self.periodo.label()

        # Filtra suscripciones y logs hasta el final del período
        df_subs = self.df_subs_full[
            self.df_subs_full["f_ini_dt"] <= self.periodo.fecha_final
        ].copy()
        df_logs = self.df_clean_logs[
            (self.df_clean_logs["f_dt"] <= self.periodo.fecha_final)
            & ~self.df_clean_logs["_sintetico"]
        ].copy()

        # Primer evento de churn (estado "6_churn") de cada orden
        churn_logs = df_logs[df_logs["estado"] == "6_churn"]
        first_churn_idx = churn_logs.groupby("orden")["f_dt"].idxmin()
        df_first_churn = churn_logs.loc[first_churn_idx][
            ["orden", "f_dt"]
        ].rename(columns={"f_dt": "f_churn"})

        # Primera reactivación después del churn (vuelta a "3_progress")
        progress_logs = df_logs[df_logs["estado"] == "3_progress"]
        merged = progress_logs.merge(
            df_first_churn, on="orden", how="inner"
        )
        after_churn = merged[merged["f_dt"] > merged["f_churn"]]
        first_react_idx = after_churn.groupby("orden")["f_dt"].idxmin()
        df_first_react = after_churn.loc[first_react_idx][
            ["orden", "f_dt"]
        ].rename(columns={"f_dt": "f_react"})

        # Combina fechas de inicio, churn y reactivación
        df_detail = (
            df_subs[["orden", "f_ini_dt"]]
            .merge(df_first_churn, on="orden", how="left")
            .merge(df_first_react, on="orden", how="left")
        )
        # Calcula días activo y días cancelado
        df_detail["dias_activo"] = (
            df_detail["f_churn"] - df_detail["f_ini_dt"]
        ).dt.days
        df_detail["dias_cancelado"] = (
            df_detail["f_react"] - df_detail["f_churn"]
        ).dt.days

        # Persiste detalle
        self.db.save_historico(
            df_detail, "master_tiempos_vida", periodo_label
        )
        total_ords = len(df_detail)
        n_churn = df_detail["dias_activo"].notna().sum()
        n_react = df_detail["dias_cancelado"].notna().sum()
        avg_activo = df_detail["dias_activo"].mean()
        avg_cancelado = df_detail["dias_cancelado"].mean()

        # Resumen global
        df_global = pd.DataFrame(
            [
                {
                    "total_ordenes": total_ords,
                    "con_churn": n_churn,
                    "con_reactivacion": n_react,
                    "prom_dias_activo": (
                        round(avg_activo, 2)
                        if pd.notna(avg_activo)
                        else 0
                    ),
                    "prom_dias_cancelado": (
                        round(avg_cancelado, 2)
                        if pd.notna(avg_cancelado)
                        else 0
                    ),
                }
            ]
        )
        self.db.save_historico(
            df_global, "master_tiempo_global", periodo_label
        )

        print(
            f"\nTIEMPOS DE VIDA | {total_ords} órdenes"
        )
        print(
            f"  Promedio días activo: {df_global.iloc[0]['prom_dias_activo']}"
            f" | basado en {n_churn} órdenes con churn"
        )
        print(
            f"  Promedio días cancelado: "
            f"{df_global.iloc[0]['prom_dias_cancelado']}"
            f" | basado en {n_react} órdenes con reactivación"
        )

        return df_detail
