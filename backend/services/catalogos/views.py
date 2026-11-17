"""El modulo de Catalogos: sus cuatro paginas y el CRUD de todas ellas.

Planes y zonas eran `data/Planes.json` y `data/Zonas.json`, y cambiarlos
exigia editar un fichero del repositorio y volver a desplegar. Despues fueron
una pantalla de Subscriptions (`/subscriptions/config/`), y hoy son un modulo
propio porque los usan dos: Subscriptions y Comisiones.

El modulo se reparte en grupos, una pagina cada uno y un permiso cada uno:
**Productos** (planes y reguladores; el permiso operacional), **Estructura**
(zonas y estados; el comercial) y **Ventas** (sites y unidades de negocio, los
equipos de ventas con su gente y sus condiciones de pago, y los objetivos; el de
ventas). **Notificaciones** junta lo pendiente de cada area
—lo que esta en los datos importados y nadie registro— y lo que se decidio
ignorar; cada usuario ve ahi solo las areas que administra.

Los modelos siguen en `services/subscriptions/models.py`: sus tablas ya tienen
nombre propio y mudar las clases de app no le da nada a nadie.

Es un solo par de endpoints para todos los catalogos y no veinte vistas casi
iguales: lo unico que cambia entre ellos es que campos se leen del cuerpo y
como se serializa la fila, y eso es lo que declara `CATALOGOS`. Cada escritura
comprueba el permiso del catalogo que toca, no el de la pagina.

Toda escritura llama a `fixtures.reset_cache()`: el catalogo se lee cacheado
—el worker de Celery es otro proceso— y sin esto una edicion tardaria hasta un
minuto en verse, o no se veria nunca en el proceso que ya la tenia leida.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import urlencode
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core import fixtures
from core.odoo_nombres import clave_nombre, nombre_base, normalizar_nombre_odoo
from core.utils import clean_json_props
from services.catalogos.directorio import personas_fuera_del_directorio
from services.catalogos.equipos import (
    PIEZAS_POR_ROL,
    ROLES,
    ROLES_POR_EQUIPO,
    SUPERIOR_DEL_SUPERVISOR,
    etiqueta_rol,
    parametros_defecto,
    parametros_vigentes,
    roles_del_equipo,
    validar_parametros,
)
from services.catalogos.models import (
    AliasPersona,
    CondicionesEquipo,
    EquipoVentas,
    MembresiaEquipo,
    ObjetivoVentasOficina,
    PersonaVentas,
)
from services.config.decorators import permission_required
from services.subscriptions.analytics.imports import (
    productos_fuera_de_catalogo,
    zonas_fuera_de_catalogo,
)
from services.subscriptions.analytics.objetivos import (
    get_objetivos_config,
    nodos_conocidos,
    serializar_semaforo,
)
from services.subscriptions.analytics.queries import get_periodos
from services.subscriptions.models import (
    AREA_IGNORADO_CHOICES,
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
    ZonaSinObjetivo,
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
        "comision_pyme_pct": float(p.comision_pyme_pct) if p.comision_pyme_pct is not None else None,
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
    """Un site, con sus zonas y los equipos de ventas que lo trabajan."""
    zonas = list(s.zonas.all())
    equipos = list(s.equipos.all())
    return {
        "id": s.id,
        "nombre": s.nombre,
        "orden": s.orden,
        "zonas": len(zonas),
        "zona_ids": [z.id for z in zonas],
        "equipo_ids": [e.id for e in equipos],
        "equipos": [e.nombre for e in equipos],
    }


def _estado(e: Estado) -> dict[str, Any]:
    """Un estado, con cuantas zonas lo referencian."""
    return {"id": e.id, "nombre": e.nombre, "zonas": e.zonas.count()}


def _coordinador(c: Coordinador) -> dict[str, Any]:
    """Una unidad de negocio: sus zonas, los equipos que la trabajan y quien la lleva."""
    zonas = list(c.zonas.all())
    equipos = list(c.equipos.all())
    return {
        "id": c.id,
        "nombre": c.nombre,
        "zonas": len(zonas),
        "zona_ids": [z.id for z in zonas],
        "equipo_ids": [e.id for e in equipos],
        "equipos": [e.nombre for e in equipos],
        # Las membresias que la tienen en `unidades`: coordinador, jefes, gerentes.
        "responsables": [
            {"persona": m.persona.nombre_completo, "rol": m.rol, "etiqueta": etiqueta_rol(m.rol), "equipo": m.equipo.nombre}
            for m in c.membresias.all()
        ],
    }


# Los otros nombres de una persona viajan como tres listas, una por columna del export.
CLAVES_ALIAS = {"alias_medio": "medio", "alias_supervisor": "supervisor", "alias_usuario": "usuario"}
MAX_ALIAS = 10


def _alias_de(p: PersonaVentas) -> dict[str, list[str]]:
    """Los otros nombres de una persona, por columna."""
    return {clave: [a.literal for a in p.alias.all() if a.columna == columna] for clave, columna in CLAVES_ALIAS.items()}


def _persona(p: PersonaVentas) -> dict[str, Any]:
    """Una persona del directorio, con los equipos donde tiene un papel."""
    return {
        "id": p.id,
        "nombre": p.nombre,
        "apellido": p.apellido,
        "medio": p.medio,
        "medio_supervisor": p.medio_supervisor,
        "usuario_odoo": p.usuario_odoo,
        **_alias_de(p),
        "membresias": [
            {"id": m.id, "equipo": m.equipo.slug, "rol": m.rol, "etiqueta": etiqueta_rol(m.rol)}
            for m in p.membresias.all()
        ],
    }


def _membresia(m: MembresiaEquipo) -> dict[str, Any]:
    """El papel de una persona en un equipo, con sus literales y relaciones resueltos."""
    unidades = list(m.unidades.all())
    sites = list(m.sites.all())
    return {
        "id": m.id,
        "persona_id": m.persona_id,
        "nombre": m.persona.nombre,
        "apellido": m.persona.apellido,
        "medio": m.persona.medio,
        "medio_supervisor": m.persona.medio_supervisor,
        "usuario_odoo": m.persona.usuario_odoo,
        **_alias_de(m.persona),
        "equipo_id": m.equipo_id,
        "equipo": m.equipo.slug,
        "rol": m.rol,
        "site_ids": [s.id for s in sites],
        "sites": [s.nombre for s in sites],
        "superior_id": m.superior_id,
        "superior": m.superior.persona.nombre_completo if m.superior_id else "",
        "unidad_ids": [u.id for u in unidades],
        "unidades": [u.nombre for u in unidades],
    }


def _condicion_vista(equipo: EquipoVentas, rol: str, fila: CondicionesEquipo | None) -> dict[str, Any]:
    """Las condiciones de un rol de un equipo: las que valen, y si alguien las cambio."""
    return {
        "id": fila.id if fila else None,
        "equipo_id": equipo.id,
        "equipo": equipo.slug,
        "rol": rol,
        "etiqueta": etiqueta_rol(rol),
        "piezas": list(PIEZAS_POR_ROL[rol]),
        "parametros": parametros_vigentes(equipo.slug, rol, fila.parametros if fila else None),
        "defecto": parametros_defecto(equipo.slug, rol),
        "personalizado": bool(fila and fila.parametros),
    }


def _condicion(fila: CondicionesEquipo) -> dict[str, Any]:
    """Una fila de condiciones guardada, tal y como la consume la interfaz."""
    return _condicion_vista(fila.equipo, fila.rol, fila)


def _condiciones_todas() -> list[dict[str, Any]]:
    """Las condiciones de todos los roles de todos los equipos, editadas o no."""
    guardadas = {(f.equipo_id, f.rol): f for f in CondicionesEquipo.objects.select_related("equipo")}
    return [
        _condicion_vista(equipo, rol, guardadas.get((equipo.id, rol)))
        for equipo in EquipoVentas.objects.all()
        for rol in roles_del_equipo(equipo.slug)
    ]


def _equipo_vista(e: EquipoVentas) -> dict[str, Any]:
    """Un equipo con la descripcion de sus roles: lo que cada uno exige y admite."""
    return {
        "id": e.id,
        "slug": e.slug,
        "nombre": e.nombre,
        "roles": [
            {
                "rol": rol,
                "etiqueta": ROLES[rol]["etiqueta"],
                "medio": ROLES[rol]["medio"],
                "supervisor": ROLES[rol]["supervisor"],
                "usuario": ROLES[rol]["usuario"],
                "site": bool(ROLES[rol].get("site")),
                "unidades": ROLES[rol].get("unidades", ""),
                "superior": SUPERIOR_DEL_SUPERVISOR.get(e.slug) if rol == "supervisor" else None,
                "piezas": list(PIEZAS_POR_ROL[rol]),
            }
            for rol in ROLES_POR_EQUIPO.get(e.slug, [])
        ],
    }


def _ignorado(i: ProductoIgnorado) -> dict[str, Any]:
    """Un nombre ignorado, con su area y quien y cuando lo declaro."""
    return {
        "id": i.id,
        "nombre": i.nombre,
        "area": i.area,
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
    # Solo en los PYME, que son los unicos que se pagan por porcentaje. Vacio
    # es "sin definir", no 0: Comisiones avisa en vez de pagar nada en silencio.
    fila.comision_pyme_pct = (
        _porcentaje(data, "comision_pyme_pct") if fila.tipo_persona == "PYME" else None
    )
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


def _ids(data: dict, clave: str, modelo, etiqueta: str) -> list[int] | None:
    """Una lista de ids del cuerpo comprobada contra el catalogo; `None` si no viene.

    Distingue «no la mando» (se conserva lo que hay) de «la mando vacia» (se
    vacia), porque hay escrituras que solo tocan otros campos.
    """
    if clave not in data:
        return None
    bruto = data.get(clave)
    if not isinstance(bruto, list):
        raise DatosInvalidos(f"El campo «{clave}» tiene que ser una lista.")
    try:
        ids = sorted({int(i) for i in bruto})
    except (TypeError, ValueError):
        raise DatosInvalidos(f"El campo «{clave}» tiene que ser una lista de ids.") from None
    existentes = set(modelo.objects.filter(pk__in=ids).values_list("pk", flat=True))
    if existentes != set(ids):
        raise DatosInvalidos(f"Algún {etiqueta} indicado en «{clave}» ya no existe.")
    return ids


def _aplicar_site(fila: Site, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un site; sus zonas y equipos se escriben despues de guardarlo.

    Una zona pertenece a un site siempre: elegirla aqui la mueve a este, pero
    quitarla de la lista no tiene a donde mandarla, asi que se pide hacerlo
    desde la propia zona (Estructura › Zonas).
    """
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=80)
    fila.orden = int(_numero(data, "orden", 999))
    fila._zona_ids = _ids(data, "zona_ids", Zona, "zona")
    fila._equipo_ids = _ids(data, "equipo_ids", EquipoVentas, "equipo")
    if fila.pk and fila._zona_ids is not None:
        quitadas = set(fila.zonas.values_list("pk", flat=True)) - set(fila._zona_ids)
        if quitadas:
            nombres = ", ".join(Zona.objects.filter(pk__in=quitadas).values_list("nombre", flat=True)[:3])
            raise DatosInvalidos(
                f"Una zona no puede quedarse sin site ({nombres}…): cámbiala de site desde Estructura › Zonas."
            )


def _despues_site(fila: Site, data: dict, request) -> None:
    """Escribe las zonas y los equipos del site, ya con `pk`."""
    if fila._zona_ids is not None:
        Zona.objects.filter(pk__in=fila._zona_ids).update(site=fila)
    if fila._equipo_ids is not None:
        fila.equipos.set(fila._equipo_ids)


def _aplicar_nombre(fila, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un catalogo que solo tiene nombre."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)


def _aplicar_coordinador(fila: Coordinador, data: dict, request) -> None:
    """Vuelca el cuerpo sobre una unidad de negocio; zonas y equipos se escriben despues."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)
    fila._zona_ids = _ids(data, "zona_ids", Zona, "zona")
    fila._equipo_ids = _ids(data, "equipo_ids", EquipoVentas, "equipo")


def _despues_coordinador(fila: Coordinador, data: dict, request) -> None:
    """Asigna a la unidad las zonas elegidas y deja sin unidad las que se quitaron."""
    if fila._zona_ids is not None:
        fila.zonas.exclude(pk__in=fila._zona_ids).update(coordinador=None)
        Zona.objects.filter(pk__in=fila._zona_ids).update(coordinador=fila)
    if fila._equipo_ids is not None:
        fila.equipos.set(fila._equipo_ids)


def _volcar_persona(persona: PersonaVentas, data: dict, spec: dict[str, Any] | None) -> None:
    """Vuelca nombre y literales sobre una persona y comprueba que no choquen con otra.

    `spec` es lo que el rol pide (`equipos.ROLES`): el `medio` y el usuario de
    Odoo se exigen si el rol los lleva, y un literal que el rol no lleva se
    descarta aunque llegue. **Un literal que no viene en el cuerpo se conserva**:
    la misma persona puede estar en dos equipos y un rol sin literales (gerente de
    operaciones) no tiene por que borrar los que ya tenia.

    La unicidad no distingue mayusculas, como el cruce con el export, asi que
    se comprueba aqui con un mensaje claro en vez de dejar que la base de datos
    responda con un choque generico. La del nombre como supervisor es sobre el
    que vale en esa columna (`literal_supervisor`).
    """
    if "nombre" in data or persona.pk is None:
        persona.nombre = _texto(data, "nombre", obligatorio=True, maximo=80)
    if "apellido" in data or persona.pk is None:
        persona.apellido = _texto(data, "apellido", obligatorio=True, maximo=80)

    lleva_medio = spec is None or spec["medio"]
    lleva_supervisor = spec is None or spec["supervisor"]
    lleva_usuario = spec is None or spec["usuario"]
    if lleva_medio and "medio" in data:
        persona.medio = nombre_base(_texto(data, "medio", maximo=160))
    if lleva_supervisor and "medio_supervisor" in data:
        persona.medio_supervisor = nombre_base(_texto(data, "medio_supervisor", maximo=160))
    if lleva_usuario and "usuario_odoo" in data:
        usuario = _texto(data, "usuario_odoo", maximo=200)
        persona.usuario_odoo = normalizar_nombre_odoo(usuario) if usuario else ""

    if spec is not None:
        if spec["medio"] and not persona.medio:
            raise DatosInvalidos("El medio (como aparece en «Medio» en Odoo) es obligatorio para este rol.")
        if spec["usuario"] and not nombre_base(persona.usuario_odoo):
            raise DatosInvalidos("El usuario de Odoo es obligatorio para este rol.")
    if persona.medio_supervisor.casefold() == persona.medio.casefold():
        persona.medio_supervisor = ""

    _leer_alias(persona, data, spec)
    _comprobar_unicidad(persona)


def _leer_alias(persona: PersonaVentas, data: dict, spec: dict | None) -> None:
    """Los otros nombres que trae el cuerpo, normalizados, en `persona._alias` (columna → lista).

    Lo que no viene se conserva, como los literales principales, y una columna que el
    rol no lleva se descarta. Uno igual al principal de su columna, o repetido, se omite.
    """
    persona._alias = {}
    for clave, columna in CLAVES_ALIAS.items():
        if clave not in data or (spec is not None and not spec[columna]):
            continue
        bruto = data[clave]
        if not isinstance(bruto, list) or not all(isinstance(x, str) for x in bruto):
            raise DatosInvalidos(f"El campo «{clave}» tiene que ser una lista de nombres.")
        principal = {"medio": persona.medio, "supervisor": persona.literal_supervisor, "usuario": persona.usuario_odoo}[columna]
        vistos = {clave_nombre(principal)}
        limpios: list[str] = []
        for texto in bruto:
            literal = nombre_base(texto)[:160]
            if literal and clave_nombre(literal) not in vistos:
                vistos.add(clave_nombre(literal))
                limpios.append(normalizar_nombre_odoo(literal) if columna == "usuario" else literal)
        if len(limpios) > MAX_ALIAS:
            raise DatosInvalidos(f"Como mucho {MAX_ALIAS} nombres más por columna.")
        persona._alias[columna] = limpios


def _comprobar_unicidad(persona: PersonaVentas) -> None:
    """Ningun nombre (principal o no) de una columna lo comparte otra persona.

    No distingue mayusculas ni sufijo, como el cruce con el export, asi que se
    comprueba aqui con un mensaje claro en vez de dejar que la base de datos
    responda con un choque generico. Se compara lo que quedaria tras guardar.
    """
    otras = list(PersonaVentas.objects.exclude(pk=persona.pk).prefetch_related("alias"))

    def otros(columna: str) -> list[str]:
        """Sus otros nombres tras guardar: los que llegan, o los que ya tenia si la columna no vino."""
        if columna in persona._alias:
            return persona._alias[columna]
        return [a.literal for a in persona.alias.all() if a.columna == columna] if persona.pk else []

    propios = {
        "medio": [persona.medio, *otros("medio")],
        "usuario": [persona.usuario_odoo, *otros("usuario")],
    }
    base_supervisor = [persona.medio_supervisor] if persona.medio_supervisor else propios["medio"]
    propios["supervisor"] = [*base_supervisor, *otros("supervisor")]
    etiquetas = {"medio": "el medio", "supervisor": "«Oportunidad/Administrador»", "usuario": "el usuario"}
    for columna, literales in propios.items():
        claves: dict[str, str] = {}
        for literal in literales:
            if literal and clave_nombre(literal):
                claves[clave_nombre(literal)] = literal
        for otra in otras:
            comun = claves.keys() & otra.claves(columna)
            if comun:
                raise Duplicado(f"«{claves[next(iter(comun))]}» ya es {etiquetas[columna]} de {otra.nombre_completo}.")


def _guardar_alias(persona: PersonaVentas) -> None:
    """Escribe los otros nombres de la persona, ya con `pk`: deja exactamente los que llegaron en cada columna."""
    for columna, literales in (getattr(persona, "_alias", None) or {}).items():
        existentes = {a.literal: a for a in persona.alias.filter(columna=columna)}
        for literal in literales:
            if literal not in existentes:
                AliasPersona.objects.create(persona=persona, columna=columna, literal=literal)
        for literal, fila in existentes.items():
            if literal not in literales:
                fila.delete()


def _despues_persona(fila: PersonaVentas, data: dict, request) -> None:
    """Escribe los otros nombres de la persona."""
    _guardar_alias(fila)


def _aplicar_persona(fila: PersonaVentas, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la identidad de una persona (sin tocar su papel en los equipos).

    Es lo que usa Notificaciones para vincular un nombre del export a quien ya
    esta registrado con otro (como otro nombre suyo, sin tocar los principales). No deja sin
    medio ni sin usuario a quien su rol los exige.
    """
    _volcar_persona(fila, data, None)
    if fila.pk:
        roles = list(fila.membresias.values_list("rol", flat=True))
        if any(ROLES[r]["medio"] for r in roles) and not fila.medio:
            raise DatosInvalidos("Su rol exige medio: no se puede dejar vacío.")
        if any(ROLES[r]["usuario"] for r in roles) and not fila.usuario_odoo:
            raise DatosInvalidos("Su rol exige usuario de Odoo: no se puede dejar vacío.")


def _aplicar_membresia(fila: MembresiaEquipo, data: dict, request) -> None:
    """Vuelca el cuerpo sobre el papel de una persona en un equipo.

    En el alta se elige equipo, rol y la persona: una existente (`persona_id`,
    p. ej. el gerente de operaciones que lleva dos equipos) o una nueva con los
    datos del cuerpo. Una membresia ya guardada puede **cambiar de equipo y de
    puesto**: lo que el nuevo rol no lleva se suelta (sites, unidades, superior),
    lo que exige y no trae el cuerpo se pide, y los supervisores que respondian a
    ella se quedan sin superior, porque ya no lo es del equipo ni del rol que
    ellos esperan. Los literales, el site, el superior y las unidades se comprueban
    contra lo que el rol exige (`equipos.ROLES`). La persona se guarda aqui mismo,
    asi que el endpoint envuelve todo en una transaccion.
    """
    rol_anterior = fila.rol if fila.pk else None
    cambia = False
    if fila.pk is None:
        equipo = _relacion(EquipoVentas, data, "equipo_id", obligatorio=True)
        rol = str(data.get("rol") or "")
        if rol not in roles_del_equipo(equipo.slug):
            raise DatosInvalidos(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
        fila.equipo, fila.rol = equipo, rol
        persona = _relacion(PersonaVentas, data, "persona_id", obligatorio=False) or PersonaVentas()
        if persona.pk and MembresiaEquipo.objects.filter(persona=persona, equipo=equipo).exists():
            raise Duplicado(f"{persona.nombre_completo} ya tiene un papel en {equipo.nombre}.")
    else:
        persona = fila.persona
        if "equipo_id" in data or "rol" in data:
            equipo = _relacion(EquipoVentas, data, "equipo_id", obligatorio=True) if "equipo_id" in data else fila.equipo
            rol = str(data.get("rol") or fila.rol)
            if rol not in roles_del_equipo(equipo.slug):
                raise DatosInvalidos(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
            cambia = (equipo.id, rol) != (fila.equipo_id, fila.rol)
            if cambia:
                if MembresiaEquipo.objects.filter(persona=persona, equipo=equipo).exclude(pk=fila.pk).exists():
                    raise Duplicado(f"{persona.nombre_completo} ya tiene un papel en {equipo.nombre}.")
                # Los supervisores que respondian a ella esperan otro equipo y otro rol: quedan sin asignar.
                fila.subordinados.update(superior=None)
                fila.equipo, fila.rol = equipo, rol
    spec = ROLES[fila.rol]
    spec_anterior = ROLES[rol_anterior] if rol_anterior else None
    persona.save()
    _guardar_alias(persona)
    fila.persona = persona

    fila._site_ids = None
    if not spec.get("site"):
        if fila.pk and fila.sites.exists():
            fila._site_ids = []
    else:
        ids = _ids(data, "site_ids", Site, "site")
        if ids is None and (fila.pk is None or not spec_anterior.get("site")):
            ids = []
        if ids is not None:
            if not ids:
                raise DatosInvalidos("Elige al menos un site.")
            fila._site_ids = ids

    if fila.rol == "supervisor":
        esperado = SUPERIOR_DEL_SUPERVISOR.get(fila.equipo.slug)
        if "superior_id" in data:
            superior = _relacion(MembresiaEquipo, data, "superior_id", obligatorio=False)
        else:
            superior = None if cambia else fila.superior
        if superior is not None and (superior.equipo_id != fila.equipo_id or superior.rol != esperado):
            raise DatosInvalidos(f"El superior de un supervisor de {fila.equipo.nombre} tiene que ser {etiqueta_rol(esperado or '')}.")
        fila.superior = superior

    fila._unidad_ids = None
    if not spec.get("unidades"):
        if fila.pk and fila.unidades.exists():
            fila._unidad_ids = []
    else:
        ids = _ids(data, "unidad_ids", Coordinador, "unidad de negocio")
        if ids is None and (fila.pk is None or spec_anterior.get("unidades") != spec["unidades"]):
            ids = []
        elif ids is None and cambia:
            # Mismo tipo de unidades en otro equipo: se llevan, pero se comprueba que nadie las tenga ya alli.
            ids = [u.id for u in fila.unidades.all()]
        if ids is not None:
            if spec["unidades"] == "una" and len(ids) != 1:
                raise DatosInvalidos("Un coordinador de unidad de negocio lleva exactamente una unidad.")
            if spec["unidades"] == "varias" and not ids:
                raise DatosInvalidos("Elige al menos una unidad de negocio.")
            if spec["unidades"] == "una":
                ocupada = (
                    MembresiaEquipo.objects.filter(equipo=fila.equipo, rol=fila.rol, unidades__in=ids)
                    .exclude(pk=fila.pk)
                    .select_related("persona")
                    .first()
                )
                if ocupada is not None:
                    raise Duplicado(f"Esa unidad ya la lleva {ocupada.persona.nombre_completo} en {fila.equipo.nombre}.")
            fila._unidad_ids = ids


def _borrar_site(fila: Site) -> str | None:
    """Un site que lleva alguna coordinadora de oficina no se borra: ella quedaria fuera del reporte."""
    nombres = [m.persona.nombre_completo for m in fila.membresias.select_related("persona")[:3]]
    if nombres:
        return f"No se puede eliminar este site: lo llevan {', '.join(nombres)}. Quítaselo primero."
    return None


def _despues_membresia(fila: MembresiaEquipo, data: dict, request) -> None:
    """Escribe las unidades y los sites de la membresia, ya con `pk`."""
    if fila._unidad_ids is not None:
        fila.unidades.set(fila._unidad_ids)
    if fila._site_ids is not None:
        fila.sites.set(fila._site_ids)


def _tras_borrar_membresia(fila: MembresiaEquipo) -> None:
    """Si la persona se queda sin ningun papel (ni objetivos), se borra tambien.

    Una persona sin equipo no cobra y su literal ya no seria «pendiente» en
    Notificaciones: se la dejaria registrada en un limbo. Con el papel borrado
    y nada que la retenga, desaparece y su nombre vuelve a la lista de pendientes.
    """
    persona = fila.persona
    if not persona.membresias.exists() and not persona.objetivos_ventas.exists():
        persona.delete()


def _buscar_condicion(data: dict) -> CondicionesEquipo | None:
    """Las condiciones ya guardadas de (equipo, rol): editar es siempre sobre la misma fila."""
    return CondicionesEquipo.objects.filter(equipo_id=data.get("equipo_id") or 0, rol=str(data.get("rol") or "")).first()


def _aplicar_condiciones(fila: CondicionesEquipo, data: dict, request) -> None:
    """Vuelca los parametros de pago de un rol de un equipo, validados contra el esquema del rol."""
    if fila.pk is None:
        equipo = _relacion(EquipoVentas, data, "equipo_id", obligatorio=True)
        rol = str(data.get("rol") or "")
        if rol not in roles_del_equipo(equipo.slug):
            raise DatosInvalidos(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
        fila.equipo, fila.rol = equipo, rol
    try:
        fila.parametros = validar_parametros(fila.rol, data.get("parametros"))
    except ValueError as e:
        raise DatosInvalidos(str(e)) from None
    fila.actualizado_por = request.user


def _aplicar_ignorado(fila: ProductoIgnorado, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un nombre ignorado, anotando quien lo creo.

    El area solo se fija en el alta: cambiarla despues seria mover el nombre a
    otra lista, y el permiso que se comprobo fue el de la que tenia.
    """
    if not fila.pk:
        fila.area = _opcion(data, "area", AREA_IGNORADO_CHOICES, "productos")
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


def _objetivo_oficina(o: ObjetivoVentasOficina) -> dict[str, Any]:
    """Un tramo del objetivo de ventas de las oficinas; sin persona es el general."""
    return {
        "id": o.id,
        "persona_id": o.persona_id,
        "persona": o.persona.nombre_completo if o.persona_id else "",
        "desde": o.desde or "",
        "ventas": o.ventas,
        "nota": o.nota,
        "actualizado_por": o.actualizado_por.username if o.actualizado_por else "",
        "actualizado_en": o.actualizado_en.strftime("%Y-%m-%d %H:%M"),
    }


def _aplicar_objetivo_oficina(fila: ObjetivoVentasOficina, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo del objetivo de ventas de las oficinas.

    La persona solo se fija al crearlo, como la entidad de un objetivo
    comercial: vacia es el general. Tiene que ser coordinadora de oficina. La
    unicidad de (persona, desde) se comprueba aqui porque la BD no puede.
    """
    if fila.pk is None:
        persona = _relacion(PersonaVentas, data, "persona_id", obligatorio=False)
        if persona is not None and not persona.membresias.filter(rol="coord_oficina").exists():
            raise DatosInvalidos(f"{persona.nombre_completo} no es coordinadora de oficina.")
        fila.persona = persona
    fila.desde = _mes(data, "desde", obligatorio=False)

    bruto = data.get("ventas")
    try:
        ventas = float(bruto)
    except (TypeError, ValueError):
        raise DatosInvalidos("Indica cuántas ventas al mes se esperan.") from None
    if ventas < 1 or ventas != int(ventas):
        raise DatosInvalidos("El objetivo de ventas es un número entero de 1 o más.")
    fila.ventas = int(ventas)

    if ObjetivoVentasOficina.objects.filter(persona=fila.persona, desde=fila.desde).exclude(pk=fila.pk).exists():
        cuando = f"desde {fila.desde}" if fila.desde else "desde siempre"
        quien = fila.persona.nombre_completo if fila.persona else "el general"
        raise Duplicado(f"Ya hay un objetivo de ventas {cuando} para {quien}: edítalo.")
    fila.nota = _texto(data, "nota")
    fila.actualizado_por = request.user


def _zona_sin_objetivo(z: ZonaSinObjetivo) -> dict[str, Any]:
    """Un tramo en que una zona no se mide contra ningun objetivo."""
    return {
        "id": z.id,
        "zona_id": z.zona_id,
        "zona": z.zona.nombre,
        "site": z.zona.site.nombre,
        "coordinador": z.zona.coordinador.nombre if z.zona.coordinador_id else "",
        "desde": z.desde or "",
        "hasta": z.hasta or "",
        "nota": z.nota,
        "actualizado_por": z.actualizado_por.username if z.actualizado_por else "",
        "actualizado_en": z.actualizado_en.strftime("%Y-%m-%d %H:%M"),
    }


def _aplicar_zona_sin_objetivo(fila: ZonaSinObjetivo, data: dict, request) -> None:
    """Vuelca el cuerpo sobre el tramo sin objetivo de una zona.

    La zona solo se fija al crearlo. Un tramo por zona: si ya tiene uno se
    edita ese (se le cambia el `hasta`), no se crea otro.
    """
    if fila.pk is None:
        zona = _relacion(Zona, data, "zona_id", obligatorio=True)
        if ZonaSinObjetivo.objects.filter(zona=zona).exists():
            raise Duplicado(f"{zona.nombre} ya está sin objetivo: edita su tramo.")
        fila.zona = zona
    fila.desde = _mes(data, "desde", obligatorio=False)
    fila.hasta = _mes(data, "hasta", obligatorio=False)
    if fila.desde and fila.hasta and fila.hasta < fila.desde:
        raise DatosInvalidos("«Hasta» no puede ser anterior a «Desde».")
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


# Un permiso por grupo del modulo. Los nombres de los campos son anteriores al
# modulo y se conservan: «comercial» es hoy la Estructura (zonas,
# estados) y «operacional» los Productos. Ventas —sites, unidades de negocio, equipos,
# objetivos y condiciones de pago— se separo de la estructura porque lo
# lleva quien paga comisiones, no quien reparte la red.
PERMISO_COMERCIAL = "can_manage_catalogo_comercial"
PERMISO_OPERACIONAL = "can_manage_catalogo_operacional"
PERMISO_VENTAS = "can_manage_catalogo_ventas"

# Que permiso administra los nombres ignorados de cada area: los mismos que
# administran el catalogo donde se habrian registrado.
PERMISO_POR_AREA = {
    "productos": PERMISO_OPERACIONAL,
    "estructura": PERMISO_COMERCIAL,
    "ventas": PERMISO_VENTAS,
}


def _permiso_ignorado(fila: ProductoIgnorado, data: dict) -> str:
    """El permiso de un ignorado es el de su area (la pedida, si es un alta)."""
    area = fila.area if fila.pk else str(data.get("area") or "productos")
    return PERMISO_POR_AREA.get(area, PERMISO_OPERACIONAL)


# Un catalogo = un modelo, como se sirve, como se lee del cuerpo y que permiso
# lo administra. Anadir uno nuevo es anadir una entrada aqui y una pestana en
# la interfaz. `permiso_fila`, si esta, decide el permiso mirando la fila: es
# lo que reparte los ignorados entre los tres permisos segun su area.
# `protegido` es el motivo con el que se niega borrar una fila que otra
# referencia con `PROTECT` (por defecto, las zonas).
CATALOGOS: dict[str, dict[str, Any]] = {
    "planes": {"modelo": Plan, "serializar": _plan, "aplicar": _aplicar_plan, "etiqueta": "plan", "permiso": PERMISO_OPERACIONAL},
    "reguladores": {"modelo": PlanRegulador, "serializar": _plan_regulador, "aplicar": _aplicar_plan_regulador, "etiqueta": "plan regulador", "permiso": PERMISO_OPERACIONAL},
    "ignorados": {"modelo": ProductoIgnorado, "serializar": _ignorado, "aplicar": _aplicar_ignorado, "etiqueta": "nombre ignorado", "permiso": PERMISO_OPERACIONAL, "permiso_fila": _permiso_ignorado},
    "zonas": {"modelo": Zona, "serializar": _zona, "aplicar": _aplicar_zona, "etiqueta": "zona", "femenino": True, "permiso": PERMISO_COMERCIAL},
    # Sites y unidades de negocio se muestran en Ventas › Estructura de ventas, junto a
    # los equipos que los trabajan, y los administra quien lleva el catalogo de ventas.
    "sites": {"modelo": Site, "serializar": _site, "aplicar": _aplicar_site, "despues": _despues_site, "borrable": _borrar_site, "etiqueta": "site", "permiso": PERMISO_VENTAS, "protegido": "tiene zonas o coordinadoras de oficina asociadas. Reasígnalas primero."},
    "estados": {"modelo": Estado, "serializar": _estado, "aplicar": _aplicar_nombre, "etiqueta": "estado", "permiso": PERMISO_COMERCIAL},
    "coordinadores": {"modelo": Coordinador, "serializar": _coordinador, "aplicar": _aplicar_coordinador, "despues": _despues_coordinador, "etiqueta": "unidad de negocio", "femenino": True, "permiso": PERMISO_VENTAS},
    # La persona es la identidad (nombre y literales de Odoo); su papel en cada equipo es la membresia.
    "personas": {"modelo": PersonaVentas, "serializar": _persona, "aplicar": _aplicar_persona, "despues": _despues_persona, "etiqueta": "persona", "femenino": True, "permiso": PERMISO_VENTAS},
    "membresias": {"modelo": MembresiaEquipo, "serializar": _membresia, "aplicar": _aplicar_membresia, "despues": _despues_membresia, "tras_borrar": _tras_borrar_membresia, "etiqueta": "persona del equipo", "femenino": True, "permiso": PERMISO_VENTAS},
    # Se edita siempre la fila de (equipo, rol), exista o no (`buscar`); borrarla restablece los valores de la politica.
    "condiciones_equipo": {"modelo": CondicionesEquipo, "serializar": _condicion, "aplicar": _aplicar_condiciones, "buscar": _buscar_condicion, "etiqueta": "condición de pago", "femenino": True, "permiso": PERMISO_VENTAS},
    # Los objetivos van con ventas: quien organiza a los equipos de venta es
    # quien fija lo que se espera de cada parte de la red.
    # `borrable` responde por que no se puede borrar una fila concreta.
    "objetivos": {"modelo": ObjetivoComercial, "serializar": _objetivo, "aplicar": _aplicar_objetivo, "etiqueta": "objetivo", "permiso": PERMISO_VENTAS, "borrable": _borrar_objetivo},
    "objetivos_mes": {"modelo": ObjetivoMes, "serializar": _objetivo_mes, "aplicar": _aplicar_objetivo_mes, "etiqueta": "objetivo del mes", "permiso": PERMISO_VENTAS},
    "zonas_sin_objetivo": {"modelo": ZonaSinObjetivo, "serializar": _zona_sin_objetivo, "aplicar": _aplicar_zona_sin_objetivo, "etiqueta": "zona sin objetivo", "femenino": True, "permiso": PERMISO_VENTAS},
    "objetivos_oficina": {"modelo": ObjetivoVentasOficina, "serializar": _objetivo_oficina, "aplicar": _aplicar_objetivo_oficina, "etiqueta": "objetivo de ventas", "permiso": PERMISO_VENTAS},
    # Fila unica: se edita siempre la misma y no se borra.
    "semaforo": {"modelo": SemaforoObjetivos, "serializar": _semaforo, "aplicar": _aplicar_semaforo, "etiqueta": "semáforo", "permiso": PERMISO_VENTAS, "unico": True},
}

PERMISOS_CATALOGO = (PERMISO_OPERACIONAL, PERMISO_COMERCIAL, PERMISO_VENTAS)


def _participio(catalogo: dict[str, Any], raiz: str) -> str:
    """`guardado`/`guardada` segun el genero de la etiqueta del catalogo."""
    return raiz + ("a" if catalogo.get("femenino") else "o")


def _puede(request, permiso: str) -> bool:
    """Si el usuario de la peticion tiene `permiso` (superusuario incluido)."""
    if request.user.is_superuser:
        return True
    perfil = getattr(request.user, "profile", None)
    return bool(perfil and perfil.has_permission(permiso))


def _denegado(permiso: str) -> JsonResponse:
    """La respuesta 403 de una escritura sin el permiso de su catalogo."""
    return JsonResponse(
        {"status": "error", "message": f"Acceso denegado. Se requiere el privilegio: {permiso}."},
        status=403,
    )


def _catalogo_permitido(request, data: dict, fila=None) -> tuple[dict[str, Any] | None, JsonResponse | None]:
    """El catalogo que pide el cuerpo, o la respuesta de error si no se puede tocar.

    Los endpoints de escritura dejan pasar a quien tenga cualquiera de los
    permisos del modulo; aqui se exige el del catalogo concreto, que es lo que
    impide que quien lleva la estructura edite un plan mandando
    `tipo: "planes"` a mano. Con `fila` se aplica ademas `permiso_fila`.
    """
    catalogo = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalogo is None:
        return None, JsonResponse({"status": "error", "message": "Catálogo desconocido."}, status=400)
    permiso = catalogo["permiso"]
    if fila is not None and (por_fila := catalogo.get("permiso_fila")):
        permiso = por_fila(fila, data)
    if not _puede(request, permiso):
        return None, _denegado(permiso)
    return catalogo, None


def _listado(nombre: str) -> list[dict[str, Any]]:
    """Todas las filas de un catalogo, ya serializadas."""
    catalogo = CATALOGOS[nombre]
    consulta = catalogo["modelo"].objects.all()
    if nombre == "zonas":
        consulta = consulta.select_related("site", "estado", "coordinador")
    elif nombre == "sites":
        consulta = consulta.prefetch_related("zonas", "equipos")
    elif nombre == "coordinadores":
        consulta = consulta.prefetch_related("zonas", "equipos", "membresias__persona", "membresias__equipo")
    elif nombre == "personas":
        consulta = consulta.prefetch_related("membresias__equipo", "alias")
    elif nombre == "membresias":
        consulta = consulta.select_related("persona", "equipo", "superior__persona").prefetch_related(
            "unidades", "sites", "persona__alias")
    elif nombre == "condiciones_equipo":
        return _condiciones_todas()
    elif nombre == "objetivos_oficina":
        consulta = consulta.select_related("persona", "actualizado_por")
    elif nombre == "zonas_sin_objetivo":
        consulta = consulta.select_related("zona__site", "zona__coordinador", "actualizado_por")
    elif nombre == "planes":
        consulta = consulta.select_related("plan_regulador")
    elif nombre == "ignorados":
        consulta = consulta.select_related("creado_por")
    elif nombre == "objetivos":
        consulta = consulta.select_related(*CAMPOS_REFERENCIA, "actualizado_por")
    elif nombre == "objetivos_mes":
        consulta = consulta.select_related("actualizado_por")
    return [catalogo["serializar"](fila) for fila in consulta]


def _permisos(request) -> dict[str, bool]:
    """Que grupos administra el usuario: la interfaz solo enlaza los suyos."""
    return {
        "operacional": _puede(request, PERMISO_OPERACIONAL),
        "comercial": _puede(request, PERMISO_COMERCIAL),
        "ventas": _puede(request, PERMISO_VENTAS),
    }


def _opciones(choices) -> list[dict[str, str]]:
    """Unas `choices` de Django tal y como las consume un desplegable."""
    return [{"value": v, "label": t} for v, t in choices]


def _render(request, pagina: str, grupo: str, props: dict[str, Any]):
    """Pinta una pagina del modulo con lo que todas comparten."""
    props.update({"permisos": _permisos(request), "section": grupo})
    return render_inertia(request, f"Catalogos/{pagina}", clean_json_props(props))


def _pendientes(nombre: str, funcion) -> list[dict[str, Any]]:
    """Una lista de pendientes, o vacia si la consulta falla.

    Un entorno sin datos importados todavia no tiene la tabla de
    suscripciones: eso no es motivo para romper la pagina.
    """
    try:
        return funcion()
    except Exception:
        logger.exception("No se pudo calcular la lista de %s por registrar", nombre)
        return []


# --- Vistas -----------------------------------------------------------------

@login_required
@permission_required(*PERMISOS_CATALOGO)
def inicio(request):
    """La raiz del modulo: la primera pagina que el usuario puede abrir.

    Notificaciones la abre cualquiera de los tres permisos, asi que es siempre
    esa; la funcion existe para que `/catalogos/` no sea un 404.
    """
    return redirect("catalogos:notificaciones")


def redirigir_config_antigua(request):
    """`/subscriptions/config/` era la pantalla unica de catalogos.

    Hay enlaces guardados y avisos que la usaban —el de la importacion
    bloqueada lleva `?nuevo_plan=`—, asi que sigue respondiendo y manda cada
    uno a su sitio nuevo.
    """
    nuevo_plan = (request.GET.get("nuevo_plan") or "").strip()
    if nuevo_plan:
        return redirect(f"{reverse('catalogos:productos')}?{urlencode({'nuevo_plan': nuevo_plan})}")
    return redirect("catalogos:notificaciones")


@login_required
@permission_required(*PERMISOS_CATALOGO)
def notificaciones_view(request):
    """Lo que falta en cada area, y lo que se decidio no registrar.

    Cada lista de pendientes se calcula solo si se administra su area, y lo
    mismo los ignorados: quien no puede registrar una zona tampoco tiene por
    que ver cuales faltan. Una lista ausente llega como `null`, que la
    interfaz distingue de una lista vacia ("todo registrado").

    Los nombres se registran aqui mismo, en un modal, sin ir a la pagina de
    su grupo: se resuelven uno detras de otro. Por eso viajan tambien las
    opciones que piden esos formularios (reguladores para un plan; sites,
    estados y coordinadores para una zona; cargos para una persona), y solo
    las de las areas que se administran.
    """
    permisos = _permisos(request)
    pendientes: dict[str, list[dict[str, Any]] | None] = {
        "productos": (
            _pendientes("productos", productos_fuera_de_catalogo) if permisos["operacional"] else None
        ),
        "estructura": (
            _pendientes("zonas", zonas_fuera_de_catalogo) if permisos["comercial"] else None
        ),
        "ventas": (
            _pendientes("personas", personas_fuera_del_directorio) if permisos["ventas"] else None
        ),
    }
    areas = [area for area, permiso in PERMISO_POR_AREA.items() if _puede(request, permiso)]
    ignorados = [fila for fila in _listado("ignorados") if fila["area"] in areas]

    return _render(request, "Notificaciones", "notificaciones", {
        "pendientes": pendientes,
        "ignorados": ignorados,
        "areas": [{"value": v, "label": t} for v, t in AREA_IGNORADO_CHOICES if v in areas],
        "opciones": {
            "reguladores": _listado("reguladores") if permisos["operacional"] else [],
            "tiposPersona": _opciones(TIPO_PERSONA_CHOICES),
            "tecnologias": _opciones(TECNOLOGIA_CHOICES),
            # Tambien con ventas: el alta de una coordinadora de oficina pide su site.
            "sites": _listado("sites") if permisos["comercial"] or permisos["ventas"] else [],
            "estados": _listado("estados") if permisos["comercial"] else [],
            "coordinadores": _listado("coordinadores") if permisos["comercial"] or permisos["ventas"] else [],
            "equipos": [_equipo_vista(e) for e in EquipoVentas.objects.all()] if permisos["ventas"] else [],
            "membresias": _listado("membresias") if permisos["ventas"] else [],
            "personas": _listado("personas") if permisos["ventas"] else [],
        },
    })


@login_required
@permission_required(PERMISO_OPERACIONAL)
def productos_view(request):
    """Planes y planes reguladores: el vocabulario de lo que se vende.

    `?nuevo_plan=<nombre>` abre el formulario de plan ya relleno con ese
    nombre: es a donde lleva el aviso de la importacion cuando encuentra un
    producto sin catalogar, para no obligar a copiarlo a mano.
    """
    return _render(request, "Productos", "productos", {
        "planes": _listado("planes"),
        "reguladores": _listado("reguladores"),
        "tecnologias": _opciones(TECNOLOGIA_CHOICES),
        "tiposPersona": _opciones(TIPO_PERSONA_CHOICES),
        "nuevoPlan": (request.GET.get("nuevo_plan") or "").strip(),
    })


@login_required
@permission_required(PERMISO_COMERCIAL)
def estructura_view(request):
    """Zonas y estados: como se reparte la red.

    Los sites y las unidades de negocio viajan aunque se administren en Ventas
    › Estructura de ventas: el formulario de zona los necesita para elegir a cual
    pertenece. `?nueva_zona=<nombre>`
    abre el alta ya rellena, como `?nuevo_plan=` en productos.
    """
    return _render(request, "Estructura", "estructura", {
        "zonas": _listado("zonas"),
        "sites": _listado("sites"),
        "estados": _listado("estados"),
        "coordinadores": _listado("coordinadores"),
        "tecnologias": _opciones(TECNOLOGIA_CHOICES),
        "nuevaZona": (request.GET.get("nueva_zona") or "").strip(),
    })


@login_required
@permission_required(PERMISO_VENTAS)
def ventas_view(request):
    """Estructura de ventas, equipos con su gente y condiciones, y objetivos.

    `?nueva_persona=<literal>&equipo=<slug>&rol=<rol>` abre el alta ya rellena:
    es a donde lleva «Registrar» desde Notificaciones. El literal va al usuario
    de Odoo si el rol es de los que salen en `Vendedor` y al medio en los demas.

    Lo que la pestana de objetivos necesita ademas de sus filas: el semaforo,
    la configuracion ya resuelta (para mostrar el objetivo efectivo de cada mes
    con la misma regla que los reportes), los meses calculados y las entidades
    a las que se les puede fijar un objetivo.
    """
    return _render(request, "Ventas", "ventas", {
        "equipos": [_equipo_vista(e) for e in EquipoVentas.objects.all()],
        "membresias": _listado("membresias"),
        "personas": _listado("personas"),
        "condiciones": _listado("condiciones_equipo"),
        "nuevaPersona": {
            "literal": (request.GET.get("nueva_persona") or "").strip(),
            "equipo": (request.GET.get("equipo") or "").strip(),
            "rol": (request.GET.get("rol") or "").strip(),
        },
        "coordinadores": _listado("coordinadores"),
        "objetivos": _listado("objetivos"),
        "objetivosOficina": _listado("objetivos_oficina"),
        "zonasSinObjetivo": _listado("zonas_sin_objetivo"),
        "objetivos_mes": _listado("objetivos_mes"),
        "semaforo": _semaforo(SemaforoObjetivos.actual()),
        "objetivosConfig": get_objetivos_config(),
        "periodosCalculados": sorted({p[:7] for p in get_periodos()}, reverse=True),
        # La sucursal no es un catalogo: los nodos que ya aparecen en los datos
        # son de donde se eligen la sucursal y el nodo de un objetivo.
        "nodosConocidos": nodos_conocidos(),
        "zonas": _listado("zonas"),
        "sites": _listado("sites"),
        "estados": _listado("estados"),
    })


def _leer_cuerpo(request) -> tuple[dict | None, JsonResponse | None]:
    """El cuerpo JSON de una escritura, o la respuesta 400 si no lo es."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return None, JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)
    if not isinstance(data, dict):
        return None, JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)
    return data, None


@login_required
@permission_required(*PERMISOS_CATALOGO)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_guardar(request):
    """Alta o edicion de una fila de cualquiera de los catalogos."""
    data, rechazo = _leer_cuerpo(request)
    if rechazo is not None:
        return rechazo

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo

    fila_id = data.get("id")
    if catalogo.get("unico"):
        fila = catalogo["modelo"].actual()
    elif not fila_id and (buscar := catalogo.get("buscar")) and (existente := buscar(data)) is not None:
        fila = existente
    elif fila_id:
        fila = catalogo["modelo"].objects.filter(pk=fila_id).first()
        if fila is None:
            return JsonResponse({"status": "error", "message": "El registro ya no existe."}, status=404)
    else:
        fila = catalogo["modelo"]()

    catalogo, rechazo = _catalogo_permitido(request, data, fila)
    if rechazo is not None:
        return rechazo

    try:
        # En una transaccion: un alta puede escribir mas de una fila (la persona y
        # su papel) y las relaciones M2M, y no debe quedar a medias.
        with transaction.atomic():
            catalogo["aplicar"](fila, data, request)
            fila.save()
            if despues := catalogo.get("despues"):
                despues(fila, data, request)
    except Duplicado as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=409)
    except DatosInvalidos as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except IntegrityError:
        return JsonResponse(
            {"status": "error", "message": f"Ya existe {'una' if catalogo.get('femenino') else 'un'} {catalogo['etiqueta']} con ese nombre."},
            status=409,
        )

    fixtures.reset_cache()
    # Se vuelve a leer: las relaciones recien escritas no estan en la instancia.
    fila = catalogo["modelo"].objects.get(pk=fila.pk)
    return JsonResponse({
        "status": "success",
        "message": f"{catalogo['etiqueta'].capitalize()} {_participio(catalogo, 'guardad')}.",
        "registro": catalogo["serializar"](fila),
    })


# Tope de filas de un alta en bloque: lo que cabe en una lista de pendientes,
# no una via para cargar el directorio entero sin mirarlo.
MAXIMO_LOTE = 1000


@login_required
@permission_required(*PERMISOS_CATALOGO)
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_catalogo_guardar_lote(request):
    """Alta de varias filas de un mismo catalogo de una vez.

    Es lo que usa Notificaciones para registrar en bloque, p. ej. todos los
    asesores que el filtro dejo a la vista. Cada fila pasa por el mismo
    `aplicar` que un alta suelta —las mismas validaciones, los mismos
    duplicados— y se guarda en su propio savepoint: una que choca no se lleva
    por delante a las demas, se devuelve con su motivo y el resto queda
    registrado. Como se guardan en orden, dos filas del lote que choquen entre
    si se detectan igual que contra la base. Solo altas: editar en bloque no
    lo pide nadie y obligaria a decidir que hacer con los ids que no existen.
    """
    data, rechazo = _leer_cuerpo(request)
    if rechazo is not None:
        return rechazo

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo
    if catalogo.get("unico"):
        return JsonResponse({"status": "error", "message": "Este catálogo no admite altas en bloque."}, status=400)

    filas = data.get("filas")
    if not isinstance(filas, list) or not filas or not all(isinstance(f, dict) for f in filas):
        return JsonResponse({"status": "error", "message": "No llegó ninguna fila que registrar."}, status=400)
    if len(filas) > MAXIMO_LOTE:
        return JsonResponse(
            {"status": "error", "message": f"Como mucho {MAXIMO_LOTE} filas por lote."},
            status=400,
        )

    registrados: list[dict[str, Any]] = []
    errores: list[dict[str, str]] = []
    for cuerpo in filas:
        cuerpo = {**cuerpo, "tipo": data["tipo"], "id": None}
        fila = catalogo["modelo"]()
        etiqueta = str(cuerpo.get("medio") or cuerpo.get("nombre") or "").strip()
        _, rechazo = _catalogo_permitido(request, cuerpo, fila)
        if rechazo is not None:
            errores.append({"nombre": etiqueta, "message": json.loads(rechazo.content)["message"]})
            continue
        try:
            with transaction.atomic():
                catalogo["aplicar"](fila, cuerpo, request)
                fila.save()
                if despues := catalogo.get("despues"):
                    despues(fila, cuerpo, request)
        except DatosInvalidos as e:
            errores.append({"nombre": etiqueta, "message": str(e)})
            continue
        except IntegrityError:
            errores.append({"nombre": etiqueta, "message": "Ya existe con ese nombre."})
            continue
        registrados.append(catalogo["serializar"](catalogo["modelo"].objects.get(pk=fila.pk)))

    if registrados:
        fixtures.reset_cache()
    # 200 aunque no entre ninguna: el lote se proceso, y lo que interesa al
    # cliente es la lista de motivos, que un error HTTP no le haria llegar.
    return JsonResponse({
        "status": "success" if registrados else "error",
        "message": f"Se registraron {len(registrados)} de {len(filas)}.",
        "registrados": registrados,
        "errores": errores,
    })


@login_required
@permission_required(*PERMISOS_CATALOGO)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_eliminar(request):
    """Baja de una fila.

    Un site, un estado o un coordinador con zonas colgando no se borra: la zona
    los referencia con `PROTECT` y borrarlos dejaria el catalogo incoherente.
    Se responde 409 explicando cual es el estorbo en vez de un 500.
    """
    data, rechazo = _leer_cuerpo(request)
    if rechazo is not None:
        return rechazo

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

    catalogo, rechazo = _catalogo_permitido(request, data, fila)
    if rechazo is not None:
        return rechazo

    if borrable := catalogo.get("borrable"):
        motivo = borrable(fila)
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=409)

    try:
        with transaction.atomic():
            fila.delete()
            if tras_borrar := catalogo.get("tras_borrar"):
                tras_borrar(fila)
    except ProtectedError:
        return JsonResponse(
            {
                "status": "error",
                "message": (
                    f"No se puede eliminar {'esta' if catalogo.get('femenino') else 'este'} {catalogo['etiqueta']}: "
                    + catalogo.get("protegido", "tiene zonas asociadas. Reasígnalas primero.")
                ),
            },
            status=409,
        )

    fixtures.reset_cache()
    return JsonResponse({"status": "success", "message": f"{catalogo['etiqueta'].capitalize()} {_participio(catalogo, 'eliminad')}."})
