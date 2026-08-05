# backend/support/config.py
from __future__ import annotations

# Mapeo exacto de los nombres de columnas del CSV de Odoo Support a la BD
SUPPORT_CSV_COLUMN_MAP = {
    "Secuencia ID del ticket": "ticket_sequence",
    "Cliente": "cliente",
    "Etapa": "etapa",
    "Equipo de soporte al cliente": "grupo_trabajo",
    "Suscripción/Sucursal": "sucursal",
    "Zona": "zona",
    "Suscripción/Municipio": "municipio",
    "Tipo": "tipo_solicitud",
    "Razón de la falla": "razon_falla",
    "Solución de la falla": "solucion_falla",
    "Creado el": "creado_el",
    "Última actualización de la etapa": "ultima_actualizacion_etapa",
    "Duración total (horas)": "duracion_total_horas",
}

# Cabeceras mínimas obligatorias para validar la estructura del CSV
REQUIRED_SUPPORT_HEADERS = {
    "Secuencia ID del ticket": "ticket_sequence",
    "Cliente": "cliente",
    "Etapa": "etapa",
    "Equipo de soporte al cliente": "grupo_trabajo",
    "Creado el": "creado_el",
}

# Dimensiones para desglosar métricas
SUPPORT_DIMENSIONES = ["sucursal", "zona", "municipio", "grupo_trabajo"]

# Lista de nombres/palabras clave que identifican un ticket como RESUELTO
RESOLVED_STAGES = {
    "Resuelto", "resuelto"
}