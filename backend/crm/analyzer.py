"""
Orquestador principal del análisis CRM.
Recibe un período, filtra datos por fecha_fin, calcula métricas y dimensiones.
"""
from __future__ import annotations
from typing import Any, Dict

from ..database import DBConnector
from ..models import Periodo
from .metrics import compute_and_save_all_global
from .dimensions import aggregate_dimensions


class CRMAnalyzer:
    """Analizador de métricas CRM para un período dado."""

    def __init__(self, db: DBConnector, periodo: Periodo):
        self.db = db
        self.periodo = periodo
        self.fecha_fin = periodo.fecha_final
        self.metrics_data: dict = {}

    def _migrate_schema(self):
        """Migra esquemas existentes agregando columnas faltantes."""
        from ..config import DB_SCHEMA
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                for table, col, dtype in [
                    ("crm_tiempo_instalacion", "horas_p25", "NUMERIC"),
                    ("crm_tiempo_instalacion", "horas_p75", "NUMERIC"),
                ]:
                    cur.execute(
                        f"ALTER TABLE {DB_SCHEMA}.{table} ADD COLUMN IF NOT EXISTS {col} {dtype}"
                    )
            conn.commit()

    def run(self) -> dict:
        """Ejecuta el pipeline completo de análisis."""
        periodo_label = self.periodo.label()
        print(f"\nANALISIS CRM | Periodo: {periodo_label}")
        print(f"  Cierre: {self.fecha_fin}")
        self._migrate_schema()
        print(f"  Calculando métricas globales...")

        # 1. Métricas globales → tablas detalle + crm_metricas_globales
        self.metrics_data = compute_and_save_all_global(
            self.db, periodo_label, self.fecha_fin
        )

        # 2. Dimensiones → tablas detalle + crm_dimensiones_historico
        print(f"  Calculando dimensiones...")
        aggregate_dimensions(self.db, periodo_label, self.fecha_fin)

        # 3. Resumen
        self._print_summary()
        return self.metrics_data

    def _print_summary(self):
        md = self.metrics_data
        print(f"\nANALISIS CRM COMPLETADO | Periodo: {self.periodo.label()}")
        print(f"Total Clientes: {md.get('total_clientes', 0)}")
        print(f"Ganados: {md.get('ganados', 0)} | Perdidos: {md.get('perdidos', 0)}")

        ti = md.get("tiempo_instalacion", {})
        if ti:
            h_prom = ti.get('horas_promedio') or 0
            tot_inst = ti.get('total_instalados') or 0
            print(f"Tiempo Instalación Promedio: {h_prom:.1f}h | Total Instalados: {tot_inst}")

        for e in md.get("efectividad", []):
            print(f"  Efectividad {e['etapa']}: {e.get('efectividad_pct', 0)}% (salidas: {e.get('total_salidas', 0)}, retornos: {e.get('retornos', 0)})")

        prob = md.get("probabilidad_etapa8_perdidos", {}).get("resumen", {})
        if prob:
            print(f"Pct Etapa 8: {prob.get('pct_etapa8', 0)}% | Pct Perdidos: {prob.get('pct_perdidos', 0)}%")

        resc = md.get("rescate_perdidos", {})
        if resc:
            print(f"Rescate Perdidos->Instalados: {resc.get('pct_rescate', 0)}% (perdidos: {resc.get('total_perdidos', 0)}, rescatados: {resc.get('rescatados', 0)})")


def run_crm_analysis(periodo_text: str) -> dict:
    """Función de conveniencia para ejecutar análisis desde CLI o API."""
    db = DBConnector()
    periodo = Periodo.build(periodo_text)
    analyzer = CRMAnalyzer(db, periodo)
    return analyzer.run()
