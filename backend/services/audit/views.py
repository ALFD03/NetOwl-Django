"""`/api/audit/`: el registro de auditoría y el monitoreo de los servidores.

Los filtros del registro se aplican en el servidor y se envían los `LIMIT` más
recientes; el `detail` de cada registro se pide al abrirlo.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from pydantic import BaseModel, Field

from services.config.api import endpoint

from . import monitoring
from .labels import MODULES, action_label
from .models import AuditLog

LIMIT = 1000


class LogQuery(BaseModel):
    desde: date | None = None
    hasta: date | None = None
    modulo: str = ""
    usuario: str = ""
    resultado: str = ""
    q: str = Field(default="", max_length=100)


class StatsQuery(BaseModel):
    hours: int = Field(default=24, ge=1, le=24 * 31)


def _filter(query: LogQuery):
    today = timezone.localdate()
    since = query.desde or today - timedelta(days=30)
    until = query.hasta or today
    if until < since:
        since, until = until, since
    zone = timezone.get_current_timezone()
    logs = AuditLog.objects.filter(
        created_at__gte=timezone.make_aware(datetime.combine(since, time.min), zone),
        created_at__lt=timezone.make_aware(datetime.combine(until + timedelta(days=1), time.min), zone),
    )
    if query.modulo:
        logs = logs.filter(module=query.modulo)
    if query.usuario:
        logs = logs.filter(username=query.usuario)
    if query.resultado:
        logs = logs.filter(outcome=query.resultado)
    text = query.q.strip()
    if text:
        logs = logs.filter(
            Q(description__icontains=text) | Q(target__icontains=text)
            | Q(action__icontains=text) | Q(username__icontains=text)
        )
    filters = {
        "desde": since.isoformat(), "hasta": until.isoformat(), "modulo": query.modulo,
        "usuario": query.usuario, "resultado": query.resultado, "q": text,
    }
    return logs, filters


def _row(r: AuditLog) -> dict:
    return {
        "id": r.id,
        "fecha": timezone.localtime(r.created_at).strftime("%Y-%m-%d %H:%M:%S"),
        "username": r.username or "—",
        "ip": r.ip or "",
        "modulo": r.module,
        "modulo_display": MODULES.get(r.module, r.module),
        "accion": r.action,
        "accion_display": action_label(r.action),
        "resultado": r.outcome,
        "resultado_display": r.get_outcome_display(),
        "estado_http": r.status_code,
        "canal": r.channel,
        "duracion_ms": r.duration_ms,
        "objeto": r.target,
        "descripcion": r.description,
    }


@endpoint(perms=["can_view_auditoria"], query=LogQuery)
def logs(request, query: LogQuery):
    """El registro filtrado: los `LIMIT` más recientes de lo que cumple los filtros."""
    filtered, filters = _filter(query)
    users = AuditLog.objects.exclude(username="").order_by("username").values_list("username", flat=True).distinct()
    modules = AuditLog.objects.order_by("module").values_list("module", flat=True).distinct()
    return {
        "registros": [_row(r) for r in filtered.order_by("-created_at", "-id")[:LIMIT]],
        "total": filtered.count(),
        "limite": LIMIT,
        "filtros": filters,
        "opciones": {
            "modulos": [{"value": m, "label": MODULES.get(m, m)} for m in modules],
            "usuarios": list(users),
            "resultados": [{"value": v, "label": label} for v, label in AuditLog.OUTCOME_CHOICES],
        },
    }


@endpoint(perms=["can_view_auditoria"])
def log_detail(request, log_id: int):
    """Un registro con su `detalle`."""
    r = AuditLog.objects.get(pk=log_id)
    return {**_row(r), "metodo": r.method, "ruta": r.path, "detalle": r.detail}


@endpoint(perms=["can_view_auditoria"])
def health(request):
    """Estado de web, Postgres, Redis, worker de Celery y análisis."""
    return monitoring.health()


@endpoint(perms=["can_view_auditoria"], query=StatsQuery)
def stats(request, query: StatsQuery):
    """Actividad, errores y latencia por endpoint de las últimas horas."""
    return monitoring.stats(query.hours)
