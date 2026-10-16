# 15. `services/comisiones/` — Comisiones de la fuerza de ventas

Calcula lo que cobra cada persona de ventas por las suscripciones que vendió.
Se construye mes a mes, unos 15 días después de que termine el mes, cuando las
primeras facturas de lo instalado ya deberían estar pagadas.

```
services/comisiones/
├── models.py            Jerarquía, condiciones, periodos, revisiones, indicadores y lo congelado
├── views.py             Informe, jerarquía, condiciones y sus escrituras
├── urls.py
└── analytics/
    ├── reglas.py        Las reglas de pago, como funciones puras (con doctests)
    ├── calculo.py       Del periodo a las candidatas, su clasificación, sus personas y los pagos
    ├── cierre.py        Cerrar (congelar) y reabrir un periodo
    └── queries.py       Lo que leen las vistas
```

Depende del directorio de ventas (`services/catalogos/models.py:PersonaVentas`,
ver el capítulo 6 §8) y de tres columnas de la importación de suscripciones:
`Medio`, `Oportunidad/Administrador` y `Estado de la factura`.

---

## 1. El periodo: de días promocionales a días promocionales

Un periodo de comisiones **no va del 1 al último día del mes**. Lo instalado en
los *días promocionales* (normalmente desde el 25) no paga la mensualidad del
mes siguiente sino la del otro, así que su comisión es del periodo siguiente.
El periodo de un mes va del inicio de los días promocionales del mes anterior
al día antes de los del mes:

| Periodo | Días promocionales del mes anterior | Del mes | Instalaciones que cuentan |
|---|---|---|---|
| 2026-09 | 25/08 | 24/09 | 25/08 al 23/09, ambos incluidos |
| 2026-10 | 24/09 | 25/10 | 24/09 al 24/10 |

Como los días promocionales se adelantan o se retrasan, **cada periodo guarda
el inicio de los suyos** (`ComisionPeriodo.inicio_promo`) y el siguiente arranca
en él. Al crear un periodo:

1. Si el mes anterior tiene periodo, el inicio es su `inicio_promo` y no se
   pregunta.
2. Si no, se pregunta dónde empezaron los días promocionales del mes anterior.
3. Se confirma el inicio de los del mes, con el día habitual
   (`CondicionesComision.dia_promocional`, 25) como propuesta.

Cambiar el `inicio_promo` de un periodo mueve el inicio del siguiente, así que
no se permite si el siguiente está cerrado. La página avisa si se calcula antes
de `dias_espera` (15) días tras el fin del mes.

## 2. Qué venta cuenta

Las candidatas son las suscripciones con `fecha_inicio` dentro de la ventana,
**más** las que una revisión de otro periodo difirió a este, **menos** las que una
revisión de este difirió a otro y las que ya se pagaron en un periodo cerrado.
Se clasifican con `reglas.clasificar`, según el estado de la factura y si la
suscripción está en progreso **hoy**:

| `Estado de la factura` | En progreso | Clasificación |
|---|---|---|
| Facturado por completo | sí | **válida**: la primera mensualidad se facturó y se pagó |
| Facturado por completo | no | **no pagada**: se facturó y no se pagó. Se pierde: en el corte siguiente ya no aparece |
| Por facturar | sí | **en revisión**: sin primera factura, la campaña pudo exonerar un mes |
| Por facturar | no | excluida |
| Nada por facturar | — | excluida. *La política no dice nada de este caso; se tomó como no pagable* |

**La revisión es manual** (`RevisionComision`): cada venta en revisión se cuenta
en este periodo o se difiere a uno posterior, donde vuelve a ser candidata y se
clasifica con lo que diga entonces su factura. Se puede decidir en bloque.

## 3. Quién cobra por una venta

Las tres columnas del export se cruzan contra el directorio de ventas, sin
distinguir mayúsculas ni el sufijo `(User)` (`core.odoo_nombres.clave_nombre`):

- `Medio` → quien vendió (`PersonaVentas.medio`).
- `Medio/Supervisor` → su supervisor (`medio` también).
- `Vendedor` → el coordinador de oficina (`PersonaVentas.usuario_odoo`).

**Lo que trae la venta manda.** La estructura jerárquica (`PosicionJerarquia`:
asesor → supervisor → coordinador de oficina → coordinador de UN) solo rellena
una columna **vacía** y da **siempre** el coordinador de unidad de negocio, que
Odoo no tiene. Un literal que no está en el directorio no se rellena con la
jerarquía: es un problema de registro, y la venta lo lleva como aviso (y sale
en Catálogos › Notificaciones). Así una venta conserva el equipo con el que se
hizo aunque la persona cambie de equipo después.

## 4. Lo que cobra cada uno

Las reglas viven en `reglas.calcular_pagos`; los montos y tramos, en
`CondicionesComision` (editables en `/comisiones/condiciones/`).

- **PYME** (`Plan.tipo_persona == PYME`): quien la vendió cobra
  `Plan.precio × Plan.comision_pyme_pct`, sea cual sea su cargo y vendiera lo que
  vendiera. Nadie más cobra por ella y **no cuenta para ningún tramo ni equipo**.
  Un plan PYME sin % sale con aviso y sin monto.
- **Asesor**: por tramos de sus ventas residenciales. Cada tramo vale desde
  `desde` ventas; se pagan `(ventas − descontar) × monto`.

  | Ventas | Pago (por defecto) |
  |---|---|
  | 0–5 | nada |
  | 6–19 | (ventas − 5) × 5$ |
  | 20 | 20 × 6$ |
  | 21–25 | ventas × 7$ |
  | 26+ | ventas × 8$ |

- **Supervisor** y **coordinador de oficina**: `monto_equipo` (2.5$) por cada
  venta residencial de su equipo y `monto_directa` (4$) por cada una propia
  (`Medio` es él). El total se multiplica por su **% de cumplimiento del
  objetivo**, con tope en 100%. El cumplimiento se escribe en el informe
  (`IndicadorComision`): la política dice que vendrá de un campo de
  suscripciones que aún no existe. Sin escribir paga como 100% y lo avisa, pero
  **no deja cerrar**. La PYME queda fuera de la multiplicación: es del vendedor
  directo.
- **Coordinador de unidad de negocio**: por cada venta residencial de su
  equipo, el monto del tramo de **crecimiento del mes de sus unidades** (por
  defecto: menos de 1% → 1$, desde 1% → 1.5$, desde 2% → 2$; el 1% exacto no lo
  cubre la política y se puso en 1.5$), y `monto_directa_un` (4$) por cada una
  propia. Sin objetivo.

  El crecimiento sale de Unidades de negocio del **mes natural** del periodo:
  los nodos de todas las unidades (`Coordinador`) que apuntan a la persona,
  agregados con `calculate_aggregation_totals`. Si el mes no está analizado se
  puede escribir a mano en el informe; sin él, sus ventas de equipo no se pagan
  y el periodo no se cierra.

Una venta propia de un supervisor no le cuenta además como venta de equipo
(cobra 4$, no 6.5$), pero sí cuenta como venta de equipo para quienes están por
encima de él.

## 5. Borrador y cierre

**Un borrador no guarda resultados**: el informe se recalcula cada vez que se
abre (medio segundo para un mes de ~3.400 candidatas). **Cerrar lo congela**
(`cierre.cerrar_periodo`): las ventas con su clasificación (`ComisionVenta`), lo
que cobra cada persona (`ComisionPago`, con nombre y cargo copiados), las
condiciones usadas y el resumen. Hace falta porque la tabla de suscripciones se
trunca en cada importación y su estado es siempre el de hoy: recalcular un mes
pasado daría otra cosa. Es el mismo razonamiento que el bloqueo del reporte ETA.

No se cierra con ventas en revisión sin decidir, supervisores o coordinadores
de oficina sin cumplimiento, ni coordinadores de UN sin crecimiento conocido. Las
ventas válidas de un periodo cerrado no vuelven a contar en ningún otro.
Reabrir borra lo congelado y no se permite si el periodo siguiente está cerrado.

## 6. Páginas y permisos

| Página | Contenido | Permiso |
|---|---|---|
| `/comisiones/?periodo=` | El informe: ventana, KPIs, pagos por cargo, revisión, detalle de ventas, exportación a Excel, cierre | `can_view_comisiones` (escribir: `can_manage_comisiones`) |
| `/comisiones/jerarquia/` | El árbol de equipos y a quién responde cada persona | `can_manage_comisiones` |
| `/comisiones/condiciones/` | Tramos, montos, día promocional, días de espera y los % de los planes PYME | `can_manage_comisiones` |

El detalle venta a venta no viaja en los props —un mes son miles de filas—: lo
pide la página a `api/ventas/` la primera vez que hace falta (desglose de una
persona, pestaña de ventas, exportación).
