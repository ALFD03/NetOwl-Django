"""Registro del historial de importaciones y calculos.

Vivia dentro de `views.py`, pero desde que los analisis corren en el worker de
Celery el desenlace lo escribe la tarea, no la vista. Las dos partes lo
comparten desde aqui para no importarse la una a la otra.
"""

import logging

from .models import ImportActionLog

logger = logging.getLogger(__name__)


def register_import_log(
    user, module, file_name='N/A', rows=0, status='success', message='', details=''
):
    """Deja constancia de una importacion o un calculo en el historial.

    `user` puede ser None: las tareas de Celery registran el desenlace mucho
    despues de que la peticion haya terminado, y el usuario que la lanzo pudo
    haber sido borrado entre medias (el job lo guarda con on_delete=SET_NULL).
    """
    autenticado = user is not None and getattr(user, 'is_authenticated', False)
    try:
        ImportActionLog.objects.create(
            user=user if autenticado else None,
            username=user.username if autenticado else 'Sistema',
            module=module,
            file_name=file_name or 'N/A',
            rows_processed=rows,
            status=status,
            message=message,
            details=details
        )
    except Exception as e:
        logger.exception("Error al registrar acción en historial: %s", str(e))
