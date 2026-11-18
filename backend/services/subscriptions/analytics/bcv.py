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

# La ultima tasa publicada, sin pedir fecha. Es otra pregunta que la de arriba:
# la del mes es la que se declara, esta es la que vale hoy —util para convertir
# a precio de hoy lo que se exporta fuera de la declaracion.
CURRENT_URL = "https://ve.dolarapi.com/v1/dolares/oficial"

# Conexion y lectura. Cortos a proposito: esto se consulta desde la peticion
# que pinta el reporte, y un tercero caido no puede dejar la pagina colgada.
TIMEOUT = (5, 10)

# Cuantos dias se avanza buscando el primero publicado. Siete cubre un puente
# largo sin salirse del mes; mas alla, la tasa ya no representa al periodo y es
# mejor decir que no hay que inventar una.
DAYS_TO_TRY = 7


class RateUnavailable(RuntimeError):
    """No se pudo obtener la tasa. El mensaje explica por que, y se enseña."""


def _api_date(day: date) -> str:
    """La fecha en el formato que pide la ruta: `YYYY/MM/DD`."""
    return day.strftime("%Y/%m/%d")


def first_day(period: str) -> date:
    """El dia 1 del periodo `YYYY-MM`."""
    try:
        year, month = period.split("-")
        return date(int(year), int(month), 1)
    except (AttributeError, ValueError):
        raise RateUnavailable(f"«{period}» no es un periodo valido (se espera YYYY-MM).") from None


def _average(data: object) -> float | None:
    """La cifra que se usa de la respuesta, o `None` si no viene.

    `compra` y `venta` llegan a `null` en esta fuente, asi que `promedio` es el
    unico campo con dato. Que falte no es un error del servicio: es lo que
    responde un dia sin publicar.
    """
    average = data.get("promedio") if isinstance(data, dict) else None
    if average is None:
        return None

    try:
        value = float(average)
    except (TypeError, ValueError):
        raise RateUnavailable(
            f"El servicio de tasas devolvio un promedio no numerico: {average!r}."
        ) from None

    if value <= 0:
        raise RateUnavailable(f"El servicio de tasas devolvio una tasa invalida: {value}.")

    return value


def _fetch_day(day: date) -> float | None:
    """La tasa publicada ese dia, o `None` si no hubo publicacion.

    Un 404 no es un error: es la respuesta correcta a preguntar por un sabado.
    Lo que si son errores —red caida, 500, JSON ilegible— suben como
    `RateUnavailable`, porque reintentar al dia siguiente no los arregla y
    seguir probando solo retrasaria el mensaje siete veces.
    """
    try:
        response = requests.get(URL.format(fecha=_api_date(day)), timeout=TIMEOUT)
    except requests.RequestException as e:
        raise RateUnavailable(
            "No se pudo contactar con el servicio de tasas (ve.dolarapi.com)."
        ) from e

    if response.status_code == 404:
        return None

    if not response.ok:
        raise RateUnavailable(
            f"El servicio de tasas respondio {response.status_code}."
        )

    try:
        data = response.json()
    except ValueError as e:
        raise RateUnavailable("El servicio de tasas devolvio una respuesta ilegible.") from e

    # Cuerpo valido pero sin la cifra: mismo caso que un dia sin publicar.
    return _average(data)


def fetch_month_rate(period: str) -> tuple[float, str]:
    """La tasa con que se declara el periodo, y de que dia salio.

    Devuelve `(tasa, descripcion)`. La descripcion es lo que se guarda junto a
    la cifra y se enseña: sin ella, una tasa a secas no dice si la puso alguien
    a mano o de que dia es.
    """
    first = first_day(period)

    for jump in range(DAYS_TO_TRY):
        day = first + timedelta(days=jump)
        if day.month != first.month:
            break

        rate = _fetch_day(day)
        if rate is not None:
            return rate, f"BCV {day.isoformat()} (ve.dolarapi.com)"

    raise RateUnavailable(
        f"El BCV no publico tasa en los primeros dias de {period}. "
        "Escribela a mano si hace falta declarar ya."
    )


def fetch_rate_on(day: date) -> tuple[float, date]:
    """El valor del bolivar oficial vigente ese dia, y de que publicacion salio.

    Si el BCV publico ese dia, es esa. Si no (fin de semana o feriado, la API
    responde 404), vale la ultima publicada antes: es la que estaba en vigor ese
    dia. A diferencia de `fetch_month_rate`, que avanza al primer dia
    publicado del mes, esto retrocede, porque pregunta por el valor de un dia
    concreto y no por la primera tasa de un mes.
    """
    for jump in range(DAYS_TO_TRY):
        published = day - timedelta(days=jump)
        rate = _fetch_day(published)
        if rate is not None:
            return rate, published

    raise RateUnavailable(
        f"El BCV no publico tasa en los {DAYS_TO_TRY} dias hasta el {day.strftime('%d/%m/%Y')}."
    )


def _publication_date(data: object) -> str:
    """El dia que la fuente dice haber publicado, en `YYYY-MM-DD`.

    `fechaActualizacion` llega en ISO con huso (`2026-09-21T00:00:00-04:00`);
    solo interesa el dia, asi que se corta en la `T` en vez de construir un
    `datetime` con zona. Si no viene, se devuelve vacio: la tasa sigue siendo
    valida, lo unico que se pierde es poder decir de cuando es.
    """
    on_date = data.get("fechaActualizacion") if isinstance(data, dict) else None
    return str(on_date).split("T")[0] if on_date else ""


def fetch_current_rate() -> tuple[float, str]:
    """La ultima tasa oficial publicada, sea del dia que sea.

    Devuelve `(tasa, descripcion)` con la misma forma que
    `fetch_month_rate`, para que las dos puedan usarse indistintamente al
    exportar. La diferencia es cual se pregunta: **la del mes es la que se
    declara** —la reguladora la fija en el primer dia publicado del periodo— y
    esta es la que vale hoy, que es otra cifra y no la sustituye.

    Aqui un 404 si es un error: la tasa vigente existe siempre, no depende de
    que un dia concreto fuera habil.
    """
    try:
        response = requests.get(CURRENT_URL, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise RateUnavailable(
            "No se pudo contactar con el servicio de tasas (ve.dolarapi.com)."
        ) from e

    if not response.ok:
        raise RateUnavailable(f"El servicio de tasas respondio {response.status_code}.")

    try:
        data = response.json()
    except ValueError as e:
        raise RateUnavailable("El servicio de tasas devolvio una respuesta ilegible.") from e

    rate = _average(data)
    if rate is None:
        raise RateUnavailable("El servicio de tasas no devolvio la tasa vigente.")

    day = _publication_date(data)
    return rate, f"BCV {day} (ve.dolarapi.com)" if day else "BCV vigente (ve.dolarapi.com)"
