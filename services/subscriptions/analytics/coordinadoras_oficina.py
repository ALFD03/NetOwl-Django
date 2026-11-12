"""Las coordinadoras de oficina de cada site, con sus ventas del mes y su objetivo.

Lo pinta el Sales Report bajo cada site. Una coordinadora de oficina
(la membresia de equipo con rol `coord_oficina`) pertenece a uno o varios sites por
`MembresiaEquipo.sites`; sin site no sale en el reporte. Con varios, sale en el bloque
de cada uno con las mismas cifras: las ventas son suyas, no de un site.

De cada una se cuentan dos cosas del mes, por la fecha de instalacion
(`fecha_inicio`) de las suscripciones:

- **propias**: las que la nombran como `Medio`, lo que vendio ella misma.
- **oficina**: las que la nombran como `Vendedor`, las de su oficina, las
  vendiera quien las vendiera.

El cumplimiento se mide **contra las propias**, a peticion del usuario: las de
la oficina se ensenan, pero no cuentan para su objetivo. El cruce de nombres es
el de los directorios (`core.odoo_nombres.clave_nombre`): `Medio` contra
`medio`, `Vendedor` contra `usuario_odoo`.

El objetivo es una cantidad de ventas al mes (`ObjetivoVentasOficina`): el
individual vigente, o si no tiene, el general vigente. Como los objetivos
comerciales, no se guarda con ninguna metrica: se resuelve al leer, y
cambiarlo no obliga a relanzar nada.

Los conteos van **por dia de instalacion**, no acumulados: la barra de dias del
reporte reagrupa en el cliente, y el corte del dia N es la suma hasta N, que es
lo mismo que significa un corte en el resto del reporte.
"""

from __future__ import annotations

import calendar
import logging
import re
from datetime import date
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.odoo_nombres import clave_nombre
from core.utils import normalize_text, parse_date

logger = logging.getLogger(__name__)

_MES = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Las que todavia no son un servicio: una cotizacion no se vendio y una
# instalacion no termino. Es el mismo criterio que comisiones
# (`reglas.ESTADOS_SIN_SERVICIO`).
ESTADOS_SIN_SERVICIO = frozenset({"cotizacion", "instalacion"})


def objetivo_vigente(tramos: list[tuple[str | None, int]], mes: str) -> int | None:
    """Las ventas del tramo vigente en `mes`: el mas reciente que ya empezo.

    `desde` nulo es "desde siempre". Nulo si ningun tramo ha empezado.

    >>> objetivo_vigente([(None, 30), ("2026-09", 40)], "2026-08")
    30
    >>> objetivo_vigente([(None, 30), ("2026-09", 40)], "2026-10")
    40
    >>> objetivo_vigente([("2026-09", 40)], "2026-08") is None
    True
    """
    vigentes = [(desde or "", ventas) for desde, ventas in tramos if desde is None or desde <= mes]
    return max(vigentes)[1] if vigentes else None


def _ventas_por_dia(mes: str) -> dict[str, dict[str, list[int]]]:
    """`{"medio"|"vendedor": {clave: [instalaciones del dia 1..31]}}` del mes.

    `fecha_inicio` es texto: las fechas ISO se filtran en SQL y las que vengan
    en otro formato se resuelven con `parse_date`, como en comisiones. Una
    columna que el export no trae se queda vacia.
    """
    anio, num = int(mes[:4]), int(mes[5:7])
    inicio = date(anio, num, 1)
    fin = date(anio, num, calendar.monthrange(anio, num)[1])
    vacio: dict[str, dict[str, list[int]]] = {"medio": {}, "vendedor": {}}

    db = DBConnector()
    columnas = db.columnas(TableNames.SUBSCRIPTIONS)
    nombres = [c for c in ("medio", "vendedor") if c in columnas]
    if "fecha_inicio" not in columnas or not nombres:
        return vacio
    estado = ", estado" if "estado" in columnas else ""
    df = db.query(
        f"""
        SELECT fecha_inicio, {", ".join(nombres)}{estado}
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE (fecha_inicio ~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}' AND LEFT(fecha_inicio, 10) BETWEEN %s AND %s)
           OR (fecha_inicio IS NOT NULL AND fecha_inicio !~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}')
        """,
        params=[inicio.isoformat(), fin.isoformat()],
    )
    if df.empty:
        return vacio

    for fila in df.itertuples(index=False):
        if estado and normalize_text(fila.estado or "") in ESTADOS_SIN_SERVICIO:
            continue
        leido = parse_date(fila.fecha_inicio)
        if leido is None or pd.isna(leido):
            continue
        dia = leido.date()
        if not inicio <= dia <= fin:
            continue
        for columna in nombres:
            clave = clave_nombre(str(getattr(fila, columna) or ""))
            if clave:
                vacio[columna].setdefault(clave, [0] * 31)[dia.day - 1] += 1
    return vacio


def _sumar_dias(por_clave: dict[str, list[int]], claves: set[str]) -> list[int]:
    """Las ventas por dia de todas las formas en que Odoo escribe a la persona, sumadas."""
    total = [0] * 31
    for clave in claves:
        for i, n in enumerate(por_clave.get(clave, ())):
            total[i] += n
    return total


def get_coordinadoras_oficina(periodo: str | None) -> list[dict[str, Any]]:
    """Las coordinadoras de oficina con site, sus ventas por dia y su objetivo del mes.

    `periodo` es el del reporte (`"2026-10-01 al 2026-10-31"` o `"2026-10"`).
    Una fila por coordinadora y site, ordenadas por site y nombre:

    - `site`: el nombre del site, para colgarla del bloque del reporte.
    - `propias_dia` / `oficina_dia`: instalaciones de cada dia como `Medio` y
      como `Vendedor`, de 31 posiciones.
    - `objetivo`: ventas esperadas en el mes, y `origen_objetivo` si es el
      suyo (`individual`) o el `general`; nulos si no hay ninguno.

    Si la tabla de suscripciones no se puede leer se devuelven sin ventas: es
    una parte del reporte, y no merece romperlo entero.
    """
    from services.catalogos.models import MembresiaEquipo, ObjetivoVentasOficina

    mes = str(periodo or "")[:7]
    if not _MES.match(mes):
        return []
    # Una fila por persona y site: la coordinadora que figurara en dos equipos con el
    # mismo site saldria dos veces en su bloque.
    vistas: set[tuple[int, int]] = set()
    membresias = []
    for m in (
        MembresiaEquipo.objects.filter(rol="coord_oficina", sites__isnull=False)
        .select_related("persona")
        .prefetch_related("sites", "persona__alias")
    ):
        for site in m.sites.all():
            if (m.persona_id, site.id) not in vistas:
                vistas.add((m.persona_id, site.id))
                membresias.append((site, m))
    if not membresias:
        return []
    membresias.sort(key=lambda t: (t[0].orden, t[0].nombre, t[1].persona.nombre, t[1].persona.apellido))

    general: list[tuple[str | None, int]] = []
    propios: dict[int, list[tuple[str | None, int]]] = {}
    for o in ObjetivoVentasOficina.objects.all():
        (propios.setdefault(o.persona_id, []) if o.persona_id else general).append((o.desde, o.ventas))

    try:
        ventas = _ventas_por_dia(mes)
    except Exception:
        logger.exception("No se pudieron contar las ventas de las coordinadoras de oficina de %s", mes)
        ventas = {"medio": {}, "vendedor": {}}

    filas = []
    for site, m in membresias:
        p = m.persona
        objetivo = objetivo_vigente(propios.get(p.id, []), mes)
        origen = "individual" if objetivo is not None else None
        if objetivo is None:
            objetivo = objetivo_vigente(general, mes)
            origen = "general" if objetivo is not None else None
        filas.append({
            "id": p.id,
            "nombre": p.nombre_completo,
            "site": site.nombre,
            "propias_dia": _sumar_dias(ventas["medio"], p.claves("medio")),
            "oficina_dia": _sumar_dias(ventas["vendedor"], p.claves("usuario")),
            "objetivo": objetivo,
            "origen_objetivo": origen,
        })
    return filas
