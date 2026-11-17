"""Recepción de los CSV subidos: un temporal validado que se borra al salir."""

from __future__ import annotations

import logging
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager

from django.conf import settings

from core.utils import validate_csv_structure
from services.config.api import ApiError

logger = logging.getLogger(__name__)


@contextmanager
def uploaded_csv(request, required_headers=None, field: str = "csv_file") -> Iterator[str]:
    """La ruta del CSV de `request.FILES[field]`, ya validado. Lanza `ApiError` (400)."""
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
        if required_headers:
            valid, message = validate_csv_structure(path, required_headers)
            if not valid:
                raise ApiError(message)
        yield path
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
