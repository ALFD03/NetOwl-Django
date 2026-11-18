"""El informe de comisiones de un periodo: de las suscripciones a lo que cobra cada uno.

1. **Candidatas**: las suscripciones instaladas (`fecha_inicio`) dentro de la
   ventana del periodo —del inicio de los dias promocionales del mes anterior
   al fin del mes—, menos las ya pagadas en un periodo cerrado, mas las
   agregadas a mano (`VentaManual`). Lo instalado en los dias promocionales
   del mes solo cuenta si el cliente adelanto la primera mensualidad antes del
   corte (`cutoff_of`); si no, es del periodo siguiente (`DIFERIDA`). Lo de los
   del mes anterior, en el primer periodo del sistema, se confirma a mano: pudo
   cobrarse ya en el anterior, fuera del sistema.
2. **Clasificacion** (`rules.clasificar`): por su primera mensualidad —la
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
   negocio, la de la cadena supervisor → su superior (`MembresiaEquipo.superior`).
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
from dataclasses import asdict
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
    CondicionesEquipo,
    EquipoVentas,
    MembresiaEquipo,
    PersonaVentas,
)
from services.catalogs.teams import ROLES, ROLES_BY_TEAM, current_parameters
from services.commissions.models import (
    ComisionPeriodo,
    ComisionVenta,
    CondicionesComision,
    IndicadorComision,
    RevisionComision,
    VentaManual,
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
from services.subscriptions.models import Coordinador

from .payments import Indicadores, Member, Venta, compute_payments
from .rules import (
    ALREADY_PAID,
    COUNT,
    DIFERIDA,
    DONT_COUNT,
    EXCLUIDA,
    MANUAL,
    NORMAL,
    PLAN_CHANGE_REASON,
    PREVIOUS_PROMO,
    PROMO,
    REVIEW,
    UNPAID,
    VALID,
    Factura,
    cancelled_within_first_month,
    clasificar,
    first_installment,
    paid_until,
    payment_date,
    tramo,
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

def previous_month(periodo: str) -> str:
    """`YYYY-MM` del mes anterior."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio - 1}-12" if mes == 1 else f"{anio}-{mes - 1:02d}"


def next_month(periodo: str) -> str:
    """`YYYY-MM` del mes siguiente."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio + 1}-01" if mes == 12 else f"{anio}-{mes + 1:02d}"


def tasa_conatel(periodo: ComisionPeriodo) -> dict[str, Any]:
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
    mes = next_month(periodo.periodo)
    primero = day_of_month(mes, 1)
    without_rate = {"mes": mes, "dia": primero.isoformat(), "tasa": None, "fuente": ""}
    if periodo.tasa_conatel is None:
        if primero > date.today():
            return {**without_rate, "aviso": f"Se conoce a partir del {primero.strftime('%d/%m/%Y')}."}
        try:
            tasa, publicada = fetch_rate_on(primero)
        except RateUnavailable as e:
            return {**without_rate, "aviso": str(e)}
        periodo.tasa_conatel = Decimal(str(tasa))
        periodo.tasa_conatel_publicada = publicada
        periodo.save(update_fields=["tasa_conatel", "tasa_conatel_publicada"])

    publicada = periodo.tasa_conatel_publicada
    fuente = f"BCV {publicada.strftime('%d/%m/%Y')}" if publicada else "BCV"
    if publicada and publicada != primero:
        fuente += f", vigente el {primero.strftime('%d/%m/%Y')} (ese día no hubo publicación)"
    fuente += " · ve.dolarapi.com"
    return {**without_rate, "tasa": float(periodo.tasa_conatel), "fuente": fuente, "aviso": ""}


def day_of_month(periodo: str, dia: int) -> date:
    """El dia `dia` del mes, recortado al ultimo si el mes es mas corto."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return date(anio, mes, min(dia, calendar.monthrange(anio, mes)[1]))


def calculation_date(periodo: str, dias_espera: int) -> date:
    """Desde cuando tiene sentido calcular: `dias_espera` dias tras el fin del mes.

    Es lo que tardan las primeras facturas de lo instalado en pagarse: lo del
    25 de agosto al 24 de septiembre se paga el 15 de octubre.
    """
    anio, mes = (int(x) for x in periodo.split("-"))
    return date(anio, mes, calendar.monthrange(anio, mes)[1]) + timedelta(days=dias_espera)


def end_of(periodo: ComisionPeriodo) -> date:
    """El ultimo dia de instalacion que puede contar: el fin del mes.

    Lo instalado desde `inicio_promo` solo cuenta si se adelanto el pago.
    """
    anio, mes = (int(x) for x in periodo.periodo.split("-"))
    return date(anio, mes, calendar.monthrange(anio, mes)[1])


def cutoff_of(periodo: ComisionPeriodo, dia_corte: int) -> date:
    """Hasta que dia un pago adelantado cuenta en el periodo.

    El escrito en el periodo, o el `dia_corte` (22) del mes siguiente: es
    cuando se saca el informe, y lo que se pague despues ya va al siguiente.
    """
    return periodo.corte_adelantos or day_of_month(next_month(periodo.periodo), dia_corte)


# --- Condiciones ------------------------------------------------------------------

def current_conditions() -> dict[str, Any]:
    """Las condiciones actuales: la ventana de pago y las de cada rol de cada equipo.

    `equipos` es `{equipo: {rol: parametros}}`, con lo guardado completado con la
    politica por defecto (`teams.current_parameters`); `nombres`, el nombre de
    cada equipo, para que la copia que congela un cierre se explique sola.
    """
    c = CondicionesComision.actual()
    guardadas = {(f.equipo.slug, f.rol): f.parametros for f in CondicionesEquipo.objects.select_related("equipo")}
    return {
        "dia_promocional": c.dia_promocional,
        "dias_espera": c.dias_espera,
        "dia_corte": c.dia_corte,
        "equipos": {
            slug: {rol: current_parameters(slug, rol, guardadas.get((slug, rol))) for rol in roles}
            for slug, roles in ROLES_BY_TEAM.items()
        },
        "nombres": dict(EquipoVentas.objects.values_list("slug", "nombre")),
    }


# --- Lectura -----------------------------------------------------------------------

def _read(donde: str, params: list) -> pd.DataFrame:
    """Las suscripciones que cumplen `donde`, con la fecha de instalacion leida en `fecha`."""
    db = DBConnector()
    table = f'"{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"'
    # Las columnas siempre existen; lo que dice si el export las traía es que tengan algún valor.
    loaded = db.query(
        "SELECT " + ", ".join(f"bool_or({c} IS NOT NULL) AS {c}" for c in REQUIRED_COLUMNS) + f" FROM {table}"
    ).iloc[0]
    faltan = [titulo for col, titulo in REQUIRED_COLUMNS.items() if loaded[col] is not None and not loaded[col]]
    if faltan:
        raise MissingCommissionColumns(
            "La tabla de suscripciones no trae "
            + ", ".join(f"«{t}»" for t in faltan)
            + ". Vuelve a importar las suscripciones con un export que incluya esas columnas."
        )

    df = db.query(
        f"""
        SELECT orden_producto, cliente, sucursal, zona, estado, fecha_inicio,
               producto, tarifa, total, vendedor, medio, medio_supervisor, estado_factura, activo
        FROM {table}
        WHERE {donde}
        """,
        params=params,
    )
    if df.empty:
        return df
    df["fecha"] = pd.to_datetime(df["fecha_inicio"], errors="coerce").dt.date
    return df


def _read_candidates(inicio: date, fin: date) -> pd.DataFrame:
    """Las suscripciones instaladas en la ventana."""
    return _read("fecha_inicio BETWEEN %s AND %s", [inicio, fin])


def read_orders(ordenes: list[str]) -> pd.DataFrame:
    """Las suscripciones de esas ordenes, esten instaladas cuando esten: las agregadas a mano."""
    if not ordenes:
        return pd.DataFrame()
    return _read("orden_producto = ANY(%s)", [ordenes])


def _free_orders(df: pd.DataFrame) -> set[str]:
    """Las candidatas que hoy son gratuitas, y por eso no pagan comision.

    Con la misma evidencia que el analisis mensual: archivada en el export
    (`activo` falso), una tarifa «Gratis», o un «Suscripción archivada» como
    ultimo log de archivado (sin un «desarchivada» despues).
    """
    if df.empty:
        return set()
    ordenes = df["orden_producto"].astype(str)
    gratuita = df["tarifa"].map(_is_free_tariff) | parse_archived(df["activo"])
    resultado = set(ordenes[gratuita.to_numpy()])

    logs = DBConnector().query(
        f"""
        SELECT orden, log, fecha_log
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_LOGS}"
        WHERE orden = ANY(%s) AND log ILIKE %s
        ORDER BY orden, fecha_log
        """,
        params=[ordenes.tolist(), "%archivada%"],
    )
    for orden, grupo in logs.groupby("orden", sort=False):
        ultimo = normalize_text(grupo["log"].iloc[-1])
        if ARCHIVED_EVENT in ultimo and UNARCHIVED_EVENT not in ultimo:
            resultado.add(str(orden))
    return resultado


def _cancelled_on(df: pd.DataFrame) -> dict[str, date]:
    """El dia en que se cancelo cada candidata que hoy esta «Cancelado».

    Es el comienzo de su ultimo tramo cancelado en `subscriptions-logs`: el
    primer log de la racha final con estado `6_churn`. Una cancelada sin ese
    log se queda sin fecha (y entonces no se excluye por durar poco).
    """
    if df.empty:
        return {}
    canceladas = df.loc[df["estado"].map(normalize_text) == "cancelado", "orden_producto"].astype(str).tolist()
    if not canceladas:
        return {}
    logs = DBConnector().query(
        f"""
        SELECT orden, fecha_log, estado
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_LOGS}"
        WHERE orden = ANY(%s)
        ORDER BY orden, fecha_log
        """,
        params=[canceladas],
    )
    fechas: dict[str, date] = {}
    for orden, grupo in logs.groupby("orden", sort=False):
        inicio = None
        for fila in grupo.itertuples(index=False):
            if fila.estado == CANCELLED_LOG:
                inicio = inicio or fila.fecha_log
            else:
                inicio = None
        dia = parse_date(inicio) if inicio else None
        if dia is not None and not pd.isna(dia):
            fechas[str(orden)] = pd.Timestamp(dia).date()
    return fechas


def _plan_index() -> tuple[dict[tuple[str, str], dict], dict[str, dict]]:
    """Los planes del catalogo por (nombre, tarifa) y por nombre (gana el ultimo)."""
    by_tariff: dict[tuple[str, str], dict] = {}
    by_name: dict[str, dict] = {}
    for plan in fixtures.planes():
        by_tariff[(plan["name"], plan.get("tarifa") or "")] = plan
        by_name[plan["name"]] = plan
    return by_tariff, by_name


class _Directory:
    """El directorio de ventas y la estructura de los equipos, indexados para resolver cada venta."""

    def __init__(self):
        self.personas = {p.id: p for p in PersonaVentas.objects.prefetch_related("alias")}
        self.membresias = list(
            MembresiaEquipo.objects.select_related("persona", "equipo", "superior")
            .prefetch_related("unidades", "sites")
            .order_by("equipo__orden", "rol", "persona__nombre", "persona__apellido")
        )
        self.by_key = {(m.persona_id, m.equipo.slug): m for m in self.membresias}
        self.by_id = {m.id: m for m in self.membresias}
        self.of_person: dict[int, list[MembresiaEquipo]] = {}
        for m in self.membresias:
            self.of_person.setdefault(m.persona_id, []).append(m)
        # Una persona puede estar escrita de varias formas (con y sin tilde): cada una apunta a ella.
        # Odoo a veces la escribe distinto como supervisor.
        self.by_channel = {k: p for p in self.personas.values() for k in p.claves("medio")}
        self.by_supervisor = {k: p for p in self.personas.values() for k in p.claves("supervisor")}
        self.by_user = {k: p for p in self.personas.values() for k in p.claves("usuario")}
        self.unidades = dict(Coordinador.objects.values_list("id", "nombre"))

    def nombre(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.nombre_completo if persona else ""

    def miembros(self) -> dict[tuple[int, str], Member]:
        """Las membresias como las lee el motor de pagos."""
        return {
            clave: Member(m.persona_id, m.equipo.slug, m.rol, tuple(sorted(u.id for u in m.unidades.all())))
            for clave, m in self.by_key.items()
        }

    def units_of(self, m: MembresiaEquipo | None) -> tuple[int, ...]:
        """Las unidades de negocio de una membresia: las que lleva, o las de su superior.

        El coordinador de UN lleva una; el jefe y los gerentes, varias; un
        supervisor no lleva ninguna y hereda las de a quien responde.
        """
        if m is None:
            return ()
        if ROLES[m.rol].get("unidades"):
            return tuple(sorted(u.id for u in m.unidades.all()))
        superior = self.by_id.get(m.superior_id) if m.superior_id is not None else None
        return self.units_of(superior) if superior is not None and superior.id != m.id else ()

    def _team_of(self, *personas: int | None) -> tuple[str, str | None]:
        """El equipo de una venta, y un aviso si no esta claro.

        Es el del `Medio`; si no esta registrado en ningun equipo, el de su
        supervisor, y luego el de su `Vendedor`. Quien esta en varios (el
        gerente de operaciones) se desempata con el equipo de los demas de la venta.
        """
        with_team = [
            [m.equipo.slug for m in self.of_person.get(pid, [])] for pid in personas if pid is not None
        ]
        with_team = [e for e in with_team if e]
        if not with_team:
            return "", None
        primeros = with_team[0]
        if len(primeros) == 1:
            return primeros[0], None
        comunes = [e for e in primeros if all(e in otros for otros in with_team[1:])]
        if len(comunes) == 1:
            return comunes[0], None
        return (comunes or primeros)[0], "Quien vendió está en varios equipos y no se pudo saber de cuál es la venta"

    def resolver(self, medio: str, supervisor: str, vendedor: str) -> tuple[dict[str, Any], list[str]]:
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
        avisos: list[str] = []

        def buscar(literal: str, indice: dict, columna: str) -> int | None:
            if not literal:
                return None
            persona = indice.get(name_key(literal))
            if persona is None:
                avisos.append(f"{columna} «{literal}» no está en el directorio")
                return None
            return persona.id

        medio_id = buscar(medio, self.by_channel, "Medio")
        supervisor_id = buscar(supervisor, self.by_supervisor, "Supervisor")
        office_id = buscar(vendedor, self.by_user, "Vendedor")

        equipo, aviso = self._team_of(medio_id, supervisor_id, office_id)
        if aviso:
            avisos.append(aviso)
        if not equipo and any(i is not None for i in (medio_id, supervisor_id, office_id)):
            avisos.append("Ninguna de las personas de la venta tiene un papel en un equipo: no se paga")

        def papel(persona_id: int | None) -> MembresiaEquipo | None:
            return self.by_key.get((persona_id, equipo)) if persona_id is not None and equipo else None

        if supervisor_id is not None:
            unidades = self.units_of(papel(supervisor_id))
        elif not supervisor:
            unidades = self.units_of(papel(medio_id))
        else:
            unidades = ()
        quien = papel(medio_id)
        for etiqueta, pid in (("Medio", medio_id), ("Supervisor", supervisor_id), ("Vendedor", office_id)):
            if equipo and pid is not None and papel(pid) is None:
                avisos.append(f"{etiqueta} «{self.nombre(pid)}» no tiene papel en el equipo de la venta")
        return {
            "medio_id": medio_id,
            "supervisor_id": supervisor_id,
            "coord_oficina_id": office_id,
            "equipo": equipo,
            "unidad_ids": list(unidades),
            "es_oficina": bool(quien and quien.rol == "coord_oficina"),
        }, avisos


def _indicators(
    clave: str,
    directorio: _Directory,
    condiciones: dict[str, Any],
    cumplimientos_manuales: dict[int, float],
    crecimientos_manuales: dict[int, float],
) -> tuple[Indicadores, dict[str, Any]]:
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
        datos = month_indicators(clave)
    except Exception:
        logger.exception("No se pudieron calcular los cumplimientos de %s", clave)
        datos = None
    sites = (datos or {}).get("sites", {})
    by_unit = (datos or {}).get("unidades", {})
    unit_name = directorio.unidades

    personales = {}
    if any(m.rol == "coord_oficina" for m in directorio.membresias):
        for c in get_office_coordinators(clave):
            propias = sum(c["propias_dia"])
            personales[c["id"]] = {
                "ventas": propias,
                "objetivo": c["objetivo"],
                "pct": round(propias / c["objetivo"] * 100, 2) if c["objetivo"] else None,
            }

    ind = Indicadores(pct_empresa=((datos or {}).get("empresa") or {}).get("pct_ventas"))
    factores, crecimientos, ingresos = [], [], []

    def piezas(m: MembresiaEquipo) -> dict[str, Any]:
        return condiciones["equipos"].get(m.equipo.slug, {}).get(m.rol, {})

    for m in directorio.membresias:
        cond = piezas(m)
        k = (m.persona_id, m.equipo.slug)
        base = {"persona_id": m.persona_id, "equipo": m.equipo.slug, "rol": m.rol, "nombre": m.persona.nombre_completo}

        tipo = cond.get("factor")
        if tipo in ("site", "unidad"):
            if tipo == "site":
                fuentes = [{"nombre": s.nombre, "pct": sites.get(s.nombre, {}).get("pct_ventas")} for s in m.sites.all()]
            else:
                fuentes = [
                    {"nombre": unit_name.get(u, str(u)), "pct": by_unit.get(unit_name.get(u, ""), {}).get("pct_ventas")}
                    for u in directorio.units_of(m)
                ]
            with_value = [f["pct"] for f in fuentes if f["pct"] is not None]
            calculado = round(sum(with_value) / len(with_value), 2) if with_value else None
            manual = cumplimientos_manuales.get(m.persona_id)
            valor = manual if manual is not None else calculado
            ind.factores[k] = valor
            factores.append({
                **base, "factor": tipo, "fuentes": fuentes, "calculado": calculado, "manual": manual, "valor": valor,
                "fuente": "manual" if manual is not None else (tipo if calculado is not None else None),
                "personal": personales.get(m.persona_id) if m.rol == "coord_oficina" else None,
            })

        if "escalon_crecimiento" in cond or "bono_churn" in cond:
            unidades = directorio.units_of(m)
            fila = by_unit.get(unit_name.get(unidades[0], ""), {}) if unidades else {}
            calculado = fila.get("crecimiento")
            manual = crecimientos_manuales.get(m.persona_id)
            ind.crecimientos[k] = manual if manual is not None else calculado
            ind.churns[k] = fila.get("churn_bruto")
            crecimientos.append({
                **base, "unidades": [unit_name.get(u, str(u)) for u in unidades],
                "calculado": calculado, "manual": manual, "valor": ind.crecimientos[k],
                "fuente": "manual" if manual is not None else ("unidades de negocio" if calculado is not None else None),
                "churn_bruto": ind.churns[k],
            })

    for uid, nombre in sorted(unit_name.items(), key=lambda kv: kv[1]):
        fila = by_unit.get(nombre)
        if fila is not None:
            ind.ingresos_unidad[uid] = fila["pct_ingresos"]
            ingresos.append({"unidad_id": uid, "unidad": nombre, "pct_ingresos": fila["pct_ingresos"], "pct_ventas": fila["pct_ventas"]})

    return ind, {
        "analizado": datos is not None,
        "factores": factores,
        "crecimientos": crecimientos,
        "ingresos_unidad": ingresos,
        "empresa": (datos or {}).get("empresa"),
    }


# --- El informe ------------------------------------------------------------------------

def build_report(periodo: ComisionPeriodo) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)` de un periodo, calculado con los datos de hoy.

    `informe` es lo que pinta la pagina (resumen, pagos, revision) y `ventas`
    el detalle de cada candidata, que se pide aparte por su tamano.

    Levanta `MissingCommissionColumns` si la tabla de suscripciones no tiene lo necesario.
    """
    clave = periodo.periodo
    inicio, fin = periodo.inicio, end_of(periodo)
    condiciones = current_conditions()
    siguiente = next_month(clave)

    # Lo instalado en los dias promocionales del mes anterior pudo cobrarse
    # alli, si se adelanto el pago. Con el anterior cerrado lo dicen sus
    # ventas validas (`pagadas`); sin periodo anterior, se confirma a mano lo
    # que estaba pagado en su corte. Lo pagado despues, en su fecha, toca aqui
    # y no se revisa.
    anterior = ComisionPeriodo.objects.filter(periodo=previous_month(clave)).first()
    first_period = anterior is None
    corte = cutoff_of(periodo, condiciones["dia_corte"])
    corte_anterior = (cutoff_of(anterior, condiciones["dia_corte"]) if anterior
                      else day_of_month(clave, condiciones["dia_corte"]))

    decisiones = {r.orden: r for r in RevisionComision.objects.filter(periodo_origen=clave)}
    agregadas = {m.orden: m for m in VentaManual.objects.filter(periodo=clave)}
    calculo_desde = calculation_date(clave, condiciones["dias_espera"])

    pagadas = dict(
        ComisionVenta.objects.filter(clasificacion=VALID, periodo__estado="cerrado")
        .exclude(periodo__periodo=clave)
        .values_list("orden", "periodo__periodo")
    )

    imported_on = invoices_imported_at()
    if imported_on is None:
        raise MissingCommissionColumns(
            "No hay facturas importadas. Carga el export de facturas en Importaciones › Suscripciones:"
            " sin él no se sabe qué primeras mensualidades se pagaron."
        )

    df = _read_candidates(inicio, fin)
    in_window = set(df["orden_producto"].astype(str)) if not df.empty else set()
    fuera = sorted(set(agregadas) - in_window)
    if fuera:
        df = pd.concat([df, read_orders(fuera)], ignore_index=True)
    ordenes = df["orden_producto"].astype(str).tolist() if not df.empty else []
    facturas = read_invoices(ordenes)
    free_orders = _free_orders(df)
    cancelled_on = _cancelled_on(df)
    plans_by_tariff, plans_by_name = _plan_index()
    directorio = _Directory()

    ventas: list[dict[str, Any]] = []
    for fila in df.itertuples(index=False):
        orden = str(fila.orden_producto)
        texto = lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()  # noqa: E731

        plan = plans_by_tariff.get((texto(fila.producto), texto(fila.tarifa))) or plans_by_name.get(texto(fila.producto))
        pyme = bool(plan and plan.get("people") == "PYME")
        precio = float(plan.get("price") or 0) if plan else 0.0
        decision = decisiones.get(orden)
        decidido = decision.decision if decision else None
        manual = agregadas.get(orden)
        of_order = facturas.get(orden, [])
        mensualidad = first_installment([
            Factura(
                f["numero"], f["estado"], f["estado_pago"], f["creado_el"], f["plan"],
                f.get("fecha_pago", ""), f.get("actualizado_el", ""),
            )
            for f in of_order
        ], hasta=corte)
        payment_day, pago_fuente = payment_date(mensualidad)
        gratuita = orden in free_orders
        cancelada_el = cancelled_on.get(orden)
        instalada = fila.fecha if isinstance(fila.fecha, date) else None
        without_month = cancelled_within_first_month(instalada, cancelada_el)
        parte = (tramo(instalada, inicio, periodo.inicio_promo)
                 if instalada is not None and inicio <= instalada <= fin else MANUAL)
        adelantada = False
        # Primer periodo: pagada hasta el corte del mes anterior, pudo cobrarse alli.
        previous_advance = False

        datos = (texto(fila.estado_factura), mensualidad, plan["name"] if plan else "", gratuita)
        sub_state = texto(fila.estado)
        # Lo que dicen las facturas se guarda aparte: con una decision, es por que se reviso.
        motivo_analisis = clasificar(*datos, estado_suscripcion=sub_state, cancelled_without_month=without_month, corte=corte)[1]
        if orden in pagadas:
            clasificacion, motivo = EXCLUIDA, f"Ya se pagó en {pagadas[orden]}"
            motivo_analisis = motivo
        elif manual:
            clasificacion, motivo = VALID, f"Agregada a mano: {manual.nota}"
        else:
            clasificacion, motivo = clasificar(
                *datos, decidido if decidido in (COUNT, DONT_COUNT) else None,
                estado_suscripcion=sub_state, cancelled_without_month=without_month, corte=corte,
            )
            if parte == PROMO:
                # Su comision es del siguiente salvo que adelantara el pago.
                adelantada = clasificacion == VALID and (decidido == COUNT or paid_until(mensualidad, corte))
                if not adelantada:
                    clasificacion = DIFERIDA
                    motivo = (f"Día promocional sin adelantar la mensualidad al {corte.strftime('%d/%m/%Y')}:"
                              f" toca en {siguiente}")
            elif parte == PREVIOUS_PROMO and first_period:
                previous_advance = paid_until(mensualidad, corte_anterior)
                if decidido == ALREADY_PAID:
                    clasificacion = EXCLUIDA
                    motivo = f"Ya cobrada en la comisión de {previous_month(clave)}: adelantó la mensualidad"

        # Solo se confirma lo que adelanto el pago y pagaria aqui: lo que otra
        # regla ya resolvio (no pagada, excluida, decidida en Revision) no.
        por_confirmar = previous_advance and decidido is None and clasificacion == VALID
        # Lo que se ve en «Dias promocionales del mes anterior»: lo que falta
        # confirmar y lo ya confirmado (para deshacerlo); con el anterior
        # cerrado, lo que se cobro alli.
        revisar_promo = parte == PREVIOUS_PROMO and (
            por_confirmar or decidido in (ALREADY_PAID, NORMAL) or orden in pagadas
        )

        personas, avisos = directorio.resolver(texto(fila.medio), texto(fila.medio_supervisor), texto(fila.vendedor))
        if plan is None:
            avisos.append(f"Producto «{texto(fila.producto)}» fuera del catálogo: se trata como residencial")

        ventas.append({
            "orden": orden,
            "cliente": texto(fila.cliente),
            "fecha_inicio": fila.fecha.isoformat() if isinstance(fila.fecha, date) else texto(fila.fecha_inicio),
            "sucursal": texto(fila.sucursal),
            "zona": texto(fila.zona),
            "producto": texto(fila.producto),
            "pyme": pyme,
            "precio": precio,
            "pct_pyme": plan.get("comision_pyme_pct") if plan else None,
            "estado": texto(fila.estado),
            "estado_factura": texto(fila.estado_factura),
            "clasificacion": clasificacion,
            "motivo": motivo,
            "motivo_analisis": motivo_analisis,
            "decision": decidido,
            "nota_revision": decision.nota if decision else "",
            "tramo": parte,
            "manual": manual is not None,
            "nota_manual": manual.nota if manual else "",
            "adelantada": adelantada,
            "por_confirmar": por_confirmar,
            "revisar_promo": revisar_promo,
            "gratuita": gratuita,
            "cancelada_el": cancelada_el.isoformat() if cancelada_el else "",
            "facturas": len(of_order),
            "factura_numero": mensualidad.numero if mensualidad else "",
            "factura_fecha": mensualidad.creado_el[:10] if mensualidad else "",
            "factura_estado": mensualidad.estado if mensualidad else "",
            "factura_pago": mensualidad.estado_pago if mensualidad else "",
            "factura_plan": mensualidad.plan if mensualidad else "",
            "pago_fecha": payment_day,
            "pago_fuente": pago_fuente,
            "medio": texto(fila.medio),
            "medio_supervisor": texto(fila.medio_supervisor),
            "vendedor": texto(fila.vendedor),
            **personas,
            "unidades": [directorio.unidades.get(u, str(u)) for u in personas["unidad_ids"]],
            "avisos": avisos,
        })

    manuales_ind = {i.persona_id: i for i in IndicadorComision.objects.filter(periodo=clave)}
    propios = {pid: float(i.cumplimiento_pct) for pid, i in manuales_ind.items() if i.cumplimiento_pct is not None}
    manuales = {pid: float(i.crecimiento_pct) for pid, i in manuales_ind.items() if i.crecimiento_pct is not None}
    ind, ind_detail = _indicators(clave, directorio, condiciones, propios, manuales)
    factores = {(f["persona_id"], f["equipo"]): f for f in ind_detail["factores"]}
    crecimientos = {(c["persona_id"], c["equipo"]): c for c in ind_detail["crecimientos"]}

    validas = [v for v in ventas if v["clasificacion"] == VALID]
    pagos = compute_payments(
        [
            Venta(
                orden=v["orden"], pyme=v["pyme"], precio=v["precio"], pct_pyme=v["pct_pyme"], equipo=v["equipo"],
                medio_id=v["medio_id"], supervisor_id=v["supervisor_id"], coord_oficina_id=v["coord_oficina_id"],
                unidad_ids=tuple(v["unidad_ids"]), es_oficina=v["es_oficina"],
            )
            for v in validas
        ],
        directorio.miembros(),
        condiciones["equipos"],
        ind,
    )

    payment_rows = []
    for pago in pagos:
        persona = directorio.personas.get(pago.persona_id)
        miembro = directorio.by_key[(pago.persona_id, pago.equipo)]
        k = (pago.persona_id, pago.equipo)
        factor, crecimiento = factores.get(k), crecimientos.get(k)
        payment_rows.append({
            **asdict(pago),
            "nombre": persona.nombre_completo if persona else "",
            "medio": persona.medio if persona else "",
            "equipo_nombre": miembro.equipo.nombre,
            "cumplimiento_pct": ind.factores.get(k) if factor else None,
            "cumplimiento_propio": propios.get(pago.persona_id),
            # De donde sale el % aplicado y lo que se calculo, aunque no se use.
            "cumplimiento": factor,
            "crecimiento_pct": crecimiento["valor"] if crecimiento else None,
            "crecimiento_calculado": crecimiento["calculado"] if crecimiento else None,
            "crecimiento_fuente": crecimiento["fuente"] if crecimiento else None,
            "unidades": [directorio.unidades.get(u, str(u)) for u in directorio.units_of(miembro)],
            "site": ", ".join(s.nombre for s in miembro.sites.all()),
        })
    payment_rows.sort(key=lambda f: (f["equipo"], f["rol"], f["nombre"]))

    conteo = lambda c: sum(1 for v in ventas if v["clasificacion"] == c)  # noqa: E731
    of_tier = lambda t: [v for v in ventas if v["tramo"] == t]  # noqa: E731
    promo, promo_anterior = of_tier(PROMO), of_tier(PREVIOUS_PROMO)
    hoy = date.today()
    informe = {
        "periodo": clave,
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat(),
        "inicio_promo": periodo.inicio_promo.isoformat(),
        "corte_adelantos": corte.isoformat(),
        "corte_anterior": corte_anterior.isoformat(),
        # Sin periodo anterior, lo de sus dias promocionales se confirma a mano.
        "anterior": {"periodo": previous_month(clave), "estado": anterior.estado if anterior else None},
        # Sin la fecha del pago en el export, los adelantos se fechan por la ultima actualizacion o la creacion.
        "facturas_con_fecha_pago": invoices_have_payment_dates(),
        "estado": periodo.estado,
        "calculo_desde": calculo_desde.isoformat(),
        "antes_de_tiempo": hoy < calculo_desde,
        "facturas_importadas_el": imported_on.isoformat(),
        # Va dentro del informe para que el cierre la congele con el resto.
        "tasa_conatel": tasa_conatel(periodo),
        "resumen": {
            # Lo diferido es del periodo siguiente: aqui solo se informa.
            "candidatas": len(ventas) - conteo(DIFERIDA),
            "validas": conteo(VALID),
            "no_pagadas": conteo(UNPAID),
            "revision": conteo(REVIEW),
            "excluidas": conteo(EXCLUIDA),
            "validas_pyme": sum(1 for v in validas if v["pyme"]),
            "validas_cambio_plan": sum(1 for v in validas if v["motivo"] == PLAN_CHANGE_REASON),
            "validas_sin_medio": sum(1 for v in validas if v["medio_id"] is None),
            "validas_sin_equipo": sum(1 for v in validas if not v["equipo"]),
            "diferidas": conteo(DIFERIDA),
            "promo": len(promo),
            "adelantadas": sum(1 for v in promo if v["adelantada"]),
            "promo_anterior": len(promo_anterior),
            "promo_anterior_cobradas": sum(
                1 for v in promo_anterior if v["orden"] in pagadas or v["decision"] == ALREADY_PAID
            ),
            "promo_por_confirmar": sum(1 for v in ventas if v["por_confirmar"]),
            "promo_anterior_revisar": sum(1 for v in ventas if v["revisar_promo"]),
            "manuales": sum(1 for v in ventas if v["manual"]),
            "bonos": round(sum(p["bono"] for p in payment_rows), 2),
            "total": round(sum(p["neto"] for p in payment_rows), 2),
        },
        "pagos": payment_rows,
        "indicadores": ind_detail,
        **_teams(ventas, payment_rows, directorio),
        # Las pendientes y las ya decididas, que se pueden deshacer.
        "revision": [
            v for v in ventas if v["clasificacion"] == REVIEW or v["decision"] in (COUNT, DONT_COUNT)
        ],
        # Son pocas: viajan enteras, con las que ya no estan en suscripciones.
        "manuales": _manuales(agregadas, ventas),
        "pendientes_cierre": _pending_close(ventas, payment_rows, anterior, ind_detail),
    }
    return informe, ventas


def _manuales(manuales: dict[str, VentaManual], ventas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Las ventas agregadas a mano, con su clasificacion; `venta` nula si la orden ya no esta en suscripciones."""
    by_order = {v["orden"]: v for v in ventas if v["manual"]}
    filas = []
    for orden, m in sorted(manuales.items()):
        por = m.agregado_por
        filas.append({
            "orden": orden,
            "nota": m.nota,
            "agregado_por": (por.get_full_name() or por.get_username()) if por else "",
            "agregado_en": m.agregado_en.isoformat(),
            "venta": by_order.get(orden),
        })
    return filas


def _teams(ventas: list[dict[str, Any]], pagos: list[dict[str, Any]], directorio: _Directory) -> dict[str, Any]:
    """Quien vendio con quien, para agrupar la nomina por equipos y supervisores.

    Una fila por combinacion de equipo, oficina, supervisor y quien vendio, con
    sus ventas validas: `ventas` (residenciales) y `pyme`. Es lo que permite
    asignar cada asesor al supervisor con el que mas vende sin mandar las miles
    de ventas: un mes son unos cientos de combinaciones. Un id nulo es que la
    venta no trae esa columna o trae un nombre sin registrar.

    `personas` da nombre y papeles a cada id (con su superior y sus unidades),
    porque no todos cobran: un supervisor sin pago no esta en `pagos`.
    """
    filas: dict[tuple, dict[str, Any]] = {}
    for v in ventas:
        if v["clasificacion"] != VALID:
            continue
        clave = (v["equipo"], v["coord_oficina_id"], v["supervisor_id"], v["medio_id"])
        fila = filas.setdefault(clave, {
            "equipo": clave[0], "coord_oficina_id": clave[1], "supervisor_id": clave[2], "medio_id": clave[3],
            "ventas": 0, "pyme": 0,
        })
        fila["pyme" if v["pyme"] else "ventas"] += 1
    ids = {i for clave in filas for i in clave[1:] if i is not None} | {p["persona_id"] for p in pagos}
    return {
        "equipos": list(filas.values()),
        "personas": {
            str(i): {
                "nombre": directorio.nombre(i),
                "papeles": [
                    {
                        "equipo": m.equipo.slug,
                        "rol": m.rol,
                        "superior_id": directorio.by_id[m.superior_id].persona_id if m.superior_id in directorio.by_id else None,
                        "unidades": [directorio.unidades.get(u, str(u)) for u in directorio.units_of(m)],
                        "site": ", ".join(s.nombre for s in m.sites.all()),
                    }
                    for m in directorio.of_person.get(i, [])
                ],
            }
            for i in sorted(ids)
        },
    }


def _pending_close(
    ventas: list[dict[str, Any]], pagos: list[dict[str, Any]], anterior: ComisionPeriodo | None,
    indicadores: dict[str, Any],
) -> list[str]:
    """Lo que impide cerrar el periodo. Vacio: se puede cerrar."""
    pendientes = []
    if anterior is not None and not anterior.cerrado:
        pendientes.append(
            f"El periodo {anterior.periodo} sigue en borrador: ciérralo antes, porque lo que cobre de los"
            " días promocionales ya no cuenta en este"
        )
    revision = sum(1 for v in ventas if v["clasificacion"] == REVIEW)
    if revision:
        pendientes.append(f"{revision} venta(s) por facturar sin decidir en Revisión")
    por_confirmar = sum(1 for v in ventas if v["por_confirmar"])
    if por_confirmar:
        pendientes.append(
            f"{por_confirmar} instalación(es) de los días promocionales del mes anterior sin confirmar si ya se cobraron"
        )
    without_compliance = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos
        if p["detalle"].get("factor") and p["cumplimiento_pct"] is None and p["bruto"]
    ]
    if without_compliance:
        pendientes.append(
            "Cumplimiento sin definir (sin site ni unidad con % calculado: escríbelo en Indicadores): "
            + ", ".join(without_compliance)
        )
    without_growth = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos
        if "monto_por_venta_equipo" not in p["detalle"] and p["rol"] == "coord_un" and p["ventas_equipo"]
    ]
    if without_growth:
        pendientes.append("Crecimiento desconocido: " + ", ".join(without_growth))
    # Los que solo salen del analisis del mes: sin el, no hay a quien pagarle el bono.
    faltan = ("Churn de su unidad desconocido", "de la empresa desconocido", "sin % de ingresos")
    without_analysis = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos if any(t in a for a in p["avisos"] for t in faltan)
    ]
    if without_analysis:
        pendientes.append(
            "Faltan indicadores del mes para sus bonos (analiza el mes en Subscriptions): " + ", ".join(without_analysis)
        )
    return pendientes
