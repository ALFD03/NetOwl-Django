"""Auditoría: quién hizo qué, cuándo, desde dónde, por qué canal y con qué resultado.

Fuentes de `AuditLog`:

* `AuditMiddleware`: toda escritura, las lecturas que sacan datos de clientes en
  bloque y **toda petición hecha con token de API**.
* Las señales de autenticación (`signals.py`).
* `log.record()` donde hace falta más contexto o no hay petición (el worker).
"""
