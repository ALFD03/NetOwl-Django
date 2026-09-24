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
PERSONA_FORMULARIO = {"nat": "Persona Natural", "PYME": "Persona Jurídica"}
SERVICIO_FORMULARIO = {"FTTH": "Fibra", "RF": "Inalámbrico"}

PERSONA_POR_DEFECTO = "Persona Natural"
SERVICIO_POR_DEFECTO = "Inalámbrico"

# Prefijos de las filas que no salen del catalogo comercial sino de las
# excepciones por orden, agrupadas por velocidad.
PREFIJO_DEDICADO = "Internet Dedicado"
PREFIJO_TRANSPORTE = "Transporte de Datos"

# La reguladora no pide el consumo medido sino el **teorico**: lo que ese plan
# moveria saturado durante un trimestre. La formula es suya, no nuestra:
#   (Mbps -> Kbps) / 8000 -> MB/s, x3600 -> MB/h, x24 -> MB/dia, x90 -> MB/trimestre
SEGUNDOS_POR_HORA = 3600
HORAS_POR_DIA = 24
DIAS_DECLARADOS = 90

# Cuanto de la velocidad contratada se declara como velocidad promedio real.
# Son dos numeros distintos porque la radio comparte el medio y la fibra no.
FACTOR_PROMEDIO = {"RF": 0.5, "FTTH": 0.2}
FACTOR_PROMEDIO_POR_DEFECTO = 0.5


def mbps_texto(mbps: float) -> str:
    """`10.0` -> `10`, `2.5` -> `2.5`. Es lo que va en el nombre sintetizado."""
    return f"{mbps:g}"


def _kbps(mbps: float) -> int:
    return int(round(mbps * 1000))


def _consumo_trimestral_mb(mbps: float, suscriptores: int) -> float:
    """El consumo teorico del plan en MB, por todos sus suscriptores."""
    mb_por_segundo = (mbps * 1000) / 8000
    return mb_por_segundo * SEGUNDOS_POR_HORA * HORAS_POR_DIA * DIAS_DECLARADOS * suscriptores


def _velocidad_promedio_kbps(mbps: float, tecnologia: str) -> int:
    factor = FACTOR_PROMEDIO.get(tecnologia, FACTOR_PROMEDIO_POR_DEFECTO)
    return int(round(mbps * factor * 1000))


def nombre_sintetizado(mbps: float, *, es_transporte: bool) -> str:
    """El nombre con que se declara un grupo de enlaces de la misma velocidad."""
    prefijo = PREFIJO_TRANSPORTE if es_transporte else PREFIJO_DEDICADO
    return f"{prefijo} {mbps_texto(mbps)} Mbps"


def _agregar(filas: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Agrupa las filas por el plan regulador con que se declara cada una.

    El precio se promedia sobre el grupo. Para un regulador del catalogo eso es
    su propio precio repetido, asi que el promedio lo devuelve intacto; para un
    grupo sintetizado —donde cada contrato trae la tarifa que negocio— es la
    unica cifra que representa al grupo entero.
    """
    grupos: dict[str, dict[str, Any]] = {}

    for fila in filas:
        regulador = fila.get("regulador")
        if not regulador:
            continue

        nombre = str(regulador["nombre"]).strip()
        if not nombre:
            continue

        grupo = grupos.get(nombre)
        if grupo is None:
            grupo = grupos[nombre] = {
                "nombre": nombre,
                "tecnologia": regulador.get("tecnologia") or "RF",
                "tipo_persona": regulador.get("tipo_persona") or "nat",
                "datas_mbps": float(regulador.get("datas_mbps") or 0.0),
                "tiene_tv": bool(regulador.get("tiene_tv", False)),
                "es_transporte": bool(regulador.get("es_transporte", False)),
                "suscriptores": 0,
                "_precios": [],
            }

        grupo["suscriptores"] += 1
        grupo["_precios"].append(float(regulador.get("precio") or 0.0))

    for grupo in grupos.values():
        precios = grupo.pop("_precios")
        grupo["precio"] = round(sum(precios) / len(precios), 2) if precios else 0.0

    return grupos


def construir_formularios(
    filas: list[dict[str, Any]],
    entidades: list[str],
) -> dict[str, Any]:
    """Las tres hojas del libro, listas para escribirse tal cual.

    `filas` es una fila por suscriptor activo del cierre, cada una con el plan
    regulador que ya le resolvio `ETAReportManager`. `entidades` son todas las
    entidades federales del catalogo: la reguladora las quiere encadenadas en
    cada fila, no las entidades en que ese plan concreto tiene clientes.

    Los precios salen **sin convertir**, en divisa. Quien exporta multiplica
    por la tasa del BCV.
    """
    cadena_entidades = " / ".join(entidades)
    grupos = _agregar(filas)

    internet: list[dict[str, Any]] = []
    transporte: list[dict[str, Any]] = []
    television: list[dict[str, Any]] = []

    for grupo in sorted(grupos.values(), key=lambda g: g["nombre"]):
        mbps = grupo["datas_mbps"]
        suscriptores = grupo["suscriptores"]
        tecnologia = grupo["tecnologia"]
        persona = PERSONA_FORMULARIO.get(grupo["tipo_persona"], PERSONA_POR_DEFECTO)
        servicio = SERVICIO_FORMULARIO.get(tecnologia, SERVICIO_POR_DEFECTO)

        if grupo["es_transporte"]:
            transporte.append({
                "nombre": grupo["nombre"],
                "suscriptores": suscriptores,
                "precio": grupo["precio"],
                "velocidad_kbps": _kbps(mbps),
            })
            # El transporte solo va en su hoja: no es un plan de internet ni de
            # television, y las columnas que pide son otras.
            continue

        internet.append({
            "nombre": grupo["nombre"],
            "tipo_suscriptor": persona,
            "entidades": cadena_entidades,
            "suscriptores": suscriptores,
            "precio": grupo["precio"],
            "tipo_servicio": servicio,
            "uplink_kbps": _kbps(mbps),
            "downlink_kbps": _kbps(mbps),
            "velocidad_promedio_kbps": _velocidad_promedio_kbps(mbps, tecnologia),
            "consumo_promedio_mb": round(_consumo_trimestral_mb(mbps, suscriptores), 2),
        })

        # Un plan con television aparece en las dos hojas: es un solo producto
        # que presta los dos servicios, y cada formulario declara el suyo.
        if grupo["tiene_tv"]:
            television.append({
                "nombre": grupo["nombre"],
                "tipo_suscriptor": persona,
                "entidades": cadena_entidades,
                "suscriptores": suscriptores,
                "precio": grupo["precio"],
            })

    return {
        "internet": internet,
        "transporte": transporte,
        "television": television,
        "entidades": cadena_entidades,
    }
