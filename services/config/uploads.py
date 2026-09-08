"""Recepcion de CSV subidos por el usuario, compartida por todas las apps.

Estas dos funciones vivian duplicadas palabra por palabra en
`services/subscriptions/views.py` y `services/crm/views.py`, y
`services/imports/views.py` las importaba desde el modulo de vistas de otra
app, creando una dependencia entre apps que no deberia existir. Viven aqui,
en la app de infraestructura que todas las demas ya usan (`decorators.py`,
`models.py`), y no en `core/`, porque dependen de Django: reciben un
`HttpRequest` y devuelven un `JsonResponse`.
"""

from __future__ import annotations

import os
import tempfile
from typing import Optional, Tuple

from django.conf import settings
from django.http import JsonResponse

from core.utils import validate_csv_structure


def cleanup_tempfile(tmp_path: Optional[str]) -> None:
    """Borra el temporal, ignorando que ya no exista."""
    if tmp_path:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def handle_csv_upload(request, required_headers=None) -> Tuple[Optional[str], Optional[JsonResponse]]:
    """Vuelca el CSV subido a un temporal y valida su estructura.

    Devuelve `(ruta, None)` si todo fue bien, o `(None, respuesta_de_error)`
    para que la vista la retorne tal cual. El temporal es responsabilidad de
    quien llama: hay que cerrarlo con `cleanup_tempfile` cuando se termine.
    """
    if "csv_file" not in request.FILES:
        return None, JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)

    csv_file = request.FILES["csv_file"]
    if not csv_file.name.endswith(".csv"):
        return None, JsonResponse(
            {"status": "error", "message": "Solo se permiten archivos con extensión .csv"},
            status=400,
        )
    if csv_file.size > settings.MAX_UPLOAD_SIZE:
        return None, JsonResponse(
            {"status": "error", "message": "El archivo excede el tamaño máximo permitido"},
            status=400,
        )

    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        tmp_path = tmp.name
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp.close()

        if required_headers:
            is_valid, err_msg = validate_csv_structure(tmp_path, required_headers)
            if not is_valid:
                cleanup_tempfile(tmp_path)
                return None, JsonResponse({"status": "error", "message": err_msg}, status=400)
    except Exception as e:
        if tmp_path:
            cleanup_tempfile(tmp_path)
        return None, JsonResponse(
            {"status": "error", "message": f"Error al procesar el archivo: {str(e)}"},
            status=500,
        )

    return tmp_path, None
