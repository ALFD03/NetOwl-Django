# 15. `services/comisiones/` — Comisiones de la fuerza de ventas

Calcula lo que cobra cada persona de ventas por las suscripciones que vendió.
Se construye mes a mes, unos 15 días después de que termine el mes, cuando las
primeras facturas de lo instalado ya deberían estar pagadas.

```
services/comisiones/
├── models.py            Ventana de pago, periodos, revisiones, indicadores y lo congelado
├── views.py             Informe, ventana de pago y sus escrituras
├── urls.py
└── analytics/
    ├── reglas.py        Las reglas que deciden si una venta cuenta, como funciones puras (con doctests)
    ├── pagos.py         El motor de pago por equipo y rol: cuánto se paga por una venta que ya cuenta (con doctests)
    ├── calculo.py       Del periodo a las candidatas, su clasificación, sus personas, indicadores y pagos
    ├── cierre.py        Cerrar (congelar) y reabrir un periodo
    └── queries.py       Lo que leen las vistas
```

Depende del directorio de ventas y de los equipos (`services/catalogos/`:
`PersonaVentas`, `MembresiaEquipo`, `CondicionesEquipo` y `equipos.py`; ver el
capítulo 6 §8) y de tres columnas de la importación de suscripciones: `Medio`,
`Oportunidad/Administrador` y `Estado de la factura`.

---

## 1. El periodo: de los días promocionales del mes anterior al fin de mes

Un periodo de comisiones **no va del 1 al último día del mes**. Lo instalado en
los *días promocionales* (normalmente desde el 25) no paga la mensualidad del
mes siguiente sino la del otro, así que su comisión es, por norma, del periodo
siguiente. El periodo de un mes va del inicio de los días promocionales del mes
anterior **al fin del mes**, en tres tramos (`reglas.tramo`):

| Tramo | 2026-09 | Qué cuenta |
|---|---|---|
| Días promocionales del mes anterior (`promo_anterior`) | 25/08 al 31/08 | Todo, salvo lo que ya se cobró en el periodo anterior porque el cliente adelantó la mensualidad |
| El mes (`regular`) | 01/09 al 24/09 | Todo |
| Días promocionales del mes (`promo`) | 25/09 al 30/09 | **Solo lo que adelantó el pago**: primera mensualidad pagada hasta el corte. Lo demás es `diferida` y cuenta en el periodo siguiente |

**El pago adelantado.** Un cliente instalado el 28/09 paga normalmente su
primera mensualidad el 1/11, y su comisión es de octubre. Si la adelanta y la
paga el 7/10, cuando se saca el informe de septiembre (hacia el 22/10) ya está
pagada: entra en septiembre y, al cerrarlo, octubre ya no la cuenta (es una
venta válida de un periodo cerrado). El corte es `ComisionPeriodo.corte_adelantos`,
propuesto el día `CondicionesComision.dia_corte` (22) del mes siguiente y
editable por periodo; lo pagado después del corte ya va al siguiente.

**El corte es la ventana de pago de todo el periodo, no solo de los días
promocionales.** Una venta de `regular` o de `promo_anterior` que no tiene la
primera mensualidad pagada hasta el corte es **no pagada**, aunque el export
traiga facturas de los meses siguientes pagadas: las facturas creadas después
del corte ni se miran (`primera_mensualidad(..., hasta=corte)`) y una pagada
después del corte es como si no se hubiera pagado (`clasificar(..., corte=)`).
Ejemplo: SUB119892, instalada el 25/08, con la mensualidad del 05/09 cancelada a
los 25 días y otra del 01/11; para septiembre (corte 22/10) la del 01/11 no
existe, así que queda excluida por la cancelación, se pague o no la de noviembre.

**Cuándo se pagó** sale del export de facturas: la «Fecha del último pago». Si el
export cargado no la trae, la «Última actualización el» (pagar la factura la
actualiza, así que el pago no es posterior) y, si tampoco, el «Creado el», que es
solo una aproximación; la página avisa (`reglas.fecha_del_pago`).

**Lo del mes anterior.** Con el periodo anterior **cerrado**, lo que validó ya
no cuenta (`Ya se pagó en …`) y no hay nada que decidir. Con el anterior **en
borrador**, este no se puede cerrar: hasta entonces no se sabe qué se cobró
allí. **Sin periodo anterior** (el primero del sistema) se cobró fuera de él, así
que se confirma a mano en «Días promocionales del mes anterior». Solo se
pregunta por lo que pudo cobrarse allí: las instalaciones que, por sus facturas,
cuentan aquí y pagaron la primera mensualidad hasta el corte de ese mes (el 22
del mes del periodo). Lo que pagó después toca aquí sin más, y lo que otra regla
ya resolvió (no pagada, excluida, decidida en Revisión) no aparece. Cada una se
decide `ya_pagada` (excluida) o `normal` (se clasifica por sus facturas): una a
una, las marcadas con la casilla o todas las pendientes de una vez. Las
decisiones van en `RevisionComision`; hasta que estén todas, no se cierra.

Como los días promocionales se adelantan o se retrasan, **cada periodo guarda
el inicio de los suyos** (`ComisionPeriodo.inicio_promo`) y el siguiente arranca
en él. Al crear un periodo:

1. Si el mes anterior tiene periodo, el inicio es su `inicio_promo` y no se
   pregunta.
2. Si no, se pregunta dónde empezaron los días promocionales del mes anterior.
3. Se confirma el inicio de los del mes, con el día habitual
   (`CondicionesComision.dia_promocional`, 25) como propuesta, y el corte de
   los adelantos (un día del mes siguiente).

Cambiar el `inicio_promo` de un periodo mueve el inicio del siguiente, así que
no se permite si el siguiente está cerrado. La página avisa si se calcula antes
de `dias_espera` (15) días tras el fin del mes: algunas primeras mensualidades
pueden no estar pagadas aún.

## 2. Qué venta cuenta

Las candidatas son las suscripciones con `fecha_inicio` dentro de la ventana,
**menos** las que ya se pagaron en un periodo cerrado, **más** las agregadas a
mano (`VentaManual`): una venta agregada a mano cuenta en el periodo se
instalara cuando se instalara y digan lo que digan sus facturas, con una nota
obligatoria; tiene que estar en suscripciones (de ahí sale quién cobra) y no se
puede agregar si ya se pagó en otro periodo cerrado. Lo que paga la comisión es
la **primera mensualidad**, y sale del export de facturas (Importaciones ›
Suscripciones › Facturas, tabla `subscriptions-facturas`, global y reemplazado
en cada carga). Sin facturas importadas el informe no se calcula.

**La primera mensualidad** (`reglas.primera_mensualidad`) es la primera factura,
por `Creado el`, con una línea cuyo producto es un plan del catálogo (la de
instalación o la del router no lo son; la referencia `[...]` que Odoo antepone
al producto se ignora). **Las canceladas no cuentan**, sean del mes que sean: se
evalúa la primera que no lo esté, y si todas lo están la venta va a revisión. Si
a la elegida se le **revirtió** el pago y en el **mismo mes** se emitió otra,
manda la más nueva: un pago revertido suele ser uno que no llegó al banco y el
cliente volvió a pagar. Una factura de otro mes ya es la mensualidad siguiente y
no la sustituye.

Solo cuenta como pagada una factura **Registrada** con el pago **Pagado** o **En
proceso de pago**. **Pagado parcialmente** no cuenta (sí contaba antes de los equipos);
Revertido y Sin pagar tampoco; Borrador
todavía no se emitió y Cancelado no cuenta. **Que la suscripción siga hoy en
progreso no importa**: si la primera mensualidad está pagada, vale aunque hoy
esté en pausa o cancelada. Hasta que se cierra, el informe se recalcula con lo
último importado, pero lo que cuenta es lo pagado **hasta el corte**, no hasta el día en que se cierra.

`reglas.clasificar`, en este orden:

| Caso | Clasificación |
|---|---|
| La suscripción está en «Cotización» o «Instalación» | excluida, también con una decisión manual: todavía no es un servicio |
| Hoy está «Cancelado» y se canceló antes de cumplir un mes desde la instalación | excluida, también con una decisión manual. El día de la cancelación es el primer log de su último tramo `6_churn`; un mes llega hasta el mismo día del mes siguiente (instalada el 1/9 y cancelada el 30/9 no lo cumplió) |
| Hay una decisión manual | la decisión: **válida** si se cuenta, excluida si no |
| Hoy es gratuita y la mensualidad está pagada | **en revisión** |
| Hoy es gratuita | excluida: no paga comisión |
| Pagada, sea cual sea el estado de la factura de la suscripción | **válida**: la factura ya se pagó. Si la suscripción dice «Por facturar» y la factura es de otro plan, se apunta como cambio de plan (Odoo factura el nuevo y deja la venta por facturar) |
| Registrada sin pagar (o pagada en parte, o revertida) | **no pagada** |
| En borrador con el pago «Pagado» o «En proceso de pago» | **válida**: el estado de pago manda sobre el del documento (el motivo lo dice: «la factura sigue en borrador»). Una cancelada no cuenta aunque diga «Pagado» |
| En borrador sin ese pago | **no pagada** |
| «Nada que facturar» sin mensualidad pagada | excluida |
| Todas sus mensualidades canceladas, la última a 20 días o más de emitida («Creado el» → «Última actualización el») | excluida: el cliente no pagó |
| Todas sus mensualidades canceladas, la última a menos de 20 días de emitida, o sin una de las dos fechas | **en revisión** |
| Sin factura de mensualidad, «Facturado por completo» o «Por facturar» | **no pagada**: sin factura no se paga |
| Sin factura ni estado de factura | excluida |

**Gratuita** es lo mismo que en el análisis mensual: archivada en el export
(`activo` falso), una tarifa «Gratis», o un «Suscripción archivada» como último
log de archivado. Es el caso de la suscripción que pagó su instalación y pasó a
plan gratuito: su mensualidad se cancela y no se paga comisión.

**La revisión es manual** (`RevisionComision`): cada venta en revisión se cuenta
en este periodo o no se cuenta. Una venta solo es candidata en el periodo en que
se instaló, así que no contarla es que no se paga. **La decisión manda sobre lo
que digan las facturas**, también si después cambian, hasta que se deshace; la
tabla de revisión muestra igualmente qué dicen (`motivo_analisis`). Se puede
decidir en bloque —las marcadas con la casilla, o todas las pendientes—, y
«Deshacer» la devuelve a Revisión.

Antes de las facturas la validez se deducía del estado de la factura de la
suscripción y de si seguía en progreso, y un log «Plan change» hacía válida una
venta por facturar. Las dos reglas se quitaron: la factura lo dice directamente.
Las decisiones de revisión de los periodos sin cerrar se reiniciaron
(`comisiones/0006`), porque se tomaron sin ese dato.

## 3. Quién cobra por una venta

La venta lo dice todo y no se rellena nada: `Medio` es quien vendió,
`Oportunidad/Administrador` su supervisor y `Vendedor` la coordinadora de oficina,
cada uno contra su literal en el directorio (`PersonaVentas.medio`,
`.medio_supervisor`, `.usuario_odoo`). Un literal sin registrar es un problema de
registro y se avisa; una venta sin `Vendedor` no paga a ninguna oficina.

- **El equipo de la venta es el de su `Medio`** (si no está, el de su supervisor y
  luego el de su `Vendedor`). Quien está en varios equipos —el gerente de
  operaciones lo está en Aragua y La Victoria— se desempata con las demás personas de la venta.
- **Las unidades de negocio de la venta** salen de la cadena supervisor → su
  superior (`MembresiaEquipo.superior`): el coordinador de UN lleva una, los jefes y
  gerentes varias. Sin supervisor, las de quien vendió. Nada se deduce de la zona de la venta.
- **Cualquier rol puede ocupar cualquier columna.** Una coordinadora de oficina o un
  coordinador de UN también vende (`Medio`) y supervisa. Cada persona cobra una venta
  **una sola vez, con la regla de su rol en ese equipo**: quien vendió, la propia; los
  demás que tengan la venta en su **alcance**, una de equipo.
- **El alcance** (`equipo.alcance` de las condiciones del rol): `supervisados` (es el
  supervisor de la venta), `oficina` (es su `Vendedor`), `unidades` (la venta es de
  una unidad que lleva) o `equipo_completo` (cualquier venta del equipo).
  `excluir_oficina` deja fuera las ventas que hizo una coordinadora de oficina.
- **Una venta de oficina** es la que hizo la propia coordinadora como `Medio`.

## 4. Lo que cobra cada uno

Los equipos y sus roles son código (`services/catalogos/equipos.py`); los valores
se editan en Catálogos › Ventas › *equipo* › Condiciones de pago
(`CondicionesEquipo`). Un rol sin fila paga con `PARAMETROS_DEFECTO`, que
reproduce la política. El motor es `analytics/pagos.py:calcular_pagos`, una
función pura con doctests.

| Pieza | Qué paga |
|---|---|
| `propia` / `equipo` | Un monto por venta, o un % del precio del plan (La Victoria: el 10 %, 20$ → 2$ … 70$ → 7$) |
| `tramos_asesor` | Por ventas propias residenciales: cada tramo vale desde su cantidad; se pagan `(ventas − descontar) × monto` |
| `bono_tramos` | Un monto único según las ventas propias (el último tramo alcanzado) |
| `bono_por_asesor` | El supervisor cobra por **cada asesor suyo** que llega al tramo; el asesor es de quien más le supervisa |
| `bono_por_unidad` | El jefe de UN: un monto por unidad × su % de ingresos (tope 100 %) |
| `escalon_crecimiento` | El coordinador de UN: por venta de equipo, el monto alto si el crecimiento de su unidad llega al umbral (6 %), si no el bajo |
| `bono_churn` | El coordinador de UN: según el churn bruto de su unidad (≤ 3 → 100$, ≤ 1,9 → 200$; vale el tramo más exigente que cumple) |
| `bono_empresa` | La administradora: por debajo del 100 % de ventas de la empresa, el monto proporcional (80 % → 80$); al 100 %, 100$; por encima, 120$ |
| `factor` | Multiplica lo que cobra por ventas (propias + equipo): el % de ventas de su site o el promedio de sus unidades, con tope del 100 % |

Neto = (propias + equipo) × factor + PYME + bonos. **Los bonos no se multiplican
por el factor.** La **PYME** la cobra solo quien la vendió, un `Plan.precio ×
Plan.comision_pyme_pct`, en todos los equipos: no cuenta para tramos, equipos ni factor.

Equipos y roles (los valores por defecto son los de la política):

- **Verticalización**: jefe (2$ por venta del equipo, 4$ propia), supervisor (2,5$ / 4$ + bono por asesor 30/40/50 → 20/25/30), asesor (5$ plano + bono 30/40/50 → 120/200/250).
- **Carabobo**: jefe de UN (0,8$ por venta de sus unidades sin las de oficina + 50$ por unidad según su % de ingresos), coordinador de UN (4$ propia, escalón de crecimiento y bono por churn), coordinadora de oficina (4$ propia, 2,5$ de equipo, × % de su site), supervisor (2,5$ / 4$, × % de su unidad, bono por asesor), asesor (tramos 6–19 → 5$ descontando 5, 20 → 6$, 21–25 → 7$, 26+ → 8$; bono 30/40/50).
- **Nacional**: administradora (bono por la empresa), telemarketing (2$ + bono 30/40/50).
- **Aragua**: gerente de UN (2$ de sus unidades, 4$ propia, × % de su unidad), gerente de operaciones (1$ / 4$), coordinadora de oficina, supervisor, asesor (con un tramo extra de 15–19 → 5$ sin descuento y bono desde 15).
- **La Victoria**: gerente de UN, gerente de operaciones, supervisor y asesor como los anteriores pero «según el monto del plan»; coordinadora de oficina 2$.

Decisiones que la política deja abiertas y quedan en los valores por defecto: 25
ventas es el tramo de 7$ (la política salta de «21 a 24» a «más de 25»); el bono
por churn se lee en dólares.

### Los indicadores

`calculo._indicadores` los resuelve y `cumplimiento_sites.indicadores_del_mes` los
calcula en el servidor, con la misma regla que el cliente (`lib/objetivos.ts`,
`lib/commercial.ts`) para el total de un grupo —nodo a nodo, del nivel del grupo
hacia arriba: en un site sucursal → estado → site, en una unidad además coordinador;
sin las zonas sin objetivo; sin recortar—. **El cliente y el servidor tienen que decir lo mismo.**

- **% Ventas** = instalaciones / meta; **% Ingresos** = crecimiento neto / meta.
- **Factor**: el de su site (coordinadora de oficina) o el promedio simple de las
  unidades que le tocan (supervisor por su superior; gerente por las suyas).
- **Crecimiento y churn bruto** de la unidad del coordinador de UN; **% de ingresos**
  de cada unidad (jefe); **% de ventas de la empresa** (administradora).
- Precedencia del factor y del crecimiento: lo escrito para la persona
  (`IndicadorComision`) → lo calculado → ninguno (el factor paga como 100 % y
  bloquea el cierre). El resto no tiene valor a mano: sin el análisis del mes no se
  pagan y el cierre espera. **Nada se deduce de las ventas.**
- La coordinadora de oficina ve además su % de ventas de oficina (sus ventas como
  `Medio` contra su objetivo), que no paga.

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
Tiene permiso propio (`can_reopen_comisiones`), exige un motivo de al menos 10
caracteres y el periodo escrito a mano, y **antes de borrar copia el cierre
entero** —periodo, condiciones, resumen, cada venta y cada pago— en
`ComisionCierreArchivado` (`comisiones_cierres_archivados`), con quién cerró,
quién reabrió, cuándo y por qué. Copia y borrado van en una transacción con la
fila del periodo bloqueada. Cada reapertura deja una versión más; las versiones
no se editan ni se borran (el modelo lo impide y la FK es `PROTECT`), y desde el
paso de cierre se descarga cada una como el mismo Excel de la nómina.

**Borrar un informe** (`api/periodo/borrar/`) tiene también permiso propio
(`can_delete_comisiones`, cerrado para todos). Solo vale para un borrador que
**nunca se cerró**: se lleva el periodo con sus revisiones, sus ventas a mano y
sus indicadores, sin copia. El botón abre un modal que avisa de lo que se pierde
y pide el periodo escrito a mano, que el servidor vuelve a comprobar. Un periodo
cerrado se reabre antes; uno con cierres archivados no se borra nunca, porque
esos cierres son el historial de lo que se pagó.

## Bolívares: la tasa CONATEL del mes siguiente

Las comisiones se calculan en dólares y se pagan el mes siguiente (las de
septiembre, en octubre), así que el informe las pasa a bolívares con la **tasa
CONATEL de ese mes siguiente**: el valor del bolívar oficial **el día 1**. Si el
BCV no publicó ese día (fin de semana o feriado), la vigente: la última publicada
antes, y la fuente lo dice (`bcv.consultar_tasa_vigente_el`). Es independiente
del reporte ETA, que declara con el primer día *publicado* del mes (hacia
delante). Se consulta una vez y se guarda en el periodo
(`ComisionPeriodo.tasa_conatel`, `tasa_conatel_publicada`): el valor de un día
pasado no cambia. Un mes que aún no empezó no tiene tasa, y un fallo del
servicio se avisa sin romper el informe.

Como referencia se enseña también la **tasa del día** (`api/tasa-actual/`), que
no se guarda y se pide aparte para no frenar la página. La nómina y el Excel
enseñan solo los bolívares a la tasa CONATEL: la del día es una referencia y no
se paga con ella.

## El informe: cuatro pasos y la nómina por equipo

Revisar las ventas por facturar → **indicadores** (cada % en una pantalla: cumplimiento, crecimiento y
churn, ingresos de las unidades y de la empresa) → **nómina**, de solo lectura → **cerrar**.

La nómina es para quien paga. A la izquierda, los equipos con lo que cobra cada uno; a la derecha,
el elegido: sus roles de dirección (jefe, coordinadores, gerentes, oficinas, administradora) como
secciones, y los supervisores cada uno con sus asesores. Cada persona sale **una vez por equipo**,
con su pago entero, así que los equipos suman el total. Los de $0 se ven atenuados con el motivo.

### El Excel

Un **Resumen** (total en $ y Bs, tasa, y lo que se paga por equipo y rol), **una hoja por equipo**
maquetada como la nómina, y **Ventas**, el detalle venta a venta. Los bolívares de cada fila se
redondean a céntimos y los totales son la suma de esas filas.

Lo escribe `shared/lib/excel.downloadStyledWorkbook`, que recibe las hojas ya
maquetadas celda a celda.

## 6. Páginas y permisos

| Página | Contenido | Permiso |
|---|---|---|
| `/comisiones/?periodo=` | El informe en cuatro pasos (revisión, indicadores, nómina por equipo, cierre), total a pagar y tasas, exportación a Excel. La revisión tiene cinco vistas: por decidir, días promocionales del mes anterior (qué se cobró allí; confirmación en el primer periodo), días promocionales del mes (quién adelantó el pago), agregadas a mano (con el formulario para agregar) y todas las ventas | `can_view_comisiones` (escribir: `can_manage_comisiones`) |
| `/comisiones/condiciones/` | Solo la ventana de pago (día promocional, días de espera, día de corte de los adelantos) y los % de los planes PYME. Cuánto cobra cada rol de cada equipo se edita en **Catálogos › Ventas**. Se abre en lectura; «Editar» muestra los cambios pendientes y los errores antes de guardar | `can_manage_comisiones` |

El detalle venta a venta no viaja en los props —un mes son miles de filas—: lo
pide la página a `api/ventas/` la primera vez que hace falta (desglose de una
persona, las vistas de días promocionales y de todas las ventas, exportación).
Las agregadas a mano, que son pocas, sí viajan en los props (`informe.manuales`).
