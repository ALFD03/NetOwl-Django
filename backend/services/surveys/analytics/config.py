"""Los vocabularios cerrados de Encuestas y de dónde sale la lista de cada una.

Que existan las dos encuestas (`instalados`, `bajas`) y su lista (`loader`) es código; lo
que se pregunta y con qué opciones es dato, y se edita desde la web.
Los valores de estados, tipos y modos se guardan en la base tal cual.
"""

from __future__ import annotations

INSTALLED = "instalados"
CHURNED = "bajas"
SURVEYS = {INSTALLED: "Encuesta de instalados", CHURNED: "Encuesta de bajas"}


# Estado de un encuestado. `completada` solo lo pone el guardado de respuestas.
PENDING = "pendiente"
COMPLETED = "completada"
NO_ANSWER = "no_contesta"
REFUSED = "rechazo"
STATUSES = [(PENDING, "Pendiente"), (COMPLETED, "Completada"), (NO_ANSWER, "No contesta"), (REFUSED, "Rechazó")]
MANUAL_STATUSES = {PENDING, NO_ANSWER, REFUSED}

# Cómo se responde una pregunta.
SINGLE = "unica"
MULTIPLE = "multiple"
TEXT = "texto"
QUESTION_KINDS = [(SINGLE, "Una opción"), (MULTIPLE, "Varias opciones"), (TEXT, "Texto libre")]
# Las que se responden eligiendo de una lista: las únicas que pueden condicionar a otras.
OPTION_KINDS = (SINGLE, MULTIPLE)
MAX_TEXT = 500

# Condición de una pregunta respecto a la respuesta de otra.
SHOW_IF = "mostrar"
HIDE_IF = "ocultar"
CONDITION_MODES = [(SHOW_IF, "Mostrar si"), (HIDE_IF, "Ocultar si")]

# Cuántos meses cerrados se ofrecen para abrir una encuesta.
OFFERED_MONTHS = 12
