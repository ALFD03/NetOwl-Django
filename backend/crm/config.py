"""
Configuración CRM Analytics - Etapas, dimensiones, reglas de efectividad.
"""
from __future__ import annotations

# Mapeo etapas Odoo -> claves canónicas (normalizado: minúsculas, sin acentos, snake_case)
ETAPA_MAP = {
    "1. Contacto inicial, manejo de objeciones, presentación del servicio y envío de información": "etapa_1_contacto",
    "2. Recepción de datos y creación de ficha": "etapa_2_recepcion",
    "3. Evaluación de factibilidad específica (Inmediata, Adecuación Sencilla, Adecuación Intermedia, Adecuación Avanzada, Inspección)": "etapa_3_factibilidad",
    "4. Adecuaciones de Red Óptica": "etapa_4_adecuaciones",
    "5. Gestión y Planificación de Instalaciones (GPI)": "etapa_5_gpi",
    "6. Asignado a contratistas": "etapa_6_contratistas",
    "7. Clientes instalados": "etapa_7_instalados",
    "8. Prospectos devueltos": "etapa_8_devueltos",
    "9. Disponibles en otra fecha": "etapa_9_disponibles",
    "10. Potenciales para proyectos": "etapa_10_proyectos",
    "Perdido": "perdido",
}

# Orden canónico para sorting
ETAPA_ORDER = [
    "etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad",
    "etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas",
    "etapa_7_instalados", "etapa_8_devueltos", "etapa_9_disponibles",
    "etapa_10_proyectos", "perdido"
]

# Dimensiones para desglose (aplican a todas las métricas)
DIMENSIONES = ["municipio", "campana", "sucursal", "vendedor", "equipo_ventas"]

# Dimensiones especiales que SOLO aplican a métricas específicas (no a todas)
PROB_DIM_E8 = ["devolver_oportunidad"]           # Solo % Etapa 8
PROB_DIM_PERDIDOS_RESCATE = ["motivo_perdida"]    # Solo % Perdidos y % Rescate

# Mapeo dimensión -> columna real en BD (cuando el nombre difiere)
DIMENSION_COL_MAP = {"municipio": "cliente_municipio"}


def dim_col(dim: str) -> str:
    """Retorna el nombre real de la columna en BD para una dimensión."""
    return DIMENSION_COL_MAP.get(dim, dim)

# Reglas de efectividad: qué retornos afectan a cada etapa
EFECTIVIDAD_REGLAS = {
    "etapa_3_factibilidad": {"origen_retorno": ["etapa_5_gpi", "etapa_6_contratistas"]},
    "etapa_4_adecuaciones": {"origen_retorno": ["etapa_5_gpi", "etapa_6_contratistas"]},
    "etapa_5_gpi": {"origen_retorno": ["etapa_6_contratistas"]},
    "ventas": {"origen_retorno": ["etapa_3_factibilidad", "etapa_2_recepcion"]},
}

# Normalización de columnas CSV Odoo -> snake_case
CSV_COLUMN_MAP = {
    "ID": "id",
    "Oportunidad": "oportunidad",
    "Cliente": "cliente",
    "Cliente/Municipio": "cliente_municipio",
    "Campaña": "campana",
    "Sucursal": "sucursal",
    "Vendedor": "vendedor",
    "Medio": "medio",
    "Medio/Supervisor": "medio_supervisor",
    "Equipo de ventas": "equipo_ventas",
    "Etapa": "etapa",
    "Motivo de pérdida": "motivo_perdida",
    "Devolver oportunidad": "devolver_oportunidad",
    "Ganado": "ganado",
    "Activo": "activo",
    "Creado el": "creado_el",
    "Fecha de cierre": "fecha_cierre",
    "Última actualización de la etapa": "ultima_actualizacion",
    "Duración Total (horas)": "duracion_total_horas",
    "Entradas de Tiempo/Iniciativa/ID": "entradas_de_tiempo_iniciativa_id",
    "Entradas de Tiempo/Duración (horas)": "entradas_de_tiempo_duracion_horas",
    "Entradas de Tiempo/Creado el": "entradas_de_tiempo_creado_el",
    "Entradas de Tiempo/Etapa Anterior": "entradas_de_tiempo_etapa_anterior",
    "Entradas de Tiempo/Nueva Etapa": "entradas_de_tiempo_nueva_etapa",
}

CLIENT_FIELDS = [v for k, v in CSV_COLUMN_MAP.items() if not k.startswith("Entradas de Tiempo")]
LOG_FIELDS = [v for k, v in CSV_COLUMN_MAP.items() if k.startswith("Entradas de Tiempo")]

# Estados válidos para ganado
GANADO_STATES = {"perdido", "ganado", "pendiente"}

# Métricas disponibles
METRICAS = [
    "tiempo_por_etapa",
    "tiempo_instalacion",
    "efectividad",
    "probabilidad_etapa8_perdidos",
    "rescate_perdidos",
]