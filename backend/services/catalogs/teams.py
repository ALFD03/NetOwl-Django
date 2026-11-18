"""Los equipos de ventas, sus roles y los parametros de pago de cada rol.

Lo que es **codigo** y no tabla: que equipos hay, que roles tiene cada uno, que
datos exige cada rol (literales de Odoo, site, superior, unidades) y que
piezas de pago admite. Es vocabulario con consecuencias —el motor de
comisiones interpreta cada pieza—, asi que cambiarlo es un cambio de codigo.

Lo que es **dato** y se edita en Catalogos › Ventas: las personas de cada equipo
(`MembresiaEquipo`) y los valores de las piezas (`CondicionesEquipo.parametros`).
Un equipo/rol sin fila guardada paga con `DEFAULT_PARAMETERS`, que reproduce la
politica; por eso no hace falta sembrar condiciones.

Las piezas de pago, y quien las puede llevar, estan en `PIECES_BY_ROLE`:

- `propia` / `equipo`: `{"tipo": "monto" | "pct_plan", "valor": n}`; `monto` es
  dolares por venta y `pct_plan` un % del precio del plan. `equipo` anade
  `alcance` (de que ventas se cobra) y `excluir_oficina`.
- `factor`: el % de cumplimiento (tope 100) que multiplica propias + equipo.
- `tramos_asesor`: `[{desde, monto, descontar}]` sobre las ventas propias.
- `bono_tramos`: `[{desde, monto}]`, un monto unico segun las ventas propias.
- `bono_por_asesor`: lo mismo, pero se paga por cada asesor del equipo que llega.
- `bono_por_unidad`: `{monto}` por unidad, proporcional a su % de ingresos.
- `escalon_crecimiento`: `{umbral_pct, alto, bajo}` para la venta de equipo
  del coordinador de UN.
- `bonus_churn`: `[{max, monto}]` segun el churn bruto de su unidad.
- `bono_empresa`: `{monto, excedente}` segun el % de ventas de la empresa.
"""

from __future__ import annotations

import copy
from typing import Any

# --- Equipos y roles ---------------------------------------------------------------

# Se siembran en la migracion `catalogos/0006` con estos mismos slugs.
TEAMS: list[tuple[str, str]] = [
    ("verticalizacion", "Verticalización"),
    ("carabobo", "Carabobo"),
    ("nacional", "Nacional"),
    ("aragua", "Aragua"),
    ("la_victoria", "La Victoria"),
]

# El rol al que responde un supervisor, por equipo: el coordinador de UN en
# Carabobo y el gerente de UN en Aragua y La Victoria. Verticalizacion no tiene.
SUPERVISOR_MANAGER = {"carabobo": "coord_un", "aragua": "gerente_un", "la_victoria": "gerente_un"}

# Que literal de Odoo lleva cada rol: `medio` (columna `Medio`), `supervisor`
# (`Oportunidad/Administrador`, opcional: vacio es «igual que medio») y `usuario`
# (`Vendedor`, el usuario de Odoo con sufijo). `True` lo exige, `False` no aplica.
ROLES: dict[str, dict[str, Any]] = {
    "jefe": {"label": "Jefe", "channel": True, "supervisor": True, "user": False},
    "jefe_un": {"label": "Jefe de unidades de negocio", "channel": True, "supervisor": True, "user": False,
                "units": "varias"},
    "coord_un": {"label": "Coordinador de unidad de negocio", "channel": True, "supervisor": True,
                 "user": False, "units": "una"},
    "gerente_un": {"label": "Gerente de unidad de negocio", "channel": True, "supervisor": True,
                   "user": False, "units": "varias"},
    "gerente_ops": {"label": "Gerente de operaciones", "channel": False, "supervisor": False,
                    "user": False, "units": "varias"},
    "coord_oficina": {"label": "Coordinadora de oficina", "channel": True, "supervisor": True, "user": True,
                      "site": True},
    "supervisor": {"label": "Supervisor de ventas", "channel": True, "supervisor": True, "user": False},
    "asesor": {"label": "Asesor de ventas", "channel": True, "supervisor": False, "user": False},
    "administradora": {"label": "Administradora de ventas", "channel": False, "supervisor": False,
                       "user": True},
    "telemarketing": {"label": "Asesor de telemarketing", "channel": True, "supervisor": False, "user": False},
}

ROLES_BY_TEAM: dict[str, list[str]] = {
    "verticalizacion": ["jefe", "supervisor", "asesor"],
    "carabobo": ["jefe_un", "coord_un", "coord_oficina", "supervisor", "asesor"],
    "nacional": ["administradora", "telemarketing"],
    "aragua": ["gerente_un", "gerente_ops", "coord_oficina", "supervisor", "asesor"],
    "la_victoria": ["gerente_un", "gerente_ops", "coord_oficina", "supervisor", "asesor"],
}

ROLE_CHOICES = [(role, spec["label"]) for role, spec in ROLES.items()]

# Los roles que cobran por las ventas de unidades de negocio: llevan `unidades`.
ROLES_WITH_UNITS = tuple(role for role, spec in ROLES.items() if spec.get("units"))
# Los roles que pueden figurar en `Oportunidad/Administrador`.
SUPERVISING_ROLES = tuple(role for role, spec in ROLES.items() if spec["supervisor"])


def team_roles(slug: str) -> list[str]:
    """Los roles de un equipo, en el orden en que se presentan."""
    return list(ROLES_BY_TEAM.get(slug, []))


def role_label(role: str) -> str:
    """El nombre legible de un rol."""
    return ROLES.get(role, {}).get("label", role)


# --- Piezas de pago ----------------------------------------------------------------

SCOPES = ("supervisados", "equipo_completo", "unidades", "oficina")
FACTORS = ("ninguno", "site", "unidad")
AMOUNT_TYPES = ("monto", "pct_plan")

PIECES_BY_ROLE: dict[str, tuple[str, ...]] = {
    "jefe": ("propia", "equipo"),
    "jefe_un": ("equipo", "bono_por_unidad"),
    "coord_un": ("propia", "equipo", "escalon_crecimiento", "bono_churn"),
    "gerente_un": ("propia", "equipo", "factor"),
    "gerente_ops": ("propia", "equipo"),
    "coord_oficina": ("propia", "equipo", "factor"),
    "supervisor": ("propia", "equipo", "factor", "bono_por_asesor"),
    "asesor": ("tramos_asesor", "bono_tramos"),
    "administradora": ("bono_empresa",),
    "telemarketing": ("tramos_asesor", "bono_tramos"),
}

# --- Valores por defecto: la politica -----------------------------------------------

_BONUS_30_40_50 = [{"desde": 30, "monto": 120}, {"desde": 40, "monto": 200}, {"desde": 50, "monto": 250}]
_ADVISOR_BONUS_ARAGUA = [{"desde": 15, "monto": 50}, {"desde": 20, "monto": 80}, *_BONUS_30_40_50]
_BONUS_PER_ADVISOR = [{"desde": 30, "monto": 20}, {"desde": 40, "monto": 25}, {"desde": 50, "monto": 30}]
_TIERS_GENERAL = [
    {"desde": 0, "monto": 0, "descontar": 0},
    {"desde": 6, "monto": 5, "descontar": 5},
    {"desde": 20, "monto": 6, "descontar": 0},
    {"desde": 21, "monto": 7, "descontar": 0},
    {"desde": 26, "monto": 8, "descontar": 0},
]
_TIERS_ARAGUA = [
    {"desde": 0, "monto": 0, "descontar": 0},
    {"desde": 6, "monto": 5, "descontar": 5},
    {"desde": 15, "monto": 5, "descontar": 0},
    {"desde": 20, "monto": 6, "descontar": 0},
    {"desde": 21, "monto": 7, "descontar": 0},
    {"desde": 26, "monto": 8, "descontar": 0},
]


def _amount(value: float) -> dict[str, Any]:
    return {"tipo": "monto", "valor": value}


def _pct_plan(value: float = 10) -> dict[str, Any]:
    return {"tipo": "pct_plan", "valor": value}


def _team(value: dict[str, Any], scope: str, exclude_office: bool = False) -> dict[str, Any]:
    return {**value, "alcance": scope, "excluir_oficina": exclude_office}


DEFAULT_PARAMETERS: dict[tuple[str, str], dict[str, Any]] = {
    # Verticalizacion
    ("verticalizacion", "jefe"): {"propia": _amount(4), "equipo": _team(_amount(2), "equipo_completo")},
    ("verticalizacion", "supervisor"): {
        "propia": _amount(4), "equipo": _team(_amount(2.5), "supervisados"),
        "factor": "ninguno", "bono_por_asesor": _BONUS_PER_ADVISOR,
    },
    ("verticalizacion", "asesor"): {
        "tramos_asesor": [{"desde": 0, "monto": 5, "descontar": 0}], "bono_tramos": _BONUS_30_40_50,
    },
    # Carabobo
    ("carabobo", "jefe_un"): {
        "equipo": _team(_amount(0.8), "unidades", exclude_office=True), "bono_por_unidad": {"monto": 50},
    },
    ("carabobo", "coord_un"): {
        "propia": _amount(4), "equipo": _team(_amount(0), "unidades", exclude_office=True),
        "escalon_crecimiento": {"umbral_pct": 6, "alto": 2, "bajo": 1},
        "bono_churn": [{"max": 3, "monto": 100}, {"max": 1.9, "monto": 200}],
    },
    ("carabobo", "coord_oficina"): {
        "propia": _amount(4), "equipo": _team(_amount(2.5), "oficina"), "factor": "site",
    },
    ("carabobo", "supervisor"): {
        "propia": _amount(4), "equipo": _team(_amount(2.5), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONUS_PER_ADVISOR,
    },
    ("carabobo", "asesor"): {"tramos_asesor": _TIERS_GENERAL, "bono_tramos": _BONUS_30_40_50},
    # Nacional
    ("nacional", "administradora"): {"bono_empresa": {"monto": 100, "excedente": 120}},
    ("nacional", "telemarketing"): {
        "tramos_asesor": [{"desde": 0, "monto": 2, "descontar": 0}], "bono_tramos": _BONUS_30_40_50,
    },
    # Aragua
    ("aragua", "gerente_un"): {
        "propia": _amount(4), "equipo": _team(_amount(2), "unidades"), "factor": "unidad",
    },
    ("aragua", "gerente_ops"): {"propia": _amount(4), "equipo": _team(_amount(1), "unidades")},
    ("aragua", "coord_oficina"): {
        "propia": _amount(4), "equipo": _team(_amount(2.5), "oficina"), "factor": "site",
    },
    ("aragua", "supervisor"): {
        "propia": _amount(4), "equipo": _team(_amount(2.5), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONUS_PER_ADVISOR,
    },
    ("aragua", "asesor"): {"tramos_asesor": _TIERS_ARAGUA, "bono_tramos": _ADVISOR_BONUS_ARAGUA},
    # La Victoria: segun el monto del plan (el 10 %: 20$ -> 2, 25$ -> 2.5 ... 70$ -> 7)
    ("la_victoria", "gerente_un"): {
        "propia": _pct_plan(), "equipo": _team(_pct_plan(), "unidades"), "factor": "unidad",
    },
    ("la_victoria", "gerente_ops"): {"propia": _pct_plan(), "equipo": _team(_pct_plan(), "unidades")},
    ("la_victoria", "coord_oficina"): {
        "propia": _amount(2), "equipo": _team(_amount(2), "oficina"), "factor": "site",
    },
    ("la_victoria", "supervisor"): {
        "propia": _pct_plan(), "equipo": _team(_pct_plan(), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONUS_PER_ADVISOR,
    },
    ("la_victoria", "asesor"): {"tramos_asesor": _TIERS_GENERAL, "bono_tramos": _BONUS_30_40_50},
}


def default_parameters(slug: str, role: str) -> dict[str, Any]:
    """Copia de los parametros por defecto de un rol de un equipo (vacios si no existe)."""
    return copy.deepcopy(DEFAULT_PARAMETERS.get((slug, role), {}))


def current_parameters(slug: str, role: str, saved: dict[str, Any] | None) -> dict[str, Any]:
    """Los parametros que valen: los guardados, completados con los de por defecto.

    Una pieza que el rol admite y no esta guardada paga con la de por defecto; una
    que esta guardada manda entera (no se mezcla por dentro).
    """
    base = default_parameters(slug, role)
    if saved:
        base.update({k: v for k, v in saved.items() if k in PIECES_BY_ROLE.get(role, ())})
    return base


# --- Validacion ---------------------------------------------------------------------

def _number(value: Any, that: str, min_value: float | None = 0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{that} tiene que ser un número.") from None
    if min_value is not None and n < min_value:
        raise ValueError(f"{that} no puede ser menor que {min_value:g}.")
    return n


def _amount_or_pct(piece: Any, that: str) -> dict[str, Any]:
    if not isinstance(piece, dict) or piece.get("tipo") not in AMOUNT_TYPES:
        raise ValueError(f"{that}: el tipo tiene que ser «monto» o «pct_plan».")
    return {"tipo": piece["tipo"], "valor": _number(piece.get("valor"), f"{that}: el valor")}


def _tiers(entries: Any, that: str, *, discounted: bool = False) -> list[dict[str, float]]:
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"{that}: no puede quedar vacío.")
    clean = []
    for t in entries:
        if not isinstance(t, dict):
            raise ValueError(f"{that}: cada tramo necesita «desde» y «monto».")
        since = int(_number(t.get("desde"), f"{that}: «desde»"))
        row: dict[str, float] = {"desde": since, "monto": _number(t.get("monto"), f"{that}: «monto»")}
        if discounted:
            discount = int(_number(t.get("descontar") or 0, f"{that}: «descontar»"))
            if discount > since:
                raise ValueError(f"{that}: el tramo desde {since} ventas no puede descontar {discount}.")
            row["descontar"] = discount
        clean.append(row)
    clean.sort(key=lambda t: t["desde"])
    if len({t["desde"] for t in clean}) != len(clean):
        raise ValueError(f"{that}: dos tramos empiezan en la misma cantidad de ventas.")
    if discounted and clean[0]["desde"] != 0:
        raise ValueError(f"{that}: el primer tramo tiene que empezar en 0 ventas.")
    if not discounted and clean[0]["desde"] < 1:
        raise ValueError(f"{that}: los tramos empiezan en 1 venta o más.")
    return clean


def validate_parameters(role: str, params: Any) -> dict[str, Any]:
    """Los parametros de un rol, comprobados y limpios. Levanta `ValueError`.

    Solo se admiten las piezas del rol (`PIECES_BY_ROLE`); las que falten se
    dejan sin guardar y pagan con las de por defecto.
    """
    if role not in PIECES_BY_ROLE:
        raise ValueError("Rol desconocido.")
    if not isinstance(params, dict):
        raise ValueError("Los parámetros tienen que ser un objeto.")
    unknown = set(params) - set(PIECES_BY_ROLE[role])
    if unknown:
        raise ValueError(f"{role_label(role)} no admite: {', '.join(sorted(unknown))}.")

    clean: dict[str, Any] = {}
    for key, piece in params.items():
        if key == "propia":
            clean[key] = _amount_or_pct(piece, "Venta propia")
        elif key == "equipo":
            base = _amount_or_pct(piece, "Venta de equipo")
            scope = piece.get("alcance")
            if scope not in SCOPES:
                raise ValueError("Venta de equipo: el alcance no es válido.")
            clean[key] = {**base, "alcance": scope, "excluir_oficina": bool(piece.get("excluir_oficina"))}
        elif key == "factor":
            if piece not in FACTORS:
                raise ValueError("El factor de cumplimiento no es válido.")
            clean[key] = piece
        elif key == "tramos_asesor":
            clean[key] = _tiers(piece, "Tramos del asesor", discounted=True)
        elif key in ("bono_tramos", "bono_por_asesor"):
            clean[key] = _tiers(piece, "Bono por ventas")
        elif key == "bono_por_unidad":
            clean[key] = {"monto": _number((piece or {}).get("monto"), "Bono por unidad")}
        elif key == "escalon_crecimiento":
            piece = piece or {}
            clean[key] = {
                "umbral_pct": _number(piece.get("umbral_pct"), "Umbral de crecimiento", None),
                "alto": _number(piece.get("alto"), "Monto con crecimiento"),
                "bajo": _number(piece.get("bajo"), "Monto sin crecimiento"),
            }
        elif key == "bono_churn":
            if not isinstance(piece, list):
                raise ValueError("Bono por churn: tiene que ser una lista.")
            rows = [
                {"max": _number(f.get("max"), "Bono por churn: «max»", None),
                 "monto": _number(f.get("monto"), "Bono por churn: «monto»")}
                for f in piece
                if isinstance(f, dict)
            ]
            clean[key] = sorted(rows, key=lambda f: f["max"], reverse=True)
        elif key == "bono_empresa":
            piece = piece or {}
            clean[key] = {
                "monto": _number(piece.get("monto"), "Bono de la administradora"),
                "excedente": _number(piece.get("excedente"), "Bono por superar el 100 %"),
            }
    return clean
