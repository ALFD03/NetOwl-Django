"""El registro de catálogos: cómo se serializa, se valida y se protege cada uno.

`CATALOGS` declara, por catálogo, su modelo, su serializador, cómo se aplica el
cuerpo de una escritura y qué permiso lo administra; las vistas de `views.py`
son un único par guardar/eliminar sobre este registro.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from core.odoo_names import base_name, name_key, normalize_odoo_name
from services.catalogs.models import (
    OfficeSalesTarget,
    PersonAlias,
    SalesPerson,
    SalesTeam,
    TeamConditions,
    TeamMembership,
)
from services.catalogs.teams import (
    PIECES_BY_ROLE,
    ROLES,
    ROLES_BY_TEAM,
    SUPERVISOR_MANAGER,
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
    TECHNOLOGY_CHOICES,
    CommercialTarget,
    Coordinator,
    IgnoredProduct,
    MonthTarget,
    Plan,
    RegulatoryPlan,
    Site,
    State,
    TargetThresholds,
    Zone,
    ZoneWithoutTarget,
)

logger = logging.getLogger(__name__)


class InvalidData(ValueError):
    """Lo que mando el cliente no compone una fila valida."""


class Duplicate(InvalidData):
    """La fila chocaria con otra que ya existe (se responde 409, no 400)."""


def _text(data: dict, key: str, *, required: bool = False, max_value: int = 255) -> str:
    """Lee un campo de texto del cuerpo, recortado y con longitud maxima."""
    value = str(data.get(key) or "").strip()
    if required and not value:
        raise InvalidData(f"El campo «{key}» es obligatorio.")
    return value[:max_value]


def _number(data: dict, key: str, default: float = 0.0) -> float:
    """Lee un campo numerico del cuerpo."""
    try:
        return float(data.get(key) or default)
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{key}» debe ser un numero.") from None


def _option(data: dict, key: str, options, default: str) -> str:
    """Lee un campo que solo admite unos valores concretos."""
    value = str(data.get(key) or default).strip()
    valid = [v for v, _ in options]
    if value not in valid:
        raise InvalidData(
            f"«{value}» no es un valor valido para {key}: {', '.join(valid)}."
        )
    return value


def _relation(model, data: dict, key: str, *, required: bool):
    """Resuelve la clave ajena de un campo del cuerpo."""
    gross = data.get(key)
    if gross in (None, "", 0):
        if required:
            raise InvalidData(f"El campo «{key}» es obligatorio.")
        return None
    row = model.objects.filter(pk=gross).first()
    if row is None:
        raise InvalidData(f"No existe el registro indicado en «{key}».")
    return row


# --- Serializacion ----------------------------------------------------------

def _plan(p: Plan) -> dict[str, Any]:
    """Un plan, tal y como lo consume la interfaz."""
    return {
        "id": p.id,
        "nombre": p.name,
        "tarifa": p.tariff,
        "tecnologia": p.technology,
        "tipo_persona": p.person_type,
        "referencia": p.reference,
        "tiene_tv": p.has_tv,
        "datas_mbps": float(p.data_mbps),
        "precio": float(p.price),
        "declarar_en_eta": p.declare_in_eta,
        "comision_pyme_pct": float(p.sme_commission_pct) if p.sme_commission_pct is not None else None,
        "plan_regulador_id": p.regulator_plan_id,
        "plan_regulador": p.regulator_plan.name if p.regulator_plan_id else "",
    }


def _regulatory_plan(r: RegulatoryPlan) -> dict[str, Any]:
    """Un plan regulador, con cuantos planes comerciales se declaran con el."""
    return {
        "id": r.id,
        "nombre": r.name,
        "tecnologia": r.technology,
        "tipo_persona": r.person_type,
        "datas_mbps": float(r.data_mbps),
        "precio": float(r.price),
        "tiene_tv": r.has_tv,
        "es_transporte": r.is_transport,
        "notas": r.notes,
        "planes": r.plans.count(),
    }


def _zone(z: Zone) -> dict[str, Any]:
    """Una zona, con los nombres de sus relaciones resueltos."""
    return {
        "id": z.id,
        "nombre": z.name,
        "site_id": z.site_id,
        "site": z.site.name,
        "estado_id": z.state_id,
        "estado": z.state.name,
        "tecnologia": z.technology,
        "coordinador_id": z.coordinator_id,
        "coordinador": z.coordinator.name if z.coordinator else "",
    }


def _site(s: Site) -> dict[str, Any]:
    """Un site, con sus zonas y los equipos de ventas que lo trabajan."""
    zones = list(s.zones.all())
    teams = list(s.teams.all())
    return {
        "id": s.id,
        "nombre": s.name,
        "orden": s.order,
        "zonas": len(zones),
        "zona_ids": [z.id for z in zones],
        "equipo_ids": [e.id for e in teams],
        "equipos": [e.name for e in teams],
    }


def _state(e: State) -> dict[str, Any]:
    """Un estado, con cuantas zonas lo referencian."""
    return {"id": e.id, "nombre": e.name, "zonas": e.zones.count()}


def _coordinator(c: Coordinator) -> dict[str, Any]:
    """Una unidad de negocio: sus zonas, los equipos que la trabajan y quien la lleva."""
    zones = list(c.zones.all())
    teams = list(c.teams.all())
    return {
        "id": c.id,
        "nombre": c.name,
        "zonas": len(zones),
        "zona_ids": [z.id for z in zones],
        "equipo_ids": [e.id for e in teams],
        "equipos": [e.name for e in teams],
        # Las membresias que la tienen en `unidades`: coordinador, jefes, gerentes.
        "responsables": [
            {"persona": m.person.full_name, "rol": m.role, "etiqueta": role_label(m.role), "equipo": m.team.name}
            for m in c.memberships.all()
        ],
    }


# Los otros nombres de una persona viajan como tres listas, una por columna del export.
ALIAS_KEYS = {"alias_medio": "medio", "alias_supervisor": "supervisor", "alias_usuario": "usuario"}
MAX_ALIAS = 10


def _alias_of(p: SalesPerson) -> dict[str, list[str]]:
    """Los otros nombres de una persona, por columna."""
    return {key: [a.literal for a in p.aliases.all() if a.column == column] for key, column in ALIAS_KEYS.items()}


def _person(p: SalesPerson) -> dict[str, Any]:
    """Una persona del directorio, con los equipos donde tiene un papel."""
    return {
        "id": p.id,
        "nombre": p.name,
        "apellido": p.last_name,
        "medio": p.channel,
        "medio_supervisor": p.supervisor_channel,
        "usuario_odoo": p.odoo_user,
        **_alias_of(p),
        "membresias": [
            {"id": m.id, "equipo": m.team.slug, "rol": m.role, "etiqueta": role_label(m.role)}
            for m in p.memberships.all()
        ],
    }


def _membership(m: TeamMembership) -> dict[str, Any]:
    """El papel de una persona en un equipo, con sus literales y relaciones resueltos."""
    units = list(m.units.all())
    sites = list(m.sites.all())
    return {
        "id": m.id,
        "persona_id": m.person_id,
        "nombre": m.person.name,
        "apellido": m.person.last_name,
        "medio": m.person.channel,
        "medio_supervisor": m.person.supervisor_channel,
        "usuario_odoo": m.person.odoo_user,
        **_alias_of(m.person),
        "equipo_id": m.team_id,
        "equipo": m.team.slug,
        "rol": m.role,
        "site_ids": [s.id for s in sites],
        "sites": [s.name for s in sites],
        "superior_id": m.manager_id,
        "superior": m.manager.person.full_name if m.manager_id else "",
        "unidad_ids": [u.id for u in units],
        "unidades": [u.name for u in units],
    }


def _condition_view(team: SalesTeam, role: str, row: TeamConditions | None) -> dict[str, Any]:
    """Las condiciones de un rol de un equipo: las que valen, y si alguien las cambio."""
    return {
        "id": row.id if row else None,
        "equipo_id": team.id,
        "equipo": team.slug,
        "rol": role,
        "etiqueta": role_label(role),
        "piezas": list(PIECES_BY_ROLE[role]),
        "parametros": current_parameters(team.slug, role, row.params if row else None),
        "defecto": default_parameters(team.slug, role),
        "personalizado": bool(row and row.params),
    }


def _condition(row: TeamConditions) -> dict[str, Any]:
    """Una fila de condiciones guardada, tal y como la consume la interfaz."""
    return _condition_view(row.team, row.role, row)


def _all_conditions() -> list[dict[str, Any]]:
    """Las condiciones de todos los roles de todos los equipos, editadas o no."""
    saved = {(f.team_id, f.role): f for f in TeamConditions.objects.select_related("team")}
    return [
        _condition_view(team, role, saved.get((team.id, role)))
        for team in SalesTeam.objects.all()
        for role in team_roles(team.slug)
    ]


def _team_view(e: SalesTeam) -> dict[str, Any]:
    """Un equipo con la descripcion de sus roles: lo que cada uno exige y admite."""
    return {
        "id": e.id,
        "slug": e.slug,
        "nombre": e.name,
        "roles": [
            {
                "rol": role,
                "etiqueta": ROLES[role]["label"],
                "medio": ROLES[role]["channel"],
                "supervisor": ROLES[role]["supervisor"],
                "usuario": ROLES[role]["user"],
                "site": bool(ROLES[role].get("site")),
                "unidades": ROLES[role].get("units", ""),
                "superior": SUPERVISOR_MANAGER.get(e.slug) if role == "supervisor" else None,
                "piezas": list(PIECES_BY_ROLE[role]),
            }
            for role in ROLES_BY_TEAM.get(e.slug, [])
        ],
    }


def _ignored(i: IgnoredProduct) -> dict[str, Any]:
    """Un nombre ignorado, con su area y quien y cuando lo declaro."""
    return {
        "id": i.id,
        "nombre": i.name,
        "area": i.area,
        "nota": i.note,
        "creado_por": i.created_by.username if i.created_by else "",
        "creado_en": i.created_at.strftime("%Y-%m-%d %H:%M"),
    }


# --- Aplicacion del cuerpo a la fila ----------------------------------------

def _apply_plan(row: Plan, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan."""
    row.name = _text(data, "nombre", required=True, max_value=150)
    row.tariff = _text(data, "tarifa", max_value=150)
    row.technology = _option(data, "tecnologia", TECHNOLOGY_CHOICES, "FTTH")
    row.person_type = _option(data, "tipo_persona", PERSON_KIND_CHOICES, "nat")
    row.reference = _text(data, "referencia", max_value=200)
    row.has_tv = bool(data.get("tiene_tv", False))
    row.data_mbps = _number(data, "datas_mbps")
    row.price = _number(data, "precio")
    row.declare_in_eta = bool(data.get("declarar_en_eta", True))
    # Solo en los PYME, que son los unicos que se pagan por porcentaje. Vacio
    # es "sin definir", no 0: Comisiones avisa en vez de pagar nada en silencio.
    row.sme_commission_pct = (
        _percentage(data, "comision_pyme_pct") if row.person_type == "PYME" else None
    )
    # Opcional: un plan recien creado todavia no esta agrupado, y hasta que lo
    # este no aparece en los formularios de la reguladora.
    row.regulator_plan = _relation(RegulatoryPlan, data, "plan_regulador_id", required=False)


def _apply_regulatory_plan(row: RegulatoryPlan, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan regulador."""
    row.name = _text(data, "nombre", required=True, max_value=200)
    row.technology = _option(data, "tecnologia", TECHNOLOGY_CHOICES, "FTTH")
    row.person_type = _option(data, "tipo_persona", PERSON_KIND_CHOICES, "nat")
    row.data_mbps = _number(data, "datas_mbps")
    row.price = _number(data, "precio")
    row.has_tv = bool(data.get("tiene_tv", False))
    row.is_transport = bool(data.get("es_transporte", False))
    row.notes = _text(data, "notas")


def _apply_zone(row: Zone, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre una zona."""
    row.name = _text(data, "nombre", required=True, max_value=120)
    row.site = _relation(Site, data, "site_id", required=True)
    row.state = _relation(State, data, "estado_id", required=True)
    row.technology = _option(data, "tecnologia", TECHNOLOGY_CHOICES, "FTTH")
    row.coordinator = _relation(Coordinator, data, "coordinador_id", required=False)


def _ids(data: dict, key: str, model, label: str) -> list[int] | None:
    """Una lista de ids del cuerpo comprobada contra el catalogo; `None` si no viene.

    Distingue «no la mando» (se conserva lo que hay) de «la mando vacia» (se
    vacia), porque hay escrituras que solo tocan otros campos.
    """
    if key not in data:
        return None
    gross = data.get(key)
    if not isinstance(gross, list):
        raise InvalidData(f"El campo «{key}» tiene que ser una lista.")
    try:
        ids = sorted({int(i) for i in gross})
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{key}» tiene que ser una lista de ids.") from None
    existing = set(model.objects.filter(pk__in=ids).values_list("pk", flat=True))
    if existing != set(ids):
        raise InvalidData(f"Algún {label} indicado en «{key}» ya no existe.")
    return ids


def _apply_site(row: Site, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un site; sus zonas y equipos se escriben despues de guardarlo.

    Una zona pertenece a un site siempre: elegirla aqui la mueve a este, pero
    quitarla de la lista no tiene a donde mandarla, asi que se pide hacerlo
    desde la propia zona (Estructura › Zonas).
    """
    row.name = _text(data, "nombre", required=True, max_value=80)
    row.order = int(_number(data, "orden", 999))
    row._zone_ids = _ids(data, "zona_ids", Zone, "zona")
    row._team_ids = _ids(data, "equipo_ids", SalesTeam, "equipo")
    if row.pk and row._zone_ids is not None:
        removed = set(row.zones.values_list("pk", flat=True)) - set(row._zone_ids)
        if removed:
            names = ", ".join(Zone.objects.filter(pk__in=removed).values_list("name", flat=True)[:3])
            raise InvalidData(
                f"Una zona no puede quedarse sin site ({names}…): cámbiala de site desde Estructura › Zonas."
            )


def _after_site(row: Site, data: dict, request) -> None:
    """Escribe las zonas y los equipos del site, ya con `pk`."""
    if row._zone_ids is not None:
        Zone.objects.filter(pk__in=row._zone_ids).update(site=row)
    if row._team_ids is not None:
        row.teams.set(row._team_ids)


def _apply_name(row, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un catalogo que solo tiene nombre."""
    row.name = _text(data, "nombre", required=True, max_value=120)


def _apply_coordinator(row: Coordinator, data: dict, request) -> None:
    """Vuelca el cuerpo sobre una unidad de negocio; zonas y equipos se escriben despues."""
    row.name = _text(data, "nombre", required=True, max_value=120)
    row._zone_ids = _ids(data, "zona_ids", Zone, "zona")
    row._team_ids = _ids(data, "equipo_ids", SalesTeam, "equipo")


def _after_coordinator(row: Coordinator, data: dict, request) -> None:
    """Asigna a la unidad las zonas elegidas y deja sin unidad las que se quitaron."""
    if row._zone_ids is not None:
        row.zones.exclude(pk__in=row._zone_ids).update(coordinator=None)
        Zone.objects.filter(pk__in=row._zone_ids).update(coordinator=row)
    if row._team_ids is not None:
        row.teams.set(row._team_ids)


def _dump_person(person: SalesPerson, data: dict, spec: dict[str, Any] | None) -> None:
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
    if "nombre" in data or person.pk is None:
        person.name = _text(data, "nombre", required=True, max_value=80)
    if "apellido" in data or person.pk is None:
        person.last_name = _text(data, "apellido", required=True, max_value=80)

    has_channel = spec is None or spec["channel"]
    has_supervisor = spec is None or spec["supervisor"]
    has_user = spec is None or spec["user"]
    if has_channel and "medio" in data:
        person.channel = base_name(_text(data, "medio", max_value=160))
    if has_supervisor and "medio_supervisor" in data:
        person.supervisor_channel = base_name(_text(data, "medio_supervisor", max_value=160))
    if has_user and "usuario_odoo" in data:
        user = _text(data, "usuario_odoo", max_value=200)
        person.odoo_user = normalize_odoo_name(user) if user else ""

    if spec is not None:
        if spec["channel"] and not person.channel:
            raise InvalidData("El medio (como aparece en «Medio» en Odoo) es obligatorio para este rol.")
        if spec["user"] and not base_name(person.odoo_user):
            raise InvalidData("El usuario de Odoo es obligatorio para este rol.")
    if person.supervisor_channel.casefold() == person.channel.casefold():
        person.supervisor_channel = ""

    _read_alias(person, data, spec)
    _check_unique(person)


# Qué dato de la especificación del rol (`teams.ROLES`) habilita cada columna de alias.
ALIAS_ROLE_FLAG = {"medio": "channel", "supervisor": "supervisor", "usuario": "user"}


def _read_alias(person: SalesPerson, data: dict, spec: dict | None) -> None:
    """Los otros nombres que trae el cuerpo, normalizados, en `persona._alias` (columna → lista).

    Lo que no viene se conserva, como los literales principales, y una columna que el
    rol no lleva se descarta. Uno igual al principal de su columna, o repetido, se omite.
    """
    person._alias = {}
    for key, column in ALIAS_KEYS.items():
        if key not in data or (spec is not None and not spec[ALIAS_ROLE_FLAG[column]]):
            continue
        gross = data[key]
        if not isinstance(gross, list) or not all(isinstance(x, str) for x in gross):
            raise InvalidData(f"El campo «{key}» tiene que ser una lista de nombres.")
        main = {"medio": person.channel, "supervisor": person.supervisor_literal, "usuario": person.odoo_user}[column]
        seen = {name_key(main)}
        clean: list[str] = []
        for text in gross:
            literal = base_name(text)[:160]
            if literal and name_key(literal) not in seen:
                seen.add(name_key(literal))
                clean.append(normalize_odoo_name(literal) if column == "usuario" else literal)
        if len(clean) > MAX_ALIAS:
            raise InvalidData(f"Como mucho {MAX_ALIAS} nombres más por columna.")
        person._alias[column] = clean


def _check_unique(person: SalesPerson) -> None:
    """Ningun nombre (principal o no) de una columna lo comparte otra persona.

    No distingue mayusculas ni sufijo, como el cruce con el export, asi que se
    comprueba aqui con un mensaje claro en vez de dejar que la base de datos
    responda con un choque generico. Se compara lo que quedaria tras guardar.
    """
    other_people = list(SalesPerson.objects.exclude(pk=person.pk).prefetch_related("aliases"))

    def others(column: str) -> list[str]:
        """Sus otros nombres tras guardar: los que llegan, o los que ya tenia si la columna no vino."""
        if column in person._alias:
            return person._alias[column]
        return [a.literal for a in person.aliases.all() if a.column == column] if person.pk else []

    own = {
        "medio": [person.channel, *others("medio")],
        "usuario": [person.odoo_user, *others("usuario")],
    }
    base_supervisor = [person.supervisor_channel] if person.supervisor_channel else own["medio"]
    own["supervisor"] = [*base_supervisor, *others("supervisor")]
    labels = {"medio": "el medio", "supervisor": "«Oportunidad/Administrador»", "usuario": "el usuario"}
    for column, literals in own.items():
        keys: dict[str, str] = {}
        for literal in literals:
            if literal and name_key(literal):
                keys[name_key(literal)] = literal
        for other in other_people:
            common = keys.keys() & other.name_keys(column)
            if common:
                raise Duplicate(f"«{keys[next(iter(common))]}» ya es {labels[column]} de {other.full_name}.")


def _save_alias(person: SalesPerson) -> None:
    """Escribe los otros nombres de la persona, ya con `pk`: deja exactamente los que llegaron en cada columna."""
    for column, literals in (getattr(person, "_alias", None) or {}).items():
        existing = {a.literal: a for a in person.aliases.filter(column=column)}
        for literal in literals:
            if literal not in existing:
                PersonAlias.objects.create(person=person, column=column, literal=literal)
        for literal, row in existing.items():
            if literal not in literals:
                row.delete()


def _after_person(row: SalesPerson, data: dict, request) -> None:
    """Escribe los otros nombres de la persona."""
    _save_alias(row)


def _apply_person(row: SalesPerson, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la identidad de una persona (sin tocar su papel en los equipos).

    Es lo que usa Notificaciones para vincular un nombre del export a quien ya
    esta registrado con otro (como otro nombre suyo, sin tocar los principales). No deja sin
    medio ni sin usuario a quien su rol los exige.
    """
    _dump_person(row, data, None)
    if row.pk:
        roles = list(row.memberships.values_list("role", flat=True))
        if any(ROLES[r]["channel"] for r in roles) and not row.channel:
            raise InvalidData("Su rol exige medio: no se puede dejar vacío.")
        if any(ROLES[r]["user"] for r in roles) and not row.odoo_user:
            raise InvalidData("Su rol exige usuario de Odoo: no se puede dejar vacío.")


def _apply_membership(row: TeamMembership, data: dict, request) -> None:
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
    previous_role = row.role if row.pk else None
    changes = False
    if row.pk is None:
        team = _relation(SalesTeam, data, "equipo_id", required=True)
        role = str(data.get("rol") or "")
        if role not in team_roles(team.slug):
            raise InvalidData(f"«{role}» no es un rol del equipo {team.name}.")
        row.team, row.role = team, role
        person = _relation(SalesPerson, data, "persona_id", required=False) or SalesPerson()
        if person.pk and TeamMembership.objects.filter(person=person, team=team).exists():
            raise Duplicate(f"{person.full_name} ya tiene un papel en {team.name}.")
    else:
        person = row.person
        if "equipo_id" in data or "rol" in data:
            team = _relation(SalesTeam, data, "equipo_id", required=True) if "equipo_id" in data else row.team
            role = str(data.get("rol") or row.role)
            if role not in team_roles(team.slug):
                raise InvalidData(f"«{role}» no es un rol del equipo {team.name}.")
            changes = (team.id, role) != (row.team_id, row.role)
            if changes:
                if TeamMembership.objects.filter(person=person, team=team).exclude(pk=row.pk).exists():
                    raise Duplicate(f"{person.full_name} ya tiene un papel en {team.name}.")
                # Los supervisores que respondian a ella esperan otro equipo y otro rol: quedan sin asignar.
                row.subordinates.update(manager=None)
                row.team, row.role = team, role
    spec = ROLES[row.role]
    previous_spec = ROLES[previous_role] if previous_role else None
    person.save()
    _save_alias(person)
    row.person = person

    row._site_ids = None
    if not spec.get("site"):
        if row.pk and row.sites.exists():
            row._site_ids = []
    else:
        ids = _ids(data, "site_ids", Site, "site")
        if ids is None and (row.pk is None or not previous_spec.get("site")):
            ids = []
        if ids is not None:
            if not ids:
                raise InvalidData("Elige al menos un site.")
            row._site_ids = ids

    if row.role == "supervisor":
        expected = SUPERVISOR_MANAGER.get(row.team.slug)
        if "superior_id" in data:
            manager = _relation(TeamMembership, data, "superior_id", required=False)
        else:
            manager = None if changes else row.manager
        if manager is not None and (manager.team_id != row.team_id or manager.role != expected):
            raise InvalidData(f"El superior de un supervisor de {row.team.name} tiene que ser {role_label(expected or '')}.")
        row.manager = manager

    row._unit_ids = None
    if not spec.get("units"):
        if row.pk and row.units.exists():
            row._unit_ids = []
    else:
        ids = _ids(data, "unidad_ids", Coordinator, "unidad de negocio")
        if ids is None and (row.pk is None or previous_spec.get("units") != spec["units"]):
            ids = []
        elif ids is None and changes:
            # Mismo tipo de unidades en otro equipo: se llevan, pero se comprueba que nadie las tenga ya alli.
            ids = [u.id for u in row.units.all()]
        if ids is not None:
            if spec["units"] == "una" and len(ids) != 1:
                raise InvalidData("Un coordinador de unidad de negocio lleva exactamente una unidad.")
            if spec["units"] == "varias" and not ids:
                raise InvalidData("Elige al menos una unidad de negocio.")
            if spec["units"] == "una":
                busy = (
                    TeamMembership.objects.filter(team=row.team, role=row.role, units__in=ids)
                    .exclude(pk=row.pk)
                    .select_related("person")
                    .first()
                )
                if busy is not None:
                    raise Duplicate(f"Esa unidad ya la lleva {busy.person.full_name} en {row.team.name}.")
            row._unit_ids = ids


def _delete_site(row: Site) -> str | None:
    """Un site que lleva alguna coordinadora de oficina no se borra: ella quedaria fuera del reporte."""
    names = [m.person.full_name for m in row.memberships.select_related("person")[:3]]
    if names:
        return f"No se puede eliminar este site: lo llevan {', '.join(names)}. Quítaselo primero."
    return None


def _after_membership(row: TeamMembership, data: dict, request) -> None:
    """Escribe las unidades y los sites de la membresia, ya con `pk`."""
    if row._unit_ids is not None:
        row.units.set(row._unit_ids)
    if row._site_ids is not None:
        row.sites.set(row._site_ids)


def _after_membership_delete(row: TeamMembership) -> None:
    """Si la persona se queda sin ningun papel (ni objetivos), se borra tambien.

    Una persona sin equipo no cobra y su literal ya no seria «pendiente» en
    Notificaciones: se la dejaria registrada en un limbo. Con el papel borrado
    y nada que la retenga, desaparece y su nombre vuelve a la lista de pendientes.
    """
    person = row.person
    if not person.memberships.exists() and not person.sales_targets.exists():
        person.delete()


def _find_condition(data: dict) -> TeamConditions | None:
    """Las condiciones ya guardadas de (equipo, rol): editar es siempre sobre la misma fila."""
    return TeamConditions.objects.filter(team_id=data.get("equipo_id") or 0, role=str(data.get("rol") or "")).first()


def _apply_conditions(row: TeamConditions, data: dict, request) -> None:
    """Vuelca los parametros de pago de un rol de un equipo, validados contra el esquema del rol."""
    if row.pk is None:
        team = _relation(SalesTeam, data, "equipo_id", required=True)
        role = str(data.get("rol") or "")
        if role not in team_roles(team.slug):
            raise InvalidData(f"«{role}» no es un rol del equipo {team.name}.")
        row.team, row.role = team, role
    try:
        row.params = validate_parameters(row.role, data.get("parametros"))
    except ValueError as e:
        raise InvalidData(str(e)) from None
    row.updated_by = request.user


def _apply_ignored(row: IgnoredProduct, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un nombre ignorado, anotando quien lo creo.

    El area solo se fija en el alta: cambiarla despues seria mover el nombre a
    otra lista, y el permiso que se comprobo fue el de la que tenia.
    """
    if not row.pk:
        row.area = _option(data, "area", IGNORED_AREA_CHOICES, "productos")
    row.name = _text(data, "nombre", required=True, max_value=200)
    row.note = _text(data, "nota")
    if row.created_by_id is None:
        row.created_by = request.user


# --- Objetivos ----------------------------------------------------------------

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Los modelos de cada nivel, para resolver la referencia que manda el cliente.
_MODEL_BY_LEVEL = {
    "estado": State,
    "site": Site,
    "coordinador": Coordinator,
    "zona": Zone,
    "zona_sucursal": Zone,
}


def _month(data: dict, key: str, *, required: bool) -> str | None:
    """Lee un mes `YYYY-MM`; vacio es None (en `desde`, "desde siempre")."""
    value = str(data.get(key) or "").strip()
    if not value:
        if required:
            raise InvalidData(f"El campo «{key}» es obligatorio.")
        return None
    if not _MONTH.match(value):
        raise InvalidData(f"«{value}» no es un mes valido: se espera AAAA-MM.")
    return value


def _percentage(data: dict, key: str) -> float | None:
    """Lee un porcentaje opcional entre 0 y 100; vacio es None ("hereda")."""
    gross = data.get(key)
    if gross in (None, ""):
        return None
    try:
        value = float(gross)
    except (TypeError, ValueError):
        raise InvalidData(f"El campo «{key}» debe ser un numero.") from None
    if not 0 <= value <= 100:
        raise InvalidData(f"El campo «{key}» debe estar entre 0 y 100.")
    return value


def _target_values(row, data: dict) -> None:
    """Crecimiento y churn: al menos uno, porque el otro puede heredarse."""
    row.growth_pct = _percentage(data, "crecimiento_pct")
    row.churn_pct = _percentage(data, "churn_pct")
    if row.growth_pct is None and row.churn_pct is None:
        raise InvalidData("Indica al menos el objetivo de crecimiento o el de churn.")


def _pct(value) -> float | None:
    """Decimal del ORM a float, conservando el nulo que significa "hereda"."""
    return None if value is None else float(value)


def _target(o: CommercialTarget) -> dict[str, Any]:
    """Un tramo de objetivo, con el nombre de su entidad resuelto.

    `entidad` es el nombre con el que se cruza contra los reportes: la sucursal
    tal cual, o `"Zona - Sucursal"` en un nodo.
    """
    entity = o.entity
    return {
        "id": o.id,
        "nivel": o.level,
        "entidad_id": entity.id if entity else None,
        "entidad": o.entity_name,
        "sucursal": o.branch,
        "desde": o.since or "",
        "crecimiento_pct": _pct(o.growth_pct),
        "churn_pct": _pct(o.churn_pct),
        "nota": o.note,
        "actualizado_por": o.updated_by.username if o.updated_by else "",
        "actualizado_en": o.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def _month_target(o: MonthTarget) -> dict[str, Any]:
    """La excepcion de un mes."""
    return {
        "id": o.id,
        "periodo": o.period,
        "crecimiento_pct": _pct(o.growth_pct),
        "churn_pct": _pct(o.churn_pct),
        "nota": o.note,
        "actualizado_por": o.updated_by.username if o.updated_by else "",
        "actualizado_en": o.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def _traffic_light(s: TargetThresholds) -> dict[str, Any]:
    """Los umbrales de color, con el id de la fila unica."""
    return {"id": s.id, **serialize_traffic_light(s)}


def _is_general(row: CommercialTarget) -> bool:
    """El objetivo general: una sola fila, sin fecha, que no se crea ni se borra."""
    return row.level == "general"


def _target_entity(level: str, data: dict):
    """La fila de catalogo del nivel: por `entidad_id` o por `entidad_nombre`.

    El nombre existe porque un nodo se elige de los datos (`"Guacara - NYC"`),
    que traen el nombre de la zona y no su id.
    """
    model = _MODEL_BY_LEVEL[level]
    if data.get("entidad_id") not in (None, "", 0):
        return _relation(model, data, "entidad_id", required=True)
    name = _text(data, "entidad_nombre", max_value=200)
    if not name:
        raise InvalidData("Indica a qué zona, site, estado o coordinador va el objetivo.")
    row = model.objects.filter(name__iexact=name).first()
    if row is None:
        raise InvalidData(f"«{name}» no está en el catálogo.")
    return row


def _target_reference(level: str, data: dict) -> dict[str, Any]:
    """Los campos que identifican a quien tiene el objetivo en `nivel`."""
    reference: dict[str, Any] = {}
    field = REFERENCE_BY_LEVEL.get(level)
    if field:
        reference[field] = _target_entity(level, data)
    if level in LEVELS_WITH_BRANCH:
        reference["branch"] = _text(data, "sucursal", required=True, max_value=80)
    return reference


def _reference_filter(level: str, reference: dict[str, Any], since: str | None) -> dict[str, Any]:
    """El filtro de "el mismo tramo": mismo nivel, misma entidad, mismo `desde`.

    La sucursal se compara sin mayusculas: `nyc` y `NYC` son la misma.
    """
    criteria: dict[str, Any] = {"level": level, "since": since}
    for field, value in reference.items():
        if field == "branch":
            criteria["branch__iexact"] = value
        else:
            criteria[field] = value
    return criteria


def _apply_target(row: CommercialTarget, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo de objetivo.

    El nivel y la entidad solo se fijan al crearlo: mover un tramo de una zona
    a otra es borrar uno y crear otro, y asi la tabla no cambia de significado
    bajo los pies de quien la esta mirando.

    El general es una sola fila sin fecha: se edita, pero no se crea otro ni se
    le pone vigencia. Lo que cambia en un mes concreto es una excepcion de mes.
    """
    if row.pk is None:
        row.level = _option(data, "nivel", TARGET_LEVEL_CHOICES, "zona")
        if _is_general(row) and CommercialTarget.objects.filter(level="general").exists():
            raise Duplicate("El objetivo general es uno solo: edítalo.")
        for field, value in _target_reference(row.level, data).items():
            setattr(row, field, value)

    since = _month(data, "desde", required=False)
    if _is_general(row) and since is not None:
        raise InvalidData(
            "El objetivo general no lleva fecha: para cambiar un mes concreto usa una excepción de mes."
        )
    row.since = since

    _target_values(row, data)
    if _is_general(row) and (row.growth_pct is None or row.churn_pct is None):
        raise InvalidData("El objetivo general necesita crecimiento y churn: no hay de quien heredar.")

    # La unicidad (entidad, desde) no la puede exigir la BD —los NULL son
    # distintos en un UNIQUE—, asi que se comprueba aqui.
    field = REFERENCE_BY_LEVEL.get(row.level)
    reference: dict[str, Any] = {field: getattr(row, field)} if field else {}
    if row.level in LEVELS_WITH_BRANCH:
        reference["branch"] = row.branch
    criteria = _reference_filter(row.level, reference, row.since)
    if CommercialTarget.objects.filter(**criteria).exclude(pk=row.pk).exists():
        when = f"desde {row.since}" if row.since else "desde siempre"
        who = row.entity_name or "el nivel general"
        raise Duplicate(f"Ya hay un objetivo {when} para {who}: edítalo.")

    row.note = _text(data, "nota")
    row.updated_by = request.user


def _delete_target(row: CommercialTarget) -> str | None:
    """Por que no se puede borrar este tramo, o None si se puede."""
    if _is_general(row):
        return "El objetivo general no se puede eliminar: es el que responde cuando nadie más lo hace."
    return None


def _apply_month_target(row: MonthTarget, data: dict, request) -> None:
    """Vuelca el cuerpo sobre la excepcion de un mes."""
    period = _month(data, "periodo", required=True)
    if MonthTarget.objects.filter(period=period).exclude(pk=row.pk).exists():
        raise Duplicate(f"El mes {period} ya tiene una excepción: edítala.")
    row.period = period
    _target_values(row, data)
    row.note = _text(data, "nota")
    row.updated_by = request.user


def _office_target(o: OfficeSalesTarget) -> dict[str, Any]:
    """Un tramo del objetivo de ventas de las oficinas; sin persona es el general."""
    return {
        "id": o.id,
        "persona_id": o.person_id,
        "persona": o.person.full_name if o.person_id else "",
        "desde": o.since or "",
        "ventas": o.sales,
        "nota": o.note,
        "actualizado_por": o.updated_by.username if o.updated_by else "",
        "actualizado_en": o.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def _apply_office_target(row: OfficeSalesTarget, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un tramo del objetivo de ventas de las oficinas.

    La persona solo se fija al crearlo, como la entidad de un objetivo
    comercial: vacia es el general. Tiene que ser coordinadora de oficina. La
    unicidad de (persona, desde) se comprueba aqui porque la BD no puede.
    """
    if row.pk is None:
        person = _relation(SalesPerson, data, "persona_id", required=False)
        if person is not None and not person.memberships.filter(role="coord_oficina").exists():
            raise InvalidData(f"{person.full_name} no es coordinadora de oficina.")
        row.person = person
    row.since = _month(data, "desde", required=False)

    gross = data.get("ventas")
    try:
        sales = float(gross)
    except (TypeError, ValueError):
        raise InvalidData("Indica cuántas ventas al mes se esperan.") from None
    if sales < 1 or sales != int(sales):
        raise InvalidData("El objetivo de ventas es un número entero de 1 o más.")
    row.sales = int(sales)

    if OfficeSalesTarget.objects.filter(person=row.person, since=row.since).exclude(pk=row.pk).exists():
        when = f"desde {row.since}" if row.since else "desde siempre"
        who = row.person.full_name if row.person else "el general"
        raise Duplicate(f"Ya hay un objetivo de ventas {when} para {who}: edítalo.")
    row.note = _text(data, "nota")
    row.updated_by = request.user


def _zone_without_target(z: ZoneWithoutTarget) -> dict[str, Any]:
    """Un tramo en que una zona no se mide contra ningun objetivo."""
    return {
        "id": z.id,
        "zona_id": z.zone_id,
        "zona": z.zone.name,
        "site": z.zone.site.name,
        "coordinador": z.zone.coordinator.name if z.zone.coordinator_id else "",
        "desde": z.since or "",
        "hasta": z.until or "",
        "nota": z.note,
        "actualizado_por": z.updated_by.username if z.updated_by else "",
        "actualizado_en": z.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def _apply_zone_without_target(row: ZoneWithoutTarget, data: dict, request) -> None:
    """Vuelca el cuerpo sobre el tramo sin objetivo de una zona.

    La zona solo se fija al crearlo. Un tramo por zona: si ya tiene uno se
    edita ese (se le cambia el `hasta`), no se crea otro.
    """
    if row.pk is None:
        zone = _relation(Zone, data, "zona_id", required=True)
        if ZoneWithoutTarget.objects.filter(zone=zone).exists():
            raise Duplicate(f"{zone.name} ya está sin objetivo: edita su tramo.")
        row.zone = zone
    row.since = _month(data, "desde", required=False)
    row.until = _month(data, "hasta", required=False)
    if row.since and row.until and row.until < row.since:
        raise InvalidData("«Hasta» no puede ser anterior a «Desde».")
    row.note = _text(data, "nota")
    row.updated_by = request.user


# La clave de cada umbral en el cuerpo y su campo en `TargetThresholds`.
THRESHOLD_FIELDS = {
    "cumpl_verde": "compliance_green", "cumpl_amarillo": "compliance_yellow",
    "crec_verde": "growth_green", "crec_amarillo": "growth_yellow",
    "churn_verde": "churn_green", "churn_amarillo": "churn_yellow",
}


def _apply_traffic_light(row: TargetThresholds, data: dict, request) -> None:
    """Vuelca el cuerpo sobre los umbrales de color (valores directos, en %)."""
    fields = (
        "cumpl_verde", "cumpl_amarillo",
        "crec_verde", "crec_amarillo",
        "churn_verde", "churn_amarillo",
    )
    values = {}
    for field in fields:
        # No `_number`: su `or default` tomaria un 0 legitimo (amarillo de
        # crecimiento desde 0%, por ejemplo) por un campo vacio.
        gross = data.get(field)
        if gross in (None, ""):
            raise InvalidData(f"El campo «{field}» es obligatorio.")
        try:
            values[field] = float(gross)
        except (TypeError, ValueError):
            raise InvalidData(f"El campo «{field}» debe ser un numero.") from None
    # El crecimiento puede ser negativo (amarillo desde -1%, por ejemplo); un
    # churn o un cumplimiento negativos no significan nada.
    if any(values[field] < 0 for field in ("cumpl_verde", "cumpl_amarillo", "churn_verde", "churn_amarillo")):
        raise InvalidData("Los umbrales de churn y de cumplimiento no pueden ser negativos.")
    if values["cumpl_amarillo"] > values["cumpl_verde"]:
        raise InvalidData("En cumplimiento, el amarillo tiene que empezar por debajo del verde.")
    if values["crec_amarillo"] > values["crec_verde"]:
        raise InvalidData("En crecimiento, el amarillo tiene que empezar por debajo del verde.")
    if values["churn_verde"] > values["churn_amarillo"]:
        raise InvalidData("En churn, el verde tiene que acabar por debajo del amarillo.")
    for field, value in values.items():
        setattr(row, THRESHOLD_FIELDS[field], value)
    row.updated_by = request.user


# Un permiso por grupo del modulo. Los nombres de los campos son anteriores al
# modulo y se conservan: «comercial» es hoy la Estructura (zonas,
# estados) y «operacional» los Productos. Ventas —sites, unidades de negocio, equipos,
# objetivos y condiciones de pago— se separo de la estructura porque lo
# lleva quien paga comisiones, no quien reparte la red.
COMMERCIAL_PERMISSION = "can_manage_commercial_catalog"
OPERATIONAL_PERMISSION = "can_manage_operational_catalog"
SALES_PERMISSION = "can_manage_sales_catalog"

# Que permiso administra los nombres ignorados de cada area: los mismos que
# administran el catalogo donde se habrian registrado.
PERMISSION_BY_AREA = {
    "productos": OPERATIONAL_PERMISSION,
    "estructura": COMMERCIAL_PERMISSION,
    "ventas": SALES_PERMISSION,
}


def _ignored_permission(row: IgnoredProduct, data: dict) -> str:
    """El permiso de un ignorado es el de su area (la pedida, si es un alta)."""
    area = row.area if row.pk else str(data.get("area") or "productos")
    return PERMISSION_BY_AREA.get(area, OPERATIONAL_PERMISSION)


# Un catalogo = un modelo, como se sirve, como se lee del cuerpo y que permiso
# lo administra. Anadir uno nuevo es anadir una entrada aqui y una pestana en
# la interfaz. `permiso_fila`, si esta, decide el permiso mirando la fila: es
# lo que reparte los ignorados entre los tres permisos segun su area.
# `protegido` es el motivo con el que se niega borrar una fila que otra
# referencia con `PROTECT` (por defecto, las zonas).
CATALOGS: dict[str, dict[str, Any]] = {
    "planes": {"model": Plan, "serialize": _plan, "apply": _apply_plan, "label": "plan", "permission": OPERATIONAL_PERMISSION},
    "reguladores": {"model": RegulatoryPlan, "serialize": _regulatory_plan, "apply": _apply_regulatory_plan, "label": "plan regulador", "permission": OPERATIONAL_PERMISSION},
    "ignorados": {"model": IgnoredProduct, "serialize": _ignored, "apply": _apply_ignored, "label": "nombre ignorado", "permission": OPERATIONAL_PERMISSION, "row_permission": _ignored_permission},
    "zonas": {"model": Zone, "serialize": _zone, "apply": _apply_zone, "label": "zona", "feminine": True, "permission": COMMERCIAL_PERMISSION},
    # Sites y unidades de negocio se muestran en Ventas › Estructura de ventas, junto a
    # los equipos que los trabajan, y los administra quien lleva el catalogo de ventas.
    "sites": {"model": Site, "serialize": _site, "apply": _apply_site, "after": _after_site, "deletable": _delete_site, "label": "site", "permission": SALES_PERMISSION, "protected": "tiene zonas o coordinadoras de oficina asociadas. Reasígnalas primero."},
    "estados": {"model": State, "serialize": _state, "apply": _apply_name, "label": "estado", "permission": COMMERCIAL_PERMISSION},
    "coordinadores": {"model": Coordinator, "serialize": _coordinator, "apply": _apply_coordinator, "after": _after_coordinator, "label": "unidad de negocio", "feminine": True, "permission": SALES_PERMISSION},
    # La persona es la identidad (nombre y literales de Odoo); su papel en cada equipo es la membresia.
    "personas": {"model": SalesPerson, "serialize": _person, "apply": _apply_person, "after": _after_person, "label": "persona", "feminine": True, "permission": SALES_PERMISSION},
    "membresias": {"model": TeamMembership, "serialize": _membership, "apply": _apply_membership, "after": _after_membership, "after_delete": _after_membership_delete, "label": "persona del equipo", "feminine": True, "permission": SALES_PERMISSION},
    # Se edita siempre la fila de (equipo, rol), exista o no (`find`); borrarla restablece los valores de la politica.
    "condiciones_equipo": {"model": TeamConditions, "serialize": _condition, "apply": _apply_conditions, "find": _find_condition, "label": "condición de pago", "feminine": True, "permission": SALES_PERMISSION},
    # Los objetivos van con ventas: quien organiza a los equipos de venta es
    # quien fija lo que se espera de cada parte de la red.
    # `borrable` responde por que no se puede borrar una fila concreta.
    "objetivos": {"model": CommercialTarget, "serialize": _target, "apply": _apply_target, "label": "objetivo", "permission": SALES_PERMISSION, "deletable": _delete_target},
    "objetivos_mes": {"model": MonthTarget, "serialize": _month_target, "apply": _apply_month_target, "label": "objetivo del mes", "permission": SALES_PERMISSION},
    "zonas_sin_objetivo": {"model": ZoneWithoutTarget, "serialize": _zone_without_target, "apply": _apply_zone_without_target, "label": "zona sin objetivo", "feminine": True, "permission": SALES_PERMISSION},
    "objetivos_oficina": {"model": OfficeSalesTarget, "serialize": _office_target, "apply": _apply_office_target, "label": "objetivo de ventas", "permission": SALES_PERMISSION},
    # Fila unica: se edita siempre la misma y no se borra.
    "semaforo": {"model": TargetThresholds, "serialize": _traffic_light, "apply": _apply_traffic_light, "label": "semáforo", "permission": SALES_PERMISSION, "single": True},
}
