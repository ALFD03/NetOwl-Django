# 15. `services/comisiones/` — Comisiones de la fuerza de ventas

Calcula lo que cobra cada persona de ventas por las suscripciones que vendió.
Se construye mes a mes, unos 15 días después de que termine el mes, cuando las
primeras facturas de lo instalado ya deberían estar pagadas.

```
services/comisiones/
├── models.py            Supervisores por UN, condiciones, periodos, revisiones, indicadores y lo congelado
├── views.py             Informe, supervisores por UN, condiciones y sus escrituras
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
proceso de pago**. Pagado parcialmente, Revertido y Sin pagar no; Borrador
todavía no se emitió y Cancelado no cuenta. **Que la suscripción siga hoy en
progreso no importa**: si la primera mensualidad está pagada, vale aunque hoy
esté en pausa o cancelada. Hasta que se cierra, el informe se recalcula con lo
último importado: lo que esté pagado el día del cierre es lo que cuenta.

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
| En borrador | **no pagada** |
| «Nada que facturar» sin mensualidad pagada | excluida |
| Todas sus mensualidades canceladas | **en revisión**: ¿exoneración? |
| Sin factura de mensualidad, «Facturado por completo» o «Por facturar» | **en revisión** |
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

Las tres columnas del export se cruzan contra el directorio de ventas, sin
distinguir mayúsculas ni el sufijo `(User)` (`core.odoo_nombres.clave_nombre`):

- `Medio` → quien vendió (`PersonaVentas.medio`).
- `Oportunidad/Administrador` → su supervisor (`PersonaVentas.medio_supervisor`, o el
  `medio` si no lo tiene: Odoo a veces escribe a la misma persona distinto como
  supervisor que como medio, y en Catálogos › Notificaciones ese nombre se
  vincula a quien ya está registrado con «Vincular»).
- `Vendedor` → el coordinador de oficina (`PersonaVentas.usuario_odoo`).

**Lo que trae la venta es lo que cobra**, sin rellenar nada: una venta sin
`Vendedor` no paga a ninguna oficina, y una sin `Oportunidad/Administrador` a ningún
supervisor. Un literal que no está en el directorio es un problema de registro:
la venta lo lleva como aviso (y sale en Catálogos › Notificaciones).

Lo único que Odoo no trae es el **coordinador de unidad de negocio**, y es lo
único que se configura (`SupervisorUnidad`, en `/comisiones/supervisores/`): a
qué coordinador de UN responde cada supervisor. Es independiente de la oficina:
un mismo coordinador de UN tiene supervisores que cargan para oficinas
distintas.

```
Oficina Yanny          Oficina Herminia          ← cobran por las ventas con su Vendedor
   ├── Super1 ─┐          ├── Super3 ─┐
   └── Super2 ─┤          └── Super4 ─┤
               └──── UN Alvaro Maldonado ┘        ← cobra por las de sus cuatro supervisores
```

**Cualquier cargo puede ocupar cualquier columna.** Un coordinador de oficina o
de UN también vende (`Medio`) y supervisa (`Oportunidad/Administrador`); en 2026, 3.049
ventas tienen a la oficina como `Medio` (casi todas también como `Vendedor`) y
1.608 a un coordinador de UN como supervisor. Por eso:

- El coordinador de UN de la venta sale de su supervisor: el que tenga asignado
  si es un supervisor, él mismo si es un coordinador de UN, ninguno si es una
  oficina. Sin supervisor, de quien vendió con la misma regla. Un supervisor sin
  coordinador de UN no le paga a ninguno.
- **Cada persona cobra una venta una sola vez, con la regla de su cargo.** Quien
  vendió cobra la venta propia y nada más; cada uno de los demás, una venta de
  equipo, aunque ocupe dos columnas (la oficina como supervisor y `Vendedor`, el
  coordinador de UN como supervisor y coordinador). Un coordinador de UN que
  supervisa cobra esas ventas con su tramo de crecimiento, no con la tarifa de
  supervisor.

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
  objetivo**, con tope en 100%. La política dice que vendrá de un campo de
  suscripciones que aún no existe; hasta entonces se escribe en el informe un
  **cumplimiento general** del periodo (`ComisionPeriodo.cumplimiento_general_pct`),
  el mismo para todos. Quien tenga uno distinto lo lleva en su fila
  (`IndicadorComision`), y borrarlo lo devuelve al general. Sin ninguno de los
  dos paga como 100% y lo avisa, pero **no deja cerrar**. La PYME queda fuera de la multiplicación: es del vendedor
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

## El informe: cuatro pasos y la nómina por unidad

El informe se recorre en **cuatro pasos**, en el orden en que se prepara un
pago, y abre en el primero que falte: **Revisar ventas** (las `Por facturar`
por decidir, o todas las ventas), **Indicadores** (el cumplimiento general, el
propio de quien lo tenga distinto y el crecimiento de cada coordinador de UN,
todos en una pantalla para que un 9 que debía ser 90 salte a la vista),
**Nómina** y **Cerrar** (lo que falta, enlazado a su paso). Encima, el total a
pagar en $ y en Bs y la tasa CONATEL; la del día, solo como referencia. Los %
se escriben únicamente en Indicadores: la nómina es de solo lectura.

La **nómina** va unidad por unidad: a la izquierda las unidades de negocio, las
oficinas y, al final, lo que no tiene ninguna de las dos, cada una con lo que
cobra y un buscador de personas; a la derecha, la elegida (`lib/nomina.ts`,
`NominaView`).

- **La unidad la encabeza su coordinador de UN**; debajo, cada supervisor con
  sus asesores. Un supervisor va a la unidad donde más supervisa; un asesor, con
  el supervisor con quien más vende y en la unidad de ese supervisor.
- **Las coordinadoras de oficina no son del equipo de un coordinador de UN**:
  van aparte, en su propia sección, y cada una enseña con qué unidades comparte
  ventas. La unidad, a su vez, dice con qué oficinas comparte las suyas.
- **Lo que no tiene unidad va con su oficina**, con la misma forma que una
  unidad: el supervisor sin coordinador de UN, con la oficina con que cargó más
  ventas; el asesor sin supervisor, con la oficina de más ventas suyas (y el
  supervisado por una oficina, con esa oficina). Solo lo que no tiene ni unidad
  ni oficina queda en **«Sin unidad ni oficina»**, al final: en la práctica, los
  contratistas, que no traen supervisor ni `Vendedor`.
- **Cada persona sale una sola vez**, con su pago entero: el tramo de un asesor
  depende de todas sus ventas y no se reparte. Si vendió también con otro
  supervisor, su fila lo dice («+2 con otro supervisor, incluidas»). Así las
  unidades, las oficinas con su equipo y lo de aparte suman exactamente el
  total a pagar.
- Las columnas son las del pago: **ventas pagadas / validadas** (en ámbar cuando
  no se pagan todas: el tramo de un asesor descuenta, o el crecimiento de un
  coordinador de UN es desconocido), el **cumplimiento, crecimiento o tramo** con
  su barra, y lo que cobra en **$** y en **Bs a la tasa CONATEL**. A un
  supervisor o una oficina con cumplimiento por debajo del 100 % se le cuentan
  todas sus validadas y el recorte se ve en dólares («de $487,50»).
- **Quien queda en $0 se ve, atenuado y con el motivo** («4 ventas: no llega a
  6»), para que nadie falte sin explicación.
- Los clientes vendidos y el monto de las ventas se quitaron: no deciden ningún
  pago y se confundían con lo que se paga.
- **Los bolívares de cada fila se redondean a céntimos** y los totales son la
  suma de esas filas (`formato.aBs`/`totalBs`), en la página y en el Excel: la
  columna cuadra al céntimo.

El informe trae `equipos` (una fila por combinación de coordinador de UN,
oficina, supervisor y vendedor con sus ventas válidas, unas trescientas al mes),
`personas` (nombre y cargo de cada id) y `condiciones` (las del cierre si el
periodo está cerrado, si no las vigentes), para armar la nómina y explicar cada
recorte sin mandar las ventas.

### El Excel

`lib/exportar.ts` escribe un libro para leer, no una lista que filtrar:

- **Resumen**: el total en $ y en Bs, la tasa CONATEL y su fuente, cuántos
  cobran, y lo que se paga por cargo, por unidad de negocio (cada oficina con su
  equipo sin unidad como una fila más, y lo de aparte al final, cerrando el
  total) y por oficina.
- **Coord. de UN**, **Oficinas** (con «comparte ventas con»), **Supervisores**
  (por unidad u oficina, con subtotales) y **Asesores** (banda de unidad u
  oficina, sub-banda de supervisor, subtotal por banda y total), en el orden de
  la nómina. Las ventas pagadas de menos van en
  ámbar, quien no cobra en gris, y una columna de observaciones dice el motivo.
- **Ventas**: el detalle venta a venta.

Lo escribe `shared/lib/excel.downloadStyledWorkbook`, que recibe las hojas ya
maquetadas celda a celda.

## 6. Páginas y permisos

| Página | Contenido | Permiso |
|---|---|---|
| `/comisiones/?periodo=` | El informe en cuatro pasos (revisión, indicadores, nómina por unidad, cierre), total a pagar y tasas, exportación a Excel. La revisión tiene cinco vistas: por decidir, días promocionales del mes anterior (qué se cobró allí; confirmación en el primer periodo), días promocionales del mes (quién adelantó el pago), agregadas a mano (con el formulario para agregar) y todas las ventas | `can_view_comisiones` (escribir: `can_manage_comisiones`) |
| `/comisiones/supervisores/` | A qué coordinador de UN responde cada supervisor (uno a uno o en bloque) | `can_manage_comisiones` |
| `/comisiones/condiciones/` | Tramos, montos, día promocional, días de espera, día de corte de los adelantos y los % de los planes PYME. Se abre en lectura (quién cobra qué, tramos con sus saltos y un simulador, fechas de un periodo de ejemplo, última modificación y quién la hizo); «Editar» muestra los cambios pendientes y los errores antes de guardar | `can_manage_comisiones` |

El detalle venta a venta no viaja en los props —un mes son miles de filas—: lo
pide la página a `api/ventas/` la primera vez que hace falta (desglose de una
persona, las vistas de días promocionales y de todas las ventas, exportación).
Las agregadas a mano, que son pocas, sí viajan en los props (`informe.manuales`).
