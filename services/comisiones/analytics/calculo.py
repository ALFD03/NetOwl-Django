"""El informe de comisiones de un periodo: de las suscripciones a lo que cobra cada uno.

1. **Candidatas**: las suscripciones instaladas (`fecha_inicio`) dentro de la
   ventana del periodo, mas las que una revision anterior difirio a este, menos
   las que una revision de este difirio a otro y las ya pagadas en un periodo
   cerrado.
2. **Clasificacion** (`reglas.clasificar`): por el estado de la factura y si la
   suscripcion sigue en progreso **hoy**. Por eso un periodo se congela al
   cerrarlo: la tabla de suscripciones se trunca en cada importacion.
3. **Personas**: el `Medio`, el `Oportunidad/Administrador` y el `Vendedor` de cada venta
   contra el directorio de ventas; la jerarquia rellena lo que la venta no trae
   y da siempre el coordinador de unidad de negocio.
4. **Pagos** (`reglas.calcular_pagos`), con el cumplimiento de cada supervisor y
   coordinador de oficina y el crecimiento de las unidades de cada coordinador
   de UN, que sale de Unidades de negocio del mes.

Un borrador no guarda nada: esto se ejecuta cada vez que se abre.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import asdict
from datetime import date, timedelta
from typing import Any

import pandas as pd

from core import fixtures
from core.config import ACTIVE_STATE, DB_SCHEMA, SUBS_STATE_TO_LOG_MAP, TableNames
from core.database import DBConnector
from core.odoo_nombres import clave_nombre
from core.utils import normalize_text, parse_date
from services.catalogos.models import PersonaVentas
from services.comisiones.models import (
    ComisionPeriodo,
    ComisionVenta,
    CondicionesComision,
    IndicadorComision,
    PosicionJerarquia,
    RevisionComision,
)
from services.subscriptions.analytics.queries import (
    calculate_aggregation_totals,
    get_business_units_data,
    get_periodos,
)
from services.subscriptions.models import Coordinador

from .reglas import (
    EXCLUIDA,
    NO_PAGADA,
    REVISION,
    VALIDA,
    Venta,
    calcular_pagos,
    clasificar,
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


class FaltanColumnas(RuntimeError):
    """La tabla de suscripciones no trae las columnas que Comisiones necesita."""


# --- Fechas --------------------------------------------------------------------------

def mes_anterior(periodo: str) -> str:
    """`YYYY-MM` del mes anterior."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio - 1}-12" if mes == 1 else f"{anio}-{mes - 1:02d}"


def mes_siguiente(periodo: str) -> str:
    """`YYYY-MM` del mes siguiente."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{anio + 1}-01" if mes == 12 else f"{anio}-{mes + 1:02d}"


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
    """El ultimo dia de instalacion del periodo: el anterior a sus dias promocionales."""
    return periodo.inicio_promo - timedelta(days=1)


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
    }


# --- Lectura -----------------------------------------------------------------------

def _leer_candidatas(inicio: date, fin: date, extra: list[str]) -> pd.DataFrame:
    """Las suscripciones instaladas en la ventana, mas las ordenes de `extra`.

    `fecha_inicio` es texto, como toda columna importada. Las fechas ISO se
    filtran en SQL; las que vengan en otro formato (no deberia haberlas, pero
    el export no lo garantiza) se traen y se resuelven con `parse_date`.
    """
    db = DBConnector()
    columnas = db.columnas(TableNames.SUBSCRIPTIONS)
    faltan = [titulo for col, titulo in COLUMNAS_REQUERIDAS.items() if col not in columnas]
    if faltan:
        raise FaltanColumnas(
            "La tabla de suscripciones no trae "
            + ", ".join(f"«{t}»" for t in faltan)
            + ". Vuelve a importar las suscripciones con un export que incluya esas columnas."
        )

    df = db.query(
        f"""
        SELECT orden_producto, cliente, sucursal, zona, estado, fecha_inicio,
               producto, tarifa, total, vendedor, medio, medio_supervisor, estado_factura
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE (fecha_inicio ~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}'
               AND LEFT(fecha_inicio, 10) BETWEEN %s AND %s)
           OR (fecha_inicio IS NOT NULL AND fecha_inicio !~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}')
           OR orden_producto = ANY(%s)
        """,
        params=[inicio.isoformat(), fin.isoformat(), list(extra)],
    )
    if df.empty:
        return df

    df["fecha"] = df["fecha_inicio"].map(lambda v: (parse_date(v) or pd.NaT) if v else pd.NaT)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date
    en_ventana = df["fecha"].map(lambda f: isinstance(f, date) and inicio <= f <= fin)
    return df[en_ventana | df["orden_producto"].isin(extra)].copy()


def _indice_planes() -> tuple[dict[tuple[str, str], dict], dict[str, dict]]:
    """Los planes del catalogo por (nombre, tarifa) y por nombre (gana el ultimo)."""
    por_tarifa: dict[tuple[str, str], dict] = {}
    por_nombre: dict[str, dict] = {}
    for plan in fixtures.planes():
        por_tarifa[(plan["name"], plan.get("tarifa") or "")] = plan
        por_nombre[plan["name"]] = plan
    return por_tarifa, por_nombre


class _Directorio:
    """El directorio de ventas y la jerarquia, indexados para resolver literales."""

    def __init__(self):
        self.personas = {p.id: p for p in PersonaVentas.objects.all()}
        self.por_medio = {clave_nombre(p.medio): p for p in self.personas.values()}
        # Odoo a veces escribe a la misma persona de otra forma como supervisor.
        self.por_supervisor = {clave_nombre(p.literal_supervisor): p for p in self.personas.values()}
        self.por_usuario = {
            clave_nombre(p.usuario_odoo): p for p in self.personas.values() if p.usuario_odoo
        }
        self.superior = dict(PosicionJerarquia.objects.values_list("persona_id", "superior_id"))

    def nombre(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.nombre_completo if persona else ""

    def cargo(self, persona_id: int | None) -> str:
        persona = self.personas.get(persona_id) if persona_id else None
        return persona.cargo if persona else ""

    def subir_hasta(self, desde: int | None, cargo: str) -> int | None:
        """El primer superior de `desde` (el mismo incluido) con el cargo pedido."""
        actual, vistos = desde, set()
        while actual is not None and actual not in vistos:
            if self.cargo(actual) == cargo:
                return actual
            vistos.add(actual)
            actual = self.superior.get(actual)
        return None

    def resolver(self, medio: str, supervisor: str, vendedor: str) -> tuple[dict[str, int | None], list[str]]:
        """Las personas de una venta y los avisos de lo que no se pudo resolver.

        Lo que trae la venta manda; la jerarquia solo rellena una columna
        vacia, y da siempre el coordinador de UN (Odoo no lo tiene). Un
        literal que no esta en el directorio no se rellena con la jerarquia:
        es un problema de registro, y se avisa.
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

        if not supervisor:
            supervisor_id = self.subir_hasta(medio_id, "supervisor")
        if not vendedor:
            oficina_id = self.subir_hasta(supervisor_id or medio_id, "coord_oficina")
        coord_un_id = self.subir_hasta(oficina_id or supervisor_id or medio_id, "coord_un")
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

    revisiones = list(
        RevisionComision.objects.filter(periodo_origen=clave)
        | RevisionComision.objects.filter(decision="diferir", periodo_destino=clave)
    )
    decisiones = {r.orden: r for r in revisiones if r.periodo_origen == clave}
    diferidas_aqui = [r.orden for r in revisiones if r.periodo_origen != clave]
    diferidas_fuera = {o for o, r in decisiones.items() if r.decision == "diferir"}

    pagadas = dict(
        ComisionVenta.objects.filter(clasificacion=VALIDA, periodo__estado="cerrado")
        .exclude(periodo__periodo=clave)
        .values_list("orden", "periodo__periodo")
    )

    df = _leer_candidatas(inicio, fin, diferidas_aqui)
    planes_tarifa, planes_nombre = _indice_planes()
    directorio = _Directorio()

    ventas: list[dict[str, Any]] = []
    for fila in df.itertuples(index=False):
        orden = str(fila.orden_producto)
        texto = lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()  # noqa: E731

        plan = planes_tarifa.get((texto(fila.producto), texto(fila.tarifa))) or planes_nombre.get(texto(fila.producto))
        pyme = bool(plan and plan.get("people") == "PYME")
        precio = float(plan.get("price") or 0) if plan else 0.0
        estado = SUBS_STATE_TO_LOG_MAP.get(normalize_text(fila.estado), "")
        decision = decisiones.get(orden)

        if orden in diferidas_fuera:
            clasificacion, motivo = EXCLUIDA, f"Diferida a {decision.periodo_destino}"
        elif orden in pagadas:
            clasificacion, motivo = EXCLUIDA, f"Ya se pagó en {pagadas[orden]}"
        else:
            clasificacion, motivo = clasificar(
                estado == ACTIVE_STATE, texto(fila.estado_factura), decision.decision if decision else None
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
            "decision": decision.decision if decision else None,
            "periodo_destino": decision.periodo_destino if decision else "",
            "nota_revision": decision.nota if decision else "",
            "diferida_desde": next((r.periodo_origen for r in revisiones if r.orden == orden and r.periodo_origen != clave), ""),
            "medio": texto(fila.medio),
            "medio_supervisor": texto(fila.medio_supervisor),
            "vendedor": texto(fila.vendedor),
            **personas,
            "coord_un": directorio.nombre(personas["coord_un_id"]),
            "avisos": avisos,
        })

    indicadores = {i.persona_id: i for i in IndicadorComision.objects.filter(periodo=clave)}
    cumplimientos = {
        pid: float(i.cumplimiento_pct) for pid, i in indicadores.items() if i.cumplimiento_pct is not None
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
            "crecimiento_pct": crecimiento.get("valor"),
            "crecimiento_calculado": crecimiento.get("calculado"),
            "crecimiento_fuente": crecimiento.get("fuente"),
            "unidades": crecimiento.get("unidades", []),
        })
    filas_pago.sort(key=lambda f: (f["cargo"], f["nombre"]))

    conteo = lambda c: sum(1 for v in ventas if v["clasificacion"] == c)  # noqa: E731
    hoy = date.today()
    calculo_desde = fecha_de_calculo(clave, condiciones["dias_espera"])
    informe = {
        "periodo": clave,
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat(),
        "inicio_promo": periodo.inicio_promo.isoformat(),
        "estado": periodo.estado,
        "calculo_desde": calculo_desde.isoformat(),
        "antes_de_tiempo": hoy < calculo_desde,
        "resumen": {
            "candidatas": len(ventas),
            "validas": conteo(VALIDA),
            "no_pagadas": conteo(NO_PAGADA),
            "revision": conteo(REVISION),
            "excluidas": conteo(EXCLUIDA),
            "validas_pyme": sum(1 for v in validas if v["pyme"]),
            "validas_sin_medio": sum(1 for v in validas if v["medio_id"] is None),
            "total": round(sum(p["neto"] for p in filas_pago), 2),
        },
        "pagos": filas_pago,
        "revision": [v for v in ventas if v["clasificacion"] == REVISION or v["decision"] or v["diferida_desde"]],
        "pendientes_cierre": _pendientes_cierre(ventas, filas_pago),
    }
    return informe, ventas


def _pendientes_cierre(ventas: list[dict[str, Any]], pagos: list[dict[str, Any]]) -> list[str]:
    """Lo que impide cerrar el periodo. Vacio: se puede cerrar."""
    pendientes = []
    revision = sum(1 for v in ventas if v["clasificacion"] == REVISION)
    if revision:
        pendientes.append(f"{revision} venta(s) por facturar sin decidir en Revisión")
    sin_cumplimiento = [
        p["nombre"] for p in pagos
        if p["cargo"] in ("supervisor", "coord_oficina") and p["cumplimiento_pct"] is None and p["bruto"]
    ]
    if sin_cumplimiento:
        pendientes.append("Cumplimiento sin definir: " + ", ".join(sin_cumplimiento))
    sin_crecimiento = [
        p["nombre"] for p in pagos
        if p["cargo"] == "coord_un" and p["crecimiento_pct"] is None and p["ventas_equipo"]
    ]
    if sin_crecimiento:
        pendientes.append("Crecimiento desconocido: " + ", ".join(sin_crecimiento))
    return pendientes
