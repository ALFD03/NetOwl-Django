# 13 · Glosario

Vocabulario de negocio y de código, con el nombre exacto que usa el sistema.

## Suscripciones y churn

| Término | Definición |
|---|---|
| **Orden** (`orden`, `orden_producto`) | La referencia de la suscripción en Odoo. Es la clave de todo el dominio |
| **Periodo** | Un mes, o un corte dentro de él. Su etiqueta (`"2025-03-01 al 2025-03-31"`) es la clave `periodo_reporte` de casi todas las tablas |
| **Cierre** | El corte al último día del mes. `Periodo.es_cierre_oficial()` lo distingue |
| **Base activa** | Suscripciones cuyo último log hasta la fecha las deja en `3_progress` |
| **Activos inicio / final** | La base al empezar (estrictamente antes de la fecha de inicio) y al cerrar el periodo |
| **Nuevos** | Suscripciones con fecha de inicio dentro del periodo **y** con alguna actividad registrada |
| **Bajas netas** | `activos_inicio − (activos_final − nuevos − gratuitos_retornados) − gratuitos_nuevos` |
| **Bajas brutas** | Bajas netas + las reactivaciones que no estaban en la base al inicio. Es la cifra que se reporta como «bajas» |
| **Churn neto / bruto** | Cada una de las anteriores sobre los activos al inicio, en porcentaje |
| **Reactivación** | Vuelta a activo desde un estado inactivo, o un log cuyo texto la nombra. **Un alta nueva no es una reactivación** |
| `react_4_P` / `react_4_H` | Reactivación desde pausa de alguien que **ya estaba** en la base al inicio (`P`) o que **no** estaba (`H`) |
| `react_val` | Las reactivaciones que realmente **añaden** base: `react_6_churn + react_8_30days + react_4_H` |
| **Winback** | `reactivaciones / inactivos_al_inicio × 100` |
| **Índice de reemplazo** | Qué parte de las bajas brutas cubren las reactivaciones válidas |
| **Tasa de aporte** | Qué parte del crecimiento bruto viene de reactivaciones y no de altas |
| **Adiciones netas / brutas** | `nuevos − bajas_brutas`, y lo mismo sumando las reactivaciones que no estaban |
| **Corte por impago** | El log automático de suspensión por factura impaga |
| **Inactivo** | Último estado conocido en `4_paused`, `6_churn` o `8_30days` |
| **Cliente gratuito / archivado** | Migrado a un servicio gratuito (`9_free`). **Ni activo ni baja** |
| **ARPU** | Facturación de los activos al cierre dividida entre su número |
| **Dimensión** | Eje de desglose: `zona`, `sucursal`, `municipio`, `campanna`, `producto`, `zona_sucursal` |
| **Log sintético** | Un log fabricado por `rules.py` para cubrir un hueco del histórico de Odoo. Va marcado con `_sintetico` |
| **`Cancelado`** | La marca que Odoo deja como producto de una baja. **No es un plan** |

### Estados internos

| Código | Significado |
|---|---|
| `3_progress` | Activa |
| `4_paused` | En pausa |
| `6_churn` | Cancelada |
| `8_30days` | Más de 30 días suspendida |
| `9_free` | En servicio gratuito |
| `0_other` | Cotización o instalación: fuera del cómputo |

## Ciclo de vida (supervivencia)

| Término | Definición |
|---|---|
| **Kaplan-Meier** | Estimador no paramétrico de la curva de supervivencia. Lo calcula `lifelines` |
| **Evento** | El desenlace que se mide: caer inactivo (vida activa) o volver a activo (reactivación) |
| **Censura** | El periodo sigue abierto cuando termina la observación: cuenta el tiempo vivido, pero no como evento |
| **Tasa de censura** | Proporción de suscriptores censurados sobre el total |
| **Mediana de supervivencia** | Tiempo en el que la curva cruza el 0,5. **`null` cuando no se puede calcular**, nunca 0 |
| **p25 / p75** | Tiempos en los que la curva cruza 0,75 y 0,25 |
| **Cohorte mínima** | 15 suscriptores (`MIN_COHORT_SIZE`) para que una dimensión produzca curva |

## CRM

| Término | Definición |
|---|---|
| **Oportunidad** | Un prospecto en el embudo. Una fila de `crm_clients` |
| **Movimiento** | Un cambio de etapa. Una fila de `crm_logs`. **La pérdida no es un movimiento**: es un estado |
| **Ciclo** | Una salida de la etapa hacia adelante. **Es la unidad de la efectividad, no el cliente** |
| **Desenlace** | Cómo terminó un ciclo: `exitoso`, `retorno`, `devuelto`, `perdido` |
| **Retorno** | La oportunidad volvió a la etapa: hubo que repetir el trabajo. Lo paga quien la mandó adelante |
| **Devolución (etapa 8)** | La oportunidad salió del embudo a «prospectos devueltos». La paga la etapa que indica su motivo |
| **Motivo de excepción** | Devolución o pérdida ajena a la gestión (el cliente no contesta, espera su router). No la paga nadie |
| **Devoluciones estimadas** | Las que no traen motivo legible, repartidas con la tasa observada en las que sí lo traen. Viajan en su propio campo |
| **En riesgo** | Oportunidades con vida en el mes: creadas en él o antes **y** sin cerrar al empezar. Es el denominador del riesgo de devolución |
| **Fila `ventas`** | Las etapas 1 y 2. Población propia, no un duplicado de factibilidad |
| **Permanencia** | Lo que lleva en su etapa una oportunidad **que todavía no ha salido** |
| **Winsorización** | Recortar la cola superior al percentil 95 sin descartar el caso: entra valiendo el corte, así el promedio sigue siendo sobre las N salidas reales |
| **`entrada_id`** | El `Iniciativa/ID` del CSV. **Es el id de la oportunidad**, no el del movimiento |

## Soporte

| Término | Definición |
|---|---|
| **Cohorte de un periodo** | La unión de lo creado en el mes y lo cerrado en el mes |
| **Cerrados** | Etapa terminal **y** última actualización dentro del mes. Mide el trabajo despachado |
| **Creados** | Nacidos en el mes. Mide la demanda que entró |
| **Arrastre** | Cerrado en el mes pero nacido en uno anterior |
| **Rezagados** | Creados en el mes que no cerraron dentro de él |
| **Cierre creado→cerrado** | El proceso completo, cola incluida. Es `duracion_total_horas` de Odoo |
| **Cierre asignado→cerrado** | Solo la gestión del técnico |
| **Asignación** | Creación → primera asignación. Se mide sobre lo creado, aunque no haya cerrado |
| **Muestra** | Cuántos tickets se pudieron medir en una medida. Sirve para juzgar la cobertura |
| **Incidencia por zona** | Tickets del grupo en la zona por cada 100 clientes activos de la zona |
| **Desglose** | El qué: tipo de solicitud, razón de falla, solución de falla |

## Reporte ETA

| Término | Definición |
|---|---|
| **ETA** | El reporte mensual que se declara a la reguladora |
| **Alámbrico / Inalámbrico** | Las dos únicas tecnologías que distingue la reguladora. `TECH_MAP` colapsa FTTH y RF a ellas |
| **Persona natural / jurídica** | La clasificación de titular; `PERSONA_MAP` la normaliza |
| **Excepción individual** | Parametrización por orden (`analyzer_eta_config_subs_individual`). Gana sobre el catálogo |
| **`declarar_en_eta`** | Campo del plan: un plan **real** que queda fuera del reporte, pero que sigue contando como plan en todo lo demás |
| **Transporte / Dedicado** | Dos planes concretos, no residenciales, con tratamiento aparte. Se identifican **por su nombre** |
| **Periodo bloqueado** | Un mes congelado: se sirve el JSON guardado en vez de recalcular |
| **Planes por clasificar** | Productos que el reporte no sabe clasificar. La pantalla los descubre y **enlaza al catálogo** |

## Catálogos e importación

| Término | Definición |
|---|---|
| **Catálogo** | Las seis tablas de referencia (`catalogo_*`), compartidas por todos los entornos |
| **Producto ignorado** | Línea del export que nunca será un plan: routers, instalaciones, servicios puntuales |
| **Producto sin catalogar** | Línea que podría ser un plan nuevo. **Bloquea la importación antes de escribir nada** |
| **Fixture** | Un diccionario con las claves de la época JSON, que es lo que `core/fixtures` sirve a los análisis |

## Infraestructura

| Término | Definición |
|---|---|
| **`DB_SCHEMA`** | El esquema de Postgres que identifica al entorno |
| **`ENV_SUFFIX`** | `DB_SCHEMA` saneado. Sufija las cookies y el nombre de la cola de Celery |
| **`AnalysisJob`** | La fila que representa una ejecución. **La única fuente de verdad de su estado** |
| **Turno de módulo** | El cerrojo en Redis que impide que dos análisis del mismo módulo escriban a la vez |
| **Job muerto** | Ejecución abierta sin señales de vida en 15 minutos. Deja de bloquear |
| **Duplicado exacto** | Mismo módulo **y** mismo periodo ya abiertos. Es lo único que se rechaza con 409 |
| **Instantánea del catálogo** | La copia coherente de los seis catálogos que `fixtures` cachea 60 segundos |
