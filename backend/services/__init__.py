"""Un paquete por dominio de negocio.

Cada servicio agrupa su analitica (`analytics/`, pandas y SQL puros) y su capa
HTTP (`views.py`, `urls.py`). La regla de dependencia es en un solo sentido:
`views.py` importa de `analytics/`, nunca al reves, y `core/` no importa de
ningun servicio.
"""
