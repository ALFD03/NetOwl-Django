"""Que unidades de negocio puede ver una cuenta.

Una unidad de negocio es un `Coordinador` del catalogo, y el catalogo cambia:
por eso no es un permiso por unidad sino un interruptor
(`can_view_all_business_units`) y, sin el, una lista (`unidades_negocio`) mas el
bloque RF (`unidad_rf`). Lo resuelve `Profile.alcance_unidades()`.

El interruptor es un permiso de la matriz, asi que puede venir del grupo. **La
lista no**: es siempre la del usuario, este o no en un grupo, porque que
unidades ve cada uno es de cada persona y no de la plantilla.

Solo restringe la pagina Unidades de negocio. El consolidado FTTH de la
empresa se ve siempre (ver `subscriptions.analytics.queries.restringir_unidades`).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AlcanceUnidades:
    """Las unidades que ve una cuenta sin el interruptor de todas."""

    ids: frozenset[int]
    rf: bool

    def nombres(self) -> frozenset[str]:
        """Los nombres de las unidades, que es como las nombra el reporte."""
        from services.subscriptions.models import Coordinador

        return frozenset(Coordinador.objects.filter(id__in=self.ids).values_list('nombre', flat=True))

    def cubre(self, otro: 'AlcanceUnidades | None') -> bool:
        """Si este alcance incluye entero a `otro` (`None` es todas)."""
        if otro is None:
            return False
        return otro.ids <= self.ids and (self.rf or not otro.rf)


def alcance_de(usuario) -> AlcanceUnidades | None:
    """El alcance de una cuenta: None si ve todas (superusuario incluido)."""
    if usuario.is_superuser:
        return None
    profile = getattr(usuario, 'profile', None)
    if profile is None:
        return AlcanceUnidades(ids=frozenset(), rf=False)
    return profile.alcance_unidades()


def lista_de(profile) -> AlcanceUnidades:
    """La lista guardada en el perfil, rija o no (con el interruptor no rige)."""
    return AlcanceUnidades(
        ids=frozenset(profile.unidades_negocio.values_list('id', flat=True)),
        rf=profile.unidad_rf,
    )
