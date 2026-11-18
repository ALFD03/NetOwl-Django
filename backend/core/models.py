"""El `Period`: el mes (o el corte dentro de el) del que habla un analisis.

Es la unica pieza de dominio compartida por los tres modulos, por eso vive en
`core` y no en ninguno de ellos.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import datetime

from .utils import parse_date


@dataclass
class Period:
    """Un intervalo cerrado de fechas, normalmente un mes natural.

    `label()` es la clave con la que se guarda y se lee casi todo:
    `periodo_reporte` en las tablas de resultados es exactamente esa cadena.
    """

    start_date: datetime
    end_date: datetime

    @classmethod
    def build(cls, ini_text: str, end_text: str | None = None) -> Period:
        """Construye un periodo a partir de texto.

        Sin `fin_text` devuelve el mes completo de `ini_text` (del dia 1 a las
        00:00:00 al ultimo dia a las 23:59:59). Con el, un corte arbitrario; si la
        fecha final llega sin hora se le pone el final del dia, para que el corte
        incluya lo ocurrido ese mismo dia.
        """
        start = parse_date(ini_text)
        if start is None:
            raise ValueError(f"Fecha inicio inválida: {ini_text}")
        if end_text:
            final = parse_date(end_text)
            if final and final.hour == 0:
                final = final.replace(hour=23, minute=59, second=59)
            return cls(
                start.replace(hour=0, minute=0, second=0), final
            )
        last_day = calendar.monthrange(start.year, start.month)[1]
        final = datetime(start.year, start.month, last_day, 23, 59, 59)
        return cls(
            start.replace(day=1, hour=0, minute=0, second=0), final
        )

    def label(self) -> str:
        """Etiqueta del periodo, `"YYYY-MM-DD al YYYY-MM-DD"`.

        Es la clave `periodo_reporte` de las tablas de resultados: cambiarla
        invalidaria la lectura de todo lo ya calculado.
        """
        return (
            f"{self.start_date.strftime('%Y-%m-%d')}"
            f" al {self.end_date.strftime('%Y-%m-%d')}"
        )

    def cutoff_date(self) -> str:
        """Fecha de corte del snapshot (día hasta el que se calculó)."""
        return self.end_date.strftime("%Y-%m-%d")

    def period_month(self) -> str:
        """Mes al que pertenece el corte, en formato YYYY-MM."""
        return self.start_date.strftime("%Y-%m")
