"""El informe de comisiones de un periodo: de las suscripciones a lo que cobra cada uno.

1. **Candidatas**: las suscripciones instaladas (`fecha_inicio`) dentro de la
   ventana del periodo —del inicio de los dias promocionales del mes anterior
   al fin del mes—, menos las ya pagadas en un periodo cerrado, mas las
   agregadas a mano (`VentaManual`). Lo instalado en los dias promocionales
   del mes solo cuenta si el cliente adelanto la primera mensualidad antes del
   corte (`corte_de`); si no, es del periodo siguiente (`DIFERIDA`). Lo de los
   del mes anterior, en el primer periodo del sistema, se confirma a mano: pudo
   cobrarse ya en el anterior, fuera del sistema.
2. **Clasificacion** (`reglas.clasificar`): por su primera mensualidad —la
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
4. **Pagos** (`pagos.calcular_pagos`): cada persona cobra segun las condiciones
   de su rol en el equipo de la venta, con los indicadores del mes
   (`_indicadores`): los % de cumplimiento de sites y unidades de negocio, el
   crecimiento, el churn y los % de ingresos, que salen del servidor
   (`cumplimiento_sites.indicadores_del_mes`) o se escriben a mano cuando se
   puede (`IndicadorComision`).

Un borrador no guarda nada: esto se ejecuta cada vez que se abre.
"""

from __future__ import annotations

import calendar
import logging
import re
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
from core.odoo_nombres import clave_nombre
from core.utils import normalize_text, parse_date
from services.catalogos.equipos import ROLES, ROLES_POR_EQUIPO, parametros_vigentes
from services.catalogos.models import (
    CondicionesEquipo,
    EquipoVentas,
    MembresiaEquipo,
    PersonaVentas,
)
from services.comisiones.models import (
    ComisionPeriodo,
    ComisionVenta,
    CondicionesComision,
    IndicadorComision,
    RevisionComision,
    VentaManual,
)
from services.subscriptions.analytics.analyzer.cleaner import parse_archivado
from services.subscriptions.analytics.bcv import TasaNoDisponible, consultar_tasa_vigente_el
from services.subscriptions.analytics.coordinadoras_oficina import get_coordinadoras_oficina
from services.subscriptions.analytics.cumplimiento_sites import indicadores_del_mes
from services.subscriptions.analytics.facturas import facturas_importadas_el, leer_facturas
from services.subscriptions.analytics.free_plans import _is_free_tariff
from services.subscriptions.models import Coordinador

from .pagos import Indicadores, Miembro, Venta, calcular_pagos
from .reglas import (
    CONTAR,
    DIFERIDA,
    EXCLUIDA,
    MANUAL,
    MOTIVO_CAMBIO_PLAN,
    NO_CONTAR,
    NO_PAGADA,
    NORMAL,
    PROMO,
    PROMO_ANTERIOR,
    REVISION,
    VALIDA,
    YA_PAGADA,
    Factura,
    cancelada_sin_cumplir_un_mes,
    clasificar,
    fecha_del_pago,
    pagada_hasta,
    primera_mensualidad,
    tramo,
)

logger = logging.getLogger(__name__)

# Las columnas del export sin las que no hay comisiones que calcular. La
# importacion las acepta como opcionales; es aqui donde se exigen.
COLUMNAS_REQUERIDAS = {
    "medio": "Medio",
    "medio_supervisor": "Oportunidad/Administrador",
    "estado_factura": "Estado de la factura",
}

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}")

# El estado interno de los logs de una suscripcion cancelada.
CANCELADO_LOG = SUBS_STATE_TO_LOG_MAP["cancelado"]

class FaltanColumnas(RuntimeError):
    """Faltan datos sin los que no hay informe: columnas de suscripciones o las facturas."""


# --- Fechas --------------------------------------------------------------------------

def mes_anterior(periodo: str) -> str:
    """`YYYY-MM` del mes anterior."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio - 1}-12" if mes == 1 else f"{anio}-{mes - 1:02d}"


def mes_siguiente(periodo: str) -> str:
    """`YYYY-MM` del mes siguiente."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio + 1}-01" if mes == 12 else f"{anio}-{mes + 1:02d}"


def tasa_conatel(periodo: ComisionPeriodo) -> dict[str, Any]:
    """La tasa en bolivares con que se paga el periodo: la CONATEL del mes siguiente.

    Las comisiones de un mes se pagan el mes siguiente (las de septiembre en
    octubre), y la tasa CONATEL de un mes es el valor del bolivar oficial el
    **dia 1** de ese mes. Si el BCV no publico ese dia, la vigente: la ultima
    publicada antes (`bcv.consultar_tasa_vigente_el`).

    El valor de un dia pasado ya no cambia, asi que se consulta una vez y se
    guarda en el periodo. Un mes que aun no empezo no tiene tasa y no se
    pregunta. Un fallo del servicio no rompe el informe: se devuelve en `aviso`
    y se vuelve a intentar la proxima vez que se abra.
    """
    mes = mes_siguiente(periodo.periodo)
    primero = dia_del_mes(mes, 1)
    sin_tasa = {"mes": mes, "dia": primero.isoformat(), "tasa": None, "fuente": ""}
    if periodo.tasa_conatel is None:
        if primero > date.today():
            return {**sin_tasa, "aviso": f"Se conoce a partir del {primero.strftime('%d/%m/%Y')}."}
        try:
            tasa, publicada = consultar_tasa_vigente_el(primero)
        except TasaNoDisponible as e:
            return {**sin_tasa, "aviso": str(e)}
        periodo.tasa_conatel = Decimal(str(tasa))
        periodo.tasa_conatel_publicada = publicada
        periodo.save(update_fields=["tasa_conatel", "tasa_conatel_publicada"])

    publicada = periodo.tasa_conatel_publicada
    fuente = f"BCV {publicada.strftime('%d/%m/%Y')}" if publicada else "BCV"
    if publicada and publicada != primero:
        fuente += f", vigente el {primero.strftime('%d/%m/%Y')} (ese día no hubo publicación)"
    fuente += " · ve.dolarapi.com"
    return {**sin_tasa, "tasa": float(periodo.tasa_conatel), "fuente": fuente, "aviso": ""}


def dia_del_mes(periodo: str, dia: int) -> date:
    """El dia `dia` del mes, recortado al ultimo si el mes es mas corto."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return date(anio, mes, min(dia, calendar.monthrange(anio, mes)[1]))


def fecha_de_calculo(periodo: str, dias_espera: int) -> date:
    """Desde cuando tiene sentido calcular: `dias_espera` dias tras el fin del mes.

    Es lo que tardan las primeras facturas de lo instalado en pagarse: lo del
    25 de agosto al 24 de septiembre se paga el 15 de octubre.
    """
    anio, mes = (int(x) for x in periodo.split("-"))
    return date(anio, mes, calendar.monthrange(anio, mes)[1]) + timedelta(days=dias_espera)


def fin_de(periodo: ComisionPeriodo) -> date:
    """El ultimo dia de instalacion que puede contar: el fin del mes.

    Lo instalado desde `inicio_promo` solo cuenta si se adelanto el pago.
    """
    anio, mes = (int(x) for x in periodo.periodo.split("-"))
    return date(anio, mes, calendar.monthrange(anio, mes)[1])


def corte_de(periodo: ComisionPeriodo, dia_corte: int) -> date:
    """Hasta que dia un pago adelantado cuenta en el periodo.

    El escrito en el periodo, o el `dia_corte` (22) del mes siguiente: es
    cuando se saca el informe, y lo que se pague despues ya va al siguiente.
    """
    return periodo.corte_adelantos or dia_del_mes(mes_siguiente(periodo.periodo), dia_corte)


# --- Condiciones ------------------------------------------------------------------

def condiciones_vigentes() -> dict[str, Any]:
    """Las condiciones actuales: la ventana de pago y las de cada rol de cada equipo.

    `equipos` es `{equipo: {rol: parametros}}`, con lo guardado completado con la
    politica por defecto (`equipos.parametros_vigentes`); `nombres`, el nombre de
    cada equipo, para que la copia que congela un cierre se explique sola.
    """
    c = CondicionesComision.actual()
    guardadas = {(f.equipo.slug, f.rol): f.parametros for f in CondicionesEquipo.objects.select_related("equipo")}
    return {
        "dia_promocional": c.dia_promocional,
        "dias_espera": c.dias_espera,
        "dia_corte": c.dia_corte,
        "equipos": {
            slug: {rol: parametros_vigentes(slug, rol, guardadas.get((slug, rol))) for rol in roles}
            for slug, roles in ROLES_POR_EQUIPO.items()
        },
        "nombres": dict(EquipoVentas.objects.values_list("slug", "nombre")),
    }


# --- Lectura -----------------------------------------------------------------------

def _leer(donde: str, params: list) -> pd.DataFrame:
    """Las suscripciones que cumplen `donde`, con la fecha de instalacion leida en `fecha`."""
    db = DBConnector()
    columnas = db.columnas(TableNames.SUBSCRIPTIONS)
    faltan = [titulo for col, titulo in COLUMNAS_REQUERIDAS.items() if col not in columnas]
    if faltan:
        raise FaltanColumnas(
            "La tabla de suscripciones no trae "
            + ", ".join(f"«{t}»" for t in faltan)
            + ". Vuelve a importar las suscripciones con un export que incluya esas columnas."
        )

    # `activo` llega solo con los exports nuevos: sin ella, nadie se da por archivado.
    activo = ", activo" if "activo" in columnas else ""
    df = db.query(
        f"""
        SELECT orden_producto, cliente, sucursal, zona, estado, fecha_inicio,
               producto, tarifa, total, vendedor, medio, medio_supervisor, estado_factura{activo}
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE {donde}
        """,
        params=params,
    )
    if df.empty:
        return df
    df["fecha"] = df["fecha_inicio"].map(lambda v: (parse_date(v) or pd.NaT) if v else pd.NaT)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date
    return df


def _leer_candidatas(inicio: date, fin: date) -> pd.DataFrame:
    """Las suscripciones instaladas en la ventana.

    `fecha_inicio` es texto, como toda columna importada. Las fechas ISO se
    filtran en SQL; las que vengan en otro formato (no deberia haberlas, pero
    el export no lo garantiza) se traen y se resuelven con `parse_date`.
    """
    df = _leer(
        """(fecha_inicio ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND LEFT(fecha_inicio, 10) BETWEEN %s AND %s)
           OR (fecha_inicio IS NOT NULL AND fecha_inicio !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}')""",
        [inicio.isoformat(), fin.isoformat()],
    )
    if df.empty:
        return df
    en_ventana = df["fecha"].map(lambda f: isinstance(f, date) and inicio <= f <= fin)
    return df[en_ventana].copy()


def leer_ordenes(ordenes: list[str]) -> pd.DataFrame:
    """Las suscripciones de esas ordenes, esten instaladas cuando esten: las agregadas a mano."""
    if not ordenes:
        return pd.DataFrame()
    return _leer("orden_producto = ANY(%s)", [ordenes])


def _gratuitas(df: pd.DataFrame) -> set[str]:
    """Las candidatas que hoy son gratuitas, y por eso no pagan comision.

    Con la misma evidencia que el analisis mensual: archivada en el export
    (`activo` falso), una tarifa «Gratis», o un «Suscripción archivada» como
    ultimo log de archivado (sin un «desarchivada» despues).
    """
    if df.empty:
        return set()
    ordenes = df["orden_producto"].astype(str)
    gratuita = df["tarifa"].map(_is_free_tariff)
    if "activo" in df.columns:
        gratuita |= parse_archivado(df["activo"])
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


def _canceladas_el(df: pd.DataFrame) -> dict[str, date]:
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
            if fila.estado == CANCELADO_LOG:
                inicio = inicio or fila.fecha_log
            else:
                inicio = None
        dia = parse_date(inicio) if inicio else None
        if dia is not None and not pd.isna(dia):
            fechas[str(orden)] = pd.Timestamp(dia).date()
    return fechas


def _indice_planes() -> tuple[dict[tuple[str, str], dict], dict[str, dict]]:
    """Los planes del catalogo por (nombre, tarifa) y por nombre (gana el ultimo)."""
    por_tarifa: dict[tuple[str, str], dict] = {}
    por_nombre: dict[str, dict] = {}
    for plan in fixtures.planes():
        por_tarifa[(plan["name"], plan.get("tarifa") or "")] = plan
        por_nombre[plan["name"]] = plan
    return por_tarifa, por_nombre


class _Directorio:
    """El directorio de ventas y la estructura de los equipos, indexados para resolver cada venta."""

    def __init__(self):
        self.personas = {p.id: p for p in PersonaVentas.objects.prefetch_related("alias")}
        self.membresias = list(
            MembresiaEquipo.objects.select_related("persona", "equipo", "superior")
            .prefetch_related("unidades", "sites")
            .order_by("equipo__orden", "rol", "persona__nombre", "persona__apellido")
        )
        self.por_clave = {(m.persona_id, m.equipo.slug): m for m in self.membresias}
        self.por_id = {m.id: m for m in self.membresias}
        self.de_persona: dict[int, list[MembresiaEquipo]] = {}
        for m in self.membresias:
            self.de_persona.setdefault(m.persona_id, []).append(m)
        # Una persona puede estar escrita de varias formas (con y sin tilde): cada una apunta a ella.
        # Odoo a veces la escribe distinto como supervisor.
        self.por_medio = {k: p for p in self.personas.values() for k in p.claves("medio")}
        self.por_supervisor = {k: p for p in self.personas.values() for k in p.claves("supervisor")}
        self.por_usuario = {k: p for p in self.personas.values() for k in p.claves("usuario")}
        self.unidades = dict(Coordinador.objects.values_list("id", "nombre"))

    def nombre(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.nombre_completo if persona else ""

    def miembros(self) -> dict[tuple[int, str], Miembro]:
        """Las membresias como las lee el motor de pagos."""
        return {
            clave: Miembro(m.persona_id, m.equipo.slug, m.rol, tuple(sorted(u.id for u in m.unidades.all())))
            for clave, m in self.por_clave.items()
        }

    def unidades_de(self, m: MembresiaEquipo | None) -> tuple[int, ...]:
        """Las unidades de negocio de una membresia: las que lleva, o las de su superior.

        El coordinador de UN lleva una; el jefe y los gerentes, varias; un
        supervisor no lleva ninguna y hereda las de a quien responde.
        """
        if m is None:
            return ()
        if ROLES[m.rol].get("unidades"):
            return tuple(sorted(u.id for u in m.unidades.all()))
        superior = self.por_id.get(m.superior_id) if m.superior_id is not None else None
        return self.unidades_de(superior) if superior is not None and superior.id != m.id else ()

    def _equipo_de(self, *personas: int | None) -> tuple[str, str | None]:
        """El equipo de una venta, y un aviso si no esta claro.

        Es el del `Medio`; si no esta registrado en ningun equipo, el de su
        supervisor, y luego el de su `Vendedor`. Quien esta en varios (el
        gerente de operaciones) se desempata con el equipo de los demas de la venta.
        """
        con_equipo = [
            [m.equipo.slug for m in self.de_persona.get(pid, [])] for pid in personas if pid is not None
        ]
        con_equipo = [e for e in con_equipo if e]
        if not con_equipo:
            return "", None
        primeros = con_equipo[0]
        if len(primeros) == 1:
            return primeros[0], None
        comunes = [e for e in primeros if all(e in otros for otros in con_equipo[1:])]
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
            persona = indice.get(clave_nombre(literal))
            if persona is None:
                avisos.append(f"{columna} «{literal}» no está en el directorio")
                return None
            return persona.id

        medio_id = buscar(medio, self.por_medio, "Medio")
        supervisor_id = buscar(supervisor, self.por_supervisor, "Supervisor")
        oficina_id = buscar(vendedor, self.por_usuario, "Vendedor")

        equipo, aviso = self._equipo_de(medio_id, supervisor_id, oficina_id)
        if aviso:
            avisos.append(aviso)
        if not equipo and any(i is not None for i in (medio_id, supervisor_id, oficina_id)):
            avisos.append("Ninguna de las personas de la venta tiene un papel en un equipo: no se paga")

        def papel(persona_id: int | None) -> MembresiaEquipo | None:
            return self.por_clave.get((persona_id, equipo)) if persona_id is not None and equipo else None

        if supervisor_id is not None:
            unidades = self.unidades_de(papel(supervisor_id))
        elif not supervisor:
            unidades = self.unidades_de(papel(medio_id))
        else:
            unidades = ()
        quien = papel(medio_id)
        for etiqueta, pid in (("Medio", medio_id), ("Supervisor", supervisor_id), ("Vendedor", oficina_id)):
            if equipo and pid is not None and papel(pid) is None:
                avisos.append(f"{etiqueta} «{self.nombre(pid)}» no tiene papel en el equipo de la venta")
        return {
            "medio_id": medio_id,
            "supervisor_id": supervisor_id,
            "coord_oficina_id": oficina_id,
            "equipo": equipo,
            "unidad_ids": list(unidades),
            "es_oficina": bool(quien and quien.rol == "coord_oficina"),
        }, avisos


def _indicadores(
    clave: str,
    directorio: _Directorio,
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
        datos = indicadores_del_mes(clave)
    except Exception:
        logger.exception("No se pudieron calcular los cumplimientos de %s", clave)
        datos = None
    sites = (datos or {}).get("sites", {})
    por_unidad = (datos or {}).get("unidades", {})
    nombre_unidad = directorio.unidades

    personales = {}
    if any(m.rol == "coord_oficina" for m in directorio.membresias):
        for c in get_coordinadoras_oficina(clave):
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
                    {"nombre": nombre_unidad.get(u, str(u)), "pct": por_unidad.get(nombre_unidad.get(u, ""), {}).get("pct_ventas")}
                    for u in directorio.unidades_de(m)
                ]
            con_valor = [f["pct"] for f in fuentes if f["pct"] is not None]
            calculado = round(sum(con_valor) / len(con_valor), 2) if con_valor else None
            manual = cumplimientos_manuales.get(m.persona_id)
            valor = manual if manual is not None else calculado
            ind.factores[k] = valor
            factores.append({
                **base, "factor": tipo, "fuentes": fuentes, "calculado": calculado, "manual": manual, "valor": valor,
                "fuente": "manual" if manual is not None else (tipo if calculado is not None else None),
                "personal": personales.get(m.persona_id) if m.rol == "coord_oficina" else None,
            })

        if "escalon_crecimiento" in cond or "bono_churn" in cond:
            unidades = directorio.unidades_de(m)
            fila = por_unidad.get(nombre_unidad.get(unidades[0], ""), {}) if unidades else {}
            calculado = fila.get("crecimiento")
            manual = crecimientos_manuales.get(m.persona_id)
            ind.crecimientos[k] = manual if manual is not None else calculado
            ind.churns[k] = fila.get("churn_bruto")
            crecimientos.append({
                **base, "unidades": [nombre_unidad.get(u, str(u)) for u in unidades],
                "calculado": calculado, "manual": manual, "valor": ind.crecimientos[k],
                "fuente": "manual" if manual is not None else ("unidades de negocio" if calculado is not None else None),
                "churn_bruto": ind.churns[k],
            })

    for uid, nombre in sorted(nombre_unidad.items(), key=lambda kv: kv[1]):
        fila = por_unidad.get(nombre)
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

def construir_informe(periodo: ComisionPeriodo) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)` de un periodo, calculado con los datos de hoy.

    `informe` es lo que pinta la pagina (resumen, pagos, revision) y `ventas`
    el detalle de cada candidata, que se pide aparte por su tamano.

    Levanta `FaltanColumnas` si la tabla de suscripciones no tiene lo necesario.
    """
    clave = periodo.periodo
    inicio, fin = periodo.inicio, fin_de(periodo)
    condiciones = condiciones_vigentes()
    siguiente = mes_siguiente(clave)

    # Lo instalado en los dias promocionales del mes anterior pudo cobrarse
    # alli, si se adelanto el pago. Con el anterior cerrado lo dicen sus
    # ventas validas (`pagadas`); sin periodo anterior, se confirma a mano lo
    # que estaba pagado en su corte. Lo pagado despues, en su fecha, toca aqui
    # y no se revisa.
    anterior = ComisionPeriodo.objects.filter(periodo=mes_anterior(clave)).first()
    primer_periodo = anterior is None
    corte = corte_de(periodo, condiciones["dia_corte"])
    corte_anterior = (corte_de(anterior, condiciones["dia_corte"]) if anterior
                      else dia_del_mes(clave, condiciones["dia_corte"]))

    decisiones = {r.orden: r for r in RevisionComision.objects.filter(periodo_origen=clave)}
    agregadas = {m.orden: m for m in VentaManual.objects.filter(periodo=clave)}
    calculo_desde = fecha_de_calculo(clave, condiciones["dias_espera"])

    pagadas = dict(
        ComisionVenta.objects.filter(clasificacion=VALIDA, periodo__estado="cerrado")
        .exclude(periodo__periodo=clave)
        .values_list("orden", "periodo__periodo")
    )

    importadas_el = facturas_importadas_el()
    if importadas_el is None:
        raise FaltanColumnas(
            "No hay facturas importadas. Carga el export de facturas en Importaciones › Suscripciones:"
            " sin él no se sabe qué primeras mensualidades se pagaron."
        )

    df = _leer_candidatas(inicio, fin)
    en_ventana = set(df["orden_producto"].astype(str)) if not df.empty else set()
    fuera = sorted(set(agregadas) - en_ventana)
    if fuera:
        df = pd.concat([df, leer_ordenes(fuera)], ignore_index=True)
    ordenes = df["orden_producto"].astype(str).tolist() if not df.empty else []
    facturas = leer_facturas(ordenes)
    gratuitas = _gratuitas(df)
    canceladas_el = _canceladas_el(df)
    planes_tarifa, planes_nombre = _indice_planes()
    directorio = _Directorio()

    ventas: list[dict[str, Any]] = []
    for fila in df.itertuples(index=False):
        orden = str(fila.orden_producto)
        texto = lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()  # noqa: E731

        plan = planes_tarifa.get((texto(fila.producto), texto(fila.tarifa))) or planes_nombre.get(texto(fila.producto))
        pyme = bool(plan and plan.get("people") == "PYME")
        precio = float(plan.get("price") or 0) if plan else 0.0
        decision = decisiones.get(orden)
        decidido = decision.decision if decision else None
        manual = agregadas.get(orden)
        de_la_orden = facturas.get(orden, [])
        mensualidad = primera_mensualidad([
            Factura(
                f["numero"], f["estado"], f["estado_pago"], f["creado_el"], f["plan"],
                f.get("fecha_pago", ""), f.get("actualizado_el", ""),
            )
            for f in de_la_orden
        ], hasta=corte)
        pago_dia, pago_fuente = fecha_del_pago(mensualidad)
        gratuita = orden in gratuitas
        cancelada_el = canceladas_el.get(orden)
        instalada = fila.fecha if isinstance(fila.fecha, date) else None
        sin_mes = cancelada_sin_cumplir_un_mes(instalada, cancelada_el)
        parte = (tramo(instalada, inicio, periodo.inicio_promo)
                 if instalada is not None and inicio <= instalada <= fin else MANUAL)
        adelantada = False
        # Primer periodo: pagada hasta el corte del mes anterior, pudo cobrarse alli.
        adelanto_anterior = False

        datos = (texto(fila.estado_factura), mensualidad, plan["name"] if plan else "", gratuita)
        estado_sub = texto(fila.estado)
        # Lo que dicen las facturas se guarda aparte: con una decision, es por que se reviso.
        motivo_analisis = clasificar(*datos, estado_suscripcion=estado_sub, cancelada_sin_mes=sin_mes, corte=corte)[1]
        if orden in pagadas:
            clasificacion, motivo = EXCLUIDA, f"Ya se pagó en {pagadas[orden]}"
            motivo_analisis = motivo
        elif manual:
            clasificacion, motivo = VALIDA, f"Agregada a mano: {manual.nota}"
        else:
            clasificacion, motivo = clasificar(
                *datos, decidido if decidido in (CONTAR, NO_CONTAR) else None,
                estado_suscripcion=estado_sub, cancelada_sin_mes=sin_mes, corte=corte,
            )
            if parte == PROMO:
                # Su comision es del siguiente salvo que adelantara el pago.
                adelantada = clasificacion == VALIDA and (decidido == CONTAR or pagada_hasta(mensualidad, corte))
                if not adelantada:
                    clasificacion = DIFERIDA
                    motivo = (f"Día promocional sin adelantar la mensualidad al {corte.strftime('%d/%m/%Y')}:"
                              f" toca en {siguiente}")
            elif parte == PROMO_ANTERIOR and primer_periodo:
                adelanto_anterior = pagada_hasta(mensualidad, corte_anterior)
                if decidido == YA_PAGADA:
                    clasificacion = EXCLUIDA
                    motivo = f"Ya cobrada en la comisión de {mes_anterior(clave)}: adelantó la mensualidad"

        # Solo se confirma lo que adelanto el pago y pagaria aqui: lo que otra
        # regla ya resolvio (no pagada, excluida, decidida en Revision) no.
        por_confirmar = adelanto_anterior and decidido is None and clasificacion == VALIDA
        # Lo que se ve en «Dias promocionales del mes anterior»: lo que falta
        # confirmar y lo ya confirmado (para deshacerlo); con el anterior
        # cerrado, lo que se cobro alli.
        revisar_promo = parte == PROMO_ANTERIOR and (
            por_confirmar or decidido in (YA_PAGADA, NORMAL) or orden in pagadas
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
            "facturas": len(de_la_orden),
            "factura_numero": mensualidad.numero if mensualidad else "",
            "factura_fecha": mensualidad.creado_el[:10] if mensualidad else "",
            "factura_estado": mensualidad.estado if mensualidad else "",
            "factura_pago": mensualidad.estado_pago if mensualidad else "",
            "factura_plan": mensualidad.plan if mensualidad else "",
            "pago_fecha": pago_dia,
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
    ind, detalle_ind = _indicadores(clave, directorio, condiciones, propios, manuales)
    factores = {(f["persona_id"], f["equipo"]): f for f in detalle_ind["factores"]}
    crecimientos = {(c["persona_id"], c["equipo"]): c for c in detalle_ind["crecimientos"]}

    validas = [v for v in ventas if v["clasificacion"] == VALIDA]
    pagos = calcular_pagos(
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

    filas_pago = []
    for pago in pagos:
        persona = directorio.personas.get(pago.persona_id)
        miembro = directorio.por_clave[(pago.persona_id, pago.equipo)]
        k = (pago.persona_id, pago.equipo)
        factor, crecimiento = factores.get(k), crecimientos.get(k)
        filas_pago.append({
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
            "unidades": [directorio.unidades.get(u, str(u)) for u in directorio.unidades_de(miembro)],
            "site": ", ".join(s.nombre for s in miembro.sites.all()),
        })
    filas_pago.sort(key=lambda f: (f["equipo"], f["rol"], f["nombre"]))

    conteo = lambda c: sum(1 for v in ventas if v["clasificacion"] == c)  # noqa: E731
    del_tramo = lambda t: [v for v in ventas if v["tramo"] == t]  # noqa: E731
    promo, promo_anterior = del_tramo(PROMO), del_tramo(PROMO_ANTERIOR)
    hoy = date.today()
    informe = {
        "periodo": clave,
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat(),
        "inicio_promo": periodo.inicio_promo.isoformat(),
        "corte_adelantos": corte.isoformat(),
        "corte_anterior": corte_anterior.isoformat(),
        # Sin periodo anterior, lo de sus dias promocionales se confirma a mano.
        "anterior": {"periodo": mes_anterior(clave), "estado": anterior.estado if anterior else None},
        # Sin la fecha del pago en el export, los adelantos se fechan por la ultima actualizacion o la creacion.
        "facturas_con_fecha_pago": "fecha_pago" in DBConnector().columnas(TableNames.SUBSCRIPTIONS_FACTURAS),
        "estado": periodo.estado,
        "calculo_desde": calculo_desde.isoformat(),
        "antes_de_tiempo": hoy < calculo_desde,
        "facturas_importadas_el": importadas_el.isoformat(),
        # Va dentro del informe para que el cierre la congele con el resto.
        "tasa_conatel": tasa_conatel(periodo),
        "resumen": {
            # Lo diferido es del periodo siguiente: aqui solo se informa.
            "candidatas": len(ventas) - conteo(DIFERIDA),
            "validas": conteo(VALIDA),
            "no_pagadas": conteo(NO_PAGADA),
            "revision": conteo(REVISION),
            "excluidas": conteo(EXCLUIDA),
            "validas_pyme": sum(1 for v in validas if v["pyme"]),
            "validas_cambio_plan": sum(1 for v in validas if v["motivo"] == MOTIVO_CAMBIO_PLAN),
            "validas_sin_medio": sum(1 for v in validas if v["medio_id"] is None),
            "validas_sin_equipo": sum(1 for v in validas if not v["equipo"]),
            "diferidas": conteo(DIFERIDA),
            "promo": len(promo),
            "adelantadas": sum(1 for v in promo if v["adelantada"]),
            "promo_anterior": len(promo_anterior),
            "promo_anterior_cobradas": sum(
                1 for v in promo_anterior if v["orden"] in pagadas or v["decision"] == YA_PAGADA
            ),
            "promo_por_confirmar": sum(1 for v in ventas if v["por_confirmar"]),
            "promo_anterior_revisar": sum(1 for v in ventas if v["revisar_promo"]),
            "manuales": sum(1 for v in ventas if v["manual"]),
            "bonos": round(sum(p["bono"] for p in filas_pago), 2),
            "total": round(sum(p["neto"] for p in filas_pago), 2),
        },
        "pagos": filas_pago,
        "indicadores": detalle_ind,
        **_equipos(ventas, filas_pago, directorio),
        # Las pendientes y las ya decididas, que se pueden deshacer.
        "revision": [
            v for v in ventas if v["clasificacion"] == REVISION or v["decision"] in (CONTAR, NO_CONTAR)
        ],
        # Son pocas: viajan enteras, con las que ya no estan en suscripciones.
        "manuales": _manuales(agregadas, ventas),
        "pendientes_cierre": _pendientes_cierre(ventas, filas_pago, anterior, detalle_ind),
    }
    return informe, ventas


def _manuales(manuales: dict[str, VentaManual], ventas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Las ventas agregadas a mano, con su clasificacion; `venta` nula si la orden ya no esta en suscripciones."""
    por_orden = {v["orden"]: v for v in ventas if v["manual"]}
    filas = []
    for orden, m in sorted(manuales.items()):
        por = m.agregado_por
        filas.append({
            "orden": orden,
            "nota": m.nota,
            "agregado_por": (por.get_full_name() or por.get_username()) if por else "",
            "agregado_en": m.agregado_en.isoformat(),
            "venta": por_orden.get(orden),
        })
    return filas


def _equipos(ventas: list[dict[str, Any]], pagos: list[dict[str, Any]], directorio: _Directorio) -> dict[str, Any]:
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
        if v["clasificacion"] != VALIDA:
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
                        "superior_id": directorio.por_id[m.superior_id].persona_id if m.superior_id in directorio.por_id else None,
                        "unidades": [directorio.unidades.get(u, str(u)) for u in directorio.unidades_de(m)],
                        "site": ", ".join(s.nombre for s in m.sites.all()),
                    }
                    for m in directorio.de_persona.get(i, [])
                ],
            }
            for i in sorted(ids)
        },
    }


def _pendientes_cierre(
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
    revision = sum(1 for v in ventas if v["clasificacion"] == REVISION)
    if revision:
        pendientes.append(f"{revision} venta(s) por facturar sin decidir en Revisión")
    por_confirmar = sum(1 for v in ventas if v["por_confirmar"])
    if por_confirmar:
        pendientes.append(
            f"{por_confirmar} instalación(es) de los días promocionales del mes anterior sin confirmar si ya se cobraron"
        )
    sin_cumplimiento = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos
        if p["detalle"].get("factor") and p["cumplimiento_pct"] is None and p["bruto"]
    ]
    if sin_cumplimiento:
        pendientes.append(
            "Cumplimiento sin definir (sin site ni unidad con % calculado: escríbelo en Indicadores): "
            + ", ".join(sin_cumplimiento)
        )
    sin_crecimiento = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos
        if "monto_por_venta_equipo" not in p["detalle"] and p["rol"] == "coord_un" and p["ventas_equipo"]
    ]
    if sin_crecimiento:
        pendientes.append("Crecimiento desconocido: " + ", ".join(sin_crecimiento))
    # Los que solo salen del analisis del mes: sin el, no hay a quien pagarle el bono.
    faltan = ("Churn de su unidad desconocido", "de la empresa desconocido", "sin % de ingresos")
    sin_analisis = [
        f"{p['nombre']} ({p['equipo_nombre']})" for p in pagos if any(t in a for a in p["avisos"] for t in faltan)
    ]
    if sin_analisis:
        pendientes.append(
            "Faltan indicadores del mes para sus bonos (analiza el mes en Subscriptions): " + ", ".join(sin_analisis)
        )
    return pendientes
