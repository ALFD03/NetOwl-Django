# NetOwl

Sistema web para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida, análisis por dimensiones y **CRM Analytics** con pipeline Odoo → JSONB → API REST.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 (pandas, numpy, psycopg2, lifelines) |
| Backend web | Django 5 |
| Base de datos | PostgreSQL 15+ |
| Frontend | Bootstrap 5, Chart.js v3+, Bootstrap Icons, CSS propio |
| Estáticos | Whitenoise (comprimidos y cacheados) |
| Servidor web | Gunicorn (timeout 300s) |
| Contenedor | Docker + Docker Compose (usuario no‑root) |

## Arquitectura

```
NetOwl-Django/
├── cli.py                             # Entrypoint CLI (import + analyze)
├── manage.py                          # Entrypoint Django
├── requirements.txt                   # Dependencias Python
├── Dockerfile                         # Imagen Docker multi‑stage, usuario no‑root
├── entrypoint.sh                      # Generación automática de SECRET_KEY si falta
├── .env.example                       # Template de variables de entorno
│
├── backend/                           # Lógica de negocio (independiente de Django)
│   ├── __init__.py                    # Exportaciones del paquete
│   ├── config.py                      # Constantes + carga de .env + TableNames
│   ├── utils.py                       # parse_date()
│   ├── models.py                      # Periodo (dataclass)
│   ├── database.py                    # DBConnector (pool con sslmode, read, save, copy, schema cache)
│   │
│   ├── subscriptions/                 # Módulo: subscriptions (churn, reactivaciones, ARPU, KM)
│   │   ├── __init__.py
│   │   ├── imports.py                 # Importación y limpieza de CSV
│   │   ├── data_api.py                # Capa de acceso a datos para vistas
│   │   │
│   │   ├── analyzer/                  # Churn analysis
│   │   │   ├── __init__.py
│   │   │   ├── analyzer.py            # MetricsAnalyzer (orquestador)
│   │   │   ├── cleaner.py             # Limpieza y normalización de logs
│   │   │   ├── dimensions.py          # Análisis por dimensiones
│   │   │   ├── loader.py              # Carga de datos BD → DataFrames
│   │   │   ├── metrics_calc.py        # Cálculo de KPIs y métricas
│   │   │   └── rules.py               # Reglas de anomalías (logs sintéticos)
│   │   │
│   │   └── lifetime/                  # Lifecycle analysis (Kaplan‑Meier)
│   │       ├── __init__.py
│   │       ├── analyzer.py            # LifecycleAnalyzer
│   │       ├── dimensions.py          # Análisis dimensional de tiempos de vida
│   │       ├── km_utils.py            # Funciones auxiliares Kaplan‑Meier
│   │       ├── lifecycle.py           # Cálculo de métricas de ciclo de vida
│   │       ├── loader.py              # Carga de datos BD → DataFrames
│   │       ├── queries.py             # Consultas SQL específicas
│   │       └── runner.py              # Orquestador del pipeline
│   │
│   └── crm/                           # Módulo: CRM Analytics (Odoo opportunities)
│       ├── __init__.py
│       ├── config.py                  # ETAPA_MAP, EFECTIVIDAD_REGLAS, ETAPA8_ATRIBUCION, CSV_COLUMN_MAP, etc.
│       ├── loader.py                  # Carga CSV Odoo (chunking, normalización)
│       ├── analyzer.py                # run_crm_analysis() — orquestador global + dimensiones
│       ├── dimensions.py              # Cálculo de métricas desglosadas por dimensión
│       ├── queries.py                 # Per‑metric getters + composite getters aplanados
│       │
│       └── metrics/                   # Cálculo individual de cada métrica
│           ├── __init__.py
│           ├── core.py                # _compute_totals, _upsert_globales, compute_and_save_all_global
│           ├── tiempo.py              # compute_tiempo_instalacion, compute_tiempo_por_etapa
│           ├── efectividad.py         # compute_efectividad (forward cycles, e8 attribution, return reclass)
│           ├── probabilidad.py        # compute_probabilidad_etapa8, compute_probabilidad_perdido
│           └── rescate.py             # compute_rescate_perdidos
│
├── frontend/                          # Aplicación Django
│   ├── __init__.py
│   ├── netowl_web/                    # Proyecto Django (settings, wsgi, urls raíz)
│   │   ├── settings.py                # Auth habilitado, seguridad SSL, logging rotativo, MAX_UPLOAD_SIZE
│   │   ├── urls.py                    # /login/, /setup/, /logout/, /config/, /subscriptions/, /crm/
│   │   └── wsgi.py
│   │
│   ├── config/                        # App Django: autenticación, permisos, utilidades
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── views.py                   # login_view, setup_view
│   │   ├── urls.py                    # Rutas de configuración de usuarios
│   │   ├── decorators.py              # @analyst_or_admin_required, handle_csv_upload, cleanup_tempfile
│   │   ├── models.py                  # Profile (rol: admin / analyst / viewer)
│   │   ├── templates/                 # Templates de login/setup
│   │   └── migrations/
│   │
│   ├── subscriptions/                 # App Django (vistas, urls, templates, static)
│   │   ├── views.py                   # Vistas por página + API con login_required
│   │   ├── urls.py                    # Rutas por página + API
│   │   ├── apps.py
│   │   │
│   │   ├── templates/subscriptions/   # Templates por página
│   │   │   ├── dashboard.html
│   │   │   ├── analytics.html
│   │   │   ├── imports.html
│   │   │   ├── results.html
│   │   │   ├── lifetime.html
│   │   │   └── partials/
│   │   │       ├── header.html
│   │   │       └── sidebar.html
│   │   │
│   │   └── static/subscriptions/js/
│   │       ├── dashboard.js
│   │       ├── analytics.js
│   │       ├── imports.js
│   │       ├── results.js
│   │       └── lifetime.js
│   │
│   └── crm/                           # App Django: CRM
│       ├── views.py                   # Vistas + APIs (login_required, rate‑limited)
│       ├── urls.py                    # /dashboard/, /analytics/, /results/, /import/, + APIs
│       │
│       ├── templates/crm/             # Templates CRM
│       │   ├── dashboard.html
│       │   ├── analytics.html
│       │   ├── results.html
│       │   ├── imports.html
│       │   └── partials/
│       │       └── header.html
│       │
│       └── static/crm/js/
│           ├── dashboard.js           # Gráficos de tiempo por etapa + efectividad + gauges
│           ├── analytics.js           # KPI cards + gráficos por dimensión (doughnut/hbar/bar)
│           └── results.js             # Tabla histórica + detalle completo con dimensiones
│
├── static/                            # Archivos estáticos globales
│   ├── css/
│   │   ├── base.css                   # Variables CSS, tema claro/oscuro, reset
│   │   ├── sidebar.css                # Estilos del sidebar
│   │   ├── components.css             # Cards, botones, tablas, formularios
│   │   └── subscriptions.css          # Estilos específicos
│   └── js/
│       ├── core.js                    # Utilidades comunes, tema, toast, loading
│       ├── theme.js                   # Toggle claro/oscuro, persistencia
│       └── sidebar.js                 # Interacción del sidebar
│
└── templates/                         # Templates raíz
    └── base.html                      # Layout base (Bootstrap, Chart.js, Icons)
```

### Cambios principales respecto a versión anterior

| Cambio | Detalle |
|---|---|
| **CRM Analytics** | Nuevo módulo completo: pipeline Odoo → JSONB → API REST con 6 métricas + 7 dimensiones |
| **Persistencia JSONB** | ~10 tablas intermedias reemplazadas por 2 tablas con columnas JSONB (`crm_metricas_globales`, `crm_dimensiones_historico`) |
| **Per‑metric APIs** | 14 nuevos endpoints (`/crm/api/metricas/*` y `/crm/api/dimensiones/*`) |
| **Autenticación** | `django.contrib.auth` habilitado; todas las vistas requieren login |
| **App `config`** | Nueva app Django para login, setup inicial, decoradores de permisos |
| **Seguridad** | Cabeceras HTTP seguras, SSL redirect configurable, logging rotativo de requests |
| **Docker** | Usuario no‑root, `entrypoint.sh` con generación automática de `SECRET_KEY`, `sslmode` en conexión BD |
| **Rate limiting** | `django-ratelimit` en endpoints de importación y análisis (10 req/min/IP) |
| **Archivos eliminados** | `asgi.py`, `admin.py`, `forms.py`, `cleaner.py` (CRM), `metrics.py` (monolítico) |

## Requisitos

- Docker y Docker Compose
- PostgreSQL (en Docker o externo)

## Configuración

Variables de entorno necesarias (`.env` o en `environment` del compose):

```env
HOST=db                           # Nombre del servicio PostgreSQL
DB=Netcom                         # Nombre de la base de datos
DB_USER=metabase                  # Usuario de base de datos (usar DB_USER, no USER)
PASS=tu_password                  # Contraseña
PORT=5432
SCHEMA=public
DB_SSLMODE=prefer                 # Modo SSL para PostgreSQL

DJANGO_SECRET_KEY=genera-una-clave-única
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_SECURE_SSL=False          # True si usas HTTPS
```

> **Nota**: Se usa `DB_USER` (no `USER`) para evitar colisión con la variable de entorno `USER` del sistema Linux.

## Quick Start con Docker

```yaml
app:
    build: ./
    container_name: netowl_app
    ports:
      - "8000:8000"
    environment:
      - HOST=db
      - DB=Netcom
      - DB_USER=metabase
      - PASS=tu_password
      - PORT=5432
      - SCHEMA=public
      - DB_SSLMODE=prefer
      - DJANGO_SECRET_KEY=genera-una-clave-única
      - DJANGO_DEBUG=False
      - DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
      - DJANGO_SECURE_SSL=False
    depends_on:
      - db
    restart: always
```

```bash
# Construir la imagen
docker compose build app

# Levantar el servicio
docker compose up -d app

# Crear primer usuario administrador
docker compose exec app python manage.py createsuperuser

# Acceder en el navegador
# http://localhost:8000
```

## Uso CLI (subscriptions)

Sin necesidad del navegador, desde la raíz del proyecto:

```bash
# Importar suscripciones
python cli.py import subs ./datos/suscripciones.csv

# Importar logs
python cli.py import logs ./datos/logs.csv

# Ejecutar análisis
python cli.py analyze 2026-06

# Pipeline completo (import + analyze)
python cli.py run-all 2026-06 ./subs.csv ./logs.csv
```

## Uso web

### Subscriptions – Dashboard (`/subscriptions/dashboard/`)
- Seleccionar mes/año con los dropdowns
- Hacer clic en "Ejecutar análisis"
- Ver consola integrada con el progreso
- Explorar gráficos animados: churn, activos inicio/final, winback, ARPU, aporte reactivaciones, índice de reemplazo, adiciones, cortes vs reactivaciones, curva KM
- **Curva Kaplan‑Meier**: supervivencia con IC 95%, curvas por método (Financiero/Operativo), toggle de cohortes mensuales, risk table y estadísticas (mediana, P25, P75)

### Subscriptions – Analytics (`/subscriptions/analytics/`)
- Filtro multiselect de períodos
- 20 tarjetas KPI con colores condicionales
- Gráficos por dimensión: doughnut, pie, barras, barras horizontales
- Umbral <2.5% agrupa en "Otros" (promedio, siempre al final)

### Subscriptions – Importar CSVs (`/subscriptions/import/`)
- Drag & drop o seleccionar archivo (tipo: subscripciones o logs)
- Barra de progreso animada
- Se procesa automáticamente (limpieza, consolidación, carga a DB)

### Subscriptions – Resultados (`/subscriptions/results/`)
- Tabla histórica con buscador
- Modal de detalle con 24 métricas + desglose por dimensiones

### Subscriptions – Tiempos de Vida (`/subscriptions/lifetime/`)
- Curvas Kaplan‑Meier de cartera activa y cancelada
- Tabla de órdenes con tiempos de vida

### CRM – Dashboard (`/crm/dashboard/`)
- Gauge de tiempo de instalación promedio
- Gauge de % Etapa 8, % Perdidos y % Rescate
- Gráfico de barras: tiempo promedio por etapa
- Gráfico de barras agrupadas: efectividad (Etapa 3, 4, 5, Ventas)

### CRM – Analytics (`/crm/analytics/`)
- Tarjetas KPI: tiempo instalación, efectividad, probabilidad, rescate, totales
- Gráficos doughnut y barras horizontales por dimensión (municipio, campaña, sucursal, vendedor, equipo_ventas, motivo_perdida, devolver_oportunidad)

### CRM – Resultados (`/crm/results/`)
- Tabla histórica con métricas globales
- Detalle completo: tiempo instalación (7 estadísticas), tiempo por etapa (9 etapas, 6 columnas), efectividad por etapa, probabilidad Etapa 8 y pérdidas con motivos, rescate de perdidos, desglose por dimensiones

### CRM – Importar CSV (`/crm/import/`)
- Carga de CSV exportado de Odoo (formato plano, 200k+ filas)
- Chunking de 50,000 filas, COPY masivo
- Ejecución automática del análisis post‑import

## Pipeline de análisis CRM (`backend/crm/`)

```
1.  Carga CSV Odoo (chunking 50k, normalización de etapas, separación clients/logs)
2.  Cálculo de Totals (clientes, ganados, perdidos, etapa_7, etapa_8)
3.  Cálculo de Tiempo Instalación (promedio, mediana, p25, p75, min, max, std)
4.  Cálculo de Tiempo por Etapa (promedio, mediana, min, max, std, movimientos)
5.  Cálculo de Efectividad (forward cycles + atribución etapa_8 + reclasificación retornos)
6.  Cálculo de Probabilidad Etapa 8
7.  Cálculo de Probabilidad Pérdida
8.  Cálculo de Rescate de Perdidos
9.  Persistencia en crm_metricas_globales (singleton JSONB)
10. Cálculo por dimensiones (5 estándar + 2 especiales → crm_dimensiones_historico JSONB)
```

> Ver `reporte.md` para la documentación detallada de cada métrica, sus fórmulas, parámetros editables y casos frontera.

## Pipeline de análisis Subscriptions (`backend/analyzer.py`)

```
1.  Carga de datos (DB → DataFrames en 3 hilos)
2.  Limpieza y normalización de logs
3.  Reglas de anomalías (logs sintéticos: casos 1‑6)
4.  Fotos de cartera (activos inicio / activos final / nuevos)
5.  Inactivos al inicio del período
6.  ARPU (facturación total / activos final)
7.  Reactivaciones segmentadas por origen
8.  Corte por factura impagada
9.  Método Financiero (balance contable)
10. Método Operativo (transiciones en logs)
11. KPI final (churn neto/bruto, winback, ARPU, adiciones, etc.)
12. Dimensiones (zona, sucursal, municipio, campaña, producto)
13. Kaplan‑Meier (mediana/P25/P75 vida activo y cancelado, curvas por método y cohorte)
```

## Tablas de base de datos

### Entrada Subscriptions (se importan desde CSV)

| Tabla | Contenido |
|---|---|
| `Subscripciones` | Suscripciones consolidadas (una fila por orden) |
| `Subscripciones-b` | Datos detallados por línea de orden |
| `Subscripciones-logs` | Historial de cambios de estado |
| `Subscripciones-logs-v15` | Logs versión 15 (con tipo/categoría) |

### Entrada CRM (se importa desde CSV Odoo)

| Tabla | Contenido |
|---|---|
| `crm_clients` | Oportunidades (una fila por ID Odoo) — columnas: `id`, `cliente`, `cliente_municipio`, `campana`, `sucursal`, `vendedor`, `equipo_ventas`, `etapa_actual`, `motivo_perdida`, `devolver_oportunidad`, `ganado`, `duracion_total_horas`, etc. |
| `crm_logs` | Trazabilidad de cambios de etapa — columnas: `client_id`, `entrada_id`, `etapa_anterior`, `nueva_etapa`, `duracion_horas`, `created_at_log` |

### Salida Subscriptions (se generan en cada ejecución)

| Tabla | Columnas principales |
|---|---|
| `cierre_churn_historico` | `periodo_reporte`, `metodo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `bajas_brutas_auditoria`, `churn_neto_pct`, `churn_bruto_pct`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `total_inactivos`, `tasa_winback_pct`, `total_billing`, `arpu`, `reactivaciones`, `react_6_8`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_brutas`, `adiciones_netas`, `corte_impagado` |
| `master_activos_cierre` | Cartera de activos al cierre del período |
| `master_reactivaciones` | Reactivaciones del período |
| `master_bajas_detalladas` | Bajas detalladas (Financiero y Operativo) |
| `master_corte_impagado` | Suscripciones con corte por impago |
| `master_inactivos_detallados` | Suscripciones inactivas al inicio del período |
| `master_tiempos_vida` | Detalle por orden: días activo, días cancelado |
| `master_tiempo_global` | Curvas Kaplan‑Meier por método |
| `master_churn_dimensiones` | Métricas desglosadas por dimensión |

### Salida CRM (se regeneran en cada importación)

| Tabla | Columnas |
|---|---|
| `crm_metricas_globales` | `id` (1), `totals` JSONB, `tiempo_instalacion` JSONB, `tiempo_por_etapa` JSONB, `efectividad` JSONB, `etapa8` JSONB, `perdido` JSONB, `rescate` JSONB |
| `crm_dimensiones_historico` | `id`, `dimension`, `valor`, + 7 columnas JSONB |

## Métricas calculadas – Subscriptions

| Métrica | Fórmula |
|---|---|
| **Churn neto (Financiero)** | `max(0, activos_inicio + nuevos - activos_final) / activos_inicio × 100` |
| **Churn bruto (Auditoría)** | `(bajas_netas + react_audit) / activos_inicio × 100` |
| **ARPU** | `sum(Total de activos final) / activos_final` |
| **Tasa Winback** | `reactivaciones_únicas / inactivos_inicio × 100` |
| **Tasa Aporte Reactivaciones** | `react_6_8 / (nuevas + react_6_8) × 100` |
| **Índice Reemplazo Reactivaciones** | `react_6_8 / bajas_fin_netas × 100` |
| **Adiciones Brutas** | `nuevas - bajas_fin_netas` |
| **Adiciones Netas** | `(nuevas + react_6_8) - bajas_fin_netas` |
| **Vida mediana activo** | `S(t) ≤ 0.50` (Kaplan‑Meier, censura por órdenes activas) |
| **P25 / P75 activo** | `S(t) ≤ 0.75` / `S(t) ≤ 0.25` (percentiles KM) |
| **Vida mediana cancelado** | `S(t) ≤ 0.50` sobre días desde churn hasta reactivación |
| **Intervalo confianza 95 %** | Fórmula de Greenwood (`lifelines.KaplanMeierFitter`) |

## Métricas calculadas – CRM

> Ver `reporte.md` para documentación exhaustiva de fórmulas, algoritmo de efectividad, atribución de etapa_8, reclasificación de retornos, dimensiones, parámetros editables y 11 casos frontera documentados.

| Métrica | Descripción breve |
|---|---|
| **Totals** | Conteos: total clientes, ganados, perdidos, etapa_7, etapa_8 |
| **Tiempo Instalación** | Promedio, mediana, p25, p75, min, max, std de horas totales (solo ganados) |
| **Tiempo por Etapa** | Promedio, mediana, min, max, std, movimientos por cada etapa del pipeline |
| **Efectividad** | % de forward moves que terminan en éxito (instalación) vs falla, con atribución de etapa_8 por motivo+ruta y reclasificación de retornos |
| **Probabilidad Etapa 8** | % de clientes que han pasado por etapa_8_devueltos |
| **Probabilidad Pérdida** | % de clientes con estado `perdido` |
| **Rescate Perdidos** | % de clientes perdidos que luego fueron instalados |

## Notas importantes

- Reactivaciones solo se cuentan si la suscripción está **activa al cierre del período**
- `react_6_8` considera solo reactivaciones provenientes de `6_churn` y `8_30days` (excluye `4_paused`)
- El método **Financiero** usa fórmula de balance contable: `activos_inicio - (activos_final - nuevos)`
- El método **Operativo** cuenta transiciones reales desde logs (`3_progress → 4_paused/6_churn`)
- Los datos duplicados por período se evitan automáticamente vía DELETE + INSERT
- Se usa `DB_USER` (no `USER`) como variable de entorno para evitar colisión con la variable de sistema Linux
- Los archivos estáticos se sirven con Whitenoise (no requiere nginx para producción básica)
- Todos los gráficos Chart.js usan animación `{duration: 800, easing: "easeOutQuart"}`
- El tema claro/oscuro se persiste en `localStorage` y se aplica con variables CSS
- El módulo CRM usa **JSONB** como almacenamiento único; los getters compuestos aplanan los datos al formato legacy para el frontend existente
- La importación CRM hace **TRUNCATE + COPY** (carga completa, no incremental)
- El análisis CRM se ejecuta sin filtro temporal (siempre sobre todo el histórico)

## Autor

Ing. Ángel Flores
