"""El `Periodo`: el mes (o el corte dentro de el) del que habla un analisis.

Es la unica pieza de dominio compartida por los tres modulos, por eso vive en
`core` y no en ninguno de ellos.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import datetime

from .utils import parse_date


@dataclass
class Periodo:
    """Un intervalo cerrado de fechas, normalmente un mes natural.

    `label()` es la clave con la que se guarda y se lee casi todo:
    `periodo_reporte` en las tablas de resultados es exactamente esa cadena.
    """

    fecha_inicio: datetime
    fecha_final: datetime

    @classmethod
    def build(cls, ini_text: str, fin_text: str | None = None) -> Periodo:
        """Construye un periodo a partir de texto.

        Sin `fin_text` devuelve el mes completo de `ini_text` (del dia 1 a las
        00:00:00 al ultimo dia a las 23:59:59). Con el, un corte arbitrario; si la
        fecha final llega sin hora se le pone el final del dia, para que el corte
        incluya lo ocurrido ese mismo dia.
        """
        inicio = parse_date(ini_text)
        if inicio is None:
            raise ValueError(f"Fecha inicio inválida: {ini_text}")
        if fin_text:
            final = parse_date(fin_text)
            if final and final.hour == 0:
                final = final.replace(hour=23, minute=59, second=59)
            return cls(
                inicio.replace(hour=0, minute=0, second=0), final
            )
        last_day = calendar.monthrange(inicio.year, inicio.month)[1]
        final = datetime(inicio.year, inicio.month, last_day, 23, 59, 59)
        return cls(
            inicio.replace(day=1, hour=0, minute=0, second=0), final
        )

    def label(self) -> str:
        """Etiqueta del periodo, `"YYYY-MM-DD al YYYY-MM-DD"`.

        Es la clave `periodo_reporte` de las tablas de resultados: cambiarla
        invalidaria la lectura de todo lo ya calculado.
        """
        return (
            f"{self.fecha_inicio.strftime('%Y-%m-%d')}"
            f" al {self.fecha_final.strftime('%Y-%m-%d')}"
        )

    def fecha_corte(self) -> str:
        """Fecha de corte del snapshot (día hasta el que se calculó)."""
        return self.fecha_final.strftime("%Y-%m-%d")

    def periodo_mes(self) -> str:
        """Mes al que pertenece el corte, en formato YYYY-MM."""
        return self.fecha_inicio.strftime("%Y-%m")

    def es_cierre_oficial(self) -> bool:
        """True si el corte cae en el último día del mes del periodo."""
        last_day = calendar.monthrange(
            self.fecha_inicio.year, self.fecha_inicio.month
        )[1]
        return (
            self.fecha_final.day == last_day
            and self.fecha_final.month == self.fecha_inicio.month
            and self.fecha_final.year == self.fecha_inicio.year
        )
