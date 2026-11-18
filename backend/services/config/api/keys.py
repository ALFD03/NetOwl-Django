"""Claves de la API en inglés sobre una analítica que habla en español.

La analítica trabaja con los nombres de sus columnas y de sus estructuras
guardadas, que no cambian. Cada módulo declara un `KeyMap` (clave en español →
clave en inglés) y `@endpoint(keys=...)` lo aplica a la respuesta. Un cuerpo
que llega con esa misma estructura se traduce de vuelta con `back()` en la vista;
los parámetros de la query se leen ya con su nombre en inglés.

Solo se traducen claves de dict que coinciden exactamente con el mapa; los
valores no se tocan. Una clave que también es un valor guardado (un rol, un
site) no entra en el mapa: se indexa por ella y tiene que llegar tal cual.
"""

from __future__ import annotations

from typing import Any


class KeyMap:
    """Un mapa biyectivo español → inglés."""

    def __init__(self, *maps: dict[str, str]):
        merged: dict[str, str] = {}
        for m in maps:
            for es, en in m.items():
                if merged.get(es, en) != en:
                    raise ValueError(f"Clave {es!r} con dos traducciones: {merged[es]!r} y {en!r}")
                merged[es] = en
        back = {en: es for es, en in merged.items()}
        if len(back) != len(merged):
            dup = sorted({en for en in merged.values() if list(merged.values()).count(en) > 1})
            raise ValueError(f"Traducciones repetidas: {dup}")
        clash = sorted(set(merged) & set(back) - {k for k in merged if merged[k] == k})
        if clash:
            raise ValueError(f"Claves que son a la vez origen y destino: {clash}")
        self.to_en = merged
        self.to_es = back

    def out(self, data: Any) -> Any:
        """La respuesta, con sus claves en inglés."""
        return _rename(data, self.to_en)

    def back(self, data: Any) -> Any:
        """Lo recibido, con sus claves en español."""
        return _rename(data, self.to_es)


def _rename(data: Any, mapping: dict[str, str]) -> Any:
    if isinstance(data, dict):
        return {mapping.get(k, k) if isinstance(k, str) else k: _rename(v, mapping) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [_rename(v, mapping) for v in data]
    return data
