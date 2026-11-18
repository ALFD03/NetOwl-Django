"""Cruce del directorio de usuarios con los tickets ya importados.

El directorio (`services/support/models.py`) dice quien existe; los tickets
dicen quien aparece. Lo interesante es la diferencia: nombres que ya estan
firmando o atendiendo tickets y que nadie ha registrado todavia.

No bloquea nada —a diferencia del catalogo de planes, un tecnico sin registrar
no invalida el analisis—, asi que esto es una lista para revisar, no una
verificacion previa a escribir.
"""

# backend/support/users.py

from __future__ import annotations

import logging
from datetime import date

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.odoo_names import name_key, normalize_odoo_name
from services.support.analytics.config import SUPPORT_DIMENSIONES_PERSONA
from services.support.models import HistorialDepartamento, UsuarioSoporte

logger = logging.getLogger(__name__)

# Relleno con el que `SUPPORT_TEXT_COLUMNS` sustituye una celda vacia. No es
# una persona: ofrecerlo como candidato a registrar seria crear un usuario
# llamado «Sin Especificar (User)».
UNSPECIFIED = "Sin Especificar"


# La comparacion es la de `core.odoo_names.name_key`: el nombre a secas,
# sin sufijo y sin distinguir mayusculas.
_key = name_key


def departments_by_user(fecha: date | None = None) -> dict[str, str]:
    """`{clave del nombre -> departamento}` para todo el directorio.

    Con `fecha`, el departamento en el que estaba cada persona **ese dia**,
    segun `HistorialDepartamento`: el ultimo tramo que empezo en o antes de la
    fecha. Sin ella, el vigente. Quien entro despues de la fecha se queda con
    su primer departamento —el tramo inicial no tiene inicio—, porque si
    aparece en tickets de entonces es mejor agruparlo en algo que en nada.

    Se consulta en cada lectura y no se cachea: son tablas pequenas, y lo que
    se gana es que **corregir el departamento de alguien se ve de inmediato en
    todos los meses**, tambien en los ya analizados. Resolverlo al calcular
    habria congelado el reparto al dia del analisis.
    """
    # El vigente como base: cubre a quien, por lo que sea, no tenga historia.
    mapa = {
        _key(nombre): departamento
        for nombre, departamento in UsuarioSoporte.objects.values_list(
            "nombre_odoo", "departamento__nombre"
        )
    }
    if fecha is None:
        return mapa

    # El orden del modelo —tramo inicial primero, luego por fecha— hace que
    # el ultimo tramo aplicable sea el que se queda.
    for nombre, departamento, desde in HistorialDepartamento.objects.values_list(
        "usuario__nombre_odoo", "departamento__nombre", "desde"
    ):
        if desde is None or desde <= fecha:
            mapa[_key(nombre)] = departamento
    return mapa


def annotate_departments(grupos: dict, fecha: date | None = None) -> dict:
    """Anade `departamento` a cada valor de las dos dimensiones de persona.

    `fecha` es el dia del corte: el ultimo del mes para el cierre, el dia
    mismo para un corte diario. Quien cambio de departamento a mitad de mes
    cuenta entero en el que tenia al cerrar: sus metricas del mes son un solo
    bloque y no se pueden partir por fecha.

    Se hace **al leer** y no al calcular, por lo dicho en
    `departments_by_user`. Es tambien la razon de que la anotacion no
    viva en `structure_groups`: esa funcion la comparten la lectura del mes y
    la escritura de los cortes diarios, y anotar alli dejaria el departamento
    grabado dentro del JSON del dia.

    Quien no este en el directorio se queda con la cadena vacia; es la
    interfaz la que decide como llamar a ese grupo.
    """
    if not grupos:
        return grupos

    try:
        mapa = departments_by_user(fecha)
    except Exception:
        logger.exception("No se pudo leer el directorio de soporte")
        return grupos

    for bloque in grupos.values():
        for dimension in SUPPORT_DIMENSIONES_PERSONA:
            for entrada in bloque.get(dimension, []):
                entrada["departamento"] = mapa.get(_key(entrada.get("nombre", "")), "")

    return grupos


def users_outside_directory() -> list[dict]:
    """Nombres presentes en los tickets que el directorio no reconoce.

    Se miran las dos columnas de persona —`asignado_a` y `creado_por`— porque
    son dos papeles distintos del mismo directorio: quien responde del ticket y
    quien lo abrio. El conteo viaja partido para que se vea de cual de los dos
    viene un nombre desconocido.

    La comparacion es la de `_key`: el nombre a secas, sin sufijo y sin
    distinguir mayusculas. Los mismos tickets escriben `(User)`, `(user)` y
    nada, y las tres son la misma persona.
    """
    db = DBConnector()
    if not db.table_exists(TableNames.SUPPORT_TICKETS):
        return []

    try:
        df = db.query(
            f"""
            SELECT asignado_a, creado_por, COUNT(*) AS tickets
            FROM "{DB_SCHEMA}"."{TableNames.SUPPORT_TICKETS}"
            GROUP BY asignado_a, creado_por
            """
        )
    except Exception:
        logger.exception("Error al cruzar los tickets con el directorio de soporte")
        return []

    if df.empty:
        return []

    df["tickets"] = pd.to_numeric(df["tickets"], errors="coerce").fillna(0).astype(int)

    # Un diccionario por nombre normalizado, con el literal tal y como lo
    # escribe el export: es lo que se le ofrece copiar a quien lo registre.
    encontrados: dict[str, dict] = {}
    for columna, papel in (("asignado_a", "asignados"), ("creado_por", "creados")):
        if columna not in df.columns:
            continue
        for literal, tickets in df.groupby(columna)["tickets"].sum().items():
            nombre = normalize_odoo_name(literal)
            if not nombre or str(literal).strip() == UNSPECIFIED:
                continue
            fila = encontrados.setdefault(
                _key(literal),
                {"nombre_odoo": nombre, "literal": str(literal).strip(), "asignados": 0, "creados": 0},
            )
            fila[papel] += int(tickets)

    registrados = set(departments_by_user())
    return sorted(
        (fila for clave, fila in encontrados.items() if clave not in registrados),
        key=lambda fila: fila["asignados"] + fila["creados"],
        reverse=True,
    )


def tickets_after_churn() -> list[dict]:
    """Usuarios dados de baja a cuyo nombre siguen entrando tickets.

    El directorio no puede impedir que Odoo le asigne un ticket a quien ya se
    fue —el export llega como llega—, pero si puede decirlo. Cuenta los
    tickets **creados despues de la fecha de egreso** que tienen a la persona
    como asignada o como creadora, partidos por papel como en
    `users_outside_directory`.

    Igual que aquella, no bloquea nada: es una lista para reasignar en Odoo.
    """
    bajas = {
        _key(u.nombre_odoo): u
        for u in UsuarioSoporte.objects.exclude(fecha_egreso=None)
    }
    if not bajas:
        return []

    db = DBConnector()
    if not db.table_exists(TableNames.SUPPORT_TICKETS):
        return []

    # Se filtra en SQL por la baja mas antigua para no traerse la tabla
    # entera; el corte fino, persona a persona, se hace despues.
    desde = min(u.fecha_egreso for u in bajas.values())
    try:
        df = db.query(
            f"""
            SELECT asignado_a, creado_por, creado_el::date AS dia, COUNT(*) AS tickets
            FROM "{DB_SCHEMA}"."{TableNames.SUPPORT_TICKETS}"
            WHERE creado_el >= %s::date + 1
            GROUP BY asignado_a, creado_por, creado_el::date
            """,
            params=[desde],
        )
    except Exception:
        logger.exception("Error al buscar tickets posteriores a las bajas de soporte")
        return []

    if df.empty:
        return []

    df["tickets"] = pd.to_numeric(df["tickets"], errors="coerce").fillna(0).astype(int)
    df["dia"] = pd.to_datetime(df["dia"], errors="coerce").dt.date

    encontrados: dict[str, dict] = {}
    for columna, papel in (("asignado_a", "asignados"), ("creado_por", "creados")):
        for (literal, dia), tickets in df.groupby([columna, "dia"])["tickets"].sum().items():
            usuario = bajas.get(_key(literal))
            if usuario is None or dia is None or dia <= usuario.fecha_egreso:
                continue
            fila = encontrados.setdefault(
                _key(literal),
                {
                    "id": usuario.id,
                    "nombre_odoo": usuario.nombre_odoo,
                    "fecha_egreso": usuario.fecha_egreso.isoformat(),
                    "asignados": 0,
                    "creados": 0,
                    "ultimo": dia,
                },
            )
            fila[papel] += int(tickets)
            fila["ultimo"] = max(fila["ultimo"], dia)

    for fila in encontrados.values():
        fila["ultimo"] = fila["ultimo"].isoformat()
    return sorted(
        encontrados.values(),
        key=lambda fila: fila["asignados"] + fila["creados"],
        reverse=True,
    )
