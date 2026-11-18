"""`/api/catalogs/`: los datos de las cuatro páginas de Catálogos y su CRUD.

Un único trío guardar / guardar en lote / eliminar para todos los catálogos de
`registry.CATALOGOS`. Cada escritura exige el permiso del catálogo que toca, no
el de la página, y limpia la caché de catálogos (`fixtures.reset_cache`): el
worker es otro proceso.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from core import fixtures
from services.catalogs.directory import people_outside_directory
from services.catalogs.models import EquipoVentas
from services.catalogs.registry import (
    CATALOGOS,
    COMMERCIAL_PERMISSION,
    OPERATIONAL_PERMISSION,
    PERMISSION_BY_AREA,
    SALES_PERMISSION,
    Duplicate,
    InvalidData,
    _all_conditions,
    _team_view,
    _traffic_light,
)
from services.config.api import ApiError, endpoint, json_body
from services.config.auth import has_permission
from services.subscriptions.analytics.imports import products_outside_catalog, zones_outside_catalog
from services.subscriptions.analytics.queries import get_periods
from services.subscriptions.analytics.targets import get_targets_config, known_nodes
from services.subscriptions.models import (
    IGNORED_AREA_CHOICES,
    PERSON_KIND_CHOICES,
    REFERENCE_FIELDS,
    TECNOLOGIA_CHOICES,
    SemaforoObjetivos,
)

logger = logging.getLogger(__name__)

CATALOG_PERMISSIONS = [OPERATIONAL_PERMISSION, COMMERCIAL_PERMISSION, SALES_PERMISSION]

# Tope de un alta en bloque: lo que cabe en una lista de pendientes.
MAX_BATCH = 1000

# Lo que cada listado necesita precargar.
_PREFETCH: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "zonas": (("site", "estado", "coordinador"), ()),
    "sites": ((), ("zonas", "equipos")),
    "coordinadores": ((), ("zonas", "equipos", "membresias__persona", "membresias__equipo")),
    "personas": ((), ("membresias__equipo", "alias")),
    "membresias": (("persona", "equipo", "superior__persona"), ("unidades", "sites", "persona__alias")),
    "objetivos_oficina": (("persona", "actualizado_por"), ()),
    "zonas_sin_objetivo": (("zona__site", "zona__coordinador", "actualizado_por"), ()),
    "planes": (("plan_regulador",), ()),
    "ignorados": (("creado_por",), ()),
    "objetivos": ((*REFERENCE_FIELDS, "actualizado_por"), ()),
    "objetivos_mes": (("actualizado_por",), ()),
}


def _participle(catalog: dict[str, Any], stem: str) -> str:
    """`guardado`/`guardada` según el género de la etiqueta."""
    return stem + ("a" if catalog.get("femenino") else "o")


def _listing(name: str) -> list[dict[str, Any]]:
    """Todas las filas de un catálogo, ya serializadas."""
    if name == "condiciones_equipo":
        return _all_conditions()
    catalog = CATALOGOS[name]
    rows = catalog["modelo"].objects.all()
    related, prefetch = _PREFETCH.get(name, ((), ()))
    if related:
        rows = rows.select_related(*related)
    if prefetch:
        rows = rows.prefetch_related(*prefetch)
    return [catalog["serializar"](row) for row in rows]


def _areas(request) -> dict[str, bool]:
    """Qué grupos administra la cuenta: la interfaz solo enlaza los suyos."""
    return {
        "operacional": has_permission(request.user, OPERATIONAL_PERMISSION),
        "comercial": has_permission(request.user, COMMERCIAL_PERMISSION),
        "ventas": has_permission(request.user, SALES_PERMISSION),
    }


def _options(choices) -> list[dict[str, str]]:
    return [{"value": v, "label": t} for v, t in choices]


def _pending(name: str, compute) -> list[dict[str, Any]]:
    """Una lista de pendientes, o vacía si la consulta falla (entorno sin datos importados)."""
    try:
        return compute()
    except Exception:
        logger.exception("No se pudo calcular la lista de %s por registrar", name)
        return []


def _page(request, data: dict[str, Any]) -> dict[str, Any]:
    return {**data, "permisos": _areas(request)}


def _allowed_catalog(request, data: dict, row=None) -> dict[str, Any]:
    """El catálogo del cuerpo si la cuenta tiene su permiso (o el de la fila)."""
    catalog = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalog is None:
        raise ApiError("Catálogo desconocido.")
    permission = catalog["permiso"]
    if row is not None and (by_row := catalog.get("permiso_fila")):
        permission = by_row(row, data)
    if not has_permission(request.user, permission):
        raise ApiError(f"Acceso denegado. Se requiere el privilegio: {permission}.", 403)
    return catalog


@endpoint(perms=CATALOG_PERMISSIONS)
def notifications(request):
    """Lo que falta en cada área administrada, lo ignorado y las opciones para registrarlo aquí.

    Una lista de pendientes ausente llega como `null` (no se administra esa área).
    """
    areas = _areas(request)
    pending = {
        "productos": _pending("productos", products_outside_catalog) if areas["operacional"] else None,
        "estructura": _pending("zonas", zones_outside_catalog) if areas["comercial"] else None,
        "ventas": _pending("personas", people_outside_directory) if areas["ventas"] else None,
    }
    own = [area for area, permission in PERMISSION_BY_AREA.items() if has_permission(request.user, permission)]
    sales_or_structure = areas["comercial"] or areas["ventas"]
    return _page(request, {
        "pendientes": pending,
        "ignorados": [row for row in _listing("ignorados") if row["area"] in own],
        "areas": [{"value": v, "label": t} for v, t in IGNORED_AREA_CHOICES if v in own],
        "opciones": {
            "reguladores": _listing("reguladores") if areas["operacional"] else [],
            "tiposPersona": _options(PERSON_KIND_CHOICES),
            "tecnologias": _options(TECNOLOGIA_CHOICES),
            "sites": _listing("sites") if sales_or_structure else [],
            "estados": _listing("estados") if areas["comercial"] else [],
            "coordinadores": _listing("coordinadores") if sales_or_structure else [],
            "equipos": [_team_view(e) for e in EquipoVentas.objects.all()] if areas["ventas"] else [],
            "membresias": _listing("membresias") if areas["ventas"] else [],
            "personas": _listing("personas") if areas["ventas"] else [],
        },
    })


@endpoint(perms=[OPERATIONAL_PERMISSION])
def products(request):
    """Planes y planes reguladores. `?nuevo_plan=` abre el alta ya rellena."""
    return _page(request, {
        "planes": _listing("planes"),
        "reguladores": _listing("reguladores"),
        "tecnologias": _options(TECNOLOGIA_CHOICES),
        "tiposPersona": _options(PERSON_KIND_CHOICES),
        "nuevoPlan": (request.GET.get("nuevo_plan") or "").strip(),
    })


@endpoint(perms=[COMMERCIAL_PERMISSION])
def structure(request):
    """Zonas y estados (con sites y unidades para el formulario). `?nueva_zona=` abre el alta."""
    return _page(request, {
        "zonas": _listing("zonas"),
        "sites": _listing("sites"),
        "estados": _listing("estados"),
        "coordinadores": _listing("coordinadores"),
        "tecnologias": _options(TECNOLOGIA_CHOICES),
        "nuevaZona": (request.GET.get("nueva_zona") or "").strip(),
    })


@endpoint(perms=[SALES_PERMISSION])
def sales(request):
    """Estructura de ventas, equipos con su gente y condiciones, y objetivos.

    `?nueva_persona=&equipo=&rol=` abre el alta ya rellena desde Notificaciones.
    """
    return _page(request, {
        "equipos": [_team_view(e) for e in EquipoVentas.objects.all()],
        "membresias": _listing("membresias"),
        "personas": _listing("personas"),
        "condiciones": _listing("condiciones_equipo"),
        "nuevaPersona": {
            "literal": (request.GET.get("nueva_persona") or "").strip(),
            "equipo": (request.GET.get("equipo") or "").strip(),
            "rol": (request.GET.get("rol") or "").strip(),
        },
        "coordinadores": _listing("coordinadores"),
        "objetivos": _listing("objetivos"),
        "objetivosOficina": _listing("objetivos_oficina"),
        "zonasSinObjetivo": _listing("zonas_sin_objetivo"),
        "objetivos_mes": _listing("objetivos_mes"),
        "semaforo": _traffic_light(SemaforoObjetivos.actual()),
        "objetivosConfig": get_targets_config(),
        "periodosCalculados": sorted({p[:7] for p in get_periods()}, reverse=True),
        "nodosConocidos": known_nodes(),
        "zonas": _listing("zonas"),
        "sites": _listing("sites"),
        "estados": _listing("estados"),
    })


@endpoint(methods=["POST"], perms=CATALOG_PERMISSIONS, rate="60/m")
def save(request):
    """Alta o edición de una fila de cualquier catálogo."""
    data = json_body(request)
    catalog = _allowed_catalog(request, data)

    row_id = data.get("id")
    if catalog.get("unico"):
        row = catalog["modelo"].actual()
    elif not row_id and (find := catalog.get("buscar")) and (existing := find(data)) is not None:
        row = existing
    elif row_id:
        row = catalog["modelo"].objects.filter(pk=row_id).first()
        if row is None:
            raise ApiError("El registro ya no existe.", 404)
    else:
        row = catalog["modelo"]()
    catalog = _allowed_catalog(request, data, row)

    try:
        # Un alta puede escribir varias filas y relaciones M2M: todo o nada.
        with transaction.atomic():
            catalog["aplicar"](row, data, request)
            row.save()
            if after := catalog.get("despues"):
                after(row, data, request)
    except Duplicate as exc:
        raise ApiError(str(exc), 409) from exc
    except InvalidData as exc:
        raise ApiError(str(exc)) from exc
    except IntegrityError as exc:
        article = "una" if catalog.get("femenino") else "un"
        raise ApiError(f"Ya existe {article} {catalog['etiqueta']} con ese nombre.", 409) from exc

    fixtures.reset_cache()
    row = catalog["modelo"].objects.get(pk=row.pk)
    return {
        "status": "success",
        "message": f"{catalog['etiqueta'].capitalize()} {_participle(catalog, 'guardad')}.",
        "registro": catalog["serializar"](row),
    }


@endpoint(methods=["POST"], perms=CATALOG_PERMISSIONS, rate="20/m")
def save_batch(request):
    """Alta de varias filas de un catálogo; cada una en su savepoint.

    Una fila que choca no se lleva a las demás: vuelve en `errores` con su motivo.
    """
    data = json_body(request)
    catalog = _allowed_catalog(request, data)
    if catalog.get("unico"):
        raise ApiError("Este catálogo no admite altas en bloque.")
    rows = data.get("filas")
    if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
        raise ApiError("No llegó ninguna fila que registrar.")
    if len(rows) > MAX_BATCH:
        raise ApiError(f"Como mucho {MAX_BATCH} filas por lote.")

    saved: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for body in rows:
        body = {**body, "tipo": data["tipo"], "id": None}
        row = catalog["modelo"]()
        label = str(body.get("medio") or body.get("nombre") or "").strip()
        try:
            _allowed_catalog(request, body, row)
            with transaction.atomic():
                catalog["aplicar"](row, body, request)
                row.save()
                if after := catalog.get("despues"):
                    after(row, body, request)
        except ApiError as exc:
            errors.append({"nombre": label, "message": exc.message})
            continue
        except InvalidData as exc:
            errors.append({"nombre": label, "message": str(exc)})
            continue
        except IntegrityError:
            errors.append({"nombre": label, "message": "Ya existe con ese nombre."})
            continue
        saved.append(catalog["serializar"](catalog["modelo"].objects.get(pk=row.pk)))

    if saved:
        fixtures.reset_cache()
    # 200 aunque no entre ninguna: lo que interesa al cliente es la lista de motivos.
    return {
        "status": "success" if saved else "error",
        "message": f"Se registraron {len(saved)} de {len(rows)}.",
        "registrados": saved,
        "errores": errors,
    }


@endpoint(methods=["POST"], perms=CATALOG_PERMISSIONS, rate="60/m")
def delete(request):
    """Baja de una fila. Lo que otra fila referencia con `PROTECT` responde 409 con el motivo."""
    data = json_body(request)
    catalog = _allowed_catalog(request, data)
    if catalog.get("unico"):
        raise ApiError(f"El {catalog['etiqueta']} no se elimina: edítalo.")
    row = catalog["modelo"].objects.filter(pk=data.get("id")).first()
    if row is None:
        return {"status": "success", "message": "El registro ya no existía."}
    catalog = _allowed_catalog(request, data, row)
    if (deletable := catalog.get("borrable")) and (reason := deletable(row)):
        raise ApiError(reason, 409)
    try:
        with transaction.atomic():
            row.delete()
            if after := catalog.get("tras_borrar"):
                after(row)
    except ProtectedError as exc:
        this = "esta" if catalog.get("femenino") else "este"
        raise ApiError(
            f"No se puede eliminar {this} {catalog['etiqueta']}: "
            + catalog.get("protegido", "tiene zonas asociadas. Reasígnalas primero."),
            409,
        ) from exc
    fixtures.reset_cache()
    return {"status": "success", "message": f"{catalog['etiqueta'].capitalize()} {_participle(catalog, 'eliminad')}."}
