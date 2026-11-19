# Servicio Encuestas (`services/surveys/`)

Dos encuestas fijas —**instalados** (satisfacción) y **bajas**— que se hacen sobre el mes ya cerrado: la de octubre
se llama en noviembre, cuando la data está completa. Páginas: `/encuestas/instalados/`, `/encuestas/bajas/` y
`/encuestas/configuracion/` (la raíz `/encuestas/` lleva a la primera permitida). API: `/api/surveys/`.

## Flujo

1. **Abrir el mes** (`api/surveys/periods/open/`): copia a `surveys_respondent` la lista de clientes del mes,
   leída por `analytics/loader.py` de las tablas de Suscripciones con `DBConnector` (sin importar la app). Es
   idempotente: repetirlo suma a los que faltan y actualiza la ficha de los pendientes; a quien ya se atendió no se
   le toca. El mes en curso no se abre.
   - **Instalados**: `subscriptions` con `fecha_inicio` en el mes, sin las que siguen en cotización o instalación.
   - **Bajas**: las órdenes de `analyzer_bajas_detalladas` del mes (exige el mes calculado); la ficha sale de
     `subscriptions` o, si ya no está, de `subscriptions-b`.
2. **Llamar**: cada cliente se abre en un formulario con su ficha (Id de Sub, Nombre, CI, Vendedor, Medio, Sucursal,
   Zona, Tipo de servicio, Campaña, Phone 1, Phone 2) y las preguntas que corresponden según lo ya contestado.
   Estados: pendiente, completada, no contesta, rechazó. Volver a pendiente a quien contestó borra sus respuestas.
3. **Resultados**: conteo y % por opción de cada pregunta, sobre quienes la contestaron; los textos libres aparte.

La ficha se **copia** al abrir el mes porque las tablas de suscripciones se truncan en cada importación: releerlas
cambiaría la lista de un mes que ya se está llamando.

## Modelo (`services/surveys/models.py`)

| Tabla | Modelo | Qué guarda |
|---|---|---|
| `surveys_survey` | `Survey` | las dos encuestas (`instalados`, `bajas`), sembradas por `surveys/0002` |
| `surveys_question` | `Question` | texto, tipo (`unica`, `multiple`, `texto`), obligatoria, activa, posición y condición |
| `surveys_option` | `Option` | respuestas posibles de una pregunta |
| `surveys_respondent` | `Respondent` | un cliente en un mes: copia de su ficha, estado y quién lo atendió. Único por (encuesta, mes, orden) |
| `surveys_answer` | `Answer` | una fila por opción elegida, o una con `text` si la pregunta es de texto libre (`PROTECT`: nada con historia se borra) |

Una pregunta u opción con respuestas no se borra: se desactiva y sigue en los resultados de los meses donde se usó.

## Reglas

- La condición de una pregunta es «mostrar si» u «ocultar si» la respuesta a otra es una de unas opciones. Solo
  condicionan las preguntas de opciones. `analytics/rules.py` (con doctests) la evalúa y valida lo contestado; el
  cliente la repite en `frontend/src/features/surveys/lib/rules.ts`, y el servidor es quien manda.
- Las listas semilla (motivos de baja, problemas, empresas) son un punto de partida genérico: se editan en Preguntas.

## Código

- `analytics/`: `config` (vocabularios guardados), `loader` (las listas), `rules` (condiciones, con doctests) y
  `queries` (lecturas y escrituras de las vistas).
- `views.py`: vistas finas con `@endpoint`; los parámetros y cuerpos se validan con modelos pydantic
  (`query=` / `body=`), así que un valor fuera de vocabulario responde 400 antes de llegar a la vista.
- Frontend en `features/surveys/` con el kit de `shared/ui` (`ActionBar`, `DataTable`, `ChoiceChips`, `TextArea`,
  `ConfirmModal`, `Badge`, `IconButton`, `ProgressBar`…); sin marcado propio de controles.

## Permisos

`can_view_surveys` (ver), `can_answer_surveys` (abrir el mes y registrar), `can_manage_surveys` (preguntas),
`can_delete_surveys` (borrar un mes con sus respuestas; no se deshace). Los cuatro nacen cerrados (`config/0022`).
La lista de encuestados lleva cédulas y teléfonos en bloque: `api/surveys/respondents/` queda en auditoría.
