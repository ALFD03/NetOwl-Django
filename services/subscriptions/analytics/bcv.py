"""La tasa del dolar oficial con que se declara la renta basica.

La reguladora quiere la renta en bolivares y el catalogo la guarda en divisa,
asi que hace falta una tasa por mes. Se consulta a `ve.dolarapi.com`, que sirve
el historico del dolar oficial del BCV por fecha.

**Se pide el dia 1 del mes del reporte**, que es la tasa con la que se declara
ese periodo. La respuesta trae `compra`, `venta` y `promedio`; se usa
`promedio`, que es el unico que viene siempre relleno —los otros dos llegan a
`null` en el historico.

**El dia 1 no siempre existe.** El BCV no publica fines de semana ni feriados,
y la API responde 404: entre 2025 y 2026 son ocho de veinticuatro meses, un
tercio. Por eso no se pide una fecha sino que se avanza al **primer dia
publicado del mes**, que sigue siendo "la tasa de ese mes" y es la primera que
hubo. Lo que respondio se anota en la descripcion para que nadie se pregunte
por que la tasa de agosto es del dia 3.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

import requests

logger = logging.getLogger(__name__)

URL = "https://ve.dolarapi.com/v1/historicos/dolares/oficial/{fecha}"

# Conexion y lectura. Cortos a proposito: esto se consulta desde la peticion
# que pinta el reporte, y un tercero caido no puede dejar la pagina colgada.
TIMEOUT = (5, 10)

# Cuantos dias se avanza buscando el primero publicado. Siete cubre un puente
# largo sin salirse del mes; mas alla, la tasa ya no representa al periodo y es
# mejor decir que no hay que inventar una.
DIAS_A_PROBAR = 7


class TasaNoDisponible(RuntimeError):
    """No se pudo obtener la tasa. El mensaje explica por que, y se enseña."""


def _fecha_api(dia: date) -> str:
    """La fecha en el formato que pide la ruta: `YYYY/MM/DD`."""
    return dia.strftime("%Y/%m/%d")


def primer_dia(periodo: str) -> date:
    """El dia 1 del periodo `YYYY-MM`."""
    try:
        anio, mes = periodo.split("-")
        return date(int(anio), int(mes), 1)
    except (AttributeError, ValueError):
        raise TasaNoDisponible(f"«{periodo}» no es un periodo valido (se espera YYYY-MM).") from None


def _consultar_dia(dia: date) -> float | None:
    """La tasa publicada ese dia, o `None` si no hubo publicacion.

    Un 404 no es un error: es la respuesta correcta a preguntar por un sabado.
    Lo que si son errores —red caida, 500, JSON ilegible— suben como
    `TasaNoDisponible`, porque reintentar al dia siguiente no los arregla y
    seguir probando solo retrasaria el mensaje siete veces.
    """
    try:
        respuesta = requests.get(URL.format(fecha=_fecha_api(dia)), timeout=TIMEOUT)
    except requests.RequestException as e:
        raise TasaNoDisponible(
            "No se pudo contactar con el servicio de tasas (ve.dolarapi.com)."
        ) from e

    if respuesta.status_code == 404:
        return None

    if not respuesta.ok:
        raise TasaNoDisponible(
            f"El servicio de tasas respondio {respuesta.status_code}."
        )

    try:
        datos = respuesta.json()
    except ValueError as e:
        raise TasaNoDisponible("El servicio de tasas devolvio una respuesta ilegible.") from e

    promedio = datos.get("promedio") if isinstance(datos, dict) else None
    if promedio is None:
        # Cuerpo valido pero sin la cifra: mismo caso que un dia sin publicar.
        return None

    try:
        valor = float(promedio)
    except (TypeError, ValueError):
        raise TasaNoDisponible(
            f"El servicio de tasas devolvio un promedio no numerico: {promedio!r}."
        ) from None

    if valor <= 0:
        raise TasaNoDisponible(f"El servicio de tasas devolvio una tasa invalida: {valor}.")

    return valor


def consultar_tasa_del_mes(periodo: str) -> tuple[float, str]:
    """La tasa con que se declara el periodo, y de que dia salio.

    Devuelve `(tasa, descripcion)`. La descripcion es lo que se guarda junto a
    la cifra y se enseña: sin ella, una tasa a secas no dice si la puso alguien
    a mano o de que dia es.
    """
    primero = primer_dia(periodo)

    for salto in range(DIAS_A_PROBAR):
        dia = primero + timedelta(days=salto)
        if dia.month != primero.month:
            break

        tasa = _consultar_dia(dia)
        if tasa is not None:
            return tasa, f"BCV {dia.isoformat()} (ve.dolarapi.com)"

    raise TasaNoDisponible(
        f"El BCV no publico tasa en los primeros dias de {periodo}. "
        "Escribela a mano si hace falta declarar ya."
    )
