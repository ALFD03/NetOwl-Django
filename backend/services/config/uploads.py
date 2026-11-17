"""Recepción de los CSV subidos: un temporal que se borra al salir.

Las cabeceras las comprueba cada importador al leerlo (`core.exports`).
"""

from __future__ import annotations

import logging
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager

from django.conf import settings

from services.config.api import ApiError

logger = logging.getLogger(__name__)


@contextmanager
def uploaded_csv(request, field: str = "csv_file") -> Iterator[str]:
    """La ruta del CSV de `request.FILES[field]`. Lanza `ApiError` (400)."""
    upload = request.FILES.get(field)
    if upload is None:
        raise ApiError("Archivo no enviado.")
    if not upload.name.lower().endswith(".csv"):
        raise ApiError("Solo se permiten archivos con extensión .csv")
    if upload.size > settings.MAX_UPLOAD_SIZE:
        raise ApiError("El archivo excede el tamaño máximo permitido.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        path = tmp.name
        try:
            for chunk in upload.chunks():
                tmp.write(chunk)
        except OSError as exc:
            logger.exception("Error al recibir el CSV subido")
            raise ApiError("No se pudo procesar el archivo.", 500) from exc
    try:
        yield path
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
