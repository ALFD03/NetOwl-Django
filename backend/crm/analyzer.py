"""
Orquestador principal del análisis CRM.
Analiza todos los datos sin filtro temporal.
"""
from __future__ import annotations
from typing import Any, Dict

from ..database import DBConnector
from .metrics import compute_and_save_all_global
from .dimensions import aggregate_dimensions


def run_crm_analysis() -> dict:
    db = DBConnector()
    datos = compute_and_save_all_global(db)
    aggregate_dimensions(db)
    _print_summary(datos)
    return datos


def _print_summary(md: dict):
    totals = md.get("totals", {})
    print(f"\nANALISIS CRM COMPLETADO | Datos completos")
    print(f"Total Clientes: {totals.get('total_clientes', 0)}")
    print(f"Ganados: {totals.get('ganados', 0)} | Perdidos: {totals.get('perdidos', 0)}")

    ti = md.get("tiempo_instalacion", {})
    if ti:
        h_prom = ti.get('horas_promedio') or 0
        tot_inst = ti.get('total_instalados') or 0
        print(f"Tiempo Instalación Promedio: {h_prom:.1f}h | Total Instalados: {tot_inst}")

    for e in md.get("efectividad", []):
        print(f"  Efectividad {e['etapa']}: {e.get('efectividad_pct', 0)}% (salidas: {e.get('total_salidas', 0)}, retornos: {e.get('retornos', 0)})")

    prob_e8 = md.get("etapa8", {})
    if prob_e8:
        print(f"Pct Etapa 8: {prob_e8.get('pct', 0)}%")

    prob_perd = md.get("perdido", {})
    if prob_perd:
        print(f"Pct Perdidos: {prob_perd.get('pct', 0)}%")

    resc = md.get("rescate", {})
    if resc:
        print(f"Rescate Perdidos->Instalados: {resc.get('pct_rescate', 0)}% (perdidos: {resc.get('total_perdidos', 0)}, rescatados: {resc.get('rescatados', 0)})")
