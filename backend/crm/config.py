from __future__ import annotations

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

ETAPA_ORDER = [
    "etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad",
    "etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas",
    "etapa_7_instalados", "etapa_8_devueltos", "etapa_9_disponibles",
    "etapa_10_proyectos", "perdido"
]

DIMENSIONES = ["municipio", "campana", "sucursal", "vendedor", "equipo_ventas"]

PROB_DIM_E8 = ["devolver_oportunidad"]
PROB_DIM_PERDIDOS_RESCATE = ["motivo_perdida"]

DIMENSION_COL_MAP = {"municipio": "cliente_municipio"}

def dim_col(dim: str) -> str:
    return DIMENSION_COL_MAP.get(dim, dim)

EFECTIVIDAD_REGLAS = {
    "etapa_3_factibilidad": {
        "forward": ["etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "perdido": "failure",
            "etapa_3_factibilidad": "return",
        },
        "direct_loss": ["perdido"],
    },
    "etapa_4_adecuaciones": {
        "forward": ["etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "perdido": "failure",
            "etapa_4_adecuaciones": "return",
            "etapa_3_factibilidad": "failure",
        },
        "direct_loss": ["perdido"],
    },
    "etapa_5_gpi": {
        "forward": ["etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "perdido": "failure",
            "etapa_5_gpi": "return",
            "etapa_3_factibilidad": "devuelto",
            "etapa_4_adecuaciones": "devuelto",
        },
        "direct_loss": ["perdido"],
    },
    "ventas": {
        "forward_key": "etapa_3_factibilidad",
        "forward": ["etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "perdido": "failure",
            "etapa_3_factibilidad": "return",
        },
        "direct_loss": ["perdido"],
    },
}

ETAPA8_EXCEPTION_MOTIVOS = [
    "No responde llamadas y/o mensajes",
    "Cliente en espera del Router",
    "Cliente no atiende las llamadas por ninguno de los 2 numeros",
    "Cliente no contesta. Numero opcional no se encuentra con el cliente",
]

ETAPA8_ATRIBUCION = [
    {
        "etapa": "etapa_3_factibilidad",
        "motivos": [
            "No es factible por posteadura",
            "No es factible por estar fuera del área de cobertura",
            "No factible por línea de vista",
            "No es factible por tuberías/tanquillas obstruidas",
        ],
        "forward_to": "etapa_5_gpi",
    },
    {
        "etapa": "etapa_4_adecuaciones",
        "motivos": [
            "No es factible por posteadura",
            "No es factible por estar fuera del área de cobertura",
            "No factible por línea de vista",
            "No es factible por tuberías/tanquillas obstruidas",
        ],
        "forward_to": "etapa_5_gpi",
    },
    {
        "etapa": "etapa_5_gpi",
        "motivos": [
            "No cuenta con el dinero, sin disponibilidad económica",
            "Se requieren permisos de inspección, acceso, instalación y/o verticalización",
            "No desea el servicio",
            "No está disponible aún, le avisará a su asesor",
            "Tiene dudas en relación a su pre-contrato",
            "El Router no es compatible",
            "Cambio de titular o ya instaló con otro nombre",
        ],
        "forward_to": "etapa_6_contratistas",
    },
]

RETORNO_ATRIBUCION = [
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_4_adecuaciones"},
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_5_gpi"},
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_6_contratistas"},
    {"etapa": "etapa_4_adecuaciones", "forward_to": "etapa_5_gpi"},
]

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

GANADO_STATES = {"perdido", "ganado", "pendiente"}

METRICAS = [
    "tiempo_por_etapa",
    "tiempo_instalacion",
    "efectividad",
    "probabilidad_etapa8_perdidos",
    "rescate_perdidos",
]