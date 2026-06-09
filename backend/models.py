"""
Modelos de datos del dominio de ChurnRateAnalyzer.

Dependencias esperadas:
- `utils.parse_date`: Conversión de cadenas a objetos datetime.
- `calendar`: Obtención del último día de un mes.
- `dataclasses`: Decorador para clases de datos inmutables.

Define la clase `Periodo`, que representa un intervalo de tiempo
(fecha_inicio, fecha_final) sobre el cual se ejecuta el análisis
de churn. Incluye métodos de construcción desde texto y generación
de etiquetas legibles.
"""

from __future__ import annotations
import calendar
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from .utils import parse_date


@dataclass
class Periodo:
    """
    Representa un período de análisis con fechas de inicio y fin.

    Encapsula la lógica de construcción del intervalo:
    - Si solo se da una fecha, se asume un mes completo (1er al último día).
    - Si se dan ambas fechas, se normalizan los extremos del día.
    """

    fecha_inicio: datetime
    fecha_final: datetime

    @classmethod
    def build(cls, ini_text: str, fin_text: Optional[str] = None) -> "Periodo":
        """
        Construye un Periodo a partir de cadenas de fecha.

        Args:
            ini_text: Fecha de inicio en formato textual.
            fin_text: Fecha de fin opcional. Si se omite, se calcula
                      el último día del mes de `ini_text`.

        Returns:
            Instancia de Periodo con fechas normalizadas.

        Raises:
            ValueError: Si la fecha de inicio no puede ser parseada.
        """
        inicio = parse_date(ini_text)
        if inicio is None:
            raise ValueError(f"Fecha inicio inválida: {ini_text}")
        if fin_text:
            # Si el usuario proveyó fecha final, se parsea
            final = parse_date(fin_text)
            # Si la hora es medianoche, se extiende al final del día
            if final and final.hour == 0:
                final = final.replace(hour=23, minute=59, second=59)
            return cls(
                inicio.replace(hour=0, minute=0, second=0), final
            )
        # Sin fecha final: se asume el mes completo de la fecha inicio
        last_day = calendar.monthrange(inicio.year, inicio.month)[1]
        final = datetime(inicio.year, inicio.month, last_day, 23, 59, 59)
        return cls(
            inicio.replace(day=1, hour=0, minute=0, second=0), final
        )

    def label(self) -> str:
        """
        Genera una etiqueta legible del período, ej: "2024-01-01 al 2024-01-31".

        Returns:
            Cadena con el rango de fechas formateado.
        """
        return (
            f"{self.fecha_inicio.strftime('%Y-%m-%d')}"
            f" al {self.fecha_final.strftime('%Y-%m-%d')}"
        )
