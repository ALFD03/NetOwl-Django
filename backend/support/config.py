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

# Duración mínima medible, en horas (1 minuto). Por debajo de este umbral la
# diferencia entre dos marcas de tiempo no es un tiempo de servicio real sino el
# rastro de una acción masiva de Odoo, que asigna y cierra en el mismo segundo.
# Contarlas hundía el promedio y la mediana e inflaba el % que excede el promedio.
MIN_DURACION_HORAS = 0.016


# Las seis medidas de tiempo, en dos ejes:
#
#   * Fórmula   — `cierre*` mide desde la primera asignación (gestión del
#                 técnico); `cierre_total*` usa `duracion_total_horas` de Odoo,
#                 que es el proceso completo desde la creación, cola incluida.
#   * Población — sin sufijo solo cuenta lo resuelto ("Success"); el sufijo
#                 `_global` suma también lo cancelado, que es tiempo de espera
#                 igual de real para el cliente.
#
# La primera respuesta solo tiene una fórmula (creación → primera asignación),
# así que se queda con las dos variantes de población.
SUPPORT_TIME_MEASURES = [
    "cierre",                    # MTTR - Success
    "cierre_total",              # MTTR - all time Success
    "cierre_global",             # MTTR - all
    "cierre_total_global",       # MTTR - all time
    "primera_respuesta",         # 1ª respuesta - Success
    "primera_respuesta_global",  # 1ª respuesta - all
]


def _time_columns(medida: str) -> list[str]:
    """Las once columnas escalares que `_prefixed` emite para una medida."""
    return [
        f"tiempo_medio_{medida}_horas", f"tiempo_mediana_{medida}_horas",
        f"tiempo_min_{medida}_horas", f"tiempo_p25_{medida}_horas",
        f"tiempo_p75_{medida}_horas", f"tiempo_max_{medida}_horas",
        f"tiempo_std_{medida}_horas", f"pct_excede_promedio_{medida}",
        f"pct_excede_mediana_{medida}", f"muestra_{medida}",
    ]


# Columnas escalares de `support_cierre_historico`, en el orden del INSERT.
# La lista es la fuente de verdad: el DDL de `loader.py` la reutiliza para
# añadir con ALTER TABLE lo que falte en instalaciones ya existentes.
SUPPORT_CIERRE_COLUMNS = [
    "total_tickets", "tickets_resueltos", "tickets_cancelados", "tickets_rezagados",
    "pct_resueltos", "pct_cancelados", "pct_rezagados",

    # Alias heredado: el dashboard guardaba la primera respuesta bajo este nombre
    # cuando la medida solo tenía promedio.
    "tiempo_promedio_primera_respuesta_horas",

    *[col for medida in SUPPORT_TIME_MEASURES for col in _time_columns(medida)],
]
