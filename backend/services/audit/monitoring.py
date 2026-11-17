"""Monitoreo de NetOwl: salud de los servicios y métricas por endpoint.

Las métricas salen del propio registro de auditoría, así que cubren lo que se
anota: escrituras, lecturas sensibles y **todo** el tráfico con token.
"""

from __future__ import annotations

import time
from datetime import timedelta
from statistics import quantiles

import redis
from django.apps import apps
from django.conf import settings
from django.db import connection
from django.db.models import Avg, Count, Max, Q
from django.utils import timezone

from .models import AuditLog


def _timed(check) -> dict:
    """Corre `check()` y devuelve su resultado con `ok` y `ms`."""
    started = time.monotonic()
    try:
        data = check() or {}
        return {"ok": True, "ms": round((time.monotonic() - started) * 1000, 1), **data}
    except Exception as exc:  # el panel informa la caída, no la propaga
        return {"ok": False, "ms": round((time.monotonic() - started) * 1000, 1), "error": str(exc)[:200]}


def _postgres() -> dict:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.execute(
            "SELECT pg_database_size(current_database()), "
            "(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()), "
            "current_setting('server_version')"
        )
        size, connections, version = cursor.fetchone()
    return {"size_mb": round(size / 1024 / 1024, 1), "connections": connections, "version": version}


def _redis_client():
    return redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)


def _redis() -> dict:
    client = _redis_client()
    client.ping()
    info = client.info()
    return {
        "version": info.get("redis_version"),
        "memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 1),
        "clients": info.get("connected_clients"),
        "queue": settings.CELERY_TASK_DEFAULT_QUEUE,
        "queued": client.llen(settings.CELERY_TASK_DEFAULT_QUEUE),
    }


def _worker() -> dict:
    from netowl_web.celery import app

    replies = app.control.inspect(timeout=1.0).ping() or {}
    if not replies:
        raise RuntimeError("Ningún worker respondió.")
    return {"workers": sorted(replies)}


def _jobs() -> dict:
    job = apps.get_model("imports", "AnalysisJob")
    since = timezone.now() - timedelta(hours=24)
    counts = dict(
        job.objects.filter(Q(created_at__gte=since) | Q(status__in=["pending", "running"]))
        .values_list("status").annotate(n=Count("id")).order_by()
    )
    return {"last_24h": counts}


def health() -> dict:
    return {
        "checked_at": timezone.localtime().isoformat(),
        "services": {
            "web": {"ok": True, "ms": 0, "schema": settings.DB_SCHEMA},
            "postgres": _timed(_postgres),
            "redis": _timed(_redis),
            "worker": _timed(_worker),
            "jobs": _timed(_jobs),
        },
    }


def _p95(values: list[int]) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return int(quantiles(values, n=20, method="inclusive")[-1])


def stats(hours: int) -> dict:
    """Actividad de las últimas `hours` horas: por canal, por endpoint y errores recientes."""
    since = timezone.now() - timedelta(hours=hours)
    logs = AuditLog.objects.filter(created_at__gte=since)

    by_channel = dict(logs.values_list("channel").annotate(n=Count("id")).order_by())
    by_outcome = dict(logs.values_list("outcome").annotate(n=Count("id")).order_by())

    durations: dict[tuple[str, str], list[int]] = {}
    for module, action, ms in logs.exclude(duration_ms=None).values_list("module", "action", "duration_ms"):
        durations.setdefault((module, action), []).append(ms)

    endpoints = []
    for row in (
        logs.values("module", "action")
        .annotate(
            total=Count("id"),
            errors=Count("id", filter=Q(outcome=AuditLog.ERROR)),
            denied=Count("id", filter=Q(outcome__in=[AuditLog.DENIED, AuditLog.LIMITED])),
            avg_ms=Avg("duration_ms"),
            max_ms=Max("duration_ms"),
            last=Max("created_at"),
        )
        .order_by("-total")[:100]
    ):
        endpoints.append({
            **row,
            "avg_ms": round(row["avg_ms"]) if row["avg_ms"] is not None else None,
            "p95_ms": _p95(sorted(durations.get((row["module"], row["action"]), []))),
            "last": timezone.localtime(row["last"]).isoformat(),
        })

    tokens = [
        {**row, "last": timezone.localtime(row["last"]).isoformat()}
        for row in (
            logs.filter(channel=AuditLog.API).exclude(token=None)
            .values("token__prefix", "token__name", "username")
            .annotate(total=Count("id"), errors=Count("id", filter=~Q(outcome=AuditLog.OK)), last=Max("created_at"))
            .order_by("-total")[:50]
        )
    ]

    recent_errors = [
        {
            "id": r.id,
            "fecha": timezone.localtime(r.created_at).strftime("%Y-%m-%d %H:%M:%S"),
            "modulo": r.module,
            "accion": r.action,
            "username": r.username,
            "estado_http": r.status_code,
            "descripcion": r.description[:300],
        }
        for r in logs.filter(outcome=AuditLog.ERROR).order_by("-created_at")[:20]
    ]

    return {
        "hours": hours,
        "by_channel": by_channel,
        "by_outcome": by_outcome,
        "endpoints": endpoints,
        "tokens": tokens,
        "recent_errors": recent_errors,
    }
