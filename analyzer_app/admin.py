"""
Registro de modelos en el panel de administración de Django.

Actualmente no se registran modelos personalizados, ya que analyzer_app
utiliza tablas gestionadas directamente a través del backend de análisis
(no mediante el ORM de Django tradicional).

Dependencias:
    - django.contrib.admin (se activaría al registrar modelos)
"""
