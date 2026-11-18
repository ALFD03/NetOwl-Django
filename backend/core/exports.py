"""Lectura común de los exports CSV de Odoo.

Todos los importadores leen igual: `read_export(path, spec)` abre el CSV como
texto (con el BOM de Excel fuera), reconoce las cabeceras aunque Odoo cambie la
caja, los acentos o le añada el sub-campo de un relacional, comprueba las
obligatorias, deja solo las columnas conocidas con su nombre interno, convierte
los vacíos en nulo y los tipos con `core.tables.apply_types`. Lo propio de cada
export (consolidar líneas, arrastrar la referencia de la fila de arriba…) lo
hace después su importador.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from .tables import apply_types, blank_to_na


class InvalidExport(ValueError):
    """El fichero no se puede leer como el export esperado. El mensaje es para el usuario."""


class MissingColumns(InvalidExport):
    """Al CSV le faltan cabeceras obligatorias. El mensaje dice cuáles y cuáles trae."""

    def __init__(self, label: str, missing: Iterable[str], found: Iterable[str] = ()):
        missing = list(missing)
        found = [h for h in found if h]
        message = f"El archivo de {label} no trae " + ", ".join(f"«{h}»" for h in missing) + "."
        if found:
            message += " Cabeceras encontradas: " + ", ".join(found) + "."
        super().__init__(message)
        self.missing = missing


def header_key(text: Any) -> str:
    """Clave de comparación de una cabecera: sin BOM, sin acentos, sin caja ni espacios de sobra."""
    base = unicodedata.normalize("NFKD", str(text).replace("﻿", ""))
    base = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", base).strip().lower()


@dataclass(frozen=True)
class ExportSpec:
    """Lo que un importador espera de su export.

    - `columns`: cabecera de Odoo -> columna interna. Solo estas se conservan.
    - `required`: cabeceras de Odoo sin las que no se importa.
    - `aliases`: otras formas de escribir una cabecera (clave de `header_key`).
    - `prefix`: prefijo del modelo que se ignora al comparar ("Registros de tiempo/").
    - `types`: columna interna -> tipo de `core.tables`.
    - `blanks`: otros textos que en este export significan "vacío" (en
      minúsculas; Odoo escribe `False` en un relacional sin valor).
    """

    label: str
    columns: Mapping[str, str]
    required: tuple[str, ...] = ()
    aliases: Mapping[str, str] = field(default_factory=dict)
    prefix: str = ""
    types: Mapping[str, str] = field(default_factory=dict)
    blanks: tuple[str, ...] = ()

    def fields(self) -> list[dict[str, Any]]:
        """Las cabeceras para la tarjeta de requisitos de la importación."""
        aliases: dict[str, list[str]] = {}
        for alias, target in self.aliases.items():
            aliases.setdefault(target, []).append(alias.capitalize())
        return [
            {
                "name": f"{self.prefix}{header}",
                "required": header in self.required,
                # Con prefijo de modelo, la cabecera sin él también vale.
                "alias": ([header] if self.prefix else []) + aliases.get(target, []),
            }
            for header, target in self.columns.items()
        ]

    def _key(self, header: str) -> str:
        key = header_key(header)
        prefix = header_key(self.prefix)
        return key[len(prefix):].strip() if prefix and key.startswith(prefix) else key

    def resolve(self, headers: Iterable[str]) -> dict[str, str]:
        """Cabecera del CSV -> columna interna. Si dos resuelven a la misma, gana la primera.

        Primero las cabeceras que coinciden enteras; después, para las columnas
        que siguen sin cabecera, las que coinciden sin su último sub-campo
        ("Asignado a/Nombre para mostrar" -> "Asignado a").
        """
        by_key = {self._key(h): target for h, target in self.columns.items()}
        by_key.update(self.aliases)
        headers = list(headers)
        resolved: dict[str, str] = {}
        used: set[str] = set()
        for exact in (True, False):
            for header in headers:
                if header in resolved:
                    continue
                key = self._key(header)
                if not exact:
                    if "/" not in key:
                        continue
                    key = key.rsplit("/", 1)[0].strip()
                target = by_key.get(key)
                if target is not None and target not in used:
                    resolved[header] = target
                    used.add(target)
        return resolved

    def check(self, headers: list[str]) -> dict[str, str]:
        """El mapa de cabeceras, o `MissingColumns` si falta alguna obligatoria."""
        resolved = self.resolve(headers)
        found = set(resolved.values())
        missing = [f"{self.prefix}{h}" for h in self.required if self.columns[h] not in found]
        if missing:
            raise MissingColumns(self.label, missing, headers)
        return resolved


def _clean(chunk: pd.DataFrame, mapping: dict[str, str], spec: ExportSpec) -> pd.DataFrame:
    df = chunk[list(mapping)].rename(columns=mapping)
    for col in df.columns:
        df[col] = blank_to_na(df[col])
        if spec.blanks:
            df[col] = df[col].mask(df[col].str.lower().isin(spec.blanks), None)
    return apply_types(df, spec.types)


def _read_csv(path: str, spec: ExportSpec, **kwargs: Any):
    """`pd.read_csv` como texto, con los fallos de formato convertidos en `InvalidExport`."""
    try:
        return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig", **kwargs)
    except pd.errors.EmptyDataError as exc:
        raise InvalidExport(f"El archivo de {spec.label} está vacío.") from exc
    except (UnicodeDecodeError, pd.errors.ParserError) as exc:
        raise InvalidExport(f"El archivo de {spec.label} no es un CSV válido (UTF-8, separado por comas).") from exc


def read_export(path: str, spec: ExportSpec) -> pd.DataFrame:
    """El export entero, limpio y tipado."""
    raw = _read_csv(path, spec, low_memory=False)
    headers = [str(c) for c in raw.columns]
    return _clean(raw, spec.check(headers), spec)


def iter_export(path: str, spec: ExportSpec, chunksize: int) -> Iterator[pd.DataFrame]:
    """Como `read_export`, por bloques de `chunksize` filas (para exports grandes)."""
    mapping: dict[str, str] | None = None
    reader = _read_csv(path, spec, chunksize=chunksize)
    while True:
        try:
            chunk = next(reader)
        except StopIteration:
            break
        except (UnicodeDecodeError, pd.errors.ParserError) as exc:
            raise InvalidExport(f"El archivo de {spec.label} no es un CSV válido (UTF-8, separado por comas).") from exc
        if mapping is None:
            mapping = spec.check([str(c) for c in chunk.columns])
        yield _clean(chunk, mapping, spec)
    if mapping is None:
        raise InvalidExport(f"El archivo de {spec.label} está vacío.")
