"""Escribir en el registro de auditoria sin que eso pueda tirar la accion auditada.

`registrar()` es la unica puerta de escritura. Nunca propaga: si la base falla
al anotar, la accion del usuario ya ocurrio y no tiene sentido devolverle un
500 por el registro. El fallo va al log de la aplicacion.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from django.db import transaction

from netowl_web.ratelimit import ip_cliente

from .models import RegistroAuditoria

logger = logging.getLogger(__name__)

# Claves cuyo valor nunca se guarda, se llamen como se llamen en cada payload.
_SENSIBLE = re.compile(r"pass|clave|contrasen|secret|token|csrf", re.IGNORECASE)
OCULTO = "***"

# Topes para que un payload grande (una decision en bloque sobre miles de
# ordenes) no convierta cada registro en un megabyte.
MAX_TEXTO = 500
MAX_ELEMENTOS = 200
MAX_PROFUNDIDAD = 6

# Lo que se resume en `objeto` si viene en el payload, en este orden.
CLAVES_OBJETO = (
    "periodo", "user_id", "username", "group_id", "name", "tipo", "id",
    "orden", "persona_id", "supervisor_ids", "module", "nombre",
)


def limpiar(valor: Any, profundidad: int = 0) -> Any:
    """Copia de `valor` apta para guardar: sin secretos y con tamano acotado."""
    if profundidad > MAX_PROFUNDIDAD:
        return "…"
    if isinstance(valor, dict):
        limpio = {}
        for i, (clave, dato) in enumerate(valor.items()):
            if i >= MAX_ELEMENTOS:
                limpio["…"] = f"{len(valor) - MAX_ELEMENTOS} claves más"
                break
            clave = str(clave)
            limpio[clave] = OCULTO if _SENSIBLE.search(clave) else limpiar(dato, profundidad + 1)
        return limpio
    if isinstance(valor, (list, tuple)):
        lista = [limpiar(dato, profundidad + 1) for dato in valor[:MAX_ELEMENTOS]]
        if len(valor) > MAX_ELEMENTOS:
            lista.append(f"… {len(valor) - MAX_ELEMENTOS} elementos más")
        return lista
    if isinstance(valor, str):
        return valor if len(valor) <= MAX_TEXTO else valor[:MAX_TEXTO] + "…"
    if valor is None or isinstance(valor, (bool, int, float)):
        return valor
    return limpiar(str(valor), profundidad)


def resumir_objeto(datos: Any) -> str:
    """`clave=valor` de las claves que identifican sobre que se actuo."""
    if not isinstance(datos, dict):
        return ""
    partes = []
    for clave in CLAVES_OBJETO:
        if clave in datos and datos[clave] not in (None, "", []):
            valor = datos[clave]
            if isinstance(valor, list):
                valor = ",".join(str(v) for v in valor[:10]) + ("…" if len(valor) > 10 else "")
            partes.append(f"{clave}={valor}")
    return " · ".join(partes)[:255]


def resultado_de(estado_http: int | None) -> str:
    """El desenlace a partir del codigo HTTP de la respuesta."""
    if estado_http is None or estado_http < 400:
        return RegistroAuditoria.OK
    if estado_http in (401, 403):
        return RegistroAuditoria.DENEGADO
    if estado_http == 429:
        return RegistroAuditoria.LIMITADO
    if estado_http < 500:
        return RegistroAuditoria.RECHAZADO
    return RegistroAuditoria.ERROR


def registrar(
    request=None,
    *,
    modulo: str,
    accion: str,
    usuario=None,
    descripcion: str = "",
    objeto: str = "",
    detalle: Any = None,
    resultado: str = RegistroAuditoria.OK,
    estado_http: int | None = None,
) -> RegistroAuditoria | None:
    """Anota una accion. Devuelve el registro, o None si no se pudo guardar.

    Con `request`, el usuario, la IP, el metodo y la ruta salen de ella; sin
    ella (el worker de Celery) hay que pasar `usuario`, que puede ser None
    para lo que hace el sistema por su cuenta.
    """
    if usuario is None and request is not None:
        usuario = getattr(request, "user", None)
    autenticado = usuario is not None and getattr(usuario, "is_authenticated", False)
    try:
        # En un savepoint: si el INSERT falla dentro de una transaccion ajena,
        # solo se deshace el registro, no lo que la peticion ya escribio.
        with transaction.atomic():
            return RegistroAuditoria.objects.create(
                usuario=usuario if autenticado else None,
                username=(usuario.username if autenticado else "")[:150],
                ip=ip_cliente(request) if request is not None else None,
                modulo=modulo[:40],
                accion=accion[:80],
                metodo=(request.method if request is not None else "")[:10],
                ruta=(request.path if request is not None else "")[:255],
                estado_http=estado_http,
                resultado=resultado,
                objeto=objeto[:255],
                descripcion=descripcion,
                detalle=limpiar(detalle) if detalle is not None else None,
            )
    except Exception:
        logger.exception("No se pudo anotar en auditoría %s.%s", modulo, accion)
        return None
