"""
Paquete de configuración del proyecto Django 'churn_web'.

Contiene los archivos de configuración general del sitio web:
    - settings.py : Configuración global (BD, apps, middleware, templates, etc.)
    - urls.py     : Enrutamiento raíz del proyecto
    - wsgi.py     : Punto de entrada para servidores WSGI (Gunicorn, etc.)
    - asgi.py     : Punto de entrada para servidores ASGI (Daphne, Uvicorn, etc.)

Dependencias esperadas:
    - Django >= 5.0
    - Variables de entorno definidas en archivo .env (o variables del sistema)
    - PostgreSQL accesible con las credenciales configuradas
"""
