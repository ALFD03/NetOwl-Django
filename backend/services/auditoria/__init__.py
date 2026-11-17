"""Registro de auditoria: quien hizo que, cuando, desde donde y con que resultado.

Tres fuentes alimentan la misma tabla (`RegistroAuditoria`):

* `AuditoriaMiddleware`, que anota **toda escritura** de un usuario (POST, PUT,
  PATCH, DELETE) y unas pocas lecturas que sacan datos de clientes en bloque.
  Esta en el middleware y no en cada vista para que un endpoint nuevo quede
  auditado sin que nadie tenga que acordarse.
* Las senales de autenticacion de Django (`signals.py`): entradas, salidas y
  credenciales incorrectas.
* Llamadas explicitas a `registrar()` donde hace falta mas contexto que el que
  ve el middleware, o donde no hay peticion (el desenlace de un analisis en el
  worker de Celery).
"""
