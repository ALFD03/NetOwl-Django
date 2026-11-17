"""Vocabulario del modulo de soporte: columnas, poblaciones, medidas y tasas.

Cuatro decisiones de negocio viven aqui y merecen leerse antes de tocar nada:

* **las etapas terminales**, que definen que es un ticket cerrado;
* **las poblaciones**: no hay universo seleccionable, cada metrica trae fijada
  la suya -los tiempos de cierre se miden sobre lo cerrado en el mes y el de
  asignacion sobre lo creado-;
* **la regla de medibilidad**: un tiempo entra si sus fechas existen y son
  coherentes, y no entra por ninguna otra razon;
* **las dimensiones**, todas colgando del grupo de trabajo.

El mapa de columnas admite alias porque Odoo no nombra siempre igual la misma
cabecera, y cada fallo de ese tipo era silencioso.
"""

# backend/support/config.py
from __future__ import annotations

# Mapeo exacto de los nombres de columnas del CSV de Odoo Support a la BD.
#
# `Asignado a` y `Creado por` son DOS personas distintas y no hay que
# confundirlas: `asignado_a` es quien responde del ticket —la dimensión del
# cierre, la que mide gestión y resolución— y `creado_por` quien lo abrió en
# Odoo —la dimensión de la apertura, la que mide demanda registrada—. Leer los
# tickets creados por la columna del asignado atribuía la apertura al técnico
# que después lo atendió, que en Odoo casi nunca es el mismo. Las dos entran en
# el export obligatorio.
SUPPORT_CSV_COLUMN_MAP = {
    "Secuencia ID del ticket": "ticket_sequence",
    "Cliente": "cliente",
    "Etapa": "etapa",
    "Equipo de soporte al cliente": "grupo_trabajo",
    "Asignado a": "asignado_a",
    "Creado por": "creado_por",
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

    "creada por": "creado_por",
    "creado por el usuario": "creado_por",
    "creador": "creado_por",
    "autor": "creado_por",
    "usuario creador": "creado_por",
    "reportado por": "creado_por",
}

# Columnas que el loader exige DESPUÉS de resolver el mapa y los alias. Van
# aquí y no en `REQUIRED_SUPPORT_HEADERS` —que valida el CSV crudo, antes de
# normalizar— para poder aceptar cualquiera de las variantes de arriba y aun
# así fallar de forma visible cuando no viene ninguna. El valor es la etiqueta
# canónica, que es la que se le nombra al usuario en el mensaje de error.
SUPPORT_LOADER_REQUIRED_COLUMNS = {
    "ticket_sequence": "Secuencia ID del ticket",
    "asignado_a": "Asignado a",
    "creado_por": "Creado por",
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
    "cliente", "etapa", "grupo_trabajo", "asignado_a", "creado_por",
    "sucursal", "zona", "tipo_solicitud", "razon_falla", "solucion_falla",
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

# --- Qué hace medible un tiempo ---------------------------------------------
#
# Lo único que deja fuera a un ticket es que sus fechas no sirvan. No hay
# umbral de duración: un ciclo de treinta segundos es un ciclo de treinta
# segundos, y descartarlo por corto era descartar dato bueno junto con el malo.
# Lo que se descarta es la fila incoherente —fecha ausente o tramo negativo—,
# que no es un tiempo corto sino un tiempo desconocido.
#
# La condición, tramo a tramo (`metrics._tramos_validos`):
#   · cierre     → las TRES fechas presentes y en orden: creación ≤ primera
#                  asignación ≤ última actualización de la etapa.
#   · asignación → creación presente; la asignación, si la hay, no anterior a
#                  ella.
#
# Que el cierre exija la fecha de asignación no es una regla de medición sino
# de higiene: un ticket cerrado sin haber sido asignado nunca es un dato mal
# capturado, y dejarlo fuera de las medidas es como se hace visible. `muestra_*`
# es lo que lo cuantifica —la distancia entre esa cifra y `tickets_cerrados` es
# exactamente el dato sucio del periodo—.


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
#   ESCALADOS — de lo cerrado en el periodo, lo que ATC cerró escalándolo a
#              Soporte. Es la población del tiempo hasta escalar.
POB_CERRADOS = "cerrados_periodo"
POB_RESUELTOS = "resueltos_periodo"
POB_CANCELADOS = "cancelados_periodo"
POB_CREADOS = "creados_periodo"
POB_ESCALADOS = "escalados_periodo"


# --- Medidas de tiempo ------------------------------------------------------
#
# Dos relojes de cierre y uno de asignación.
#
#   cierre_creado_*   — creación → cierre. Es `duracion_total_horas` de Odoo:
#                       el proceso completo, cola incluida. Se lee el campo en
#                       vez de restar las fechas porque ya viene calculado y
#                       promediarlo es sumar y dividir; quién entra en la
#                       medida lo siguen decidiendo las fechas.
#   cierre_asignado_* — primera asignación → cierre. Sólo la gestión del
#                       técnico, sin la espera en cola.
#   asignacion        — creación → primera asignación, sobre lo creado en el
#                       mes. No exige desenlace, y el que todavía no tiene
#                       asignación tampoco queda fuera: su reloj se cierra
#                       contra el corte —fin del día en la barra diaria, fin
#                       del mes en el cierre—, así que mide lo que se esperó
#                       DENTRO del periodo y el mes no cambia de valor al
#                       reanalizarlo. Medir sólo lo ya asignado dejaba fuera
#                       justo a los que llevan más tiempo esperando, que son
#                       los que la métrica existe para encontrar.
TIME_MEASURE_SPECS = [
    ("cierre_creado_resuelto", "duracion_total", POB_RESUELTOS),
    ("cierre_creado_cancelado", "duracion_total", POB_CANCELADOS),
    ("cierre_creado_cerrados", "duracion_total", POB_CERRADOS),

    ("cierre_asignado_resuelto", "asignado_a_cierre", POB_RESUELTOS),
    ("cierre_asignado_cancelado", "asignado_a_cierre", POB_CANCELADOS),
    ("cierre_asignado_cerrados", "asignado_a_cierre", POB_CERRADOS),

    ("asignacion", "creado_a_asignacion", POB_CREADOS),

    # Creación → escalamiento, sobre lo que ATC escaló en el mes. Sale de los
    # logs de etapa: es el cierre de la copia de ATC (ver `escalamiento.py`).
    ("escalamiento", "creado_a_cierre", POB_ESCALADOS),
]

SUPPORT_TIME_MEASURES = [medida for medida, _, _ in TIME_MEASURE_SPECS]

# Los nueve estadísticos que `_prefixed` emite por medida.
TIME_STATS = ["medio", "mediana", "min", "p25", "p75", "max", "std"]


# --- Tasas ------------------------------------------------------------------
#
# Cinco tasas, cada una con su denominador explícito:
#
#   pct_resueltos  = resueltos en el periodo / cerrados en el periodo
#   pct_cancelados = cancelados en el periodo / cerrados en el periodo
#   pct_escalados  = escalados en el periodo / cerrados en el periodo
#   pct_rezagados  = creados en el periodo sin cerrar en él / creados en el periodo
#   pct_recibidos_escalados = creados que llegaron escalados / creados
#
# Para ATC escalar es cerrar: resueltos + cancelados + escalados = cerrados, y
# las tres primeras suman 100 %. En Soporte `escalados` es 0 y lo que cuenta es
# `recibidos_escalados`: cuánto de lo que le entró venía de ATC.
#
# Resolución, cancelación y escalamiento se abren en dos sumandos sobre el
# MISMO denominador, para que el desglose cierre exactamente con el total: del
# 89 % resuelto, cuánto nació y murió dentro del mes (`_periodo`) y cuánto
# venía de meses anteriores (`_arrastre`).
SUPPORT_VOLUME_FIELDS = [
    "total_tickets", "tickets_creados", "tickets_cerrados",
    "tickets_resueltos", "tickets_resueltos_periodo", "tickets_resueltos_arrastre",
    "tickets_cancelados", "tickets_cancelados_periodo", "tickets_cancelados_arrastre",
    "tickets_escalados", "tickets_escalados_periodo", "tickets_escalados_arrastre",
    "tickets_recibidos_escalados",
    "tickets_rezagados",
]

SUPPORT_RATE_FIELDS = [
    "pct_resueltos", "pct_resueltos_periodo", "pct_resueltos_arrastre",
    "pct_cancelados", "pct_cancelados_periodo", "pct_cancelados_arrastre",
    "pct_escalados", "pct_escalados_periodo", "pct_escalados_arrastre",
    "pct_recibidos_escalados",
    "pct_rezagados",
]

# --- En qué se va el tiempo -------------------------------------------------
#
# El tiempo de cada ticket cerrado en el periodo, repartido por el tipo de las
# etapas por las que pasó (catálogo `EtapaSoporte`): cola, pausa, gestión y lo
# que pasó en etapas sin clasificar. Son **promedios**, no medianas, porque los
# promedios se suman: las cuatro partes dan el tiempo medio del equipo.
#
# Cada fila cuenta sólo las horas de su equipo: la copia de ATC de un escalado,
# las de ATC hasta el escalamiento; la fila de Soporte, las de Soporte desde
# él. `muestra_composicion` son los cerrados con logs de etapa: sin logs no hay
# reparto que hacer.
TIPOS_COMPOSICION = ["cola", "pausa", "gestion", "sin_clasificar"]
SUPPORT_COMPOSICION_FIELDS = [f"composicion_{t}_horas" for t in TIPOS_COMPOSICION]


# --- Dimensiones ------------------------------------------------------------
#
# Todo cuelga del equipo de trabajo. Dentro de él, las cuatro dimensiones de
# primer nivel son el dónde (zona, sucursal) y el quién, que son DOS y no uno:
# quién abrió el ticket (`creado_por`) y quién responde de él (`asignado_a`).
# Los tres desgloses son el qué (tipo, razón, solución).
#
# Separarlas es el motivo de que `creado_por` exista: en la dimensión del
# asignado, `tickets_creados` cuenta los tickets creados en el mes que le
# tocaron a esa persona, no los que esa persona abrió. Es una cifra legítima
# —la carga que entró a su nombre— pero se estaba leyendo como la otra, y en
# Odoo el que crea y el que atiende casi nunca coinciden. Cada eje mide ahora
# lo suyo: el de creación, la demanda que cada quien registró; el de
# asignación, el trabajo despachado.
#
# El cruce dimensión × desglose no se persiste: el producto cartesiano son
# decenas de miles de filas JSONB por periodo para algo que se consulta de una
# en una. `queries.get_support_breakdown` lo calcula al vuelo sobre los tickets
# del periodo, con las mismas funciones de métrica.
DIM_GRUPO = "grupo_trabajo"

SUPPORT_DIMENSIONES = ["zona", "sucursal", "asignado_a", "creado_por"]

# Las dos dimensiones cuyo valor es una persona, y por tanto las unicas que el
# directorio de `services/support/models.py` puede anotar con un departamento.
# Se declaran aparte para que quien anada un eje de persona no tenga que
# acordarse de tocar tambien la anotacion.
SUPPORT_DIMENSIONES_PERSONA = ["asignado_a", "creado_por"]
SUPPORT_DESGLOSES = ["tipo_solicitud", "razon_falla", "solucion_falla"]

SUPPORT_DIMENSION_COLUMNS = [DIM_GRUPO, *SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES]


# --- Logs de etapa ("Registros de tiempo") ---------------------------------
#
# Cada fila es un cambio de etapa de un ticket. El export sale del ticket o del
# propio modelo de registros, asi que la cabecera puede llegar con el prefijo
# `Registros de tiempo/` o sin el: `logs._resolver_columnas` lo quita antes de
# comparar. `ID` es el del registro en Odoo, unico entre todos los logs de todos
# los tickets: es la clave con la que cada log entra una sola vez aunque llegue
# en dos lotes.
LOGS_PREFIJO = "Registros de tiempo/"

LOGS_CSV_COLUMN_MAP = {
    "ID": "log_id",
    "Ticket/Secuencia ID del ticket": "ticket_sequence",
    "Creado el": "creado_el",
    "Etapa anterior": "etapa_anterior",
    "Nueva etapa": "etapa_nueva",
    "Duración (horas)": "duracion_horas",
}

# Sin estas no hay secuencia que reconstruir. La duracion se guarda pero no se
# usa para medir: los tramos salen de las fechas de los propios registros.
LOGS_REQUIRED_COLUMNS = {
    "log_id": "ID",
    "ticket_sequence": "Ticket/Secuencia ID del ticket",
    "creado_el": "Creado el",
    "etapa_anterior": "Etapa anterior",
    "etapa_nueva": "Nueva etapa",
}

LOGS_COLUMNS = ["log_id", "ticket_sequence", "creado_el", "etapa_anterior", "etapa_nueva", "duracion_horas"]

# El escalamiento: entrar en esta etapa viniendo de una que no es de Soporte
# (segun el catalogo de etapas). Un ticket que *nace* en ella -etapa anterior
# vacia- no es un escalamiento: es un ticket de Soporte desde el principio.
ETAPA_ESCALAMIENTO = "Nuevo - Soporte Técnico"

# Los dos equipos de un tramo. Un tramo de una etapa `compartida` (o sin
# clasificar) es de ATC antes del escalamiento y de Soporte despues; sin
# escalamiento, del equipo en que nacio el ticket.
EQUIPO_ATC = "atc"
EQUIPO_SOPORTE = "soporte"
EQUIPO_COMPARTIDA = "compartida"

# Que se hace en una etapa. `cola`: nadie lo ha tomado. `pausa`: espera algo de
# fuera (el cliente, un pago, una falla masiva). `gestion`: alguien trabaja en
# el. Las etapas de cierre no van en el catalogo: son RESOLVED_STAGES y
# CANCELED_STAGES, las mismas de los tickets.
TIPO_COLA = "cola"
TIPO_PAUSA = "pausa"
TIPO_GESTION = "gestion"
TIPO_CIERRE = "cierre"
TIPO_SIN_CLASIFICAR = "sin_clasificar"

# Los relojes de un ticket abierto se cierran contra la hora de Caracas: Odoo
# exporta las fechas en la zona del usuario y se guardan sin zona.
ZONA_HORARIA = "America/Caracas"

# El grupo de trabajo desde el que se escala. El export dice el grupo que el
# ticket tiene HOY, así que un escalado figura sólo en el de Soporte
# («Soporte Técnico Nivel 1»): `escalamiento.incorporar_escalamiento` le
# devuelve a ATC su parte. Si Odoo renombra el equipo, es aquí donde se cambia.
GRUPO_ATC = "Atención al cliente"

# Qué figura en la copia de ATC de un escalado en los dos campos que el export
# sólo sabe de Soporte: quién lo atiende hoy y cómo se solucionó.
ASIGNADO_ESCALADO = "Escalado (sin asignado en ATC)"
SOLUCION_ESCALADO = "Escalado a Soporte"

# Antiguedad de los tickets abiertos, en horas: [desde, hasta).
TRAMOS_ANTIGUEDAD = [
    ("< 1 día", 0, 24),
    ("1–3 días", 24, 72),
    ("3–7 días", 72, 168),
    ("7–15 días", 168, 360),
    ("15–30 días", 360, 720),
    ("30–60 días", 720, 1440),
    ("> 60 días", 1440, None),
]
