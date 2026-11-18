"""El registro de catálogos: cómo se serializa, se valida y se protege cada uno.

`CATALOGOS` declara, por catálogo, su modelo, su serializador, cómo se aplica el
cuerpo de una escritura y qué permiso lo administra; las vistas de `views.py`
son un único par guardar/eliminar sobre este registro.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from core.odoo_names import base_name, name_key, normalize_odoo_name
from services.catalogs.models import (
    AliasPersona,
    CondicionesEquipo,
    EquipoVentas,
    MembresiaEquipo,
    ObjetivoVentasOficina,
    PersonaVentas,
)
from services.catalogs.teams import (
    PIECES_BY_ROLE,
    ROLES,
    ROLES_BY_TEAM,
    SUPERVISOR_SUPERIOR,
    current_parameters,
    default_parameters,
    role_label,
    team_roles,
    validate_parameters,
)
from services.subscriptions.analytics.targets import (
    serialize_traffic_light,
)
from services.subscriptions.models import (
    IGNORED_AREA_CHOICES,
    LEVELS_WITH_BRANCH,
    PERSON_KIND_CHOICES,
    REFERENCE_BY_LEVEL,
    TARGET_LEVEL_CHOICES,
    TECNOLOGIA_CHOICES,
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


class InvalidData(ValueError):
    """Lo que mando el cliente no compone una fila valida."""


class Duplicate(InvalidData):
    """La fila chocaria con otra que ya existe (se responde 409, no 400)."""


def _text(data: dict, clave: str, *, obligatorio: bool = False, maximo: int = 255) -> str:
    """Lee un campo de texto del cuerpo, recortado y con longitud maxima."""
    valor = str(data.get(clave) or "").strip()
    if obligatorio and not valor:
        raise InvalidData(f"El campo «{clave}» es obligatorio.")
    return valor[:maximo]


def _number(data: dict, clave: str, default: float = 0.0) -> float:
    """Lee un campo numerico del cuerpo."""
    try:
        return float(data.get(clave) or default)
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{clave}» debe ser un numero.") from None


def _option(data: dict, clave: str, opciones, default: str) -> str:
    """Lee un campo que solo admite unos valores concretos."""
    valor = str(data.get(clave) or default).strip()
    validas = [v for v, _ in opciones]
    if valor not in validas:
        raise InvalidData(
            f"«{valor}» no es un valor valido para {clave}: {', '.join(validas)}."
        )
    return valor


def _relation(modelo, data: dict, clave: str, *, obligatorio: bool):
    """Resuelve la clave ajena de un campo del cuerpo."""
    bruto = data.get(clave)
    if bruto in (None, "", 0):
        if obligatorio:
            raise InvalidData(f"El campo «{clave}» es obligatorio.")
        return None
    fila = modelo.objects.filter(pk=bruto).first()
    if fila is None:
        raise InvalidData(f"No existe el registro indicado en «{clave}».")
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


def _regulatory_plan(r: PlanRegulador) -> dict[str, Any]:
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


def _zone(z: Zona) -> dict[str, Any]:
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


def _state(e: Estado) -> dict[str, Any]:
    """Un estado, con cuantas zonas lo referencian."""
    return {"id": e.id, "nombre": e.nombre, "zonas": e.zonas.count()}


def _coordinator(c: Coordinador) -> dict[str, Any]:
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
            {"persona": m.persona.nombre_completo, "rol": m.rol, "etiqueta": role_label(m.rol), "equipo": m.equipo.nombre}
            for m in c.membresias.all()
        ],
    }


# Los otros nombres de una persona viajan como tres listas, una por columna del export.
ALIAS_KEYS = {"alias_medio": "medio", "alias_supervisor": "supervisor", "alias_usuario": "usuario"}
MAX_ALIAS = 10


def _alias_of(p: PersonaVentas) -> dict[str, list[str]]:
    """Los otros nombres de una persona, por columna."""
    return {clave: [a.literal for a in p.alias.all() if a.columna == columna] for clave, columna in ALIAS_KEYS.items()}


def _person(p: PersonaVentas) -> dict[str, Any]:
    """Una persona del directorio, con los equipos donde tiene un papel."""
    return {
        "id": p.id,
        "nombre": p.nombre,
        "apellido": p.apellido,
        "medio": p.medio,
        "medio_supervisor": p.medio_supervisor,
        "usuario_odoo": p.usuario_odoo,
        **_alias_of(p),
        "membresias": [
            {"id": m.id, "equipo": m.equipo.slug, "rol": m.rol, "etiqueta": role_label(m.rol)}
            for m in p.membresias.all()
        ],
    }


def _membership(m: MembresiaEquipo) -> dict[str, Any]:
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
        **_alias_of(m.persona),
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


def _condition_view(equipo: EquipoVentas, rol: str, fila: CondicionesEquipo | None) -> dict[str, Any]:
    """Las condiciones de un rol de un equipo: las que valen, y si alguien las cambio."""
    return {
        "id": fila.id if fila else None,
        "equipo_id": equipo.id,
        "equipo": equipo.slug,
        "rol": rol,
        "etiqueta": role_label(rol),
        "piezas": list(PIECES_BY_ROLE[rol]),
        "parametros": current_parameters(equipo.slug, rol, fila.parametros if fila else None),
        "defecto": default_parameters(equipo.slug, rol),
        "personalizado": bool(fila and fila.parametros),
    }


def _condition(fila: CondicionesEquipo) -> dict[str, Any]:
    """Una fila de condiciones guardada, tal y como la consume la interfaz."""
    return _condition_view(fila.equipo, fila.rol, fila)


def _all_conditions() -> list[dict[str, Any]]:
    """Las condiciones de todos los roles de todos los equipos, editadas o no."""
    guardadas = {(f.equipo_id, f.rol): f for f in CondicionesEquipo.objects.select_related("equipo")}
    return [
        _condition_view(equipo, rol, guardadas.get((equipo.id, rol)))
        for equipo in EquipoVentas.objects.all()
        for rol in team_roles(equipo.slug)
    ]


def _team_view(e: EquipoVentas) -> dict[str, Any]:
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
                "superior": SUPERVISOR_SUPERIOR.get(e.slug) if rol == "supervisor" else None,
                "piezas": list(PIECES_BY_ROLE[rol]),
            }
            for rol in ROLES_BY_TEAM.get(e.slug, [])
        ],
    }


def _ignored(i: ProductoIgnorado) -> dict[str, Any]:
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

def _apply_plan(fila: Plan, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan."""
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=150)
    fila.tarifa = _text(data, "tarifa", maximo=150)
    fila.tecnologia = _option(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _option(data, "tipo_persona", PERSON_KIND_CHOICES, "nat")
    fila.referencia = _text(data, "referencia", maximo=200)
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.datas_mbps = _number(data, "datas_mbps")
    fila.precio = _number(data, "precio")
    fila.declarar_en_eta = bool(data.get("declarar_en_eta", True))
    # Solo en los PYME, que son los unicos que se pagan por porcentaje. Vacio
    # es "sin definir", no 0: Comisiones avisa en vez de pagar nada en silencio.
    fila.comision_pyme_pct = (
        _percentage(data, "comision_pyme_pct") if fila.tipo_persona == "PYME" else None
    )
    # Opcional: un plan recien creado todavia no esta agrupado, y hasta que lo
    # este no aparece en los formularios de la reguladora.
    fila.plan_regulador = _relation(PlanRegulador, data, "plan_regulador_id", obligatorio=False)


def _apply_regulatory_plan(fila: PlanRegulador, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan regulador."""
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=200)
    fila.tecnologia = _option(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _option(data, "tipo_persona", PERSON_KIND_CHOICES, "nat")
    fila.datas_mbps = _number(data, "datas_mbps")
    fila.precio = _number(data, "precio")
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.es_transporte = bool(data.get("es_transporte", False))
    fila.notas = _text(data, "notas")


def _apply_zone(fila: Zona, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre una zona."""
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=120)
    fila.site = _relation(Site, data, "site_id", obligatorio=True)
    fila.estado = _relation(Estado, data, "estado_id", obligatorio=True)
    fila.tecnologia = _option(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.coordinador = _relation(Coordinador, data, "coordinador_id", obligatorio=False)


def _ids(data: dict, clave: str, modelo, etiqueta: str) -> list[int] | None:
    """Una lista de ids del cuerpo comprobada contra el catalogo; `None` si no viene.

    Distingue «no la mando» (se conserva lo que hay) de «la mando vacia» (se
    vacia), porque hay escrituras que solo tocan otros campos.
    """
    if clave not in data:
        return None
    bruto = data.get(clave)
    if not isinstance(bruto, list):
        raise InvalidData(f"El campo «{clave}» tiene que ser una lista.")
    try:
        ids = sorted({int(i) for i in bruto})
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{clave}» tiene que ser una lista de ids.") from None
    existentes = set(modelo.objects.filter(pk__in=ids).values_list("pk", flat=True))
    if existentes != set(ids):
        raise InvalidData(f"Algún {etiqueta} indicado en «{clave}» ya no existe.")
    return ids


def _apply_site(fila: Site, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un site; sus zonas y equipos se escriben despues de guardarlo.

    Una zona pertenece a un site siempre: elegirla aqui la mueve a este, pero
    quitarla de la lista no tiene a donde mandarla, asi que se pide hacerlo
    desde la propia zona (Estructura › Zonas).
    """
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=80)
    fila.orden = int(_number(data, "orden", 999))
    fila._zone_ids = _ids(data, "zona_ids", Zona, "zona")
    fila._team_ids = _ids(data, "equipo_ids", EquipoVentas, "equipo")
    if fila.pk and fila._zone_ids is not None:
        quitadas = set(fila.zonas.values_list("pk", flat=True)) - set(fila._zone_ids)
        if quitadas:
            nombres = ", ".join(Zona.objects.filter(pk__in=quitadas).values_list("nombre", flat=True)[:3])
            raise InvalidData(
                f"Una zona no puede quedarse sin site ({nombres}…): cámbiala de site desde Estructura › Zonas."
            )


def _after_site(fila: Site, data: dict, request) -> None:
    """Escribe las zonas y los equipos del site, ya con `pk`."""
    if fila._zone_ids is not None:
        Zona.objects.filter(pk__in=fila._zone_ids).update(site=fila)
    if fila._team_ids is not None:
        fila.equipos.set(fila._team_ids)


def _apply_name(fila, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un catalogo que solo tiene nombre."""
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=120)


def _apply_coordinator(fila: Coordinador, data: dict, request) -> None:
    """Vuelca el cuerpo sobre una unidad de negocio; zonas y equipos se escriben despues."""
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=120)
    fila._zone_ids = _ids(data, "zona_ids", Zona, "zona")
    fila._team_ids = _ids(data, "equipo_ids", EquipoVentas, "equipo")


def _after_coordinator(fila: Coordinador, data: dict, request) -> None:
    """Asigna a la unidad las zonas elegidas y deja sin unidad las que se quitaron."""
    if fila._zone_ids is not None:
        fila.zonas.exclude(pk__in=fila._zone_ids).update(coordinador=None)
        Zona.objects.filter(pk__in=fila._zone_ids).update(coordinador=fila)
    if fila._team_ids is not None:
        fila.equipos.set(fila._team_ids)


def _dump_person(persona: PersonaVentas, data: dict, spec: dict[str, Any] | None) -> None:
    """Vuelca nombre y literales sobre una persona y comprueba que no choquen con otra.

    `spec` es lo que el rol pide (`teams.ROLES`): el `medio` y el usuario de
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
        persona.nombre = _text(data, "nombre", obligatorio=True, maximo=80)
    if "apellido" in data or persona.pk is None:
        persona.apellido = _text(data, "apellido", obligatorio=True, maximo=80)

    has_channel = spec is None or spec["medio"]
    lleva_supervisor = spec is None or spec["supervisor"]
    has_user = spec is None or spec["usuario"]
    if has_channel and "medio" in data:
        persona.medio = base_name(_text(data, "medio", maximo=160))
    if lleva_supervisor and "medio_supervisor" in data:
        persona.medio_supervisor = base_name(_text(data, "medio_supervisor", maximo=160))
    if has_user and "usuario_odoo" in data:
        usuario = _text(data, "usuario_odoo", maximo=200)
        persona.usuario_odoo = normalize_odoo_name(usuario) if usuario else ""

    if spec is not None:
        if spec["medio"] and not persona.medio:
            raise InvalidData("El medio (como aparece en «Medio» en Odoo) es obligatorio para este rol.")
        if spec["usuario"] and not base_name(persona.usuario_odoo):
            raise InvalidData("El usuario de Odoo es obligatorio para este rol.")
    if persona.medio_supervisor.casefold() == persona.medio.casefold():
        persona.medio_supervisor = ""

    _read_alias(persona, data, spec)
    _check_unique(persona)


def _read_alias(persona: PersonaVentas, data: dict, spec: dict | None) -> None:
    """Los otros nombres que trae el cuerpo, normalizados, en `persona._alias` (columna → lista).

    Lo que no viene se conserva, como los literales principales, y una columna que el
    rol no lleva se descarta. Uno igual al principal de su columna, o repetido, se omite.
    """
    persona._alias = {}
    for clave, columna in ALIAS_KEYS.items():
        if clave not in data or (spec is not None and not spec[columna]):
            continue
        bruto = data[clave]
        if not isinstance(bruto, list) or not all(isinstance(x, str) for x in bruto):
            raise InvalidData(f"El campo «{clave}» tiene que ser una lista de nombres.")
        principal = {"medio": persona.medio, "supervisor": persona.literal_supervisor, "usuario": persona.usuario_odoo}[columna]
        vistos = {name_key(principal)}
        limpios: list[str] = []
        for texto in bruto:
            literal = base_name(texto)[:160]
            if literal and name_key(literal) not in vistos:
                vistos.add(name_key(literal))
                limpios.append(normalize_odoo_name(literal) if columna == "usuario" else literal)
        if len(limpios) > MAX_ALIAS:
            raise InvalidData(f"Como mucho {MAX_ALIAS} nombres más por columna.")
        persona._alias[columna] = limpios


def _check_unique(persona: PersonaVentas) -> None:
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
            if literal and name_key(literal):
                claves[name_key(literal)] = literal
        for otra in otras:
            comun = claves.keys() & otra.claves(columna)
            if comun:
                raise Duplicate(f"«{claves[next(iter(comun))]}» ya es {etiquetas[columna]} de {otra.nombre_completo}.")


def _save_alias(persona: PersonaVentas) -> None:
    """Escribe los otros nombres de la persona, ya con `pk`: deja exactamente los que llegaron en cada columna."""
    for columna, literales in (getattr(persona, "_alias", None) or {}).items():
        existentes = {a.literal: a for a in persona.alias.filter(columna=columna)}
        for literal in literales:
            if literal not in existentes:
                AliasPersona.objects.create(persona=persona, columna=columna, literal=literal)
        for literal, fila in existentes.items():
            if literal not in literales:
                fila.delete()


def _after_person(fila: PersonaVentas, data: dict, request) -> None:
    """Escribe los otros nombres de la persona."""
    _save_alias(fila)


def _apply_person(fila: PersonaVentas, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la identidad de una persona (sin tocar su papel en los equipos).

    Es lo que usa Notificaciones para vincular un nombre del export a quien ya
    esta registrado con otro (como otro nombre suyo, sin tocar los principales). No deja sin
    medio ni sin usuario a quien su rol los exige.
    """
    _dump_person(fila, data, None)
    if fila.pk:
        roles = list(fila.membresias.values_list("rol", flat=True))
        if any(ROLES[r]["medio"] for r in roles) and not fila.medio:
            raise InvalidData("Su rol exige medio: no se puede dejar vacío.")
        if any(ROLES[r]["usuario"] for r in roles) and not fila.usuario_odoo:
            raise InvalidData("Su rol exige usuario de Odoo: no se puede dejar vacío.")


def _apply_membership(fila: MembresiaEquipo, data: dict, request) -> None:
    """Vuelca el cuerpo sobre el papel de una persona en un equipo.

    En el alta se elige equipo, rol y la persona: una existente (`persona_id`,
    p. ej. el gerente de operaciones que lleva dos equipos) o una nueva con los
    datos del cuerpo. Una membresia ya guardada puede **cambiar de equipo y de
    puesto**: lo que el nuevo rol no lleva se suelta (sites, unidades, superior),
    lo que exige y no trae el cuerpo se pide, y los supervisores que respondian a
    ella se quedan sin superior, porque ya no lo es del equipo ni del rol que
    ellos esperan. Los literales, el site, el superior y las unidades se comprueban
    contra lo que el rol exige (`teams.ROLES`). La persona se guarda aqui mismo,
    asi que el endpoint envuelve todo en una transaccion.
    """
    previous_role = fila.rol if fila.pk else None
    cambia = False
    if fila.pk is None:
        equipo = _relation(EquipoVentas, data, "equipo_id", obligatorio=True)
        rol = str(data.get("rol") or "")
        if rol not in team_roles(equipo.slug):
            raise InvalidData(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
        fila.equipo, fila.rol = equipo, rol
        persona = _relation(PersonaVentas, data, "persona_id", obligatorio=False) or PersonaVentas()
        if persona.pk and MembresiaEquipo.objects.filter(persona=persona, equipo=equipo).exists():
            raise Duplicate(f"{persona.nombre_completo} ya tiene un papel en {equipo.nombre}.")
    else:
        persona = fila.persona
        if "equipo_id" in data or "rol" in data:
            equipo = _relation(EquipoVentas, data, "equipo_id", obligatorio=True) if "equipo_id" in data else fila.equipo
            rol = str(data.get("rol") or fila.rol)
            if rol not in team_roles(equipo.slug):
                raise InvalidData(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
            cambia = (equipo.id, rol) != (fila.equipo_id, fila.rol)
            if cambia:
                if MembresiaEquipo.objects.filter(persona=persona, equipo=equipo).exclude(pk=fila.pk).exists():
                    raise Duplicate(f"{persona.nombre_completo} ya tiene un papel en {equipo.nombre}.")
                # Los supervisores que respondian a ella esperan otro equipo y otro rol: quedan sin asignar.
                fila.subordinados.update(superior=None)
                fila.equipo, fila.rol = equipo, rol
    spec = ROLES[fila.rol]
    previous_spec = ROLES[previous_role] if previous_role else None
    persona.save()
    _save_alias(persona)
    fila.persona = persona

    fila._site_ids = None
    if not spec.get("site"):
        if fila.pk and fila.sites.exists():
            fila._site_ids = []
    else:
        ids = _ids(data, "site_ids", Site, "site")
        if ids is None and (fila.pk is None or not previous_spec.get("site")):
            ids = []
        if ids is not None:
            if not ids:
                raise InvalidData("Elige al menos un site.")
            fila._site_ids = ids

    if fila.rol == "supervisor":
        esperado = SUPERVISOR_SUPERIOR.get(fila.equipo.slug)
        if "superior_id" in data:
            superior = _relation(MembresiaEquipo, data, "superior_id", obligatorio=False)
        else:
            superior = None if cambia else fila.superior
        if superior is not None and (superior.equipo_id != fila.equipo_id or superior.rol != esperado):
            raise InvalidData(f"El superior de un supervisor de {fila.equipo.nombre} tiene que ser {role_label(esperado or '')}.")
        fila.superior = superior

    fila._unidad_ids = None
    if not spec.get("unidades"):
        if fila.pk and fila.unidades.exists():
            fila._unidad_ids = []
    else:
        ids = _ids(data, "unidad_ids", Coordinador, "unidad de negocio")
        if ids is None and (fila.pk is None or previous_spec.get("unidades") != spec["unidades"]):
            ids = []
        elif ids is None and cambia:
            # Mismo tipo de unidades en otro equipo: se llevan, pero se comprueba que nadie las tenga ya alli.
            ids = [u.id for u in fila.unidades.all()]
        if ids is not None:
            if spec["unidades"] == "una" and len(ids) != 1:
                raise InvalidData("Un coordinador de unidad de negocio lleva exactamente una unidad.")
            if spec["unidades"] == "varias" and not ids:
                raise InvalidData("Elige al menos una unidad de negocio.")
            if spec["unidades"] == "una":
                ocupada = (
                    MembresiaEquipo.objects.filter(equipo=fila.equipo, rol=fila.rol, unidades__in=ids)
                    .exclude(pk=fila.pk)
                    .select_related("persona")
                    .first()
                )
                if ocupada is not None:
                    raise Duplicate(f"Esa unidad ya la lleva {ocupada.persona.nombre_completo} en {fila.equipo.nombre}.")
            fila._unidad_ids = ids


def _delete_site(fila: Site) -> str | None:
    """Un site que lleva alguna coordinadora de oficina no se borra: ella quedaria fuera del reporte."""
    nombres = [m.persona.nombre_completo for m in fila.membresias.select_related("persona")[:3]]
    if nombres:
        return f"No se puede eliminar este site: lo llevan {', '.join(nombres)}. Quítaselo primero."
    return None


def _after_membership(fila: MembresiaEquipo, data: dict, request) -> None:
    """Escribe las unidades y los sites de la membresia, ya con `pk`."""
    if fila._unidad_ids is not None:
        fila.unidades.set(fila._unidad_ids)
    if fila._site_ids is not None:
        fila.sites.set(fila._site_ids)


def _after_membership_delete(fila: MembresiaEquipo) -> None:
    """Si la persona se queda sin ningun papel (ni objetivos), se borra tambien.

    Una persona sin equipo no cobra y su literal ya no seria «pendiente» en
    Notificaciones: se la dejaria registrada en un limbo. Con el papel borrado
    y nada que la retenga, desaparece y su nombre vuelve a la lista de pendientes.
    """
    persona = fila.persona
    if not persona.membresias.exists() and not persona.objetivos_ventas.exists():
        persona.delete()


def _find_condition(data: dict) -> CondicionesEquipo | None:
    """Las condiciones ya guardadas de (equipo, rol): editar es siempre sobre la misma fila."""
    return CondicionesEquipo.objects.filter(equipo_id=data.get("equipo_id") or 0, rol=str(data.get("rol") or "")).first()


def _apply_conditions(fila: CondicionesEquipo, data: dict, request) -> None:
    """Vuelca los parametros de pago de un rol de un equipo, validados contra el esquema del rol."""
    if fila.pk is None:
        equipo = _relation(EquipoVentas, data, "equipo_id", obligatorio=True)
        rol = str(data.get("rol") or "")
        if rol not in team_roles(equipo.slug):
            raise InvalidData(f"«{rol}» no es un rol del equipo {equipo.nombre}.")
        fila.equipo, fila.rol = equipo, rol
    try:
        fila.parametros = validate_parameters(fila.rol, data.get("parametros"))
    except ValueError as e:
        raise InvalidData(str(e)) from None
    fila.actualizado_por = request.user


def _apply_ignored(fila: ProductoIgnorado, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un nombre ignorado, anotando quien lo creo.

    El area solo se fija en el alta: cambiarla despues seria mover el nombre a
    otra lista, y el permiso que se comprobo fue el de la que tenia.
    """
    if not fila.pk:
        fila.area = _option(data, "area", IGNORED_AREA_CHOICES, "productos")
    fila.nombre = _text(data, "nombre", obligatorio=True, maximo=200)
    fila.nota = _text(data, "nota")
    if fila.creado_por_id is None:
        fila.creado_por = request.user


# --- Objetivos ----------------------------------------------------------------

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Los modelos de cada nivel, para resolver la referencia que manda el cliente.
_MODEL_BY_LEVEL = {
    "estado": Estado,
    "site": Site,
    "coordinador": Coordinador,
    "zona": Zona,
    "zona_sucursal": Zona,
}


def _month(data: dict, clave: str, *, obligatorio: bool) -> str | None:
    """Lee un mes `YYYY-MM`; vacio es None (en `desde`, "desde siempre")."""
    valor = str(data.get(clave) or "").strip()
    if not valor:
        if obligatorio:
            raise InvalidData(f"El campo «{clave}» es obligatorio.")
        return None
    if not _MONTH.match(valor):
        raise InvalidData(f"«{valor}» no es un mes valido: se espera AAAA-MM.")
    return valor


def _percentage(data: dict, clave: str) -> float | None:
    """Lee un porcentaje opcional entre 0 y 100; vacio es None ("hereda")."""
    bruto = data.get(clave)
    if bruto in (None, ""):
        return None
    try:
        valor = float(bruto)
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{clave}» debe ser un numero.") from None
    if not 0 <= valor <= 100:
        raise InvalidData(f"El campo «{clave}» debe estar entre 0 y 100.")
    return valor


def _target_values(fila, data: dict) -> None:
    """Crecimiento y churn: al menos uno, porque el otro puede heredarse."""
    fila.crecimiento_pct = _percentage(data, "crecimiento_pct")
    fila.churn_pct = _percentage(data, "churn_pct")
    if fila.crecimiento_pct is None and fila.churn_pct is None:
        raise InvalidData("Indica al menos el objetivo de crecimiento o el de churn.")


def _pct(valor) -> float | None:
    """Decimal del ORM a float, conservando el nulo que significa "hereda"."""
    return None if valor is None else float(valor)


def _target(o: ObjetivoComercial) -> dict[str, Any]:
    """Un tramo de objetivo, con el nombre de su entidad resuelto.

    `entidad` es el nombre con el que se cruza contra los reportes: la sucursal
    tal cual, o `"Zona - Sucursal"` en un nodo.
    """
    entidad = o.entidad
    return {
        "id": o.id,
        "nivel": o.nivel,
        "entidad_id": entidad.id if entidad else None,
        "entidad": o.entity_name,
        "sucursal": o.sucursal,
        "desde": o.desde or "",
        "crecimiento_pct": _pct(o.crecimiento_pct),
        "churn_pct": _pct(o.churn_pct),
        "nota": o.nota,
        "actualizado_por": o.actualizado_por.username if o.actualizado_por else "",
        "actualizado_en": o.actualizado_en.strftime("%Y-%m-%d %H:%M"),
    }


def _month_target(o: ObjetivoMes) -> dict[str, Any]:
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


def _traffic_light(s: SemaforoObjetivos) -> dict[str, Any]:
    """Los umbrales de color, con el id de la fila unica."""
    return {"id": s.id, **serialize_traffic_light(s)}


def _es_general(fila: ObjetivoComercial) -> bool:
    """El objetivo general: una sola fila, sin fecha, que no se crea ni se borra."""
    return fila.nivel == "general"


def _target_entity(nivel: str, data: dict):
    """La fila de catalogo del nivel: por `entidad_id` o por `entidad_nombre`.

    El nombre existe porque un nodo se elige de los datos (`"Guacara - NYC"`),
    que traen el nombre de la zona y no su id.
    """
    modelo = _MODEL_BY_LEVEL[nivel]
    if data.get("entidad_id") not in (None, "", 0):
        return _relation(modelo, data, "entidad_id", obligatorio=True)
    nombre = _text(data, "entidad_nombre", maximo=200)
    if not nombre:
        raise InvalidData("Indica a qué zona, site, estado o coordinador va el objetivo.")
    fila = modelo.objects.filter(nombre__iexact=nombre).first()
    if fila is None:
        raise InvalidData(f"«{nombre}» no está en el catálogo.")
    return fila


def _target_reference(nivel: str, data: dict) -> dict[str, Any]:
    """Los campos que identifican a quien tiene el objetivo en `nivel`."""
    referencia: dict[str, Any] = {}
    campo = REFERENCE_BY_LEVEL.get(nivel)
    if campo:
        referencia[campo] = _target_entity(nivel, data)
    if nivel in LEVELS_WITH_BRANCH:
        referencia["sucursal"] = _text(data, "sucursal", obligatorio=True, maximo=80)
    return referencia


def _reference_filter(nivel: str, referencia: dict[str, Any], desde: str | None) -> dict[str, Any]:
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


def _apply_target(fila: ObjetivoComercial, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo de objetivo.

    El nivel y la entidad solo se fijan al crearlo: mover un tramo de una zona
    a otra es borrar uno y crear otro, y asi la tabla no cambia de significado
    bajo los pies de quien la esta mirando.

    El general es una sola fila sin fecha: se edita, pero no se crea otro ni se
    le pone vigencia. Lo que cambia en un mes concreto es una excepcion de mes.
    """
    if fila.pk is None:
        fila.nivel = _option(data, "nivel", TARGET_LEVEL_CHOICES, "zona")
        if _es_general(fila) and ObjetivoComercial.objects.filter(nivel="general").exists():
            raise Duplicate("El objetivo general es uno solo: edítalo.")
        for campo, valor in _target_reference(fila.nivel, data).items():
            setattr(fila, campo, valor)

    desde = _month(data, "desde", obligatorio=False)
    if _es_general(fila) and desde is not None:
        raise InvalidData(
            "El objetivo general no lleva fecha: para cambiar un mes concreto usa una excepción de mes."
        )
    fila.desde = desde

    _target_values(fila, data)
    if _es_general(fila) and (fila.crecimiento_pct is None or fila.churn_pct is None):
        raise InvalidData("El objetivo general necesita crecimiento y churn: no hay de quien heredar.")

    # La unicidad (entidad, desde) no la puede exigir la BD —los NULL son
    # distintos en un UNIQUE—, asi que se comprueba aqui.
    campo = REFERENCE_BY_LEVEL.get(fila.nivel)
    referencia: dict[str, Any] = {campo: getattr(fila, campo)} if campo else {}
    if fila.nivel in LEVELS_WITH_BRANCH:
        referencia["sucursal"] = fila.sucursal
    filtro = _reference_filter(fila.nivel, referencia, fila.desde)
    if ObjetivoComercial.objects.filter(**filtro).exclude(pk=fila.pk).exists():
        cuando = f"desde {fila.desde}" if fila.desde else "desde siempre"
        quien = fila.entity_name or "el nivel general"
        raise Duplicate(f"Ya hay un objetivo {cuando} para {quien}: edítalo.")

    fila.nota = _text(data, "nota")
    fila.actualizado_por = request.user


def _delete_target(fila: ObjetivoComercial) -> str | None:
    """Por que no se puede borrar este tramo, o None si se puede."""
    if _es_general(fila):
        return "El objetivo general no se puede eliminar: es el que responde cuando nadie más lo hace."
    return None


def _apply_month_target(fila: ObjetivoMes, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la excepcion de un mes."""
    periodo = _month(data, "periodo", obligatorio=True)
    if ObjetivoMes.objects.filter(periodo=periodo).exclude(pk=fila.pk).exists():
        raise Duplicate(f"El mes {periodo} ya tiene una excepción: edítala.")
    fila.periodo = periodo
    _target_values(fila, data)
    fila.nota = _text(data, "nota")
    fila.actualizado_por = request.user


def _office_target(o: ObjetivoVentasOficina) -> dict[str, Any]:
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


def _apply_office_target(fila: ObjetivoVentasOficina, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo del objetivo de ventas de las oficinas.

    La persona solo se fija al crearlo, como la entidad de un objetivo
    comercial: vacia es el general. Tiene que ser coordinadora de oficina. La
    unicidad de (persona, desde) se comprueba aqui porque la BD no puede.
    """
    if fila.pk is None:
        persona = _relation(PersonaVentas, data, "persona_id", obligatorio=False)
        if persona is not None and not persona.membresias.filter(rol="coord_oficina").exists():
            raise InvalidData(f"{persona.nombre_completo} no es coordinadora de oficina.")
        fila.persona = persona
    fila.desde = _month(data, "desde", obligatorio=False)

    bruto = data.get("ventas")
    try:
        ventas = float(bruto)
    except (TypeError, ValueError):
        raise InvalidData("Indica cuántas ventas al mes se esperan.") from None
    if ventas < 1 or ventas != int(ventas):
        raise InvalidData("El objetivo de ventas es un número entero de 1 o más.")
    fila.ventas = int(ventas)

    if ObjetivoVentasOficina.objects.filter(persona=fila.persona, desde=fila.desde).exclude(pk=fila.pk).exists():
        cuando = f"desde {fila.desde}" if fila.desde else "desde siempre"
        quien = fila.persona.nombre_completo if fila.persona else "el general"
        raise Duplicate(f"Ya hay un objetivo de ventas {cuando} para {quien}: edítalo.")
    fila.nota = _text(data, "nota")
    fila.actualizado_por = request.user


def _zone_without_target(z: ZonaSinObjetivo) -> dict[str, Any]:
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


def _apply_zone_without_target(fila: ZonaSinObjetivo, data: dict, request) -> None:
    """Vuelca el cuerpo sobre el tramo sin objetivo de una zona.

    La zona solo se fija al crearlo. Un tramo por zona: si ya tiene uno se
    edita ese (se le cambia el `hasta`), no se crea otro.
    """
    if fila.pk is None:
        zona = _relation(Zona, data, "zona_id", obligatorio=True)
        if ZonaSinObjetivo.objects.filter(zona=zona).exists():
            raise Duplicate(f"{zona.nombre} ya está sin objetivo: edita su tramo.")
        fila.zona = zona
    fila.desde = _month(data, "desde", obligatorio=False)
    fila.hasta = _month(data, "hasta", obligatorio=False)
    if fila.desde and fila.hasta and fila.hasta < fila.desde:
        raise InvalidData("«Hasta» no puede ser anterior a «Desde».")
    fila.nota = _text(data, "nota")
    fila.actualizado_por = request.user


def _apply_traffic_light(fila: SemaforoObjetivos, data: dict, request) -> None:
    """Vuelca el cuerpo sobre los umbrales de color (valores directos, en %)."""
    campos = (
        "cumpl_verde", "cumpl_amarillo",
        "crec_verde", "crec_amarillo",
        "churn_verde", "churn_amarillo",
    )
    valores = {}
    for campo in campos:
        # No `_number`: su `or default` tomaria un 0 legitimo (amarillo de
        # crecimiento desde 0%, por ejemplo) por un campo vacio.
        bruto = data.get(campo)
        if bruto in (None, ""):
            raise InvalidData(f"El campo «{campo}» es obligatorio.")
        try:
            valores[campo] = float(bruto)
        except (TypeError, ValueError):
            raise InvalidData(f"El campo «{campo}» debe ser un numero.") from None
    # El crecimiento puede ser negativo (amarillo desde -1%, por ejemplo); un
    # churn o un cumplimiento negativos no significan nada.
    if any(valores[campo] < 0 for campo in ("cumpl_verde", "cumpl_amarillo", "churn_verde", "churn_amarillo")):
        raise InvalidData("Los umbrales de churn y de cumplimiento no pueden ser negativos.")
    if valores["cumpl_amarillo"] > valores["cumpl_verde"]:
        raise InvalidData("En cumplimiento, el amarillo tiene que empezar por debajo del verde.")
    if valores["crec_amarillo"] > valores["crec_verde"]:
        raise InvalidData("En crecimiento, el amarillo tiene que empezar por debajo del verde.")
    if valores["churn_verde"] > valores["churn_amarillo"]:
        raise InvalidData("En churn, el verde tiene que acabar por debajo del amarillo.")
    for campo, valor in valores.items():
        setattr(fila, campo, valor)
    fila.actualizado_por = request.user


# Un permiso por grupo del modulo. Los nombres de los campos son anteriores al
# modulo y se conservan: «comercial» es hoy la Estructura (zonas,
# estados) y «operacional» los Productos. Ventas —sites, unidades de negocio, equipos,
# objetivos y condiciones de pago— se separo de la estructura porque lo
# lleva quien paga comisiones, no quien reparte la red.
COMMERCIAL_PERMISSION = "can_manage_catalogo_comercial"
OPERATIONAL_PERMISSION = "can_manage_catalogo_operacional"
SALES_PERMISSION = "can_manage_catalogo_ventas"

# Que permiso administra los nombres ignorados de cada area: los mismos que
# administran el catalogo donde se habrian registrado.
PERMISSION_BY_AREA = {
    "productos": OPERATIONAL_PERMISSION,
    "estructura": COMMERCIAL_PERMISSION,
    "ventas": SALES_PERMISSION,
}


def _ignored_permission(fila: ProductoIgnorado, data: dict) -> str:
    """El permiso de un ignorado es el de su area (la pedida, si es un alta)."""
    area = fila.area if fila.pk else str(data.get("area") or "productos")
    return PERMISSION_BY_AREA.get(area, OPERATIONAL_PERMISSION)


# Un catalogo = un modelo, como se sirve, como se lee del cuerpo y que permiso
# lo administra. Anadir uno nuevo es anadir una entrada aqui y una pestana en
# la interfaz. `permiso_fila`, si esta, decide el permiso mirando la fila: es
# lo que reparte los ignorados entre los tres permisos segun su area.
# `protegido` es el motivo con el que se niega borrar una fila que otra
# referencia con `PROTECT` (por defecto, las zonas).
CATALOGOS: dict[str, dict[str, Any]] = {
    "planes": {"modelo": Plan, "serializar": _plan, "aplicar": _apply_plan, "etiqueta": "plan", "permiso": OPERATIONAL_PERMISSION},
    "reguladores": {"modelo": PlanRegulador, "serializar": _regulatory_plan, "aplicar": _apply_regulatory_plan, "etiqueta": "plan regulador", "permiso": OPERATIONAL_PERMISSION},
    "ignorados": {"modelo": ProductoIgnorado, "serializar": _ignored, "aplicar": _apply_ignored, "etiqueta": "nombre ignorado", "permiso": OPERATIONAL_PERMISSION, "permiso_fila": _ignored_permission},
    "zonas": {"modelo": Zona, "serializar": _zone, "aplicar": _apply_zone, "etiqueta": "zona", "femenino": True, "permiso": COMMERCIAL_PERMISSION},
    # Sites y unidades de negocio se muestran en Ventas › Estructura de ventas, junto a
    # los equipos que los trabajan, y los administra quien lleva el catalogo de ventas.
    "sites": {"modelo": Site, "serializar": _site, "aplicar": _apply_site, "despues": _after_site, "borrable": _delete_site, "etiqueta": "site", "permiso": SALES_PERMISSION, "protegido": "tiene zonas o coordinadoras de oficina asociadas. Reasígnalas primero."},
    "estados": {"modelo": Estado, "serializar": _state, "aplicar": _apply_name, "etiqueta": "estado", "permiso": COMMERCIAL_PERMISSION},
    "coordinadores": {"modelo": Coordinador, "serializar": _coordinator, "aplicar": _apply_coordinator, "despues": _after_coordinator, "etiqueta": "unidad de negocio", "femenino": True, "permiso": SALES_PERMISSION},
    # La persona es la identidad (nombre y literales de Odoo); su papel en cada equipo es la membresia.
    "personas": {"modelo": PersonaVentas, "serializar": _person, "aplicar": _apply_person, "despues": _after_person, "etiqueta": "persona", "femenino": True, "permiso": SALES_PERMISSION},
    "membresias": {"modelo": MembresiaEquipo, "serializar": _membership, "aplicar": _apply_membership, "despues": _after_membership, "tras_borrar": _after_membership_delete, "etiqueta": "persona del equipo", "femenino": True, "permiso": SALES_PERMISSION},
    # Se edita siempre la fila de (equipo, rol), exista o no (`buscar`); borrarla restablece los valores de la politica.
    "condiciones_equipo": {"modelo": CondicionesEquipo, "serializar": _condition, "aplicar": _apply_conditions, "buscar": _find_condition, "etiqueta": "condición de pago", "femenino": True, "permiso": SALES_PERMISSION},
    # Los objetivos van con ventas: quien organiza a los equipos de venta es
    # quien fija lo que se espera de cada parte de la red.
    # `borrable` responde por que no se puede borrar una fila concreta.
    "objetivos": {"modelo": ObjetivoComercial, "serializar": _target, "aplicar": _apply_target, "etiqueta": "objetivo", "permiso": SALES_PERMISSION, "borrable": _delete_target},
    "objetivos_mes": {"modelo": ObjetivoMes, "serializar": _month_target, "aplicar": _apply_month_target, "etiqueta": "objetivo del mes", "permiso": SALES_PERMISSION},
    "zonas_sin_objetivo": {"modelo": ZonaSinObjetivo, "serializar": _zone_without_target, "aplicar": _apply_zone_without_target, "etiqueta": "zona sin objetivo", "femenino": True, "permiso": SALES_PERMISSION},
    "objetivos_oficina": {"modelo": ObjetivoVentasOficina, "serializar": _office_target, "aplicar": _apply_office_target, "etiqueta": "objetivo de ventas", "permiso": SALES_PERMISSION},
    # Fila unica: se edita siempre la misma y no se borra.
    "semaforo": {"modelo": SemaforoObjetivos, "serializar": _traffic_light, "aplicar": _apply_traffic_light, "etiqueta": "semáforo", "permiso": SALES_PERMISSION, "unico": True},
}
