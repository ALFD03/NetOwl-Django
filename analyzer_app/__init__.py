"""
Módulo principal de la aplicación analyzer_app.

Este paquete contiene toda la lógica de negocio para el análisis de tasa de
cancelación (churn rate). Incluye los componentes de Django (vistas, formularios,
modelos, URLConf) y el backend de análisis (conexión a BD, procesamiento de
datos, importación de CSVs).

Dependencias esperadas:
    - Django >= 5.0
    - pandas, numpy
    - psycopg2-binary (conexión PostgreSQL)
    - Conexión a base de datos PostgreSQL configurada en churn_web.settings

Submódulos:
    - backend/analyzer.py       : Lógica central del análisis de churn
    - backend/database.py       : Conexión y operaciones con la base de datos
    - backend/imports.py        : Utilidades de importación de archivos CSV
    - backend/models.py         : Modelos de dominio (Periodo, etc.)
    - backend/queries.py        : Consultas SQL predefinidas
"""
