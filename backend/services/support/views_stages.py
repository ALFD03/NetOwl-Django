"""`/api/support/stages/`: de qué equipo es cada etapa de soporte y qué se hace en ella.

Lo mantiene quien mantiene el directorio (`can_manage_support_users`).
"""

from __future__ import annotations

from django.db import IntegrityError

from services.config.api import ApiError, endpoint, json_body
from services.support.analytics.config import CANCELED_STAGES, ESCALATION_STAGE, RESOLVED_STAGES
from services.support.analytics.flow import stage_usage, stages_to_classify
from services.support.api_keys import SUPPORT_KEYS
from services.support.models import EtapaSoporte

TEAMS = dict(EtapaSoporte.EQUIPOS)
KINDS = dict(EtapaSoporte.TIPOS)


def _row(stage: EtapaSoporte, usage: dict[str, int]) -> dict:
    return {
        "id": stage.pk,
        "nombre": stage.nombre,
        "equipo": stage.equipo,
        "tipo": stage.tipo,
        "logs": usage.get(stage.nombre.lower(), 0),
        "es_escalamiento": stage.nombre.lower() == ESCALATION_STAGE.lower(),
    }


@endpoint(perms=["can_manage_support_users"], keys=SUPPORT_KEYS)
def stages(request):
    """El catálogo, lo que falta clasificar y las reglas fijas."""
    usage = stage_usage()
    return {
        "etapas": [_row(s, usage) for s in EtapaSoporte.objects.all()],
        "pendientes": stages_to_classify(),
        "equipos": [{"value": k, "label": v} for k, v in EtapaSoporte.EQUIPOS],
        "tipos": [{"value": k, "label": v} for k, v in EtapaSoporte.TIPOS],
        "etapaEscalamiento": ESCALATION_STAGE,
        "etapasCierre": sorted({"Resuelto", "Cancelado"}),
        "nuevaEtapa": str(request.GET.get("new_stage") or "")[:200],
    }


@endpoint(methods=["POST"], perms=["can_manage_support_users"], rate="60/m")
def stage_save(request):
    """Alta o edición de una etapa (sin `id` es un alta)."""
    data = SUPPORT_KEYS.back(json_body(request))
    name = " ".join(str(data.get("nombre") or "").split())[:200]
    team = str(data.get("equipo") or "")
    kind = str(data.get("tipo") or "")
    if not name:
        raise ApiError("El nombre de la etapa es obligatorio.")
    if name.lower() in RESOLVED_STAGES | CANCELED_STAGES:
        raise ApiError(f"«{name}» es una etapa de cierre: es fija y no se clasifica aquí.")
    if team not in TEAMS or kind not in KINDS:
        raise ApiError("Equipo o tipo no válidos.")

    if data.get("id"):
        stage = EtapaSoporte.objects.filter(pk=data.get("id")).first()
        if stage is None:
            raise ApiError("La etapa ya no existe.", 404)
    else:
        stage = EtapaSoporte()
    stage.nombre, stage.equipo, stage.tipo = name, team, kind
    try:
        stage.save()
    except IntegrityError as exc:
        raise ApiError(f"Ya existe una etapa «{name}».", 409) from exc
    return {"status": "success", "message": "Etapa guardada. Vuelve a ejecutar el análisis de soporte para que se aplique."}


@endpoint(methods=["POST"], perms=["can_manage_support_users"], rate="60/m")
def stage_delete(request):
    """Baja de una etapa: sus tramos pasan a «sin clasificar» en el siguiente análisis."""
    EtapaSoporte.objects.filter(pk=json_body(request).get("id")).delete()
    return {"status": "success", "message": "Etapa eliminada."}
