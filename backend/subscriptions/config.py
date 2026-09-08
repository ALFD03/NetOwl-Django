"""Constantes del dominio de suscripciones.

Los otros dos dominios ya tenian su modulo de configuracion
(`backend/support/config.py`, `backend/crm/crm_config.py`); suscripciones no,
asi que su vocabulario de negocio vivia incrustado en los modulos que lo
usaban. Aqui se centraliza lo que estaba repetido o escondido en literales.
"""

from __future__ import annotations

# --- Orden de presentacion de los sites -------------------------------------
# Los sites no se ordenan alfabeticamente sino por relevancia comercial; este
# es el orden que espera la UI. Lo que no este listado se va al final.
CUSTOM_SITE_ORDER = [
    "Valencia",
    "Naguanagua",
    "Los Guayos",
    "Libertador",
    "San Joaquin",
    "Guacara",
    "Puerto Cabello",
    "Moron",
    "Maracay",
    "Turmero",
    "Cagua",
    "La Victoria",
    "San Diego",
]

# --- Planes con tratamiento especial en el reporte de la reguladora ---------
# No son planes residenciales: se excluyen de los conteos por tecnologia y se
# reportan en su propia categoria.
PLAN_TRANSPORTE = "Transporte de Datos"
PLAN_DEDICADO = "Internet Dedicado"
PLANES_NO_RESIDENCIALES = [PLAN_TRANSPORTE, PLAN_DEDICADO]

# --- Vocabulario del reporte de la reguladora -------------------------------
# La reguladora solo distingue alambrico / inalambrico, asi que las tecnologias
# comerciales se colapsan a esas dos.
TECH_MAP = {
    "RF": "Inalámbrico",
    "FTTH": "Alámbrico",
    "GPON": "Alámbrico",
    "INALAMBRICO": "Inalámbrico",
    "ALAMBRICO": "Alámbrico",
    "FIBRA": "Alámbrico",
    "RADIO": "Inalámbrico",
}
TECH_DEFAULT = "Alámbrico"

PERSONA_MAP = {
    "nat": "Persona Natural",
    "pyme": "Persona Jurídica",
    "jur": "Persona Jurídica",
    "natural": "Persona Natural",
    "juridica": "Persona Jurídica",
}
PERSONA_DEFAULT = "Persona Natural"


# --- Mapeo de columnas del export de Odoo ------------------------------------
# Base compartida por el importador de suscripciones y por el detector de
# planes gratuitos, que leen el mismo fichero. Estaban declaradas dos veces
# (`SUBSCRIPTIONS_COLUMN_MAPPING` y `SUBS_COLUMNS`) y habia que acordarse de
# tocar las dos. El importador le suma los alias de la columna `Activo`.
SUBS_COLUMN_MAPPING = {
    "Líneas de la orden/Referencia de la orden": "orden_producto",
    "Líneas de la orden/Producto/Nombre": "producto",
    "Líneas de la orden/Cliente": "cliente",
    "Líneas de la orden/Cliente/CI/RIF": "ci",
    "Sucursal": "sucursal",
    "Zona": "zona",
    "Líneas de la orden/Cliente/Municipio": "municipio",
    "Tipo de Servicio": "tipo",
    "Estado de la Suscripción": "estado",
    "Campaña": "campanna",
    "Próxima Fecha de Factura": "fecha_factura",
    "Fecha de inicio": "fecha_inicio",
    "Tarifa": "tarifa",
    "Subtotal": "total",
    "Teléfono": "telefono",
    "Cliente/Phone 1": "phone",
    "Cliente/Phone 2": "phone2",
    "Vendedor": "vendedor",
}

# Odoo no siempre exporta la cabecera con la misma capitalizacion.
# false/0 = suscripcion archivada (cliente en plan gratuito).
SUBS_ACTIVO_ALIASES = {
    "Activo": "activo",
    "activo": "activo",
    "Active": "activo",
}
