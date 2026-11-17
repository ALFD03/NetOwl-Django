"""Qué unidades de negocio ve una cuenta.

Una unidad es un `Coordinador` del catálogo, y el catálogo cambia: por eso no hay
un permiso por unidad sino el interruptor `can_view_all_business_units` y, sin él,
una lista (`unidades_negocio`) más el bloque RF (`unidad_rf`).

El interruptor puede venir del grupo; **la lista no**: es siempre la del usuario.
Solo restringe la página Unidades de negocio.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class UnitScope:
    """Las unidades que ve una cuenta sin el interruptor de todas."""

    ids: frozenset[int]
    rf: bool

    def names(self) -> frozenset[str]:
        """Los nombres de las unidades, que es como las nombra el reporte."""
        from services.subscriptions.models import Coordinador

        return frozenset(Coordinador.objects.filter(id__in=self.ids).values_list("nombre", flat=True))

    def covers(self, other: "UnitScope | None") -> bool:
        """Si este alcance incluye entero a `other` (`None` es todas)."""
        if other is None:
            return False
        return other.ids <= self.ids and (self.rf or not other.rf)


EMPTY_SCOPE = UnitScope(ids=frozenset(), rf=False)


def unit_scope(user) -> UnitScope | None:
    """El alcance efectivo de una cuenta: None si ve todas (superusuario incluido)."""
    if user.is_superuser:
        return None
    profile = getattr(user, "profile", None)
    if profile is None:
        return EMPTY_SCOPE
    return profile.unit_scope()


def saved_units(profile) -> UnitScope:
    """La lista guardada en el perfil, rija o no."""
    return UnitScope(
        ids=frozenset(profile.unidades_negocio.values_list("id", flat=True)),
        rf=profile.unidad_rf,
    )
