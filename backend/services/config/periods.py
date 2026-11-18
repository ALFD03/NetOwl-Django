"""Qué periodos evaluados puede ver una cuenta.

`can_view_all_periods` abre el histórico entero; sin él, la cuenta solo ve el
**último periodo calculado** de cada módulo. Las funciones no interpretan la
etiqueta del periodo: reciben la lista del módulo, de la más reciente a la más
antigua, y se quedan con la cabeza. Se aplica en el servidor, no solo en el selector.
"""

from collections.abc import Callable

ALL_PERIODS_PERMISSION = "can_view_all_periods"


def sees_all_periods(request) -> bool:
    if request.user.is_superuser:
        return True
    profile = getattr(request.user, "profile", None)
    return bool(profile and profile.has_permission(ALL_PERIODS_PERMISSION))


def visible_periods(request, available: list[str]) -> list[str]:
    """Los periodos que la cuenta puede elegir."""
    return available if sees_all_periods(request) else available[:1]


def clamp_requested(
    request, requested: list[str] | None, available: Callable[[], list[str]],
) -> list[str] | None:
    """Los periodos pedidos (`None` = todos), recortados a lo visible.

    Sin el permiso devuelve **siempre una lista** (puede ser vacía): las
    consultas leen `None` como "todos".
    """
    if sees_all_periods(request):
        return requested
    allowed = available()[:1]
    if requested is None:
        return allowed
    return [p for p in requested if p in allowed] or allowed


def visible_period(request, requested: str | None, available: Callable[[], list[str]]) -> str | None:
    """El periodo de una página de un solo periodo: sin el permiso, el último calculado."""
    if sees_all_periods(request):
        return requested
    allowed = available()[:1]
    return allowed[0] if allowed else None


def period_denied(request, requested: str | None, available: Callable[[], list[str]]) -> bool:
    """Si un endpoint de un periodo concreto debe negarse (403)."""
    if sees_all_periods(request):
        return False
    return requested not in available()[:1]


def month_denied(request, requested: str | None, available: Callable[[], list[str]]) -> bool:
    """Como `period_denied`, comparando solo el mes (`YYYY-MM`)."""
    if sees_all_periods(request):
        return False
    allowed = available()[:1]
    return not (requested and allowed and requested[:7] == allowed[0][:7])
