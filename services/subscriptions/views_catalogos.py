"""Catalogos de referencia: la pantalla de configuracion y su CRUD.

Planes y zonas eran `data/Planes.json` y `data/Zonas.json`, y cambiarlos
exigia editar un fichero del repositorio y volver a desplegar. Aqui se
mantienen desde la propia aplicacion.

Es un solo par de endpoints para todos los catalogos y no veinte vistas casi
iguales: lo unico que cambia entre ellos es que campos se leen del cuerpo y
como se serializa la fila, y eso es lo que declara `CATALOGOS`.

Toda escritura llama a `fixtures.reset_cache()`: el catalogo se lee cacheado
—el worker de Celery es otro proceso— y sin esto una edicion tardaria hasta un
minuto en verse, o no se veria nunca en el proceso que ya la tenia leida.

Los catalogos se reparten entre dos permisos, porque los mantienen equipos
distintos: el **comercial** (zonas, sites, estados y coordinadores: como se
reparte la red entre los equipos de venta) y el **operacional** (planes, planes
reguladores, ignorados y la lista de productos por registrar). Cada entrada de `CATALOGOS` declara el suyo; la pantalla abre
con cualquiera de los dos y solo envia las pestanas del que se tiene, y cada
escritura comprueba el del catalogo que toca, no el de la pantalla.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core import fixtures
from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.subscriptions.analytics.imports import productos_fuera_de_catalogo
from services.subscriptions.analytics.objetivos import (
    get_objetivos_config,
    nodos_conocidos,
    serializar_semaforo,
)
from services.subscriptions.analytics.queries import get_periodos
from services.subscriptions.models import (
    CAMPOS_REFERENCIA,
    NIVEL_OBJETIVO_CHOICES,
    NIVELES_CON_SUCURSAL,
    REFERENCIA_POR_NIVEL,
    TECNOLOGIA_CHOICES,
    TIPO_PERSONA_CHOICES,
    Coordinador,
    Estado,
    ObjetivoComercial,
    ObjetivoMes,
    Plan,
    PlanRegulador,
    ProductoIgnorado,
    SemaforoObjetivos,
    Site,
    Zona,
)

logger = logging.getLogger(__name__)


class DatosInvalidos(ValueError):
    """Lo que mando el cliente no compone una fila valida."""


class Duplicado(DatosInvalidos):
    """La fila chocaria con otra que ya existe (se responde 409, no 400)."""


def _texto(data: dict, clave: str, *, obligatorio: bool = False, maximo: int = 255) -> str:
    """Lee un campo de texto del cuerpo, recortado y con longitud maxima."""
    valor = str(data.get(clave) or "").strip()
    if obligatorio and not valor:
        raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
    return valor[:maximo]


def _numero(data: dict, clave: str, por_defecto: float = 0.0) -> float:
    """Lee un campo numerico del cuerpo."""
    try:
        return float(data.get(clave) or por_defecto)
    except (TypeError, ValueError):
        raise DatosInvalidos(f"El campo «{clave}» debe ser un numero.") from None


def _opcion(data: dict, clave: str, opciones, por_defecto: str) -> str:
    """Lee un campo que solo admite unos valores concretos."""
    valor = str(data.get(clave) or por_defecto).strip()
    validas = [v for v, _ in opciones]
    if valor not in validas:
        raise DatosInvalidos(
            f"«{valor}» no es un valor valido para {clave}: {', '.join(validas)}."
        )
    return valor


def _relacion(modelo, data: dict, clave: str, *, obligatorio: bool):
    """Resuelve la clave ajena de un campo del cuerpo."""
    bruto = data.get(clave)
    if bruto in (None, "", 0):
        if obligatorio:
            raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
        return None
    fila = modelo.objects.filter(pk=bruto).first()
    if fila is None:
        raise DatosInvalidos(f"No existe el registro indicado en «{clave}».")
    return fila


# --- Serializacion ----------------------------------------------------------

def _plan(p: Plan) -> dict[str, Any]:
    """Un plan, tal y como lo consume la interfaz."""
    return {
        "id": p.id,
        "nombre": p.nombre,
        "tarifa": p.tarifa,
        "tecnologia": p.tecnologia,
        "tipo_persona": p.tipo_persona,
        "referencia": p.referencia,
        "tiene_tv": p.tiene_tv,
        "datas_mbps": float(p.datas_mbps),
        "precio": float(p.precio),
        "declarar_en_eta": p.declarar_en_eta,
        "plan_regulador_id": p.plan_regulador_id,
        "plan_regulador": p.plan_regulador.nombre if p.plan_regulador_id else "",
    }


def _plan_regulador(r: PlanRegulador) -> dict[str, Any]:
    """Un plan regulador, con cuantos planes comerciales se declaran con el."""
    return {
        "id": r.id,
        "nombre": r.nombre,
        "tecnologia": r.tecnologia,
        "tipo_persona": r.tipo_persona,
        "datas_mbps": float(r.datas_mbps),
        "precio": float(r.precio),
        "tiene_tv": r.tiene_tv,
        "es_transporte": r.es_transporte,
        "notas": r.notas,
        "planes": r.planes.count(),
    }


def _zona(z: Zona) -> dict[str, Any]:
    """Una zona, con los nombres de sus relaciones resueltos."""
    return {
        "id": z.id,
        "nombre": z.nombre,
        "site_id": z.site_id,
        "site": z.site.nombre,
        "estado_id": z.estado_id,
        "estado": z.estado.nombre,
        "tecnologia": z.tecnologia,
        "coordinador_id": z.coordinador_id,
        "coordinador": z.coordinador.nombre if z.coordinador else "",
    }


def _site(s: Site) -> dict[str, Any]:
    """Un site, con cuantas zonas lo referencian."""
    return {"id": s.id, "nombre": s.nombre, "orden": s.orden, "zonas": s.zonas.count()}


def _estado(e: Estado) -> dict[str, Any]:
    """Un estado, con cuantas zonas lo referencian."""
    return {"id": e.id, "nombre": e.nombre, "zonas": e.zonas.count()}


def _coordinador(c: Coordinador) -> dict[str, Any]:
    """Un coordinador, con cuantas zonas lo referencian."""
    return {"id": c.id, "nombre": c.nombre, "zonas": c.zonas.count()}


def _ignorado(i: ProductoIgnorado) -> dict[str, Any]:
    """Un producto ignorado, con quien y cuando lo declaro."""
    return {
        "id": i.id,
        "nombre": i.nombre,
        "nota": i.nota,
        "creado_por": i.creado_por.username if i.creado_por else "",
        "creado_en": i.creado_en.strftime("%Y-%m-%d %H:%M"),
    }


# --- Aplicacion del cuerpo a la fila ----------------------------------------

def _aplicar_plan(fila: Plan, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=150)
    fila.tarifa = _texto(data, "tarifa", maximo=150)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _opcion(data, "tipo_persona", TIPO_PERSONA_CHOICES, "nat")
    fila.referencia = _texto(data, "referencia", maximo=200)
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.datas_mbps = _numero(data, "datas_mbps")
    fila.precio = _numero(data, "precio")
    fila.declarar_en_eta = bool(data.get("declarar_en_eta", True))
    # Opcional: un plan recien creado todavia no esta agrupado, y hasta que lo
    # este no aparece en los formularios de la reguladora.
    fila.plan_regulador = _relacion(PlanRegulador, data, "plan_regulador_id", obligatorio=False)


def _aplicar_plan_regulador(fila: PlanRegulador, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan regulador."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=200)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _opcion(data, "tipo_persona", TIPO_PERSONA_CHOICES, "nat")
    fila.datas_mbps = _numero(data, "datas_mbps")
    fila.precio = _numero(data, "precio")
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.es_transporte = bool(data.get("es_transporte", False))
    fila.notas = _texto(data, "notas")


def _aplicar_zona(fila: Zona, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre una zona."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)
    fila.site = _relacion(Site, data, "site_id", obligatorio=True)
    fila.estado = _relacion(Estado, data, "estado_id", obligatorio=True)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.coordinador = _relacion(Coordinador, data, "coordinador_id", obligatorio=False)


def _aplicar_site(fila: Site, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un site."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=80)
    fila.orden = int(_numero(data, "orden", 999))


def _aplicar_nombre(fila, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un catalogo que solo tiene nombre."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)


def _aplicar_ignorado(fila: ProductoIgnorado, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un producto ignorado, anotando quien lo creo."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=200)
    fila.nota = _texto(data, "nota")
    if fila.creado_por_id is None:
        fila.creado_por = request.user


# --- Objetivos ----------------------------------------------------------------

_MES = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Los modelos de cada nivel, para resolver la referencia que manda el cliente.
_MODELO_POR_NIVEL = {
    "estado": Estado,
    "site": Site,
    "coordinador": Coordinador,
    "zona": Zona,
    "zona_sucursal": Zona,
}


def _mes(data: dict, clave: str, *, obligatorio: bool) -> str | None:
    """Lee un mes `YYYY-MM`; vacio es None (en `desde`, "desde siempre")."""
    valor = str(data.get(clave) or "").strip()
    if not valor:
        if obligatorio:
            raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
        return None
    if not _MES.match(valor):
        raise DatosInvalidos(f"«{valor}» no es un mes valido: se espera AAAA-MM.")
    return valor


def _porcentaje(data: dict, clave: str) -> float | None:
    """Lee un porcentaje opcional entre 0 y 100; vacio es None ("hereda")."""
    bruto = data.get(clave)
    if bruto in (None, ""):
        return None
    try:
        valor = float(bruto)
    except (TypeError, ValueError):
        raise DatosInvalidos(f"El campo «{clave}» debe ser un numero.") from None
    if not 0 <= valor <= 100:
        raise DatosInvalidos(f"El campo «{clave}» debe estar entre 0 y 100.")
    return valor


def _valores_objetivo(fila, data: dict) -> None:
    """Crecimiento y churn: al menos uno, porque el otro puede heredarse."""
    fila.crecimiento_pct = _porcentaje(data, "crecimiento_pct")
    fila.churn_pct = _porcentaje(data, "churn_pct")
    if fila.crecimiento_pct is None and fila.churn_pct is None:
        raise DatosInvalidos("Indica al menos el objetivo de crecimiento o el de churn.")


def _pct(valor) -> float | None:
    """Decimal del ORM a float, conservando el nulo que significa "hereda"."""
    return None if valor is None else float(valor)


def _objetivo(o: ObjetivoComercial) -> dict[str, Any]:
    """Un tramo de objetivo, con el nombre de su entidad resuelto.

    `entidad` es el nombre con el que se cruza contra los reportes: la sucursal
    tal cual, o `"Zona - Sucursal"` en un nodo.
    """
    entidad = o.entidad
    return {
        "id": o.id,
        "nivel": o.nivel,
        "entidad_id": entidad.id if entidad else None,
        "entidad": o.nombre_entidad,
        "sucursal": o.sucursal,
        "desde": o.desde or "",
        "crecimiento_pct": _pct(o.crecimiento_pct),
        "churn_pct": _pct(o.churn_pct),
        "nota": o.nota,
        "actualizado_por": o.actualizado_por.username if o.actualizado_por else "",
        "actualizado_en": o.actualizado_en.strftime("%Y-%m-%d %H:%M"),
    }


def _objetivo_mes(o: ObjetivoMes) -> dict[str, Any]:
    """La excepcion de un mes."""
    return {
        "id": o.id,
        "periodo": o.periodo,
        "crecimiento_pct": _pct(o.crecimiento_pct),
        "churn_pct": _pct(o.churn_pct),
        "nota": o.nota,
        "actualizado_por": o.actualizado_por.username if o.actualizado_por else "",
        "actualizado_en": o.actualizado_en.strftime("%Y-%m-%d %H:%M"),
    }


def _semaforo(s: SemaforoObjetivos) -> dict[str, Any]:
    """Los umbrales de color, con el id de la fila unica."""
    return {"id": s.id, **serializar_semaforo(s)}


def _es_general(fila: ObjetivoComercial) -> bool:
    """El objetivo general: una sola fila, sin fecha, que no se crea ni se borra."""
    return fila.nivel == "general"


def _entidad_objetivo(nivel: str, data: dict):
    """La fila de catalogo del nivel: por `entidad_id` o por `entidad_nombre`.

    El nombre existe porque un nodo se elige de los datos (`"Guacara - NYC"`),
    que traen el nombre de la zona y no su id.
    """
    modelo = _MODELO_POR_NIVEL[nivel]
    if data.get("entidad_id") not in (None, "", 0):
        return _relacion(modelo, data, "entidad_id", obligatorio=True)
    nombre = _texto(data, "entidad_nombre", maximo=200)
    if not nombre:
        raise DatosInvalidos("Indica a qué zona, site, estado o coordinador va el objetivo.")
    fila = modelo.objects.filter(nombre__iexact=nombre).first()
    if fila is None:
        raise DatosInvalidos(f"«{nombre}» no está en el catálogo.")
    return fila


def _referencia_objetivo(nivel: str, data: dict) -> dict[str, Any]:
    """Los campos que identifican a quien tiene el objetivo en `nivel`."""
    referencia: dict[str, Any] = {}
    campo = REFERENCIA_POR_NIVEL.get(nivel)
    if campo:
        referencia[campo] = _entidad_objetivo(nivel, data)
    if nivel in NIVELES_CON_SUCURSAL:
        referencia["sucursal"] = _texto(data, "sucursal", obligatorio=True, maximo=80)
    return referencia


def _filtro_referencia(nivel: str, referencia: dict[str, Any], desde: str | None) -> dict[str, Any]:
    """El filtro de "el mismo tramo": mismo nivel, misma entidad, mismo `desde`.

    La sucursal se compara sin mayusculas: `nyc` y `NYC` son la misma.
    """
    filtro: dict[str, Any] = {"nivel": nivel, "desde": desde}
    for campo, valor in referencia.items():
        if campo == "sucursal":
            filtro["sucursal__iexact"] = valor
        else:
            filtro[campo] = valor
    return filtro


def _aplicar_objetivo(fila: ObjetivoComercial, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo de objetivo.

    El nivel y la entidad solo se fijan al crearlo: mover un tramo de una zona
    a otra es borrar uno y crear otro, y asi la tabla no cambia de significado
    bajo los pies de quien la esta mirando.

    El general es una sola fila sin fecha: se edita, pero no se crea otro ni se
    le pone vigencia. Lo que cambia en un mes concreto es una excepcion de mes.
    """
    if fila.pk is None:
        fila.nivel = _opcion(data, "nivel", NIVEL_OBJETIVO_CHOICES, "zona")
        if _es_general(fila) and ObjetivoComercial.objects.filter(nivel="general").exists():
            raise Duplicado("El objetivo general es uno solo: edítalo.")
        for campo, valor in _referencia_objetivo(fila.nivel, data).items():
            setattr(fila, campo, valor)

    desde = _mes(data, "desde", obligatorio=False)
    if _es_general(fila) and desde is not None:
        raise DatosInvalidos(
            "El objetivo general no lleva fecha: para cambiar un mes concreto usa una excepción de mes."
        )
    fila.desde = desde

    _valores_objetivo(fila, data)
    if _es_general(fila) and (fila.crecimiento_pct is None or fila.churn_pct is None):
        raise DatosInvalidos("El objetivo general necesita crecimiento y churn: no hay de quien heredar.")

    # La unicidad (entidad, desde) no la puede exigir la BD —los NULL son
    # distintos en un UNIQUE—, asi que se comprueba aqui.
    campo = REFERENCIA_POR_NIVEL.get(fila.nivel)
    referencia: dict[str, Any] = {campo: getattr(fila, campo)} if campo else {}
    if fila.nivel in NIVELES_CON_SUCURSAL:
        referencia["sucursal"] = fila.sucursal
    filtro = _filtro_referencia(fila.nivel, referencia, fila.desde)
    if ObjetivoComercial.objects.filter(**filtro).exclude(pk=fila.pk).exists():
        cuando = f"desde {fila.desde}" if fila.desde else "desde siempre"
        quien = fila.nombre_entidad or "el nivel general"
        raise Duplicado(f"Ya hay un objetivo {cuando} para {quien}: edítalo.")

    fila.nota = _texto(data, "nota")
    fila.actualizado_por = request.user


def _borrar_objetivo(fila: ObjetivoComercial) -> str | None:
    """Por que no se puede borrar este tramo, o None si se puede."""
    if _es_general(fila):
        return "El objetivo general no se puede eliminar: es el que responde cuando nadie más lo hace."
    return None


def _aplicar_objetivo_mes(fila: ObjetivoMes, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la excepcion de un mes."""
    periodo = _mes(data, "periodo", obligatorio=True)
    if ObjetivoMes.objects.filter(periodo=periodo).exclude(pk=fila.pk).exists():
        raise Duplicado(f"El mes {periodo} ya tiene una excepción: edítala.")
    fila.periodo = periodo
    _valores_objetivo(fila, data)
    fila.nota = _texto(data, "nota")
    fila.actualizado_por = request.user


def _aplicar_semaforo(fila: SemaforoObjetivos, data: dict, request) -> None:
    """Vuelca el cuerpo sobre los umbrales de color (valores directos, en %)."""
    campos = (
        "cumpl_verde", "cumpl_amarillo",
        "crec_verde", "crec_amarillo",
        "churn_verde", "churn_amarillo",
    )
    valores = {}
    for campo in campos:
        # No `_numero`: su `or por_defecto` tomaria un 0 legitimo (amarillo de
        # crecimiento desde 0%, por ejemplo) por un campo vacio.
        bruto = data.get(campo)
        if bruto in (None, ""):
            raise DatosInvalidos(f"El campo «{campo}» es obligatorio.")
        try:
            valores[campo] = float(bruto)
        except (TypeError, ValueError):
            raise DatosInvalidos(f"El campo «{campo}» debe ser un numero.") from None
    # El crecimiento puede ser negativo (amarillo desde -1%, por ejemplo); un
    # churn o un cumplimiento negativos no significan nada.
    if any(valores[campo] < 0 for campo in ("cumpl_verde", "cumpl_amarillo", "churn_verde", "churn_amarillo")):
        raise DatosInvalidos("Los umbrales de churn y de cumplimiento no pueden ser negativos.")
    if valores["cumpl_amarillo"] > valores["cumpl_verde"]:
        raise DatosInvalidos("En cumplimiento, el amarillo tiene que empezar por debajo del verde.")
    if valores["crec_amarillo"] > valores["crec_verde"]:
        raise DatosInvalidos("En crecimiento, el amarillo tiene que empezar por debajo del verde.")
    if valores["churn_verde"] > valores["churn_amarillo"]:
        raise DatosInvalidos("En churn, el verde tiene que acabar por debajo del amarillo.")
    for campo, valor in valores.items():
        setattr(fila, campo, valor)
    fila.actualizado_por = request.user


PERMISO_COMERCIAL = "can_manage_catalogo_comercial"
PERMISO_OPERACIONAL = "can_manage_catalogo_operacional"

# Un catalogo = un modelo, como se sirve, como se lee del cuerpo y que permiso
# lo administra. Anadir uno nuevo es anadir una entrada aqui y una pestana en
# la interfaz.
CATALOGOS: dict[str, dict[str, Any]] = {
    "planes": {"modelo": Plan, "serializar": _plan, "aplicar": _aplicar_plan, "etiqueta": "plan", "permiso": PERMISO_OPERACIONAL},
    "reguladores": {"modelo": PlanRegulador, "serializar": _plan_regulador, "aplicar": _aplicar_plan_regulador, "etiqueta": "plan regulador", "permiso": PERMISO_OPERACIONAL},
    "ignorados": {"modelo": ProductoIgnorado, "serializar": _ignorado, "aplicar": _aplicar_ignorado, "etiqueta": "producto ignorado", "permiso": PERMISO_OPERACIONAL},
    "zonas": {"modelo": Zona, "serializar": _zona, "aplicar": _aplicar_zona, "etiqueta": "zona", "permiso": PERMISO_COMERCIAL},
    "sites": {"modelo": Site, "serializar": _site, "aplicar": _aplicar_site, "etiqueta": "site", "permiso": PERMISO_COMERCIAL},
    "estados": {"modelo": Estado, "serializar": _estado, "aplicar": _aplicar_nombre, "etiqueta": "estado", "permiso": PERMISO_COMERCIAL},
    "coordinadores": {"modelo": Coordinador, "serializar": _coordinador, "aplicar": _aplicar_nombre, "etiqueta": "coordinador", "permiso": PERMISO_COMERCIAL},
    # Los objetivos van con el catalogo comercial: quien reparte la red entre
    # los equipos de venta es quien fija lo que se espera de cada parte.
    # `borrable` responde por que no se puede borrar una fila concreta.
    "objetivos": {"modelo": ObjetivoComercial, "serializar": _objetivo, "aplicar": _aplicar_objetivo, "etiqueta": "objetivo", "permiso": PERMISO_COMERCIAL, "borrable": _borrar_objetivo},
    "objetivos_mes": {"modelo": ObjetivoMes, "serializar": _objetivo_mes, "aplicar": _aplicar_objetivo_mes, "etiqueta": "objetivo del mes", "permiso": PERMISO_COMERCIAL},
    # Fila unica: se edita siempre la misma y no se borra.
    "semaforo": {"modelo": SemaforoObjetivos, "serializar": _semaforo, "aplicar": _aplicar_semaforo, "etiqueta": "semáforo", "permiso": PERMISO_COMERCIAL, "unico": True},
}


def _puede(request, permiso: str) -> bool:
    """Si el usuario de la peticion tiene `permiso` (superusuario incluido)."""
    if request.user.is_superuser:
        return True
    perfil = getattr(request.user, "profile", None)
    return bool(perfil and perfil.has_permission(permiso))


def _catalogo_permitido(request, data: dict) -> tuple[dict[str, Any] | None, JsonResponse | None]:
    """El catalogo que pide el cuerpo, o la respuesta de error si no se puede tocar.

    Los endpoints de escritura dejan pasar a quien tenga cualquiera de los dos
    permisos; aqui se exige el del catalogo concreto, que es lo que impide que
    el grupo comercial edite un plan mandando `tipo: "planes"` a mano.
    """
    catalogo = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalogo is None:
        return None, JsonResponse({"status": "error", "message": "Catálogo desconocido."}, status=400)
    if not _puede(request, catalogo["permiso"]):
        return None, JsonResponse(
            {
                "status": "error",
                "message": f"Acceso denegado. Se requiere el privilegio: {catalogo['permiso']}.",
            },
            status=403,
        )
    return catalogo, None


def _listado(nombre: str) -> list[dict[str, Any]]:
    """Todas las filas de un catalogo, ya serializadas."""
    catalogo = CATALOGOS[nombre]
    consulta = catalogo["modelo"].objects.all()
    if nombre == "zonas":
        consulta = consulta.select_related("site", "estado", "coordinador")
    elif nombre == "planes":
        consulta = consulta.select_related("plan_regulador")
    elif nombre == "ignorados":
        consulta = consulta.select_related("creado_por")
    elif nombre == "objetivos":
        consulta = consulta.select_related(*CAMPOS_REFERENCIA, "actualizado_por")
    elif nombre == "objetivos_mes":
        consulta = consulta.select_related("actualizado_por")
    return [catalogo["serializar"](fila) for fila in consulta]


# --- Vistas -----------------------------------------------------------------

@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
def catalogos_view(request):
    """Pantalla de configuracion de los catalogos.

    Solo se envian los catalogos del permiso que se tiene: los del otro llegan
    como listas vacias y la interfaz oculta sus pestanas. `comercial` y
    `operacional` le dicen cuales mostrar sin que tenga que deducirlo de que
    una lista venga vacia, que tambien puede ser un catalogo sin filas.

    `?nuevo_plan=<nombre>` abre el formulario de plan ya relleno con ese
    nombre: es a donde lleva el aviso de la importacion cuando encuentra un
    producto sin catalogar, para no obligar a copiarlo a mano.
    """
    comercial = _puede(request, PERMISO_COMERCIAL)
    operacional = _puede(request, PERMISO_OPERACIONAL)

    props = {
        nombre: _listado(nombre) if _puede(request, catalogo["permiso"]) else []
        for nombre, catalogo in CATALOGOS.items()
        if not catalogo.get("unico")
    }
    props.update({
        "comercial": comercial,
        "operacional": operacional,
        "tecnologias": [{"value": v, "label": t} for v, t in TECNOLOGIA_CHOICES],
        "tiposPersona": [{"value": v, "label": t} for v, t in TIPO_PERSONA_CHOICES],
        "nuevoPlan": (request.GET.get("nuevo_plan") or "").strip() if operacional else "",
        "section": "catalogos",
    })

    # Lo que ya esta importado y hoy no esta en el catalogo. Es la razon de ser
    # de la mitad operacional: enterarse de que falta algo sin esperar al proximo
    # analisis. Si la consulta falla (entorno sin datos aun) no se rompe la
    # pagina por ello.
    # Lo que la pestana de objetivos necesita ademas de sus filas: el semaforo,
    # la configuracion ya resuelta (para mostrar el objetivo efectivo de cada
    # mes con la misma regla que los reportes) y los meses calculados.
    props["semaforo"] = _semaforo(SemaforoObjetivos.actual()) if comercial else None
    props["objetivosConfig"] = get_objetivos_config() if comercial else None
    props["periodosCalculados"] = (
        sorted({p[:7] for p in get_periodos()}, reverse=True) if comercial else []
    )
    # La sucursal no es un catalogo: los nodos que ya aparecen en los datos son
    # de donde se eligen la sucursal y el nodo de un objetivo.
    props["nodosConocidos"] = nodos_conocidos() if comercial else []

    props["pendientes"] = []
    if operacional:
        try:
            props["pendientes"] = productos_fuera_de_catalogo()
        except Exception:
            logger.exception("No se pudieron calcular los productos fuera de catalogo")

    return render_inertia(request, "Subscriptions/Catalogos", clean_json_props(props))


@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_guardar(request):
    """Alta o edicion de una fila de cualquiera de los catalogos."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo

    fila_id = data.get("id")
    if catalogo.get("unico"):
        fila = catalogo["modelo"].actual()
    elif fila_id:
        fila = catalogo["modelo"].objects.filter(pk=fila_id).first()
        if fila is None:
            return JsonResponse({"status": "error", "message": "El registro ya no existe."}, status=404)
    else:
        fila = catalogo["modelo"]()

    try:
        catalogo["aplicar"](fila, data, request)
        fila.save()
    except Duplicado as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=409)
    except DatosInvalidos as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except IntegrityError:
        return JsonResponse(
            {"status": "error", "message": f"Ya existe un {catalogo['etiqueta']} con ese nombre."},
            status=409,
        )

    fixtures.reset_cache()
    return JsonResponse({
        "status": "success",
        "message": f"{catalogo['etiqueta'].capitalize()} guardado.",
        "registro": catalogo["serializar"](fila),
    })


@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_eliminar(request):
    """Baja de una fila.

    Un site, un estado o un coordinador con zonas colgando no se borra: la zona
    los referencia con `PROTECT` y borrarlos dejaria el catalogo incoherente.
    Se responde 409 explicando cual es el estorbo en vez de un 500.
    """
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo

    if catalogo.get("unico"):
        return JsonResponse(
            {"status": "error", "message": f"El {catalogo['etiqueta']} no se elimina: edítalo."},
            status=400,
        )

    fila = catalogo["modelo"].objects.filter(pk=data.get("id")).first()
    if fila is None:
        return JsonResponse({"status": "success", "message": "El registro ya no existía."})

    if borrable := catalogo.get("borrable"):
        motivo = borrable(fila)
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=409)

    try:
        fila.delete()
    except ProtectedError:
        return JsonResponse(
            {
                "status": "error",
                "message": (
                    f"No se puede eliminar este {catalogo['etiqueta']}: tiene zonas "
                    "asociadas. Reasígnalas primero."
                ),
            },
            status=409,
        )

    fixtures.reset_cache()
    return JsonResponse({"status": "success", "message": f"{catalogo['etiqueta'].capitalize()} eliminado."})
