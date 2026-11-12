"""Los equipos de ventas, sus roles y los parametros de pago de cada rol.

Lo que es **codigo** y no tabla: que equipos hay, que roles tiene cada uno, que
datos exige cada rol (literales de Odoo, site, superior, unidades) y que
piezas de pago admite. Es vocabulario con consecuencias —el motor de
comisiones interpreta cada pieza—, asi que cambiarlo es un cambio de codigo.

Lo que es **dato** y se edita en Catalogos › Ventas: las personas de cada equipo
(`MembresiaEquipo`) y los valores de las piezas (`CondicionesEquipo.parametros`).
Un equipo/rol sin fila guardada paga con `PARAMETROS_DEFECTO`, que reproduce la
politica; por eso no hace falta sembrar condiciones.

Las piezas de pago, y quien las puede llevar, estan en `PIEZAS_POR_ROL`:

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
- `bono_churn`: `[{max, monto}]` segun el churn bruto de su unidad.
- `bono_empresa`: `{monto, excedente}` segun el % de ventas de la empresa.
"""

from __future__ import annotations

import copy
from typing import Any

# --- Equipos y roles ---------------------------------------------------------------

# Se siembran en la migracion `catalogos/0006` con estos mismos slugs.
EQUIPOS: list[tuple[str, str]] = [
    ("verticalizacion", "Verticalización"),
    ("carabobo", "Carabobo"),
    ("nacional", "Nacional"),
    ("aragua", "Aragua"),
    ("la_victoria", "La Victoria"),
]

# El rol al que responde un supervisor, por equipo: el coordinador de UN en
# Carabobo y el gerente de UN en Aragua y La Victoria. Verticalizacion no tiene.
SUPERIOR_DEL_SUPERVISOR = {"carabobo": "coord_un", "aragua": "gerente_un", "la_victoria": "gerente_un"}

# Que literal de Odoo lleva cada rol: `medio` (columna `Medio`), `supervisor`
# (`Oportunidad/Administrador`, opcional: vacio es «igual que medio») y `usuario`
# (`Vendedor`, el usuario de Odoo con sufijo). `True` lo exige, `False` no aplica.
ROLES: dict[str, dict[str, Any]] = {
    "jefe": {"etiqueta": "Jefe", "medio": True, "supervisor": True, "usuario": False},
    "jefe_un": {"etiqueta": "Jefe de unidades de negocio", "medio": True, "supervisor": True, "usuario": False,
                "unidades": "varias"},
    "coord_un": {"etiqueta": "Coordinador de unidad de negocio", "medio": True, "supervisor": True,
                 "usuario": False, "unidades": "una"},
    "gerente_un": {"etiqueta": "Gerente de unidad de negocio", "medio": True, "supervisor": True,
                   "usuario": False, "unidades": "varias"},
    "gerente_ops": {"etiqueta": "Gerente de operaciones", "medio": False, "supervisor": False,
                    "usuario": False, "unidades": "varias"},
    "coord_oficina": {"etiqueta": "Coordinadora de oficina", "medio": True, "supervisor": True, "usuario": True,
                      "site": True},
    "supervisor": {"etiqueta": "Supervisor de ventas", "medio": True, "supervisor": True, "usuario": False},
    "asesor": {"etiqueta": "Asesor de ventas", "medio": True, "supervisor": False, "usuario": False},
    "administradora": {"etiqueta": "Administradora de ventas", "medio": False, "supervisor": False,
                       "usuario": True},
    "telemarketing": {"etiqueta": "Asesor de telemarketing", "medio": True, "supervisor": False, "usuario": False},
}

ROLES_POR_EQUIPO: dict[str, list[str]] = {
    "verticalizacion": ["jefe", "supervisor", "asesor"],
    "carabobo": ["jefe_un", "coord_un", "coord_oficina", "supervisor", "asesor"],
    "nacional": ["administradora", "telemarketing"],
    "aragua": ["gerente_un", "gerente_ops", "coord_oficina", "supervisor", "asesor"],
    "la_victoria": ["gerente_un", "gerente_ops", "coord_oficina", "supervisor", "asesor"],
}

ROL_CHOICES = [(rol, spec["etiqueta"]) for rol, spec in ROLES.items()]

# Los roles que cobran por las ventas de unidades de negocio: llevan `unidades`.
ROLES_CON_UNIDADES = tuple(rol for rol, spec in ROLES.items() if spec.get("unidades"))
# Los roles que pueden figurar en `Oportunidad/Administrador`.
ROLES_QUE_SUPERVISAN = tuple(rol for rol, spec in ROLES.items() if spec["supervisor"])


def roles_del_equipo(slug: str) -> list[str]:
    """Los roles de un equipo, en el orden en que se presentan."""
    return list(ROLES_POR_EQUIPO.get(slug, []))


def etiqueta_rol(rol: str) -> str:
    """El nombre legible de un rol."""
    return ROLES.get(rol, {}).get("etiqueta", rol)


# --- Piezas de pago ----------------------------------------------------------------

ALCANCES = ("supervisados", "equipo_completo", "unidades", "oficina")
FACTORES = ("ninguno", "site", "unidad")
TIPOS_MONTO = ("monto", "pct_plan")

PIEZAS_POR_ROL: dict[str, tuple[str, ...]] = {
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

_BONO_30_40_50 = [{"desde": 30, "monto": 120}, {"desde": 40, "monto": 200}, {"desde": 50, "monto": 250}]
_BONO_ASESOR_ARAGUA = [{"desde": 15, "monto": 50}, {"desde": 20, "monto": 80}, *_BONO_30_40_50]
_BONO_POR_ASESOR = [{"desde": 30, "monto": 20}, {"desde": 40, "monto": 25}, {"desde": 50, "monto": 30}]
_TRAMOS_GENERAL = [
    {"desde": 0, "monto": 0, "descontar": 0},
    {"desde": 6, "monto": 5, "descontar": 5},
    {"desde": 20, "monto": 6, "descontar": 0},
    {"desde": 21, "monto": 7, "descontar": 0},
    {"desde": 26, "monto": 8, "descontar": 0},
]
_TRAMOS_ARAGUA = [
    {"desde": 0, "monto": 0, "descontar": 0},
    {"desde": 6, "monto": 5, "descontar": 5},
    {"desde": 15, "monto": 5, "descontar": 0},
    {"desde": 20, "monto": 6, "descontar": 0},
    {"desde": 21, "monto": 7, "descontar": 0},
    {"desde": 26, "monto": 8, "descontar": 0},
]


def _monto(valor: float) -> dict[str, Any]:
    return {"tipo": "monto", "valor": valor}


def _pct_plan(valor: float = 10) -> dict[str, Any]:
    return {"tipo": "pct_plan", "valor": valor}


def _equipo(valor: dict[str, Any], alcance: str, excluir_oficina: bool = False) -> dict[str, Any]:
    return {**valor, "alcance": alcance, "excluir_oficina": excluir_oficina}


PARAMETROS_DEFECTO: dict[tuple[str, str], dict[str, Any]] = {
    # Verticalizacion
    ("verticalizacion", "jefe"): {"propia": _monto(4), "equipo": _equipo(_monto(2), "equipo_completo")},
    ("verticalizacion", "supervisor"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2.5), "supervisados"),
        "factor": "ninguno", "bono_por_asesor": _BONO_POR_ASESOR,
    },
    ("verticalizacion", "asesor"): {
        "tramos_asesor": [{"desde": 0, "monto": 5, "descontar": 0}], "bono_tramos": _BONO_30_40_50,
    },
    # Carabobo
    ("carabobo", "jefe_un"): {
        "equipo": _equipo(_monto(0.8), "unidades", excluir_oficina=True), "bono_por_unidad": {"monto": 50},
    },
    ("carabobo", "coord_un"): {
        "propia": _monto(4), "equipo": _equipo(_monto(0), "unidades", excluir_oficina=True),
        "escalon_crecimiento": {"umbral_pct": 6, "alto": 2, "bajo": 1},
        "bono_churn": [{"max": 3, "monto": 100}, {"max": 1.9, "monto": 200}],
    },
    ("carabobo", "coord_oficina"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2.5), "oficina"), "factor": "site",
    },
    ("carabobo", "supervisor"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2.5), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONO_POR_ASESOR,
    },
    ("carabobo", "asesor"): {"tramos_asesor": _TRAMOS_GENERAL, "bono_tramos": _BONO_30_40_50},
    # Nacional
    ("nacional", "administradora"): {"bono_empresa": {"monto": 100, "excedente": 120}},
    ("nacional", "telemarketing"): {
        "tramos_asesor": [{"desde": 0, "monto": 2, "descontar": 0}], "bono_tramos": _BONO_30_40_50,
    },
    # Aragua
    ("aragua", "gerente_un"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2), "unidades"), "factor": "unidad",
    },
    ("aragua", "gerente_ops"): {"propia": _monto(4), "equipo": _equipo(_monto(1), "unidades")},
    ("aragua", "coord_oficina"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2.5), "oficina"), "factor": "site",
    },
    ("aragua", "supervisor"): {
        "propia": _monto(4), "equipo": _equipo(_monto(2.5), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONO_POR_ASESOR,
    },
    ("aragua", "asesor"): {"tramos_asesor": _TRAMOS_ARAGUA, "bono_tramos": _BONO_ASESOR_ARAGUA},
    # La Victoria: segun el monto del plan (el 10 %: 20$ -> 2, 25$ -> 2.5 ... 70$ -> 7)
    ("la_victoria", "gerente_un"): {
        "propia": _pct_plan(), "equipo": _equipo(_pct_plan(), "unidades"), "factor": "unidad",
    },
    ("la_victoria", "gerente_ops"): {"propia": _pct_plan(), "equipo": _equipo(_pct_plan(), "unidades")},
    ("la_victoria", "coord_oficina"): {
        "propia": _monto(2), "equipo": _equipo(_monto(2), "oficina"), "factor": "site",
    },
    ("la_victoria", "supervisor"): {
        "propia": _pct_plan(), "equipo": _equipo(_pct_plan(), "supervisados"),
        "factor": "unidad", "bono_por_asesor": _BONO_POR_ASESOR,
    },
    ("la_victoria", "asesor"): {"tramos_asesor": _TRAMOS_GENERAL, "bono_tramos": _BONO_30_40_50},
}


def parametros_defecto(slug: str, rol: str) -> dict[str, Any]:
    """Copia de los parametros por defecto de un rol de un equipo (vacios si no existe)."""
    return copy.deepcopy(PARAMETROS_DEFECTO.get((slug, rol), {}))


def parametros_vigentes(slug: str, rol: str, guardados: dict[str, Any] | None) -> dict[str, Any]:
    """Los parametros que valen: los guardados, completados con los de por defecto.

    Una pieza que el rol admite y no esta guardada paga con la de por defecto; una
    que esta guardada manda entera (no se mezcla por dentro).
    """
    base = parametros_defecto(slug, rol)
    if guardados:
        base.update({k: v for k, v in guardados.items() if k in PIEZAS_POR_ROL.get(rol, ())})
    return base


# --- Validacion ---------------------------------------------------------------------

def _numero(valor: Any, que: str, minimo: float | None = 0) -> float:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{que} tiene que ser un número.") from None
    if minimo is not None and n < minimo:
        raise ValueError(f"{que} no puede ser menor que {minimo:g}.")
    return n


def _monto_o_pct(pieza: Any, que: str) -> dict[str, Any]:
    if not isinstance(pieza, dict) or pieza.get("tipo") not in TIPOS_MONTO:
        raise ValueError(f"{que}: el tipo tiene que ser «monto» o «pct_plan».")
    return {"tipo": pieza["tipo"], "valor": _numero(pieza.get("valor"), f"{que}: el valor")}


def _tramos(lista: Any, que: str, *, con_descuento: bool = False) -> list[dict[str, float]]:
    if not isinstance(lista, list) or not lista:
        raise ValueError(f"{que}: no puede quedar vacío.")
    limpios = []
    for t in lista:
        if not isinstance(t, dict):
            raise ValueError(f"{que}: cada tramo necesita «desde» y «monto».")
        desde = int(_numero(t.get("desde"), f"{que}: «desde»"))
        fila: dict[str, float] = {"desde": desde, "monto": _numero(t.get("monto"), f"{que}: «monto»")}
        if con_descuento:
            descontar = int(_numero(t.get("descontar") or 0, f"{que}: «descontar»"))
            if descontar > desde:
                raise ValueError(f"{que}: el tramo desde {desde} ventas no puede descontar {descontar}.")
            fila["descontar"] = descontar
        limpios.append(fila)
    limpios.sort(key=lambda t: t["desde"])
    if len({t["desde"] for t in limpios}) != len(limpios):
        raise ValueError(f"{que}: dos tramos empiezan en la misma cantidad de ventas.")
    if con_descuento and limpios[0]["desde"] != 0:
        raise ValueError(f"{que}: el primer tramo tiene que empezar en 0 ventas.")
    if not con_descuento and limpios[0]["desde"] < 1:
        raise ValueError(f"{que}: los tramos empiezan en 1 venta o más.")
    return limpios


def validar_parametros(rol: str, parametros: Any) -> dict[str, Any]:
    """Los parametros de un rol, comprobados y limpios. Levanta `ValueError`.

    Solo se admiten las piezas del rol (`PIEZAS_POR_ROL`); las que falten se
    dejan sin guardar y pagan con las de por defecto.
    """
    if rol not in PIEZAS_POR_ROL:
        raise ValueError("Rol desconocido.")
    if not isinstance(parametros, dict):
        raise ValueError("Los parámetros tienen que ser un objeto.")
    desconocidas = set(parametros) - set(PIEZAS_POR_ROL[rol])
    if desconocidas:
        raise ValueError(f"{etiqueta_rol(rol)} no admite: {', '.join(sorted(desconocidas))}.")

    limpio: dict[str, Any] = {}
    for clave, pieza in parametros.items():
        if clave == "propia":
            limpio[clave] = _monto_o_pct(pieza, "Venta propia")
        elif clave == "equipo":
            base = _monto_o_pct(pieza, "Venta de equipo")
            alcance = pieza.get("alcance")
            if alcance not in ALCANCES:
                raise ValueError("Venta de equipo: el alcance no es válido.")
            limpio[clave] = {**base, "alcance": alcance, "excluir_oficina": bool(pieza.get("excluir_oficina"))}
        elif clave == "factor":
            if pieza not in FACTORES:
                raise ValueError("El factor de cumplimiento no es válido.")
            limpio[clave] = pieza
        elif clave == "tramos_asesor":
            limpio[clave] = _tramos(pieza, "Tramos del asesor", con_descuento=True)
        elif clave in ("bono_tramos", "bono_por_asesor"):
            limpio[clave] = _tramos(pieza, "Bono por ventas")
        elif clave == "bono_por_unidad":
            limpio[clave] = {"monto": _numero((pieza or {}).get("monto"), "Bono por unidad")}
        elif clave == "escalon_crecimiento":
            pieza = pieza or {}
            limpio[clave] = {
                "umbral_pct": _numero(pieza.get("umbral_pct"), "Umbral de crecimiento", None),
                "alto": _numero(pieza.get("alto"), "Monto con crecimiento"),
                "bajo": _numero(pieza.get("bajo"), "Monto sin crecimiento"),
            }
        elif clave == "bono_churn":
            if not isinstance(pieza, list):
                raise ValueError("Bono por churn: tiene que ser una lista.")
            filas = [
                {"max": _numero(f.get("max"), "Bono por churn: «max»", None),
                 "monto": _numero(f.get("monto"), "Bono por churn: «monto»")}
                for f in pieza
                if isinstance(f, dict)
            ]
            limpio[clave] = sorted(filas, key=lambda f: f["max"], reverse=True)
        elif clave == "bono_empresa":
            pieza = pieza or {}
            limpio[clave] = {
                "monto": _numero(pieza.get("monto"), "Bono de la administradora"),
                "excedente": _numero(pieza.get("excedente"), "Bono por superar el 100 %"),
            }
    return limpio
