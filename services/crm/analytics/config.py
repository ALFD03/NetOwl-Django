"""Vocabulario del embudo de CRM y las reglas que lo interpretan.

Tres bloques, y conviene no mezclarlos:

* **las etapas**: como se llaman en Odoo, en que orden van y cuales forman el
  embudo lineal (las 8, 9 y 10 vienen despues en el orden pero no son un
  avance);
* **la efectividad**: que salidas cuentan como que la etapa hizo su trabajo y
  quien responde por cada fallo -retorno, devolucion o perdida-;
* **los umbrales de tiempo**: que movimiento es una estancia real y cual es
  solo una correccion administrativa.

Todo son decisiones de negocio, no de codigo: cambiarlas cambia lo que el
reporte dice de cada equipo.
"""

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

DIMENSIONES = ["campana", "sucursal", "vendedor"]

# --- Tiempo por etapa -------------------------------------------------------
# El embudo lineal: las etapas por las que una oportunidad progresa hasta
# instalar. Las etapas 8, 9 y 10 van después en `ETAPA_ORDER` pero no son un
# avance, así que el sentido de un movimiento se decide contra esta lista y no
# contra el orden completo.
ETAPA_FLUJO = [
    "etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad",
    "etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas",
    "etapa_7_instalados",
]

# Etapas que no son cola de trabajo: nadie "espera" en ellas, así que su
# duración de salida no mide gestión. La 7 es el final del embudo y `perdido`
# es un estado terminal.
ETAPAS_SIN_ESPERA = ["etapa_7_instalados", "perdido"]

# Las etapas que manda la venta. El reporte de tiempos las destaca y el resto
# quedan como contexto.
ETAPAS_CLAVE_VENTAS = [
    "etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad",
    "etapa_5_gpi", "etapa_8_devueltos",
]

# El promedio crudo de horas en etapa lo domina la cola: una oportunidad
# olvidada seis meses en la etapa 1 pesa lo mismo que cien gestionadas en un
# día. El promedio ajustado recorta la muestra a este percentil (winsorización:
# el caso extremo no se descarta, se cuenta como si valiera el corte) para que
# el número represente la gestión típica sin perder los casos del conteo.
TIEMPO_ETAPA_WINSOR_P = 0.95

# Un movimiento por debajo de este umbral es administrativo —una corrección de
# etapa, una carga masiva—, no tiempo de gestión. Se cuenta igual en el promedio
# (es tiempo real que la oportunidad pasó ahí), pero se reporta su peso aparte
# para poder leer el promedio con esa reserva.
TIEMPO_ETAPA_UMBRAL_INSTANTANEO_H = 0.5

# Duración mínima para que un movimiento sea una estancia y no un artefacto.
# Un salto de duración exactamente 0 no es una etapa que se recorrió rápido:
# son dos escrituras del mismo instante —el alta que cae en la etapa 1 y la
# rutina que la empuja a la 2, una corrección deshecha— y meterlo en el promedio
# sólo añade ceros al numerador mientras infla el divisor. A partir de un minuto
# de diferencia sí hubo una estancia, por corta que sea, y cuenta entera.
TIEMPO_ETAPA_MIN_DURACION_H = 1 / 60

# Muestra mínima para que el tiempo de una etapa (o de una rebanada dimensional)
# se considere legible. Por debajo se sirve igual, marcado como poco fiable.
TIEMPO_ETAPA_MIN_MUESTRA = 10


# Reglas de efectividad por etapa.
#
# El log (`crm_logs`) sólo conoce movimientos entre etapas: avances, retornos,
# devoluciones a la etapa 8 e instalaciones. La pérdida NO es un movimiento —
# nunca aparece como `nueva_etapa`— sino un estado de la oportunidad, así que
# se atribuye aparte con PERDIDA_ATRIBUCION_* a partir de `crm_clients`.
#
#   origen    -> etapas del embudo cuyas salidas mide esta fila
#   forward   -> destinos que cuentan como "la fila hizo su trabajo y avanzó"
#   term_map  -> desenlace que cierra el ciclo. Se mide por transición: si
#                el cliente vuelve a la etapa, ese flujo falló, aunque más
#                tarde acabe instalando en un ciclo posterior.
EFECTIVIDAD_REGLAS = {
    "etapa_3_factibilidad": {
        "origen": ["etapa_3_factibilidad"],
        "forward": ["etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "etapa_3_factibilidad": "return",
        },
    },
    "etapa_4_adecuaciones": {
        "origen": ["etapa_4_adecuaciones"],
        "forward": ["etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "etapa_4_adecuaciones": "return",
            "etapa_3_factibilidad": "return",
        },
    },
    "etapa_5_gpi": {
        "origen": ["etapa_5_gpi"],
        "forward": ["etapa_6_contratistas", "etapa_7_instalados"],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "etapa_5_gpi": "return",
            "etapa_3_factibilidad": "return",
            "etapa_4_adecuaciones": "return",
        },
    },
    # Embudo comercial: la prospección y la creación de ficha. Tiene población
    # propia (etapas 1 y 2), no es un duplicado de factibilidad.
    "ventas": {
        "origen": ["etapa_1_contacto", "etapa_2_recepcion"],
        "forward": [
            "etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi",
            "etapa_6_contratistas", "etapa_7_instalados",
        ],
        "term_map": {
            "etapa_7_instalados": "success",
            "etapa_8_devueltos": "devuelto",
            "etapa_1_contacto": "return",
            "etapa_2_recepcion": "return",
        },
    },
}

# Etapa de devolución de prospectos, origen de la atribución de etapa 8.
ETAPA8_KEY = "etapa_8_devueltos"

# Fila que recoge lo que ninguna etapa técnica explica.
FILA_COMERCIAL = "ventas"

# --- Atribución de pérdidas -------------------------------------------------
# Una oportunidad perdida se queda en la etapa donde murió (`etapa_actual`) y
# su fecha es `fecha_cierre`. Este mapa dice qué fila paga cada muerte.
# La etapa 6 no es una fila del reporte: quien mandó al cliente a contratistas
# fue GPI, así que responde GPI. Las muertes en la etapa 8 no se resuelven aquí
# sino por motivo (ver PERDIDA_ATRIBUCION_MOTIVO y ETAPA8_ATRIBUCION).
PERDIDA_ATRIBUCION_POR_ETAPA = {
    "etapa_1_contacto": FILA_COMERCIAL,
    "etapa_2_recepcion": FILA_COMERCIAL,
    "etapa_3_factibilidad": "etapa_3_factibilidad",
    "etapa_4_adecuaciones": "etapa_4_adecuaciones",
    "etapa_5_gpi": "etapa_5_gpi",
    "etapa_6_contratistas": "etapa_5_gpi",
    "etapa_9_disponibles": FILA_COMERCIAL,
    "etapa_10_proyectos": FILA_COMERCIAL,
    # Instalado y luego dado de baja: no es un fallo del embudo de venta.
    "etapa_7_instalados": None,
}

# Etapas cuya muerte se atribuye por motivo en lugar de por etapa.
PERDIDA_POR_MOTIVO_ETAPAS = [ETAPA8_KEY]

# Motivos de devolución ajenos a la gestión: no penalizan a ninguna etapa.
ETAPA8_EXCEPTION_MOTIVOS = [
    "No responde llamadas y/o mensajes",
    "Cliente en espera del Router",
    "Cliente no atiende las llamadas por ninguno de los 2 numeros",
    "Cliente no contesta. Numero opcional no se encuentra con el cliente",
]

# Atribución de devueltos por motivo. El orden de la lista es el orden de
# prioridad: gana la primera etapa cuyo motivo y destino de avance encajan.
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

# Fila de EFECTIVIDAD_REGLAS que se queda con los devueltos que no encajan en
# ninguna regla de ETAPA8_ATRIBUCION.
ETAPA8_ATRIBUCION_FALLBACK = FILA_COMERCIAL

# --- Motivos de pérdida -----------------------------------------------------
# Catálogo propio: Odoo escribe el mismo motivo de negocio distinto en
# `motivo_perdida` y en `devolver_oportunidad` ("No cuenta con el dinero" vs
# "No cuenta con el dinero, sin disponibilidad económica"), así que no se puede
# reutilizar ETAPA8_ATRIBUCION tal cual. Donde la razón coincide se respeta la
# fila que ya le asignaba la tabla de devoluciones.
PERDIDA_ATRIBUCION_MOTIVO = [
    {
        "fila": "etapa_3_factibilidad",
        "motivos": [
            "No es factible por posteadura",
            "No es factible por estar fuera del área de cobertura",
            "No factible por línea de vista",
            "No es factible por tuberías/tanquillas obstruidas",
        ],
    },
    {
        "fila": "etapa_5_gpi",
        "motivos": [
            "No desea el servicio",
            "No está disponible aún, le avisará a su asesor",
            "No cuenta con el dinero",
            "Se requieren permisos de inspección, verticalización y/o acceso",
            "Cliente ya instalado bajo otro titular",
            "Tiene dudas en relación a su pre-contrato",
            "El Router no es compatible",
        ],
    },
    {
        # Calidad de la prospección y del cierre comercial.
        "fila": FILA_COMERCIAL,
        "motivos": [
            "Prospecto repetido",
            "Cliente instaló con otro proveedor",
            "Número(s) de teléfono(s) erróneo(s)",
            "El cliente no esta de acuerdo con el pago de IVA",
            "El plan o campaña ya no está disponible",
        ],
    },
]

# Pérdidas ajenas a la gestión: no penalizan a ninguna fila.
PERDIDA_EXCEPTION_MOTIVOS = [
    "No responde llamadas y/o mensajes",
    "Cliente no atiende las llamadas por ninguno de los 2 numeros",
    "Cliente no contesta. Numero opcional no se encuentra con el cliente",
]

# --- Imputación de devoluciones sin motivo ----------------------------------
# `devolver_oportunidad` sólo es legible mientras la oportunidad sigue en la
# etapa 8: dos tercios de las devoluciones históricas no lo tienen. Esas se
# reparten con la distribución observada en las que sí lo traen, condicionada a
# la etapa de origen (que el log sí conserva siempre). Si un origen no llega a
# esta muestra mínima se usa la distribución global.
E8_IMPUTACION_MIN_MUESTRA = 30

# Retornos que sí penalizan: el cliente ya había sido enviado hacia adelante
# y volvió, así que la etapa no resolvió. Se compara contra `forward_key`.
RETORNO_ATRIBUCION = [
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_4_adecuaciones"},
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_5_gpi"},
    {"etapa": "etapa_3_factibilidad", "forward_to": "etapa_6_contratistas"},
    {"etapa": "etapa_4_adecuaciones", "forward_to": "etapa_5_gpi"},
    {"etapa": "etapa_4_adecuaciones", "forward_to": "etapa_6_contratistas"},
    {"etapa": "etapa_5_gpi", "forward_to": "etapa_6_contratistas"}, 
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


# --- Cabeceras minimas del export de Odoo ------------------------------------
# Se validan contra el CSV crudo, antes de renombrar nada. Estaban en el modulo
# de vistas, desde donde `frontend/imports` las importaba cruzando de app a app.

REQUIRED_CRM_HEADERS = {
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
