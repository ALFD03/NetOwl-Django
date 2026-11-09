"""Catalogo de etapas de soporte: de que equipo es cada etapa y que se hace en ella.

Lo mantiene quien mantiene el directorio de soporte (`can_manage_support_users`):
es el mismo saber -como trabaja el area- y no merecia un permiso aparte. La
primera pestana, como en el directorio, es la diferencia: etapas que aparecen en
los logs cargados y que el catalogo no clasifica.
"""

from __future__ import annotations

import json
import logging

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.support.analytics.config import CANCELED_STAGES, ETAPA_ESCALAMIENTO, RESOLVED_STAGES
from services.support.analytics.flujo import etapas_por_clasificar, uso_de_etapas
from services.support.models import EtapaSoporte

logger = logging.getLogger(__name__)

EQUIPOS = dict(EtapaSoporte.EQUIPOS)
TIPOS = dict(EtapaSoporte.TIPOS)


def _fila(etapa: EtapaSoporte, uso: dict[str, int]) -> dict:
    return {
        "id": etapa.pk,
        "nombre": etapa.nombre,
        "equipo": etapa.equipo,
        "tipo": etapa.tipo,
        "logs": uso.get(etapa.nombre.lower(), 0),
        "es_escalamiento": etapa.nombre.lower() == ETAPA_ESCALAMIENTO.lower(),
    }


@login_required
@permission_required('can_manage_support_users')
def etapas_view(request):
    """El catalogo, lo que falta clasificar y las reglas fijas que no se editan."""
    uso = uso_de_etapas()
    return render_inertia(request, "Support/Etapas", clean_json_props({
        "etapas": [_fila(e, uso) for e in EtapaSoporte.objects.all()],
        "pendientes": etapas_por_clasificar(),
        "equipos": [{"value": k, "label": v} for k, v in EtapaSoporte.EQUIPOS],
        "tipos": [{"value": k, "label": v} for k, v in EtapaSoporte.TIPOS],
        "etapaEscalamiento": ETAPA_ESCALAMIENTO,
        "etapasCierre": sorted({"Resuelto", "Cancelado"}),
        "nuevaEtapa": str(request.GET.get("nueva_etapa") or "")[:200],
        "section": "etapas",
    }))


@login_required
@permission_required('can_manage_support_users')
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_etapa_guardar(request):
    """Alta o edicion de una etapa. Sin `id` es un alta."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    nombre = " ".join(str(data.get("nombre") or "").split())[:200]
    equipo = str(data.get("equipo") or "")
    tipo = str(data.get("tipo") or "")
    if not nombre:
        return JsonResponse({"status": "error", "message": "El nombre de la etapa es obligatorio."}, status=400)
    if nombre.lower() in RESOLVED_STAGES | CANCELED_STAGES:
        return JsonResponse({
            "status": "error",
            "message": f"«{nombre}» es una etapa de cierre: es fija y no se clasifica aquí.",
        }, status=400)
    if equipo not in EQUIPOS or tipo not in TIPOS:
        return JsonResponse({"status": "error", "message": "Equipo o tipo no válidos."}, status=400)

    if data.get("id"):
        etapa = EtapaSoporte.objects.filter(pk=data.get("id")).first()
        if etapa is None:
            return JsonResponse({"status": "error", "message": "La etapa ya no existe."}, status=404)
    else:
        etapa = EtapaSoporte()
    etapa.nombre, etapa.equipo, etapa.tipo = nombre, equipo, tipo

    try:
        etapa.save()
    except IntegrityError:
        return JsonResponse({"status": "error", "message": f"Ya existe una etapa «{nombre}»."}, status=409)
    return JsonResponse({
        "status": "success",
        "message": "Etapa guardada. Vuelve a ejecutar el análisis de soporte para que se aplique.",
    })


@login_required
@permission_required('can_manage_support_users')
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_etapa_eliminar(request):
    """Baja de una etapa: sus tramos pasan a «sin clasificar» en el siguiente analisis."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)
    EtapaSoporte.objects.filter(pk=data.get("id")).delete()
    return JsonResponse({"status": "success", "message": "Etapa eliminada."})
