"""Que periodos evaluados puede ver una cuenta.

`can_view_all_periods` abre el historico entero; sin el, una cuenta solo ve el
**ultimo periodo calculado** de cada modulo (Suscripciones, CRM y Soporte). Al
analizarse un mes nuevo, pasa a ver ese. Es un permiso transversal, no uno por
modulo: lo que se limita es la profundidad historica, no el modulo.

Cada modulo etiqueta sus periodos a su manera (`YYYY-MM-01`, `YYYY-MM`,
`"YYYY-MM-DD al YYYY-MM-DD"`), asi que estas funciones no interpretan la
etiqueta: reciben la lista de periodos del propio modulo, ordenada del mas
reciente al mas antiguo como la devuelven todos sus `get_*_periodos`, y se
quedan con la cabeza.

La restriccion se aplica en el servidor, no solo en el selector: un periodo
fuera de lo permitido que llegue por la URL se sustituye por el permitido o se
niega.
"""

from collections.abc import Callable

PERMISO_TODOS_LOS_PERIODOS = 'can_view_all_periods'


def ve_todos_los_periodos(request) -> bool:
    """Si la cuenta ve el historico entero (los superusuarios siempre)."""
    if request.user.is_superuser:
        return True
    profile = getattr(request.user, 'profile', None)
    return bool(profile and profile.has_permission(PERMISO_TODOS_LOS_PERIODOS))


def periodos_visibles(request, disponibles: list[str]) -> list[str]:
    """La lista de periodos que la cuenta puede elegir."""
    return disponibles if ve_todos_los_periodos(request) else disponibles[:1]


def acotar_pedidos(
    request, pedidos: list[str] | None, disponibles: Callable[[], list[str]],
) -> list[str] | None:
    """Los periodos pedidos (`None` = todos), recortados a lo visible.

    Con el permiso devuelve `pedidos` tal cual, sin leer `disponibles`. Sin el,
    **siempre una lista**, nunca `None`: las consultas leen `None` como "todos".
    Puede ser vacia si el modulo no tiene ningun periodo calculado, y el que
    llama debe tratarla como "nada que ensenar" (`IN ()` no se puede escribir, y
    las consultas toman la lista vacia como "sin filtro").
    """
    if ve_todos_los_periodos(request):
        return pedidos
    permitidos = disponibles()[:1]
    if pedidos is None:
        return permitidos
    return [p for p in pedidos if p in permitidos] or permitidos


def periodo_visible(
    request, pedido: str | None, disponibles: Callable[[], list[str]],
) -> str | None:
    """El periodo de una pagina de un solo periodo.

    Con el permiso, el pedido tal cual (`None` deja que la consulta elija el
    mas reciente, como siempre). Sin el, el ultimo calculado, se pidiera el que
    se pidiera: la pagina abre en el permitido en vez de negarse.
    """
    if ve_todos_los_periodos(request):
        return pedido
    permitidos = disponibles()[:1]
    return permitidos[0] if permitidos else None


def periodo_denegado(
    request, pedido: str | None, disponibles: Callable[[], list[str]],
) -> bool:
    """Si un endpoint JSON de un periodo concreto debe negarse (403)."""
    if ve_todos_los_periodos(request):
        return False
    return pedido not in disponibles()[:1]


def mes_denegado(
    request, pedido: str | None, disponibles: Callable[[], list[str]],
) -> bool:
    """Como `periodo_denegado`, pero comparando solo el mes (`YYYY-MM`).

    Los cortes diarios y el listado de tickets se piden por mes, no por la
    etiqueta completa del periodo (`"YYYY-MM-DD al YYYY-MM-DD"`).
    """
    if ve_todos_los_periodos(request):
        return False
    permitidos = disponibles()[:1]
    return not (pedido and permitidos and pedido[:7] == permitidos[0][:7])
