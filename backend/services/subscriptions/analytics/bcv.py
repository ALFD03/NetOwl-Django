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


def _api_date(dia: date) -> str:
    """La fecha en el formato que pide la ruta: `YYYY/MM/DD`."""
    return dia.strftime("%Y/%m/%d")


def first_day(periodo: str) -> date:
    """El dia 1 del periodo `YYYY-MM`."""
    try:
        anio, mes = periodo.split("-")
        return date(int(anio), int(mes), 1)
    except (AttributeError, ValueError):
        raise RateUnavailable(f"«{periodo}» no es un periodo valido (se espera YYYY-MM).") from None


def _promedio(datos: object) -> float | None:
    """La cifra que se usa de la respuesta, o `None` si no viene.

    `compra` y `venta` llegan a `null` en esta fuente, asi que `promedio` es el
    unico campo con dato. Que falte no es un error del servicio: es lo que
    responde un dia sin publicar.
    """
    promedio = datos.get("promedio") if isinstance(datos, dict) else None
    if promedio is None:
        return None

    try:
        valor = float(promedio)
    except (TypeError, ValueError):
        raise RateUnavailable(
            f"El servicio de tasas devolvio un promedio no numerico: {promedio!r}."
        ) from None

    if valor <= 0:
        raise RateUnavailable(f"El servicio de tasas devolvio una tasa invalida: {valor}.")

    return valor


def _fetch_day(dia: date) -> float | None:
    """La tasa publicada ese dia, o `None` si no hubo publicacion.

    Un 404 no es un error: es la respuesta correcta a preguntar por un sabado.
    Lo que si son errores —red caida, 500, JSON ilegible— suben como
    `RateUnavailable`, porque reintentar al dia siguiente no los arregla y
    seguir probando solo retrasaria el mensaje siete veces.
    """
    try:
        respuesta = requests.get(URL.format(fecha=_api_date(dia)), timeout=TIMEOUT)
    except requests.RequestException as e:
        raise RateUnavailable(
            "No se pudo contactar con el servicio de tasas (ve.dolarapi.com)."
        ) from e

    if respuesta.status_code == 404:
        return None

    if not respuesta.ok:
        raise RateUnavailable(
            f"El servicio de tasas respondio {respuesta.status_code}."
        )

    try:
        datos = respuesta.json()
    except ValueError as e:
        raise RateUnavailable("El servicio de tasas devolvio una respuesta ilegible.") from e

    # Cuerpo valido pero sin la cifra: mismo caso que un dia sin publicar.
    return _promedio(datos)


def fetch_month_rate(periodo: str) -> tuple[float, str]:
    """La tasa con que se declara el periodo, y de que dia salio.

    Devuelve `(tasa, descripcion)`. La descripcion es lo que se guarda junto a
    la cifra y se enseña: sin ella, una tasa a secas no dice si la puso alguien
    a mano o de que dia es.
    """
    primero = first_day(periodo)

    for salto in range(DAYS_TO_TRY):
        dia = primero + timedelta(days=salto)
        if dia.month != primero.month:
            break

        tasa = _fetch_day(dia)
        if tasa is not None:
            return tasa, f"BCV {dia.isoformat()} (ve.dolarapi.com)"

    raise RateUnavailable(
        f"El BCV no publico tasa en los primeros dias de {periodo}. "
        "Escribela a mano si hace falta declarar ya."
    )


def fetch_rate_on(dia: date) -> tuple[float, date]:
    """El valor del bolivar oficial vigente ese dia, y de que publicacion salio.

    Si el BCV publico ese dia, es esa. Si no (fin de semana o feriado, la API
    responde 404), vale la ultima publicada antes: es la que estaba en vigor ese
    dia. A diferencia de `fetch_month_rate`, que avanza al primer dia
    publicado del mes, esto retrocede, porque pregunta por el valor de un dia
    concreto y no por la primera tasa de un mes.
    """
    for salto in range(DAYS_TO_TRY):
        publicada = dia - timedelta(days=salto)
        tasa = _fetch_day(publicada)
        if tasa is not None:
            return tasa, publicada

    raise RateUnavailable(
        f"El BCV no publico tasa en los {DAYS_TO_TRY} dias hasta el {dia.strftime('%d/%m/%Y')}."
    )


def _publication_date(datos: object) -> str:
    """El dia que la fuente dice haber publicado, en `YYYY-MM-DD`.

    `fechaActualizacion` llega en ISO con huso (`2026-09-21T00:00:00-04:00`);
    solo interesa el dia, asi que se corta en la `T` en vez de construir un
    `datetime` con zona. Si no viene, se devuelve vacio: la tasa sigue siendo
    valida, lo unico que se pierde es poder decir de cuando es.
    """
    fecha = datos.get("fechaActualizacion") if isinstance(datos, dict) else None
    return str(fecha).split("T")[0] if fecha else ""


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
        respuesta = requests.get(CURRENT_URL, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise RateUnavailable(
            "No se pudo contactar con el servicio de tasas (ve.dolarapi.com)."
        ) from e

    if not respuesta.ok:
        raise RateUnavailable(f"El servicio de tasas respondio {respuesta.status_code}.")

    try:
        datos = respuesta.json()
    except ValueError as e:
        raise RateUnavailable("El servicio de tasas devolvio una respuesta ilegible.") from e

    tasa = _promedio(datos)
    if tasa is None:
        raise RateUnavailable("El servicio de tasas no devolvio la tasa vigente.")

    dia = _publication_date(datos)
    return tasa, f"BCV {dia} (ve.dolarapi.com)" if dia else "BCV vigente (ve.dolarapi.com)"
