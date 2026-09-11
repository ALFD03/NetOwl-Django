# Documentación de NetOwl

Documentación técnica completa del panel analítico de NetOwl (Django + Inertia +
React sobre PostgreSQL, con Celery para los análisis largos).

Esta carpeta describe **el código tal y como está hoy en el árbol de trabajo**.
Es complementaria, no sustituta, de los tres documentos que ya vivían en el
repositorio:

| Documento | Qué cubre |
|---|---|
| `README.md` (raíz) | Puesta en marcha, stack y despliegue. Es la puerta de entrada. |
| `web/src/README.md` | Reglas de arquitectura de la capa React (capas, kit de UI, tokens). |
| `CLAUDE.md` | Notas de diseño y decisiones históricas para asistentes de IA. ⚠️ Ver [13-discrepancias-y-hallazgos.md](13-discrepancias-y-hallazgos.md): hoy describe funcionalidades que no están en el código. |

## Índice

| # | Documento | Contenido |
|---|---|---|
| 01 | [Arquitectura](01-arquitectura.md) | Visión general, capas, flujo de datos, ciclo de vida de una petición y de un análisis. |
| 02 | [Configuración y entornos](02-configuracion.md) | Vault, `.env`, `DB_SCHEMA`, aislamiento entre entornos, sesiones, Celery/Redis. |
| 03 | [`core/`](03-core.md) | Vault, `DBConnector`, `Periodo`, `TableNames`, utilidades y catálogos (`fixtures`). |
| 04 | [`services/config/`](04-servicio-config.md) | Autenticación, perfiles, matriz de permisos, grupos, sesiones por entorno, subida de CSV. |
| 05 | [`services/imports/`](05-servicio-imports.md) | Importación de CSV, `AnalysisJob`, tareas de Celery, historial, endpoints de seguimiento. |
| 06 | [`services/subscriptions/`](06-servicio-subscriptions.md) | El dominio mayor: churn mensual, métricas diarias, planes gratuitos, ciclo de vida, reporte ETA y catálogos. |
| 07 | [`services/crm/`](07-servicio-crm.md) | Embudo comercial: efectividad por etapa, riesgo de devolución y tiempos. |
| 08 | [`services/support/`](08-servicio-support.md) | Cohortes de tickets, tiempos de cierre y asignación, incidencia por zona. |
| 09 | [Frontend](09-frontend.md) | Inventario de páginas, features y kit compartido; contratos con el backend. |
| 10 | [Modelo de datos](10-modelo-de-datos.md) | Todas las tablas: las del ORM y las que se crean dinámicamente, con quién las escribe y quién las lee. |
| 11 | [Referencia de endpoints](11-api-endpoints.md) | Todas las URLs con su permiso, su límite de peticiones y su respuesta. |
| 12 | [Operación](12-operacion.md) | `make`, `dev.sh`, Docker, comandos de gestión, logs y diagnóstico de fallos. |
| 13 | [Discrepancias y hallazgos](13-discrepancias-y-hallazgos.md) | Dónde la documentación previa no coincide con el código, y los defectos detectados al documentarlo. |
| 14 | [Glosario](14-glosario.md) | Vocabulario de negocio: churn neto/bruto, reactivación, cohorte, ETA, winsorización… |

## Convenciones

- **Idioma:** todo el código, comentarios, docstrings y textos de interfaz están
  en español. Esta documentación también.
- **Sin batería de pruebas:** no existe `pytest` ni `vitest`. La única puerta es
  `make check` (`manage.py check` + `tsc --noEmit` + `ruff` + `eslint`).
- **Las rutas de fichero** se citan como `ruta/archivo.py:línea` cuando ayuda a
  localizar el código concreto.
