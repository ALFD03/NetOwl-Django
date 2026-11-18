"""El informe de comisiones de un periodo: de las suscripciones a lo que cobra cada uno.

1. **Candidatas**: las suscripciones instaladas (`fecha_inicio`) dentro de la
   ventana del periodo —del inicio de los dias promocionales del mes anterior
   al fin del mes—, menos las ya pagadas en un periodo cerrado, mas las
   agregadas a mano (`VentaManual`). Lo instalado en los dias promocionales
   del mes solo cuenta si el cliente adelanto la primera mensualidad antes del
   corte (`cutoff_of`); si no, es del periodo siguiente (`DEFERRED`). Lo de los
   del mes anterior, en el primer periodo del sistema, se confirma a mano: pudo
   cobrarse ya en el anterior, fuera del sistema.
2. **Clasificacion** (`rules.classify`): por su primera mensualidad —la
   primera factura con un plan, del export de facturas— y el estado de la
   factura de la suscripcion. **Todo se mide al corte del periodo**: solo se
   miran las facturas creadas hasta ese dia y solo cuenta lo pagado hasta el;
   una factura de los meses siguientes, aunque este pagada, no rescata la venta. Se juzga con los datos de hoy, sea cual sea la
   fecha: hasta que se cierra, el informe se recalcula con lo ultimo importado.
   Por eso un periodo se congela al cerrarlo: las tablas de suscripciones y de
   facturas se reemplazan en cada importacion.
3. **Personas**: el `Medio`, el `Oportunidad/Administrador` y el `Vendedor` de cada venta
   contra el directorio de ventas, tal y como vienen: lo que la venta no trae
   no lo cobra nadie. El equipo de la venta es el de su `Medio`; la unidad de
   negocio, la de la cadena supervisor → su superior (`TeamMembership.manager`).
4. **Pagos** (`payments.compute_payments`): cada persona cobra segun las condiciones
   de su rol en el equipo de la venta, con los indicadores del mes
   (`_indicators`): los % de cumplimiento de sites y unidades de negocio, el
   crecimiento, el churn y los % de ingresos, que salen del servidor
   (`site_compliance.month_indicators`) o se escriben a mano cuando se
   puede (`IndicadorComision`).

Un borrador no guarda nada: esto se ejecuta cada vez que se abre.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pandas as pd

from core import fixtures
from core.config import (
    ARCHIVED_EVENT,
    DB_SCHEMA,
    SUBS_STATE_TO_LOG_MAP,
    UNARCHIVED_EVENT,
    TableNames,
)
from core.database import DBConnector
from core.odoo_names import name_key
from core.utils import normalize_text, parse_date
from services.catalogs.models import (
    SalesPerson,
    SalesTeam,
    TeamConditions,
    TeamMembership,
)
from services.catalogs.teams import ROLES, ROLES_BY_TEAM, current_parameters
from services.commissions.models import (
    CommissionConditions,
    CommissionIndicator,
    CommissionPeriod,
    CommissionReview,
    CommissionSale,
    ManualSale,
)
from services.subscriptions.analytics.analyzer.cleaner import parse_archived
from services.subscriptions.analytics.bcv import RateUnavailable, fetch_rate_on
from services.subscriptions.analytics.free_plans import _is_free_tariff
from services.subscriptions.analytics.invoices import (
    invoices_have_payment_dates,
    invoices_imported_at,
    read_invoices,
)
from services.subscriptions.analytics.office_coordinators import get_office_coordinators
from services.subscriptions.analytics.site_compliance import month_indicators
from services.subscriptions.models import Coordinator

from .payments import Indicators, Member, Sale, compute_payments, payment_row
from .rules import (
    ALREADY_PAID,
    COUNT,
    DEFERRED,
    DONT_COUNT,
    EXCLUDED,
    MANUAL,
    NORMAL,
    PLAN_CHANGE_REASON,
    PREVIOUS_PROMO,
    PROMO,
    REVIEW,
    UNPAID,
    VALID,
    Invoice,
    cancelled_within_first_month,
    classify,
    first_installment,
    paid_until,
    payment_date,
    tier,
)

logger = logging.getLogger(__name__)

# Las columnas del export sin las que no hay comisiones que calcular. La
# importacion las acepta como opcionales; es aqui donde se exigen.
REQUIRED_COLUMNS = {
    "medio": "Medio",
    "medio_supervisor": "Oportunidad/Administrador",
    "estado_factura": "Estado de la factura",
}

# El estado interno de los logs de una suscripcion cancelada.
CANCELLED_LOG = SUBS_STATE_TO_LOG_MAP["cancelado"]

class MissingCommissionColumns(RuntimeError):
    """Faltan datos sin los que no hay informe: columnas de suscripciones o las facturas."""


# --- Fechas --------------------------------------------------------------------------

def previous_month(period: str) -> str:
    """`YYYY-MM` del mes anterior."""
    year, month = (int(x) for x in period.split("-"))
    return f"{year - 1}-12" if month == 1 else f"{year}-{month - 1:02d}"


def next_month(period: str) -> str:
    """`YYYY-MM` del mes siguiente."""
    year, month = (int(x) for x in period.split("-"))
    return f"{year + 1}-01" if month == 12 else f"{year}-{month + 1:02d}"


def conatel_rate_for(period: CommissionPeriod) -> dict[str, Any]:
    """La tasa en bolivares con que se paga el periodo: la CONATEL del mes siguiente.

    Las comisiones de un mes se pagan el mes siguiente (las de septiembre en
    octubre), y la tasa CONATEL de un mes es el valor del bolivar oficial el
    **dia 1** de ese mes. Si el BCV no publico ese dia, la vigente: la ultima
    publicada antes (`bcv.fetch_rate_on`).

    El valor de un dia pasado ya no cambia, asi que se consulta una vez y se
    guarda en el periodo. Un mes que aun no empezo no tiene tasa y no se
    pregunta. Un fallo del servicio no rompe el informe: se devuelve en `aviso`
    y se vuelve a intentar la proxima vez que se abra.
    """
    month = next_month(period.period)
    first = day_of_month(month, 1)
    without_rate = {"mes": month, "dia": first.isoformat(), "tasa": None, "fuente": ""}
    if period.conatel_rate is None:
        if first > date.today():
            return {**without_rate, "aviso": f"Se conoce a partir del {first.strftime('%d/%m/%Y')}."}
        try:
            rate, published = fetch_rate_on(first)
        except RateUnavailable as e:
            return {**without_rate, "aviso": str(e)}
        period.conatel_rate = Decimal(str(rate))
        period.conatel_rate_published = published
        period.save(update_fields=["conatel_rate", "conatel_rate_published"])

    published = period.conatel_rate_published
    source = f"BCV {published.strftime('%d/%m/%Y')}" if published else "BCV"
    if published and published != first:
        source += f", vigente el {first.strftime('%d/%m/%Y')} (ese día no hubo publicación)"
    source += " · ve.dolarapi.com"
    return {**without_rate, "tasa": float(period.conatel_rate), "fuente": source, "aviso": ""}


def day_of_month(period: str, day: int) -> date:
    """El dia `dia` del mes, recortado al ultimo si el mes es mas corto."""
    year, month = (int(x) for x in period.split("-"))
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def calculation_date(period: str, wait_days: int) -> date:
    """Desde cuando tiene sentido calcular: `dias_espera` dias tras el fin del mes.

    Es lo que tardan las primeras facturas de lo instalado en pagarse: lo del
    25 de agosto al 24 de septiembre se paga el 15 de octubre.
    """
    year, month = (int(x) for x in period.split("-"))
    return date(year, month, calendar.monthrange(year, month)[1]) + timedelta(days=wait_days)


def end_of(period: CommissionPeriod) -> date:
    """El ultimo dia de instalacion que puede contar: el fin del mes.

    Lo instalado desde `inicio_promo` solo cuenta si se adelanto el pago.
    """
    year, month = (int(x) for x in period.period.split("-"))
    return date(year, month, calendar.monthrange(year, month)[1])


def cutoff_of(period: CommissionPeriod, cutoff_day: int) -> date:
    """Hasta que dia un pago adelantado cuenta en el periodo.

    El escrito en el periodo, o el `dia_corte` (22) del mes siguiente: es
    cuando se saca el informe, y lo que se pague despues ya va al siguiente.
    """
    return period.advance_cutoff or day_of_month(next_month(period.period), cutoff_day)


# --- Condiciones ------------------------------------------------------------------

def current_conditions() -> dict[str, Any]:
    """Las condiciones actuales: la ventana de pago y las de cada rol de cada equipo.

    `equipos` es `{equipo: {rol: parametros}}`, con lo guardado completado con la
    politica por defecto (`teams.current_parameters`); `nombres`, el nombre de
    cada equipo, para que la copia que congela un cierre se explique sola.
    """
    c = CommissionConditions.current()
    saved = {(f.team.slug, f.role): f.params for f in TeamConditions.objects.select_related("team")}
    return {
        "dia_promocional": c.promo_day,
        "dias_espera": c.wait_days,
        "dia_corte": c.cutoff_day,
        "equipos": {
            slug: {role: current_parameters(slug, role, saved.get((slug, role))) for role in roles}
            for slug, roles in ROLES_BY_TEAM.items()
        },
        "nombres": dict(SalesTeam.objects.values_list("slug", "name")),
    }


# --- Lectura -----------------------------------------------------------------------

def _read(where: str, params: list) -> pd.DataFrame:
    """Las suscripciones que cumplen `donde`, con la fecha de instalacion leida en `fecha`."""
    db = DBConnector()
    table = f'"{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"'
    # Las columnas siempre existen; lo que dice si el export las traía es que tengan algún valor.
    loaded = db.query(
        "SELECT " + ", ".join(f"bool_or({c} IS NOT NULL) AS {c}" for c in REQUIRED_COLUMNS) + f" FROM {table}"
    ).iloc[0]
    missing = [title for col, title in REQUIRED_COLUMNS.items() if loaded[col] is not None and not loaded[col]]
    if missing:
        raise MissingCommissionColumns(
            "La tabla de suscripciones no trae "
            + ", ".join(f"«{t}»" for t in missing)
            + ". Vuelve a importar las suscripciones con un export que incluya esas columnas."
        )

    df = db.query(
        f"""
        SELECT orden_producto, cliente, sucursal, zona, estado, fecha_inicio,
               producto, tarifa, total, vendedor, medio, medio_supervisor, estado_factura, activo
        FROM {table}
        WHERE {where}
        """,
        params=params,
    )
    if df.empty:
        return df
    df["fecha"] = pd.to_datetime(df["fecha_inicio"], errors="coerce").dt.date
    return df


def _read_candidates(start: date, end: date) -> pd.DataFrame:
    """Las suscripciones instaladas en la ventana."""
    return _read("fecha_inicio BETWEEN %s AND %s", [start, end])


def read_orders(orders: list[str]) -> pd.DataFrame:
    """Las suscripciones de esas ordenes, esten instaladas cuando esten: las agregadas a mano."""
    if not orders:
        return pd.DataFrame()
    return _read("orden_producto = ANY(%s)", [orders])


def _free_orders(df: pd.DataFrame) -> set[str]:
    """Las candidatas que hoy son gratuitas, y por eso no pagan comision.

    Con la misma evidencia que el analisis mensual: archivada en el export
    (`activo` falso), una tarifa «Gratis», o un «Suscripción archivada» como
    ultimo log de archivado (sin un «desarchivada» despues).
    """
    if df.empty:
        return set()
    orders = df["orden_producto"].astype(str)
    free = df["tarifa"].map(_is_free_tariff) | parse_archived(df["activo"])
    result = set(orders[free.to_numpy()])

    logs = DBConnector().query(
        f"""
        SELECT orden, log, fecha_log
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_LOGS}"
        WHERE orden = ANY(%s) AND log ILIKE %s
        ORDER BY orden, fecha_log
        """,
        params=[orders.tolist(), "%archivada%"],
    )
    for order, group in logs.groupby("orden", sort=False):
        last = normalize_text(group["log"].iloc[-1])
        if ARCHIVED_EVENT in last and UNARCHIVED_EVENT not in last:
            result.add(str(order))
    return result


def _cancelled_on(df: pd.DataFrame) -> dict[str, date]:
    """El dia en que se cancelo cada candidata que hoy esta «Cancelado».

    Es el comienzo de su ultimo tramo cancelado en `subscriptions-logs`: el
    primer log de la racha final con estado `6_churn`. Una cancelada sin ese
    log se queda sin fecha (y entonces no se excluye por durar poco).
    """
    if df.empty:
        return {}
    cancelled = df.loc[df["estado"].map(normalize_text) == "cancelado", "orden_producto"].astype(str).tolist()
    if not cancelled:
        return {}
    logs = DBConnector().query(
        f"""
        SELECT orden, fecha_log, estado
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_LOGS}"
        WHERE orden = ANY(%s)
        ORDER BY orden, fecha_log
        """,
        params=[cancelled],
    )
    dates: dict[str, date] = {}
    for order, group in logs.groupby("orden", sort=False):
        start = None
        for row in group.itertuples(index=False):
            if row.estado == CANCELLED_LOG:
                start = start or row.fecha_log
            else:
                start = None
        day = parse_date(start) if start else None
        if day is not None and not pd.isna(day):
            dates[str(order)] = pd.Timestamp(day).date()
    return dates


def _plan_index() -> tuple[dict[tuple[str, str], dict], dict[str, dict]]:
    """Los planes del catalogo por (nombre, tarifa) y por nombre (gana el ultimo)."""
    by_tariff: dict[tuple[str, str], dict] = {}
    by_name: dict[str, dict] = {}
    for plan in fixtures.plans():
        by_tariff[(plan["name"], plan.get("tarifa") or "")] = plan
        by_name[plan["name"]] = plan
    return by_tariff, by_name


class _Directory:
    """El directorio de ventas y la estructura de los equipos, indexados para resolver cada venta."""

    def __init__(self):
        self.people = {p.id: p for p in SalesPerson.objects.prefetch_related("aliases")}
        self.memberships = list(
            TeamMembership.objects.select_related("person", "team", "manager")
            .prefetch_related("units", "sites")
            .order_by("team__order", "role", "person__name", "person__last_name")
        )
        self.by_key = {(m.person_id, m.team.slug): m for m in self.memberships}
        self.by_id = {m.id: m for m in self.memberships}
        self.of_person: dict[int, list[TeamMembership]] = {}
        for m in self.memberships:
            self.of_person.setdefault(m.person_id, []).append(m)
        # Una persona puede estar escrita de varias formas (con y sin tilde): cada una apunta a ella.
        # Odoo a veces la escribe distinto como supervisor.
        self.by_channel = {k: p for p in self.people.values() for k in p.name_keys("medio")}
        self.by_supervisor = {k: p for p in self.people.values() for k in p.name_keys("supervisor")}
        self.by_user = {k: p for p in self.people.values() for k in p.name_keys("usuario")}
        self.units = dict(Coordinator.objects.values_list("id", "name"))

    def name(self, person_id: int | None) -> str:
        person = self.people.get(person_id) if person_id else None
        return person.full_name if person else ""

    def members(self) -> dict[tuple[int, str], Member]:
        """Las membresias como las lee el motor de pagos."""
        return {
            key: Member(m.person_id, m.team.slug, m.role, tuple(sorted(u.id for u in m.units.all())))
            for key, m in self.by_key.items()
        }

    def units_of(self, m: TeamMembership | None) -> tuple[int, ...]:
        """Las unidades de negocio de una membresia: las que lleva, o las de su superior.

        El coordinador de UN lleva una; el jefe y los gerentes, varias; un
        supervisor no lleva ninguna y hereda las de a quien responde.
        """
        if m is None:
            return ()
        if ROLES[m.role].get("units"):
            return tuple(sorted(u.id for u in m.units.all()))
        manager = self.by_id.get(m.manager_id) if m.manager_id is not None else None
        return self.units_of(manager) if manager is not None and manager.id != m.id else ()

    def _team_of(self, *people: int | None) -> tuple[str, str | None]:
        """El equipo de una venta, y un aviso si no esta claro.

        Es el del `Medio`; si no esta registrado en ningun equipo, el de su
        supervisor, y luego el de su `Vendedor`. Quien esta en varios (el
        gerente de operaciones) se desempata con el equipo de los demas de la venta.
        """
        with_team = [
            [m.team.slug for m in self.of_person.get(pid, [])] for pid in people if pid is not None
        ]
        with_team = [e for e in with_team if e]
        if not with_team:
            return "", None
        first = with_team[0]
        if len(first) == 1:
            return first[0], None
        common = [e for e in first if all(e in others for others in with_team[1:])]
        if len(common) == 1:
            return common[0], None
        return (common or first)[0], "Quien vendió está en varios equipos y no se pudo saber de cuál es la venta"

    def resolve(self, channel: str, supervisor: str, seller: str) -> tuple[dict[str, Any], list[str]]:
        """Las personas de una venta, su equipo y sus unidades, y los avisos de lo que no se pudo resolver.

        Cada columna se busca en el directorio tal y como viene, sin rellenar
        nada: una venta sin `Vendedor` no paga a ninguna oficina. Un literal
        que no esta en el directorio es un problema de registro, y se avisa.

        Cualquier rol puede ocupar cualquier columna: una coordinadora de
        oficina o un coordinador de UN tambien vende (`Medio`) y supervisa
        (`Oportunidad/Administrador`). Las unidades de negocio de la venta son las
        de su supervisor (o de quien vendio, si no trae supervisor); un
        supervisor escrito pero sin registrar no se sustituye por quien vendio:
        seria inventarle el equipo.
        """
        warnings: list[str] = []

        def find(literal: str, index: dict, column: str) -> int | None:
            if not literal:
                return None
            person = index.get(name_key(literal))
            if person is None:
                warnings.append(f"{column} «{literal}» no está en el directorio")
                return None
            return person.id

        channel_id = find(channel, self.by_channel, "Medio")
        supervisor_id = find(supervisor, self.by_supervisor, "Supervisor")
        office_id = find(seller, self.by_user, "Vendedor")

        team, warning = self._team_of(channel_id, supervisor_id, office_id)
        if warning:
            warnings.append(warning)
        if not team and any(i is not None for i in (channel_id, supervisor_id, office_id)):
            warnings.append("Ninguna de las personas de la venta tiene un papel en un equipo: no se paga")

        def role(person_id: int | None) -> TeamMembership | None:
            return self.by_key.get((person_id, team)) if person_id is not None and team else None

        if supervisor_id is not None:
            units = self.units_of(role(supervisor_id))
        elif not supervisor:
            units = self.units_of(role(channel_id))
        else:
            units = ()
        who = role(channel_id)
        for label, pid in (("Medio", channel_id), ("Supervisor", supervisor_id), ("Vendedor", office_id)):
            if team and pid is not None and role(pid) is None:
                warnings.append(f"{label} «{self.name(pid)}» no tiene papel en el equipo de la venta")
        return {
            "medio_id": channel_id,
            "supervisor_id": supervisor_id,
            "coord_oficina_id": office_id,
            "equipo": team,
            "unidad_ids": list(units),
            "es_oficina": bool(who and who.role == "coord_oficina"),
        }, warnings


def _indicators(
    key: str,
    directory: _Directory,
    conditions: dict[str, Any],
    manual_compliances: dict[int, float],
    manual_growths: dict[int, float],
) -> tuple[Indicators, dict[str, Any]]:
    """Los % que condicionan el pago, y de donde sale cada uno.

    Devuelve `(Indicadores, detalle)`: lo primero es lo que consume el motor; lo
    segundo, lo que pinta el paso Indicadores del informe.

    - **Factor de cumplimiento** (`factor` del rol): el que se aplica es, por orden,
      el **escrito a mano** para la persona (`IndicadorComision`), el
      **calculado** —el % Ventas de su site, o el promedio simple de las unidades
      de negocio que le tocan— o ninguno, que paga como 100 % y bloquea el cierre.
      **Nada se deduce de las ventas**: un supervisor sin superior (sin unidad) no
      tiene calculo y se escribe a mano.
    - **Crecimiento** de la unidad de un coordinador de UN (`escalon_crecimiento`):
      a mano, o el de Unidades de negocio del mes.
    - **Churn bruto** de su unidad, **% de ingresos** de cada unidad (bono del jefe)
      y **% de ventas de la empresa** (bono de la administradora): solo calculados.

    Un mes sin analizar no tiene ninguno: todo cae a lo escrito, y lo demas queda
    nulo. Ademas se informa, sin que pague, el cumplimiento personal de una
    coordinadora (sus ventas como `Medio` contra su objetivo de ventas).
    """
    try:
        data = month_indicators(key)
    except Exception:
        logger.exception("No se pudieron calcular los cumplimientos de %s", key)
        data = None
    sites = (data or {}).get("sites", {})
    by_unit = (data or {}).get("unidades", {})
    unit_name = directory.units

    personal = {}
    if any(m.role == "coord_oficina" for m in directory.memberships):
        for c in get_office_coordinators(key):
            own = sum(c["propias_dia"])
            personal[c["id"]] = {
                "ventas": own,
                "objetivo": c["objetivo"],
                "pct": round(own / c["objetivo"] * 100, 2) if c["objetivo"] else None,
            }

    ind = Indicators(company_pct=((data or {}).get("empresa") or {}).get("pct_ventas"))
    factors, growths, inflows = [], [], []

    def pieces(m: TeamMembership) -> dict[str, Any]:
        return conditions["equipos"].get(m.team.slug, {}).get(m.role, {})

    for m in directory.memberships:
        cond = pieces(m)
        k = (m.person_id, m.team.slug)
        base = {"persona_id": m.person_id, "equipo": m.team.slug, "rol": m.role, "nombre": m.person.full_name}

        kind = cond.get("factor")
        if kind in ("site", "unidad"):
            if kind == "site":
                sources = [{"nombre": s.name, "pct": sites.get(s.name, {}).get("pct_ventas")} for s in m.sites.all()]
            else:
                sources = [
                    {"nombre": unit_name.get(u, str(u)), "pct": by_unit.get(unit_name.get(u, ""), {}).get("pct_ventas")}
                    for u in directory.units_of(m)
                ]
            with_value = [f["pct"] for f in sources if f["pct"] is not None]
            computed = round(sum(with_value) / len(with_value), 2) if with_value else None
            manual = manual_compliances.get(m.person_id)
            value = manual if manual is not None else computed
            ind.factors[k] = value
            factors.append({
                **base, "factor": kind, "fuentes": sources, "calculado": computed, "manual": manual, "valor": value,
                "fuente": "manual" if manual is not None else (kind if computed is not None else None),
                "personal": personal.get(m.person_id) if m.role == "coord_oficina" else None,
            })

        if "escalon_crecimiento" in cond or "bono_churn" in cond:
            units = directory.units_of(m)
            row = by_unit.get(unit_name.get(units[0], ""), {}) if units else {}
            computed = row.get("crecimiento")
            manual = manual_growths.get(m.person_id)
            ind.growths[k] = manual if manual is not None else computed
            ind.churns[k] = row.get("churn_bruto")
            growths.append({
                **base, "unidades": [unit_name.get(u, str(u)) for u in units],
                "calculado": computed, "manual": manual, "valor": ind.growths[k],
                "fuente": "manual" if manual is not None else ("unidades de negocio" if computed is not None else None),
                "churn_bruto": ind.churns[k],
            })

    for uid, name in sorted(unit_name.items(), key=lambda kv: kv[1]):
        row = by_unit.get(name)
        if row is not None:
            ind.unit_inflows[uid] = row["pct_ingresos"]
            inflows.append({"unidad_id": uid, "unidad": name, "pct_ingresos": row["pct_ingresos"], "pct_ventas": row["pct_ventas"]})

    return ind, {
        "analizado": data is not None,
        "factores": factors,
        "crecimientos": growths,
        "ingresos_unidad": inflows,
        "empresa": (data or {}).get("empresa"),
    }


# --- El informe ------------------------------------------------------------------------

def build_report(period: CommissionPeriod) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)` de un periodo, calculado con los datos de hoy.

    `period_report` es lo que pinta la pagina (resumen, pagos, revision) y `ventas`
    el detalle de cada candidata, que se pide aparte por su tamano.

    Levanta `MissingCommissionColumns` si la tabla de suscripciones no tiene lo necesario.
    """
    key = period.period
    start, end = period.start, end_of(period)
    conditions = current_conditions()
    next_row = next_month(key)

    # Lo instalado en los dias promocionales del mes anterior pudo cobrarse
    # alli, si se adelanto el pago. Con el anterior cerrado lo dicen sus
    # ventas validas (`pagadas`); sin periodo anterior, se confirma a mano lo
    # que estaba pagado en su corte. Lo pagado despues, en su fecha, toca aqui
    # y no se revisa.
    previous = CommissionPeriod.objects.filter(period=previous_month(key)).first()
    first_period = previous is None
    cutoff = cutoff_of(period, conditions["dia_corte"])
    previous_cutoff = (cutoff_of(previous, conditions["dia_corte"]) if previous
                      else day_of_month(key, conditions["dia_corte"]))

    decisions = {r.order: r for r in CommissionReview.objects.filter(source_period=key)}
    added = {m.order: m for m in ManualSale.objects.filter(period=key)}
    compute_from = calculation_date(key, conditions["dias_espera"])

    paid = dict(
        CommissionSale.objects.filter(classification=VALID, period__status="cerrado")
        .exclude(period__period=key)
        .values_list("order", "period__period")
    )

    imported_on = invoices_imported_at()
    if imported_on is None:
        raise MissingCommissionColumns(
            "No hay facturas importadas. Carga el export de facturas en Importaciones › Suscripciones:"
            " sin él no se sabe qué primeras mensualidades se pagaron."
        )

    df = _read_candidates(start, end)
    in_window = set(df["orden_producto"].astype(str)) if not df.empty else set()
    outside = sorted(set(added) - in_window)
    if outside:
        df = pd.concat([df, read_orders(outside)], ignore_index=True)
    orders = df["orden_producto"].astype(str).tolist() if not df.empty else []
    invoices = read_invoices(orders)
    free_orders = _free_orders(df)
    cancelled_on = _cancelled_on(df)
    plans_by_tariff, plans_by_name = _plan_index()
    directory = _Directory()

    sales: list[dict[str, Any]] = []
    for row in df.itertuples(index=False):
        order = str(row.orden_producto)
        text = lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()  # noqa: E731

        plan = plans_by_tariff.get((text(row.producto), text(row.tarifa))) or plans_by_name.get(text(row.producto))
        pyme = bool(plan and plan.get("people") == "PYME")
        price = float(plan.get("price") or 0) if plan else 0.0
        decision = decisions.get(order)
        decided = decision.decision if decision else None
        manual = added.get(order)
        of_order = invoices.get(order, [])
        installment = first_installment([
            Invoice(
                f["numero"], f["estado"], f["estado_pago"], f["creado_el"], f["plan"],
                f.get("fecha_pago", ""), f.get("actualizado_el", ""),
            )
            for f in of_order
        ], until=cutoff)
        payment_day, payment_source = payment_date(installment)
        free = order in free_orders
        cancel_date = cancelled_on.get(order)
        installed = row.fecha if isinstance(row.fecha, date) else None
        without_month = cancelled_within_first_month(installed, cancel_date)
        part = (tier(installed, start, period.promo_start)
                 if installed is not None and start <= installed <= end else MANUAL)
        advanced = False
        # Primer periodo: pagada hasta el corte del mes anterior, pudo cobrarse alli.
        previous_advance = False

        data = (text(row.estado_factura), installment, plan["name"] if plan else "", free)
        sub_state = text(row.estado)
        # Lo que dicen las facturas se guarda aparte: con una decision, es por que se reviso.
        analysis_reason = classify(*data, subscription_state=sub_state, cancelled_without_month=without_month, cutoff=cutoff)[1]
        if order in paid:
            classification, reason = EXCLUDED, f"Ya se pagó en {paid[order]}"
            analysis_reason = reason
        elif manual:
            classification, reason = VALID, f"Agregada a mano: {manual.note}"
        else:
            classification, reason = classify(
                *data, decided if decided in (COUNT, DONT_COUNT) else None,
                subscription_state=sub_state, cancelled_without_month=without_month, cutoff=cutoff,
            )
            if part == PROMO:
                # Su comision es del siguiente salvo que adelantara el pago.
                advanced = classification == VALID and (decided == COUNT or paid_until(installment, cutoff))
                if not advanced:
                    classification = DEFERRED
                    reason = (f"Día promocional sin adelantar la mensualidad al {cutoff.strftime('%d/%m/%Y')}:"
                              f" toca en {next_row}")
            elif part == PREVIOUS_PROMO and first_period:
                previous_advance = paid_until(installment, previous_cutoff)
                if decided == ALREADY_PAID:
                    classification = EXCLUDED
                    reason = f"Ya cobrada en la comisión de {previous_month(key)}: adelantó la mensualidad"

        # Solo se confirma lo que adelanto el pago y pagaria aqui: lo que otra
        # regla ya resolvio (no pagada, excluida, decidida en Revision) no.
        to_confirm = previous_advance and decided is None and classification == VALID
        # Lo que se ve en «Dias promocionales del mes anterior»: lo que falta
        # confirmar y lo ya confirmado (para deshacerlo); con el anterior
        # cerrado, lo que se cobro alli.
        review_promo = part == PREVIOUS_PROMO and (
            to_confirm or decided in (ALREADY_PAID, NORMAL) or order in paid
        )

        people, warnings = directory.resolve(text(row.medio), text(row.medio_supervisor), text(row.vendedor))
        if plan is None:
            warnings.append(f"Producto «{text(row.producto)}» fuera del catálogo: se trata como residencial")

        sales.append({
            "orden": order,
            "cliente": text(row.cliente),
            "fecha_inicio": row.fecha.isoformat() if isinstance(row.fecha, date) else text(row.fecha_inicio),
            "sucursal": text(row.sucursal),
            "zona": text(row.zona),
            "producto": text(row.producto),
            "pyme": pyme,
            "precio": price,
            "pct_pyme": plan.get("comision_pyme_pct") if plan else None,
            "estado": text(row.estado),
            "estado_factura": text(row.estado_factura),
            "clasificacion": classification,
            "motivo": reason,
            "motivo_analisis": analysis_reason,
            "decision": decided,
            "nota_revision": decision.note if decision else "",
            "tramo": part,
            "manual": manual is not None,
            "nota_manual": manual.note if manual else "",
            "adelantada": advanced,
            "por_confirmar": to_confirm,
            "revisar_promo": review_promo,
            "gratuita": free,
            "cancelada_el": cancel_date.isoformat() if cancel_date else "",
            "facturas": len(of_order),
            "factura_numero": installment.number if installment else "",
            "factura_fecha": installment.created_at[:10] if installment else "",
            "factura_estado": installment.state if installment else "",
            "factura_pago": installment.payment_state if installment else "",
            "factura_plan": installment.plan if installment else "",
            "pago_fecha": payment_day,
            "pago_fuente": payment_source,
            "medio": text(row.medio),
            "medio_supervisor": text(row.medio_supervisor),
            "vendedor": text(row.vendedor),
            **people,
            "unidades": [directory.units.get(u, str(u)) for u in people["unidad_ids"]],
            "avisos": warnings,
        })

    indicators = {i.person_id: i for i in CommissionIndicator.objects.filter(period=key)}
    own = {pid: float(i.compliance_pct) for pid, i in indicators.items() if i.compliance_pct is not None}
    manual_growth = {pid: float(i.growth_pct) for pid, i in indicators.items() if i.growth_pct is not None}
    ind, ind_detail = _indicators(key, directory, conditions, own, manual_growth)
    factors = {(f["persona_id"], f["equipo"]): f for f in ind_detail["factores"]}
    growths = {(c["persona_id"], c["equipo"]): c for c in ind_detail["crecimientos"]}

    valid = [v for v in sales if v["clasificacion"] == VALID]
    payments = compute_payments(
        [
            Sale(
                order=v["orden"], pyme=v["pyme"], price=v["precio"], pct_pyme=v["pct_pyme"], team=v["equipo"],
                channel_id=v["medio_id"], supervisor_id=v["supervisor_id"], office_coord_id=v["coord_oficina_id"],
                unit_ids=tuple(v["unidad_ids"]), is_office=v["es_oficina"],
            )
            for v in valid
        ],
        directory.members(),
        conditions["equipos"],
        ind,
    )

    payment_rows = []
    for payment in payments:
        person = directory.people.get(payment.person_id)
        member = directory.by_key[(payment.person_id, payment.team)]
        k = (payment.person_id, payment.team)
        factor, growth = factors.get(k), growths.get(k)
        payment_rows.append({
            **payment_row(payment),
            "nombre": person.full_name if person else "",
            "medio": person.channel if person else "",
            "equipo_nombre": member.team.name,
            "cumplimiento_pct": ind.factors.get(k) if factor else None,
            "cumplimiento_propio": own.get(payment.person_id),
            # De donde sale el % aplicado y lo que se calculo, aunque no se use.
            "cumplimiento": factor,
            "crecimiento_pct": growth["valor"] if growth else None,
            "crecimiento_calculado": growth["calculado"] if growth else None,
            "crecimiento_fuente": growth["fuente"] if growth else None,
            "unidades": [directory.units.get(u, str(u)) for u in directory.units_of(member)],
            "site": ", ".join(s.name for s in member.sites.all()),
        })
    payment_rows.sort(key=lambda f: (f["equipo"], f["rol"], f["nombre"]))

    count = lambda c: sum(1 for v in sales if v["clasificacion"] == c)  # noqa: E731
    of_tier = lambda t: [v for v in sales if v["tramo"] == t]  # noqa: E731
    promo, previous_promo = of_tier(PROMO), of_tier(PREVIOUS_PROMO)
    today = date.today()
    period_report = {
        "periodo": key,
        "inicio": start.isoformat(),
        "fin": end.isoformat(),
        "inicio_promo": period.promo_start.isoformat(),
        "corte_adelantos": cutoff.isoformat(),
        "corte_anterior": previous_cutoff.isoformat(),
        # Sin periodo anterior, lo de sus dias promocionales se confirma a mano.
        "anterior": {"periodo": previous_month(key), "estado": previous.status if previous else None},
        # Sin la fecha del pago en el export, los adelantos se fechan por la ultima actualizacion o la creacion.
        "facturas_con_fecha_pago": invoices_have_payment_dates(),
        "estado": period.status,
        "calculo_desde": compute_from.isoformat(),
        "antes_de_tiempo": today < compute_from,
        "facturas_importadas_el": imported_on.isoformat(),
        # Va dentro del informe para que el cierre la congele con el resto.
        "tasa_conatel": conatel_rate_for(period),
        "resumen": {
            # Lo diferido es del periodo siguiente: aqui solo se informa.
            "candidatas": len(sales) - count(DEFERRED),
            "validas": count(VALID),
            "no_pagadas": count(UNPAID),
            "revision": count(REVIEW),
            "excluidas": count(EXCLUDED),
            "validas_pyme": sum(1 for v in valid if v["pyme"]),
            "validas_cambio_plan": sum(1 for v in valid if v["motivo"] == PLAN_CHANGE_REASON),
            "validas_sin_medio": sum(1 for v in valid if v["medio_id"] is None),
            "validas_sin_equipo": sum(1 for v in valid if not v["equipo"]),
            "diferidas": count(DEFERRED),
            "promo": len(promo),
            "adelantadas": sum(1 for v in promo if v["adelantada"]),
            "promo_anterior": len(previous_promo),
            "promo_anterior_cobradas": sum(
                1 for v in previous_promo if v["orden"] in paid or v["decision"] == ALREADY_PAID
            ),
            "promo_por_confirmar": sum(1 for v in sales if v["por_confirmar"]),
            "promo_anterior_revisar": sum(1 for v in sales if v["revisar_promo"]),
            "manuales": sum(1 for v in sales if v["manual"]),
            "bonos": round(sum(p["bono"] for p in payment_rows), 2),
            "total": round(sum(p["neto"] for p in payment_rows), 2),
        },
        "pagos": payment_rows,
        "indicadores": ind_detail,
        **_teams(sales, payment_rows, directory),
        # Las pendientes y las ya decididas, que se pueden deshacer.
        "revision": [
            v for v in sales if v["clasificacion"] == REVIEW or v["decision"] in (COUNT, DONT_COUNT)
        ],
        # Son pocas: viajan enteras, con las que ya no estan en suscripciones.
        "manuales": _manual_sales(added, sales),
        "pendientes_cierre": _pending_close(sales, payment_rows, previous, ind_detail),
    }
    return period_report, sales


def _manual_sales(added: dict[str, ManualSale], sales: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Las ventas agregadas a mano, con su clasificacion; `venta` nula si la orden ya no esta en suscripciones."""
    by_order = {v["orden"]: v for v in sales if v["manual"]}
    rows = []
    for order, m in sorted(added.items()):
        by = m.added_by
        rows.append({
            "orden": order,
            "nota": m.note,
            "agregado_por": (by.get_full_name() or by.get_username()) if by else "",
            "agregado_en": m.added_at.isoformat(),
            "venta": by_order.get(order),
        })
    return rows


def _teams(sales: list[dict[str, Any]], payments: list[dict[str, Any]], directory: _Directory) -> dict[str, Any]:
    """Quien vendio con quien, para agrupar la nomina por equipos y supervisores.

    Una fila por combinacion de equipo, oficina, supervisor y quien vendio, con
    sus ventas validas: `ventas` (residenciales) y `pyme`. Es lo que permite
    asignar cada asesor al supervisor con el que mas vende sin mandar las miles
    de ventas: un mes son unos cientos de combinaciones. Un id nulo es que la
    venta no trae esa columna o trae un nombre sin registrar.

    `personas` da nombre y papeles a cada id (con su superior y sus unidades),
    porque no todos cobran: un supervisor sin pago no esta en `pagos`.
    """
    rows: dict[tuple, dict[str, Any]] = {}
    for v in sales:
        if v["clasificacion"] != VALID:
            continue
        key = (v["equipo"], v["coord_oficina_id"], v["supervisor_id"], v["medio_id"])
        row = rows.setdefault(key, {
            "equipo": key[0], "coord_oficina_id": key[1], "supervisor_id": key[2], "medio_id": key[3],
            "ventas": 0, "pyme": 0,
        })
        row["pyme" if v["pyme"] else "ventas"] += 1
    ids = {i for key in rows for i in key[1:] if i is not None} | {p["persona_id"] for p in payments}
    return {
        "equipos": list(rows.values()),
        "personas": {
            str(i): {
                "nombre": directory.name(i),
                "papeles": [
                    {
                        "equipo": m.team.slug,
                        "rol": m.role,
                        "superior_id": directory.by_id[m.manager_id].person_id if m.manager_id in directory.by_id else None,
                        "unidades": [directory.units.get(u, str(u)) for u in directory.units_of(m)],
                        "site": ", ".join(s.name for s in m.sites.all()),
                    }
                    for m in directory.of_person.get(i, [])
                ],
            }
            for i in sorted(ids)
        },
    }


def _pending_close(
    sales: list[dict[str, Any]], payments: list[dict[str, Any]], previous: CommissionPeriod | None,
    indicators: dict[str, Any],
) -> list[str]:
    """Lo que impide cerrar el periodo. Vacio: se puede cerrar."""
    pending = []
    if previous is not None and not previous.is_closed:
        pending.append(
            f"El periodo {previous.period} sigue en borrador: ciérralo antes, porque lo que cobre de los"
            " días promocionales ya no cuenta en este"
        )
    review = sum(1 for v in sales if v["clasificacion"] == REVIEW)
    if review:
        pending.append(f"{review} venta(s) por facturar sin decidir en Revisión")
    to_confirm = sum(1 for v in sales if v["por_confirmar"])
    if to_confirm:
        pending.append(
            f"{to_confirm} instalación(es) de los días promocionales del mes anterior sin confirmar si ya se cobraron"
        )
    without_compliance = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in payments
        if p["detalle"].get("factor") and p["cumplimiento_pct"] is None and p["bruto"]
    ]
    if without_compliance:
        pending.append(
            "Cumplimiento sin definir (sin site ni unidad con % calculado: escríbelo en Indicadores): "
            + ", ".join(without_compliance)
        )
    without_growth = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in payments
        if "monto_por_venta_equipo" not in p["detalle"] and p["rol"] == "coord_un" and p["ventas_equipo"]
    ]
    if without_growth:
        pending.append("Crecimiento desconocido: " + ", ".join(without_growth))
    # Los que solo salen del analisis del mes: sin el, no hay a quien pagarle el bono.
    missing = ("Churn de su unidad desconocido", "de la empresa desconocido", "sin % de ingresos")
    without_analysis = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in payments if any(t in a for a in p["avisos"] for t in missing)
    ]
    if without_analysis:
        pending.append(
            "Faltan indicadores del mes para sus bonos (analiza el mes en Subscriptions): " + ", ".join(without_analysis)
        )
    return pending
