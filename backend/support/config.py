# backend/support/config.py
from __future__ import annotations

# Mapeo exacto de los nombres de columnas del CSV de Odoo Support a la BD.
# `Asignado a` es el usuario responsable del ticket: es la dimensión "usuario
# del cierre" del reporte, y por eso entra en el export obligatorio.
SUPPORT_CSV_COLUMN_MAP = {
    "Secuencia ID del ticket": "ticket_sequence",
    "Cliente": "cliente",
    "Etapa": "etapa",
    "Equipo de soporte al cliente": "grupo_trabajo",
    "Asignado a": "asignado_a",
    "Suscripción/Sucursal": "sucursal",
    "Zona": "zona",
    "Tipo": "tipo_solicitud",
    "Razón de la falla": "razon_falla",
    "Solución de la falla": "solucion_falla",
    "Creado el": "creado_el",
    "Primera fecha asignada": "primera_fecha_asignada",
    "Última actualización de la etapa": "ultima_actualizacion_etapa",
    "Duración total (horas)": "duracion_total_horas",
}

# Variantes con las que Odoo escribe la misma columna según la versión y cómo
# esté traducido el campo en la instancia. Importa sobre todo `Asignado a`: al
# no coincidir con el mapa literal la columna se perdía en silencio, y
# `SUPPORT_TEXT_COLUMNS` la rellenaba entera con "Sin Especificar", colapsando
# la dimensión del técnico en una única fila sin que nada fallara.
SUPPORT_CSV_COLUMN_ALIASES = {
    "asignada a": "asignado_a",
    "asignado": "asignado_a",
    "asignada": "asignado_a",
    "responsable": "asignado_a",
    "tecnico asignado": "asignado_a",
    "usuario asignado": "asignado_a",
}

# Columnas que el loader exige DESPUÉS de resolver el mapa y los alias. Van
# aquí y no en `REQUIRED_SUPPORT_HEADERS` —que valida el CSV crudo, antes de
# normalizar— para poder aceptar cualquiera de las variantes de arriba y aun
# así fallar de forma visible cuando no viene ninguna. El valor es la etiqueta
# canónica, que es la que se le nombra al usuario en el mensaje de error.
SUPPORT_LOADER_REQUIRED_COLUMNS = {
    "ticket_sequence": "Secuencia ID del ticket",
    "asignado_a": "Asignado a",
}

# Cabeceras mínimas obligatorias para validar la estructura del CSV. Sin estas
# cinco no hay ni cohorte ni desenlace que medir.
REQUIRED_SUPPORT_HEADERS = {
    "Secuencia ID del ticket": "ticket_sequence",
    "Etapa": "etapa",
    "Equipo de soporte al cliente": "grupo_trabajo",
    "Creado el": "creado_el",
    "Última actualización de la etapa": "ultima_actualizacion_etapa",
}

# Columnas de texto del ticket. Todas se normalizan a "Sin Especificar" cuando
# Odoo las exporta vacías, porque son claves de agrupación: un NULL partiría la
# misma zona o el mismo técnico en dos filas distintas del reporte.
SUPPORT_TEXT_COLUMNS = [
    "cliente", "etapa", "grupo_trabajo", "asignado_a", "sucursal", "zona",
    "tipo_solicitud", "razon_falla", "solucion_falla",
]

SUPPORT_TICKET_COLUMNS = [
    "ticket_sequence", *SUPPORT_TEXT_COLUMNS,
    "creado_el", "primera_fecha_asignada", "ultima_actualizacion_etapa",
    "duracion_total_horas",
]

# Etapas terminales: las que cierran el ticket, y por tanto las que definen la
# población de cierre y las tasas de resolución y cancelación.
RESOLVED_STAGES = {"resuelto"}

CANCELED_STAGES = {
    "cancelado", "cancelada", "anulado", "anulada",
    "rechazado", "rechazada", "canceled", "cancelled",
}

# Duración mínima medible, en horas (1 minuto). Por debajo de este umbral la
# diferencia entre dos marcas de tiempo no es un tiempo de servicio real sino el
# rastro de una acción masiva de Odoo, que asigna y cierra en el mismo segundo.
# Contarlas hunde el promedio y la mediana e infla el % que excede el promedio.
MIN_DURACION_HORAS = 0.016


# --- Poblaciones ------------------------------------------------------------
#
# No hay universo seleccionable: cada métrica trae fijada la población sobre la
# que tiene sentido, y eso es todo lo que el lector necesita saber.
#
#   CERRADOS — cerró en el periodo (etapa terminal + última actualización en el
#              mes). Es la población de los tiempos de cierre y de las tasas de
#              resolución y cancelación: mide el trabajo despachado en el mes.
#   CREADOS  — nació en el periodo. Es la población del tiempo de asignación y
#              de la tasa de rezago: mide la demanda que entró en el mes.
#
# La cohorte de un periodo es la unión de las dos, y cada métrica recorta la
# suya. Así conviven en un mismo bloque sin necesidad de duplicarlo.
POB_CERRADOS = "cerrados_periodo"
POB_RESUELTOS = "resueltos_periodo"
POB_CANCELADOS = "cancelados_periodo"
POB_CREADOS = "creados_periodo"


# --- Medidas de tiempo ------------------------------------------------------
#
# Dos relojes de cierre y uno de asignación.
#
#   cierre_creado_*   — creación → cierre. Es `duracion_total_horas` de Odoo:
#                       el proceso completo, cola incluida. Se lee el campo en
#                       vez de restar las fechas porque no pierde muestra (los
#                       tickets sin fecha de asignación también lo traen).
#   cierre_asignado_* — primera asignación → cierre. Sólo la gestión del
#                       técnico, sin la espera en cola.
#   asignacion        — creación → primera asignación, sobre lo creado en el
#                       mes. No exige desenlace: entra todo ticket que tenga
#                       las dos fechas, esté cerrado o no, porque la espera ya
#                       ocurrió y medirla sólo sobre lo cerrado dejaría fuera
#                       justo a los que llevan más tiempo esperando.
TIME_MEASURE_SPECS = [
    ("cierre_creado_resuelto", "duracion_total", POB_RESUELTOS),
    ("cierre_creado_cancelado", "duracion_total", POB_CANCELADOS),
    ("cierre_creado_cerrados", "duracion_total", POB_CERRADOS),

    ("cierre_asignado_resuelto", "asignado_a_cierre", POB_RESUELTOS),
    ("cierre_asignado_cancelado", "asignado_a_cierre", POB_CANCELADOS),
    ("cierre_asignado_cerrados", "asignado_a_cierre", POB_CERRADOS),

    ("asignacion", "creado_a_asignacion", POB_CREADOS),
]

SUPPORT_TIME_MEASURES = [medida for medida, _, _ in TIME_MEASURE_SPECS]

# Los nueve estadísticos que `_prefixed` emite por medida.
TIME_STATS = ["medio", "mediana", "min", "p25", "p75", "max", "std"]


def time_columns(medida: str) -> list[str]:
    """Las nueve columnas escalares que una medida aporta al bloque."""
    return [
        *[f"tiempo_{stat}_{medida}_horas" for stat in TIME_STATS],
        f"pct_excede_promedio_{medida}",
        f"muestra_{medida}",
    ]


# --- Tasas ------------------------------------------------------------------
#
# Tres tasas, cada una con su denominador explícito:
#
#   pct_resueltos  = resueltos en el periodo / cerrados en el periodo
#   pct_cancelados = cancelados en el periodo / cerrados en el periodo
#   pct_rezagados  = creados en el periodo sin cerrar en él / creados en el periodo
#
# Las dos primeras se abren en dos sumandos sobre el MISMO denominador, para
# que el desglose cierre exactamente con el total: del 89 % resuelto, cuánto
# nació y murió dentro del mes (`_periodo`) y cuánto venía de meses anteriores
# (`_arrastre`).
SUPPORT_VOLUME_FIELDS = [
    "total_tickets", "tickets_creados", "tickets_cerrados",
    "tickets_resueltos", "tickets_resueltos_periodo", "tickets_resueltos_arrastre",
    "tickets_cancelados", "tickets_cancelados_periodo", "tickets_cancelados_arrastre",
    "tickets_rezagados",
]

SUPPORT_RATE_FIELDS = [
    "pct_resueltos", "pct_resueltos_periodo", "pct_resueltos_arrastre",
    "pct_cancelados", "pct_cancelados_periodo", "pct_cancelados_arrastre",
    "pct_rezagados",
]


# --- Dimensiones ------------------------------------------------------------
#
# Todo cuelga del equipo de trabajo. Dentro de él, las tres dimensiones de
# primer nivel son el dónde (zona, sucursal) y el quién (asignado a); los tres
# desgloses son el qué (tipo, razón, solución).
#
# El cruce dimensión × desglose no se persiste: el producto cartesiano son
# decenas de miles de filas JSONB por periodo para algo que se consulta de una
# en una. `queries.get_support_breakdown` lo calcula al vuelo sobre los tickets
# del periodo, con las mismas funciones de métrica.
DIM_GRUPO = "grupo_trabajo"

SUPPORT_DIMENSIONES = ["zona", "sucursal", "asignado_a"]
SUPPORT_DESGLOSES = ["tipo_solicitud", "razon_falla", "solucion_falla"]

SUPPORT_DIMENSION_COLUMNS = [DIM_GRUPO, *SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES]
