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
    "Primera fecha asignada":"primera_fecha_asignada",
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
SUPPORT_HIERARCHY_DIMS = ["grupo_trabajo", "tipo_solicitud", "razon_falla", "sucursal", "zona"]

# Lista de nombres/palabras clave que identifican un ticket como RESUELTO
RESOLVED_STAGES = {
    "Resuelto", "resuelto"
}

CANCELED_STAGES = {
    "Cancelado", "cancelado", "cancelada", "anulado", "anulada", "rechazado", "rechazada", "canceled", "cancelled"
}

# Columnas escalares de `support_cierre_historico`, en el orden del INSERT.
# La lista es la fuente de verdad: el DDL de `loader.py` la reutiliza para
# añadir con ALTER TABLE lo que falte en instalaciones ya existentes.
SUPPORT_CIERRE_COLUMNS = [
    "total_tickets", "tickets_resueltos", "tickets_cancelados", "tickets_rezagados",
    "pct_resueltos", "pct_cancelados", "pct_rezagados",

    # Cierre desde la primera asignación (gestión del técnico)
    "tiempo_medio_cierre_horas", "tiempo_mediana_cierre_horas", "tiempo_min_cierre_horas",
    "tiempo_p25_cierre_horas", "tiempo_p75_cierre_horas", "tiempo_max_cierre_horas",
    "tiempo_std_cierre_horas", "pct_excede_promedio_cierre", "pct_excede_mediana_cierre",
    "muestra_cierre",

    # Cierre desde la creación (proceso completo, cola incluida)
    "tiempo_medio_cierre_total_horas", "tiempo_mediana_cierre_total_horas",
    "tiempo_min_cierre_total_horas", "tiempo_p25_cierre_total_horas",
    "tiempo_p75_cierre_total_horas", "tiempo_max_cierre_total_horas",
    "tiempo_std_cierre_total_horas", "pct_excede_promedio_cierre_total",
    "pct_excede_mediana_cierre_total", "muestra_cierre_total",

    # Primera respuesta (creación → primera asignación)
    "tiempo_promedio_primera_respuesta_horas", "tiempo_medio_primera_respuesta_horas",
    "tiempo_mediana_primera_respuesta_horas", "tiempo_min_primera_respuesta_horas",
    "tiempo_p25_primera_respuesta_horas", "tiempo_p75_primera_respuesta_horas",
    "tiempo_max_primera_respuesta_horas", "tiempo_std_primera_respuesta_horas",
    "pct_excede_promedio_primera_respuesta", "pct_excede_mediana_primera_respuesta",
    "muestra_primera_respuesta",
]
