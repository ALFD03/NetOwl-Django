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
   factura de la suscripcion. Se juzga con los datos de hoy, sea cual sea la
   fecha: hasta que se cierra, el informe se recalcula con lo ultimo importado.
   Por eso un periodo se congela al cerrarlo: las tablas de suscripciones y de
   facturas se reemplazan en cada importacion.
3. **Personas**: el `Medio`, el `Oportunidad/Administrador` y el `Vendedor` de cada venta
   contra el directorio de ventas, tal y como vienen: lo que la venta no trae
   no lo cobra nadie. El coordinador de unidad de negocio, que Odoo no tiene,
   es el del supervisor de la venta (`SupervisorUnidad`).
4. **Pagos** (`reglas.calcular_pagos`), con el cumplimiento de los supervisores
   y coordinadores de oficina (el general del periodo, o el propio de quien lo
   tenga) y el crecimiento de las unidades de cada coordinador
   de UN, que sale de Unidades de negocio del mes.

Un borrador no guarda nada: esto se ejecuta cada vez que se abre.
"""

from __future__ import annotations

import calendar
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
from services.catalogos.models import PersonaVentas
from services.comisiones.models import (
    ComisionPeriodo,
    ComisionVenta,
    CondicionesComision,
    IndicadorComision,
    RevisionComision,
    SupervisorUnidad,
    VentaManual,
)
from services.subscriptions.analytics.analyzer.cleaner import parse_archivado
from services.subscriptions.analytics.bcv import TasaNoDisponible, consultar_tasa_vigente_el
from services.subscriptions.analytics.facturas import facturas_importadas_el, leer_facturas
from services.subscriptions.analytics.free_plans import _is_free_tariff
from services.subscriptions.analytics.queries import (
    calculate_aggregation_totals,
    get_business_units_data,
    get_periodos,
)
from services.subscriptions.models import Coordinador

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
    Venta,
    calcular_pagos,
    cancelada_sin_cumplir_un_mes,
    clasificar,
    fecha_del_pago,
    pagada_hasta,
    primera_mensualidad,
    tramo,
    validar_tramos_asesor,
    validar_tramos_un,
)

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

# Los cargos cuyo total multiplica el % de cumplimiento.
CARGOS_CON_CUMPLIMIENTO = ("supervisor", "coord_oficina")


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
    """Las condiciones actuales, con los tramos validados, como diccionario plano."""
    c = CondicionesComision.actual()
    return {
        "monto_equipo": float(c.monto_equipo),
        "monto_directa": float(c.monto_directa),
        "monto_directa_un": float(c.monto_directa_un),
        "tramos_asesor": validar_tramos_asesor(c.tramos_asesor),
        "tramos_un": validar_tramos_un(c.tramos_un),
        "dia_promocional": c.dia_promocional,
        "dias_espera": c.dias_espera,
        "dia_corte": c.dia_corte,
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
    """El directorio de ventas, indexado para resolver literales, y la UN de cada supervisor."""

    def __init__(self):
        self.personas = {p.id: p for p in PersonaVentas.objects.all()}
        self.por_medio = {clave_nombre(p.medio): p for p in self.personas.values()}
        # Odoo a veces escribe a la misma persona de otra forma como supervisor.
        self.por_supervisor = {clave_nombre(p.literal_supervisor): p for p in self.personas.values()}
        self.por_usuario = {
            clave_nombre(p.usuario_odoo): p for p in self.personas.values() if p.usuario_odoo
        }
        self.unidad = dict(SupervisorUnidad.objects.values_list("supervisor_id", "coord_un_id"))

    def nombre(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.nombre_completo if persona else ""

    def cargo(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.cargo if persona else ""

    def unidad_de(self, persona_id: int | None) -> int | None:
        """El coordinador de UN de lo que supervisa o vende `persona_id`."""
        cargo = self.cargo(persona_id)
        if cargo == "coord_un":
            return persona_id
        if cargo == "supervisor":
            return self.unidad.get(persona_id)
        return None

    def resolver(self, medio: str, supervisor: str, vendedor: str) -> tuple[dict[str, int | None], list[str]]:
        """Las personas de una venta y los avisos de lo que no se pudo resolver.

        Cada columna se busca en el directorio tal y como viene, sin rellenar
        nada: una venta sin `Vendedor` no paga a ninguna oficina. Un literal
        que no esta en el directorio es un problema de registro, y se avisa.

        Cualquier cargo puede ocupar cualquier columna: un coordinador de
        oficina o de UN tambien vende (`Medio`) y supervisa (`Oportunidad/Administrador`).

        El coordinador de UN sale del supervisor de la venta: el que tenga
        asignado si es un supervisor, el mismo si es un coordinador de UN, y
        ninguno si es una oficina. Si la venta no trae supervisor, de quien
        vendio con la misma regla. Un supervisor escrito pero sin registrar no
        se sustituye por quien vendio: seria inventarle el equipo.
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

        if supervisor_id is not None:
            coord_un_id = self.unidad_de(supervisor_id)
        elif not supervisor:
            coord_un_id = self.unidad_de(medio_id)
        else:
            coord_un_id = None
        return {
            "medio_id": medio_id,
            "supervisor_id": supervisor_id,
            "coord_oficina_id": oficina_id,
            "coord_un_id": coord_un_id,
        }, avisos


def _crecimientos(periodo: str, directorio: _Directorio, manuales: dict[int, float]) -> dict[int, dict[str, Any]]:
    """El crecimiento del mes de las unidades de cada coordinador de UN.

    Sale de Unidades de negocio: los nodos de todas las unidades que lleva la
    persona (una puede llevar varias), agregados con la misma formula que el
    reporte usa para el total de un coordinador. Si el mes no esta calculado,
    vale el que se haya escrito a mano en el informe.
    """
    etiqueta = next((p for p in get_periodos() if str(p).startswith(periodo)), None)
    nodos_por_unidad: dict[str, list[dict]] = {}
    if etiqueta:
        datos = get_business_units_data(etiqueta)
        for grupo in datos.get("data") or []:
            if not grupo.get("is_rf"):
                nodos_por_unidad[grupo["coordinador"]] = grupo.get("nodes") or []

    unidades: dict[int, list[str]] = {}
    for nombre, persona_id in Coordinador.objects.filter(persona__isnull=False).values_list("nombre", "persona_id"):
        unidades.setdefault(persona_id, []).append(nombre)

    resultado: dict[int, dict[str, Any]] = {}
    for persona_id, persona in directorio.personas.items():
        if persona.cargo != "coord_un":
            continue
        nombres = sorted(unidades.get(persona_id, []))
        nodos = [n for u in nombres for n in nodos_por_unidad.get(u, [])]
        calculado = calculate_aggregation_totals(nodos)["crecimiento"] if nodos else None
        manual = manuales.get(persona_id)
        resultado[persona_id] = {
            "unidades": nombres,
            "calculado": calculado,
            "valor": manual if manual is not None else calculado,
            "fuente": "manual" if manual is not None else ("unidades de negocio" if calculado is not None else None),
        }
    return resultado


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
        ])
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
        motivo_analisis = clasificar(*datos, estado_suscripcion=estado_sub, cancelada_sin_mes=sin_mes)[1]
        if orden in pagadas:
            clasificacion, motivo = EXCLUIDA, f"Ya se pagó en {pagadas[orden]}"
            motivo_analisis = motivo
        elif manual:
            clasificacion, motivo = VALIDA, f"Agregada a mano: {manual.nota}"
        else:
            clasificacion, motivo = clasificar(
                *datos, decidido if decidido in (CONTAR, NO_CONTAR) else None,
                estado_suscripcion=estado_sub, cancelada_sin_mes=sin_mes,
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
            "coord_un": directorio.nombre(personas["coord_un_id"]),
            "avisos": avisos,
        })

    indicadores = {i.persona_id: i for i in IndicadorComision.objects.filter(periodo=clave)}
    propios = {
        pid: float(i.cumplimiento_pct) for pid, i in indicadores.items() if i.cumplimiento_pct is not None
    }
    general = float(periodo.cumplimiento_general_pct) if periodo.cumplimiento_general_pct is not None else None
    cumplimientos = {
        pid: propios.get(pid, general)
        for pid, p in directorio.personas.items()
        if p.cargo in CARGOS_CON_CUMPLIMIENTO and propios.get(pid, general) is not None
    }
    manuales = {pid: float(i.crecimiento_pct) for pid, i in indicadores.items() if i.crecimiento_pct is not None}
    crecimientos = _crecimientos(clave, directorio, manuales)

    validas = [v for v in ventas if v["clasificacion"] == VALIDA]
    pagos = calcular_pagos(
        [
            Venta(
                orden=v["orden"], pyme=v["pyme"], precio=v["precio"], pct_pyme=v["pct_pyme"],
                medio_id=v["medio_id"], supervisor_id=v["supervisor_id"],
                coord_oficina_id=v["coord_oficina_id"], coord_un_id=v["coord_un_id"],
            )
            for v in validas
        ],
        {pid: p.cargo for pid, p in directorio.personas.items()},
        condiciones,
        cumplimientos,
        {pid: c["valor"] for pid, c in crecimientos.items()},
    )

    filas_pago = []
    for pago in pagos.values():
        persona = directorio.personas.get(pago.persona_id)
        crecimiento = crecimientos.get(pago.persona_id, {})
        filas_pago.append({
            **asdict(pago),
            "nombre": persona.nombre_completo if persona else "",
            "medio": persona.medio if persona else "",
            "cumplimiento_pct": cumplimientos.get(pago.persona_id),
            "cumplimiento_propio": propios.get(pago.persona_id),
            "crecimiento_pct": crecimiento.get("valor"),
            "crecimiento_calculado": crecimiento.get("calculado"),
            "crecimiento_fuente": crecimiento.get("fuente"),
            "unidades": crecimiento.get("unidades", []),
        })
    filas_pago.sort(key=lambda f: (f["cargo"], f["nombre"]))

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
        "cumplimiento_general_pct": general,
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
            "total": round(sum(p["neto"] for p in filas_pago), 2),
        },
        "pagos": filas_pago,
        **_equipos(ventas, directorio),
        # Las pendientes y las ya decididas, que se pueden deshacer.
        "revision": [
            v for v in ventas if v["clasificacion"] == REVISION or v["decision"] in (CONTAR, NO_CONTAR)
        ],
        # Son pocas: viajan enteras, con las que ya no estan en suscripciones.
        "manuales": _manuales(agregadas, ventas),
        "pendientes_cierre": _pendientes_cierre(ventas, filas_pago, anterior),
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


def _equipos(ventas: list[dict[str, Any]], directorio: _Directorio) -> dict[str, Any]:
    """Quien vendio con quien, para agrupar la nomina por equipos.

    Una fila por combinacion de coordinador de UN, oficina, supervisor y quien
    vendio, con sus ventas validas: `ventas` (residenciales) y `pyme`. Es lo que
    permite ordenar la nomina por unidad, supervisor y oficina sin mandar las
    miles de ventas: un mes son unos cientos de combinaciones. Un id nulo es que
    la venta no trae esa columna o trae un nombre sin registrar.

    `personas` da nombre y cargo a cada id, porque no todos cobran (un
    coordinador sin pago no esta en `pagos`).
    """
    filas: dict[tuple, dict[str, Any]] = {}
    for v in ventas:
        if v["clasificacion"] != VALIDA:
            continue
        clave = (v["coord_un_id"], v["coord_oficina_id"], v["supervisor_id"], v["medio_id"])
        fila = filas.setdefault(clave, {
            "coord_un_id": clave[0], "coord_oficina_id": clave[1], "supervisor_id": clave[2], "medio_id": clave[3],
            "ventas": 0, "pyme": 0,
        })
        fila["pyme" if v["pyme"] else "ventas"] += 1
    ids = {i for clave in filas for i in clave if i is not None}
    return {
        "equipos": list(filas.values()),
        "personas": {
            str(i): {"nombre": directorio.nombre(i), "cargo": directorio.cargo(i)} for i in sorted(ids)
        },
    }


def _pendientes_cierre(
    ventas: list[dict[str, Any]], pagos: list[dict[str, Any]], anterior: ComisionPeriodo | None,
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
        p["nombre"] for p in pagos
        if p["cargo"] in CARGOS_CON_CUMPLIMIENTO and p["cumplimiento_pct"] is None and p["bruto"]
    ]
    if sin_cumplimiento:
        pendientes.append("Cumplimiento sin definir (escribe el general): " + ", ".join(sin_cumplimiento))
    sin_crecimiento = [
        p["nombre"] for p in pagos
        if p["cargo"] == "coord_un" and p["crecimiento_pct"] is None and p["ventas_equipo"]
    ]
    if sin_crecimiento:
        pendientes.append("Crecimiento desconocido: " + ", ".join(sin_crecimiento))
    return pendientes
