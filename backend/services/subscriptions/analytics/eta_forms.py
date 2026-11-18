"""Los formularios que la reguladora pide rellenar, a partir del cierre del mes.

El reporte ETA (`eta_report.py`) responde a "cuantos suscriptores hay por
tecnologia, persona y entidad". Los formularios preguntan otra cosa: **una fila
por producto declarado**, con su velocidad, su renta y su consumo teorico. Son
tres hojas y cada una tiene sus propias columnas:

1. **Internet** — los planes residenciales y el internet dedicado.
2. **Transporte de datos** — enlaces, con medio de transmision y numero de enlaces.
3. **Television** — desglose por modalidad de pago, con la parrilla de canales.

De donde sale cada fila:

- Un plan del catalogo comercial se declara por su **plan regulador**
  (`Plan.plan_regulador`). Varios planes comerciales colapsan en uno: la misma
  velocidad con dos tarifas es un solo producto ante la reguladora, y
  declararla dos veces cuenta los suscriptores dos veces.
- El internet dedicado y el transporte no estan en el catalogo comercial —cada
  contrato tiene su velocidad— asi que su fila se **sintetiza** agrupando las
  excepciones por orden que comparten velocidad: `Internet Dedicado 10 Mbps`,
  `Transporte de Datos 100 Mbps`. Si alguien registra un plan regulador con ese
  mismo nombre, gana el del catalogo: es la forma de corregir a mano la renta o
  la tecnologia de un grupo sin tocar orden por orden.

Los precios viajan **en divisa, sin convertir**. La renta basica en bolivares
es el precio por la tasa del BCV, y la tasa se aplica al exportar: guardarla
aqui congelaria el formulario a la tasa que hubiera el dia del calculo.
"""

from __future__ import annotations

from typing import Any

# Etiquetas con que la reguladora nombra lo que el catalogo guarda como codigo.
PERSON_FORM = {"nat": "Persona Natural", "PYME": "Persona Jurídica"}
FORM_SERVICE = {"FTTH": "Fibra", "RF": "Inalámbrico"}

DEFAULT_PERSON = "Persona Natural"
DEFAULT_SERVICE = "Inalámbrico"

# Prefijos de las filas que no salen del catalogo comercial sino de las
# excepciones por orden, agrupadas por velocidad.
DEDICATED_PREFIX = "Internet Dedicado"
TRANSPORT_PREFIX = "Transporte de Datos"

# La reguladora no pide el consumo medido sino el **teorico**: lo que ese plan
# moveria saturado durante un trimestre. La formula es suya, no nuestra:
#   (Mbps -> Kbps) / 8000 -> MB/s, x3600 -> MB/h, x24 -> MB/dia, x90 -> MB/trimestre
SECONDS_PER_HOUR = 3600
HOURS_PER_DAY = 24
DECLARED_DAYS = 90

# Cuanto de la velocidad contratada se declara como velocidad promedio real.
# Son dos numeros distintos porque la radio comparte el medio y la fibra no.
AVERAGE_FACTOR = {"RF": 0.5, "FTTH": 0.2}
DEFAULT_AVERAGE_FACTOR = 0.5


def mbps_text(mbps: float) -> str:
    """`10.0` -> `10`, `2.5` -> `2.5`. Es lo que va en el nombre sintetizado."""
    return f"{mbps:g}"


def _kbps(mbps: float) -> int:
    return int(round(mbps * 1000))


def _quarterly_usage_mb(mbps: float, subscribers: int) -> float:
    """El consumo teorico del plan en MB, por todos sus suscriptores."""
    mb_per_second = (mbps * 1000) / 8000
    return mb_per_second * SECONDS_PER_HOUR * HOURS_PER_DAY * DECLARED_DAYS * subscribers


def _average_speed_kbps(mbps: float, technology: str) -> int:
    factor = AVERAGE_FACTOR.get(technology, DEFAULT_AVERAGE_FACTOR)
    return int(round(mbps * factor * 1000))


def synthesized_name(mbps: float, *, is_transport: bool) -> str:
    """El nombre con que se declara un grupo de enlaces de la misma velocidad."""
    prefix = TRANSPORT_PREFIX if is_transport else DEDICATED_PREFIX
    return f"{prefix} {mbps_text(mbps)} Mbps"


def _add(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Agrupa las filas por el plan regulador con que se declara cada una.

    El precio se promedia sobre el grupo. Para un regulador del catalogo eso es
    su propio precio repetido, asi que el promedio lo devuelve intacto; para un
    grupo sintetizado —donde cada contrato trae la tarifa que negocio— es la
    unica cifra que representa al grupo entero.
    """
    groups: dict[str, dict[str, Any]] = {}

    for row in rows:
        regulator = row.get("regulador")
        if not regulator:
            continue

        name = str(regulator["nombre"]).strip()
        if not name:
            continue

        group = groups.get(name)
        if group is None:
            group = groups[name] = {
                "nombre": name,
                "tecnologia": regulator.get("tecnologia") or "RF",
                "tipo_persona": regulator.get("tipo_persona") or "nat",
                "datas_mbps": float(regulator.get("datas_mbps") or 0.0),
                "tiene_tv": bool(regulator.get("tiene_tv", False)),
                "es_transporte": bool(regulator.get("es_transporte", False)),
                "suscriptores": 0,
                "_precios": [],
            }

        group["suscriptores"] += 1
        group["_precios"].append(float(regulator.get("precio") or 0.0))

    for group in groups.values():
        prices = group.pop("_precios")
        group["precio"] = round(sum(prices) / len(prices), 2) if prices else 0.0

    return groups


def build_forms(
    rows: list[dict[str, Any]],
    entities: list[str],
) -> dict[str, Any]:
    """Las tres hojas del libro, listas para escribirse tal cual.

    `filas` es una fila por suscriptor activo del cierre, cada una con el plan
    regulador que ya le resolvio `ETAReportManager`. `entidades` son todas las
    entidades federales del catalogo: la reguladora las quiere encadenadas en
    cada fila, no las entidades en que ese plan concreto tiene clientes.

    Los precios salen **sin convertir**, en divisa. Quien exporta multiplica
    por la tasa del BCV.
    """
    chain_entities = " / ".join(entities)
    groups = _add(rows)

    internet: list[dict[str, Any]] = []
    transport: list[dict[str, Any]] = []
    television: list[dict[str, Any]] = []

    for group in sorted(groups.values(), key=lambda g: g["nombre"]):
        mbps = group["datas_mbps"]
        subscribers = group["suscriptores"]
        technology = group["tecnologia"]
        person = PERSON_FORM.get(group["tipo_persona"], DEFAULT_PERSON)
        service = FORM_SERVICE.get(technology, DEFAULT_SERVICE)

        if group["es_transporte"]:
            transport.append({
                "nombre": group["nombre"],
                "suscriptores": subscribers,
                "precio": group["precio"],
                "velocidad_kbps": _kbps(mbps),
            })
            # El transporte solo va en su hoja: no es un plan de internet ni de
            # television, y las columnas que pide son otras.
            continue

        internet.append({
            "nombre": group["nombre"],
            "tipo_suscriptor": person,
            "entidades": chain_entities,
            "suscriptores": subscribers,
            "precio": group["precio"],
            "tipo_servicio": service,
            "uplink_kbps": _kbps(mbps),
            "downlink_kbps": _kbps(mbps),
            "velocidad_promedio_kbps": _average_speed_kbps(mbps, technology),
            "consumo_promedio_mb": round(_quarterly_usage_mb(mbps, subscribers), 2),
        })

        # Un plan con television aparece en las dos hojas: es un solo producto
        # que presta los dos servicios, y cada formulario declara el suyo.
        if group["tiene_tv"]:
            television.append({
                "nombre": group["nombre"],
                "tipo_suscriptor": person,
                "entidades": chain_entities,
                "suscriptores": subscribers,
                "precio": group["precio"],
            })

    return {
        "internet": internet,
        "transporte": transport,
        "television": television,
        "entidades": chain_entities,
    }
