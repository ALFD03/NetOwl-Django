#!/usr/bin/env python
"""
Punto de entrada principal para tareas de gestión de Django.

Este script es generado automáticamente por Django y permite ejecutar
comandos de administración (runserver, migrate, makemigrations, shell,
collectstatic, etc.).

Uso:
    python manage.py <comando> [opciones]

Dependencias:
    - Django instalado en el entorno virtual o global
    - Variable DJANGO_SETTINGS_MODULE apuntando a churn_web.settings
"""
import os
import sys


def main():
    """
    Configura el módulo de settings y ejecuta el comando solicitado.

    Establece la variable de entorno DJANGO_SETTINGS_MODULE para que
    Django sepa qué configuración cargar, luego importa y ejecuta la
    utilidad de línea de comandos.

    Raises:
        ImportError: Si Django no está instalado o no se encuentra en
                     el PYTHONPATH.
    """
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "churn_web.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
