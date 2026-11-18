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
el de los directorios (`core.odoo_names.name_key`): `Medio` contra
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
from core.odoo_names import name_key
from core.utils import normalize_text, parse_date

logger = logging.getLogger(__name__)

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Las que todavia no son un servicio: una cotizacion no se vendio y una
# instalacion no termino. Es el mismo criterio que comisiones
# (`rules.NO_SERVICE_STATES`).
NO_SERVICE_STATES = frozenset({"cotizacion", "instalacion"})


def current_target(tiers: list[tuple[str | None, int]], month: str) -> int | None:
    """Las ventas del tramo vigente en `mes`: el mas reciente que ya empezo.

    `desde` nulo es "desde siempre". Nulo si ningun tramo ha empezado.

    >>> objetivo_vigente([(None, 30), ("2026-09", 40)], "2026-08")
    30
    >>> objetivo_vigente([(None, 30), ("2026-09", 40)], "2026-10")
    40
    >>> objetivo_vigente([("2026-09", 40)], "2026-08") is None
    True
    """
    current = [(since or "", sales) for since, sales in tiers if since is None or since <= month]
    return max(current)[1] if current else None


def _sales_per_day(month: str) -> dict[str, dict[str, list[int]]]:
    """`{"medio"|"vendedor": {clave: [instalaciones del dia 1..31]}}` del mes.

    `fecha_inicio` es texto: las fechas ISO se filtran en SQL y las que vengan
    en otro formato se resuelven con `parse_date`, como en comisiones. Una
    columna que el export no trae se queda vacia.
    """
    year, num = int(month[:4]), int(month[5:7])
    start = date(year, num, 1)
    end = date(year, num, calendar.monthrange(year, num)[1])
    empty: dict[str, dict[str, list[int]]] = {"medio": {}, "vendedor": {}}

    db = DBConnector()
    columns = db.columns(TableNames.SUBSCRIPTIONS)
    names = [c for c in ("medio", "vendedor") if c in columns]
    if "fecha_inicio" not in columns or not names:
        return empty
    state = ", estado" if "estado" in columns else ""
    df = db.query(
        f"""
        SELECT fecha_inicio, {", ".join(names)}{state}
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE fecha_inicio BETWEEN %s AND %s
        """,
        params=[start, end],
    )
    if df.empty:
        return empty

    for row in df.itertuples(index=False):
        if state and normalize_text(row.estado or "") in NO_SERVICE_STATES:
            continue
        read = parse_date(row.fecha_inicio)
        if read is None or pd.isna(read):
            continue
        day = read.date()
        if not start <= day <= end:
            continue
        for column in names:
            key = name_key(str(getattr(row, column) or ""))
            if key:
                empty[column].setdefault(key, [0] * 31)[day.day - 1] += 1
    return empty


def _add_days(by_key: dict[str, list[int]], keys: set[str]) -> list[int]:
    """Las ventas por dia de todas las formas en que Odoo escribe a la persona, sumadas."""
    total = [0] * 31
    for key in keys:
        for i, n in enumerate(by_key.get(key, ())):
            total[i] += n
    return total


def get_office_coordinators(period: str | None) -> list[dict[str, Any]]:
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
    from services.catalogs.models import OfficeSalesTarget, TeamMembership

    month = str(period or "")[:7]
    if not _MONTH.match(month):
        return []
    # Una fila por persona y site: la coordinadora que figurara en dos equipos con el
    # mismo site saldria dos veces en su bloque.
    views: set[tuple[int, int]] = set()
    memberships = []
    for m in (
        TeamMembership.objects.filter(role="coord_oficina", sites__isnull=False)
        .select_related("person")
        .prefetch_related("sites", "person__aliases")
    ):
        for site in m.sites.all():
            if (m.person_id, site.id) not in views:
                views.add((m.person_id, site.id))
                memberships.append((site, m))
    if not memberships:
        return []
    memberships.sort(key=lambda t: (t[0].order, t[0].name, t[1].person.name, t[1].person.last_name))

    general: list[tuple[str | None, int]] = []
    own: dict[int, list[tuple[str | None, int]]] = {}
    for o in OfficeSalesTarget.objects.all():
        (own.setdefault(o.person_id, []) if o.person_id else general).append((o.since, o.sales))

    try:
        sales = _sales_per_day(month)
    except Exception:
        logger.exception("No se pudieron contar las ventas de las coordinadoras de oficina de %s", month)
        sales = {"medio": {}, "vendedor": {}}

    rows = []
    for site, m in memberships:
        p = m.person
        target = current_target(own.get(p.id, []), month)
        source = "individual" if target is not None else None
        if target is None:
            target = current_target(general, month)
            source = "general" if target is not None else None
        rows.append({
            "id": p.id,
            "nombre": p.full_name,
            "site": site.name,
            "propias_dia": _add_days(sales["medio"], p.name_keys("medio")),
            "oficina_dia": _add_days(sales["vendedor"], p.name_keys("usuario")),
            "objetivo": target,
            "origen_objetivo": source,
        })
    return rows
