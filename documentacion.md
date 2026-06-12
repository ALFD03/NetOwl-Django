# Documentacion del Sistema - NetOwl Churn Rate Analyzer

## Indice

1. [Vision General](#1-vision-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura de Directorios](#3-estructura-de-directorios)
4. [Descripcion de Archivos](#4-descripcion-de-archivos)
   - [4.1 Backend (analizador)](#41-backend-analizador)
   - [4.2 App Django](#42-app-django)
   - [4.3 Proyecto Django](#43-proyecto-django)
   - [4.4 Templates](#44-templates)
   - [4.5 Archivos Estaticos](#45-archivos-estaticos)
   - [4.6 CLI](#46-cli)
   - [4.7 Infraestructura](#47-infraestructura)
5. [Flujo de Datos](#5-flujo-de-datos)
6. [Pipeline de Analisis](#6-pipeline-de-analisis)
7. [Base de Datos](#7-base-de-datos)
8. [Casos de Prueba](#8-casos-de-prueba)
9. [Ejemplos de Uso](#9-ejemplos-de-uso)
10. [Solucion de Problemas](#10-solucion-de-problemas)

---

## 1. Vision General

**NetOwl Churn Rate Analyzer** es un sistema web SPA (Single Page Application) para el calculo y analisis de la tasa de cancelacion de suscripciones (churn rate) de un proveedor de servicios de Internet. Permite importar datos desde archivos CSV, ejecutar un pipeline completo de analisis financiero y operativo, y visualizar metricas segmentadas por dimensiones geograficas y comerciales con graficos interactivos.

### Funcionalidades principales

- **Importacion de CSVs**: Carga y limpia archivos de suscripciones y logs de cambios con drag & drop
- **Analisis mensual**: Calcula churn neto/bruto por metodo financiero y operativo
- **Metricas de reactivacion**: Cuantifica winback, reactivaciones por origen y tasas de aporte
- **Analisis dimensional**: Desglosa metricas por zona, sucursal, municipio, campana y producto
- **Tiempos de vida**: Calcula curvas Kaplan-Meier (mediana, P25, P75) con intervalos de confianza y curvas por cohorte mensual
- **Dashboard interactivo**: Graficos con Chart.js (lineas, barras, doughnut, pie) con animaciones y lineas de tendencia
- **Curva de supervivencia KM**: Kaplan-Meier con IC 95%, curvas por metodo (Financiero/Operativo), toggle de cohortes, risk table
- **Panel Analytics**: Filtro multiselect de periodos, tarjetas KPI, graficos por dimension con agrupacion "Otros" (<2.5%)
- **Modal de detalle**: Tablas completas con sticky header/columna y 24 metricas por metodo (incluye medianas KM)
- **Tema claro/oscuro**: Persistencia en localStorage, todas las variables CSS adaptadas
- **CLI**: Entrypoint de linea de comandos para importacion y analisis sin acceder al web
- **Consola integrada**: Terminal en vivo que muestra el progreso del analisis

### Tecnologias

| Componente | Tecnologia |
|------------|-----------|
| Backend web | Django 5 + Python 3.11 |
| Logica de negocio | Python (pandas, numpy, psycopg2, lifelines) |
| Base de datos | PostgreSQL 15+ |
| Frontend | Bootstrap 5, Chart.js v3+, Bootstrap Icons, CSS propio |
| Graficos | Chart.js con plugin datalabels y animaciones easeOutQuart |
| Servidor WSGI | Gunicorn |
| Estaticos | Whitenoise |
| Contenedor | Docker + Docker Compose |

---

## 2. Arquitectura del Sistema

```
                     +---------------------+
                     |    Navegador Web     |
                     |  (SPA: Bootstrap 5,  |
                     |   Chart.js, CSS propio)|
                     +----------+----------+
                                |
                           HTTP :8000
                     (JSON APIs + HTML shell)
                                |
                     +----------+----------+
                     |     Gunicorn         |
                     |   (WSGI Server)      |
                     +----------+----------+
                                |
                     +----------+----------+
                     |      Django          |
                     |  (churn_web +        |
                     |   analyzer_app)      |
                     |  Sirve HTML + JSON   |
                     +----------+----------+
                                |
                     +----------+----------+
                     |      backend/        |
                     |  (Logica de negocio  |
                     |   independiente de   |
                     |   Django)            |
                     +----------+----------+
                                |
                     +----------+----------+
                     |     PostgreSQL       |
                     |  (Base de datos)     |
                     +---------------------+

                     +---------------------+
                     |  CLI (cli.py)        |
                     |  import/analyze      |
                     +----------+----------+
                                |
                     +----------+----------+
                     |      backend/        |
                     +----------+----------+
                                |
                     +----------+----------+
                     |     PostgreSQL       |
                     +---------------------+
```

### Flujo de peticion tipica (SPA)

1. Usuario navega a `/` → Django sirve `dashboard.html` (HTML inicial)
2. El JS del cliente (`main.js`) toma el control con `initSpaRouter()`
3. Segun la ruta (`/`, `/analytics`, `/results/`, etc.), carga datos via fetch a las APIs:
   - `GET /api/dashboard-data/` → Datos para graficos del dashboard
   - `GET /api/analytics-data/?periods=...` → Datos para analytics con filtro
   - `GET /api/results/` → Historial completo
   - `GET /api/results/<periodo>/` → Detalle de un periodo (modal)
4. El usuario ejecuta analisis via `POST /api/run-analysis/` con `{month: "YYYY-MM"}`
5. En el servidor:
   - Se construye `Periodo` con la fecha
   - Se instancia `ChurnRateAnalyzer(DBConnector(), periodo)`
   - `analyzer.run()` ejecuta el pipeline completo
   - El stdout se captura y se devuelve al cliente como log
6. El frontend renderiza los graficos con Chart.js y animaciones

---

## 3. Estructura de Directorios

```
NetOwl-Django/
├── manage.py                          # Entry point de Django
├── requirements.txt                   # Dependencias Python
├── cli.py                             # CLI entrypoint (import + analyze)
├── Dockerfile                         # Imagen Docker
├── docker-compose.yml                 # Orquestacion Docker
├── .env.example                       # Template de variables de entorno
├── Planes.json                        # Catalogo de planes de Internet
├── Zonas.json                         # Catalogo de zonas geograficas
├── README.md                          # Guia rapida
├── documentacion.md                   # Este archivo
│
├── backend/                           # Logica de negocio (independiente de Django)
│   ├── __init__.py                    # Exportaciones del paquete
│   ├── config.py                      # Constantes y carga de .env
│   ├── utils.py                       # normalize_text(), parse_date()
│   ├── models.py                      # Periodo (dataclass)
│   ├── database.py                    # DBConnector (pool, read, save, copy)
│   ├── analyzer.py                    # ChurnRateAnalyzer (pipeline completo ~1264 lineas)
│   ├── imports.py                     # Importacion y limpieza de CSV
│   └── data_api.py                    # Capa de acceso a datos para las vistas
│
├── frontend/                          # Aplicacion Django (frontend web)
│   ├── __init__.py
│   │
│   ├── analyzer_app/                  # App Django principal
│   │   ├── __init__.py
│   │   ├── apps.py                    # Configuracion de la app
│   │   ├── admin.py                   # Admin (vacio)
│   │   ├── urls.py                    # Rutas SPA + API endpoints
│   │   ├── views.py                   # Vistas delgadas (JsonResponse)
│   │   ├── forms.py                   # MonthForm, CSVUploadForm
│   │   │
│   │   └── templates/analyzer/        # Templates HTML
│   │       └── dashboard.html         # Unico template SPA
│   │
│   ├── churn_web/                     # Proyecto Django (config)
│   │   ├── __init__.py
│   │   ├── settings.py                # Configuracion general
│   │   ├── urls.py                    # Rutas raiz (delega a analyzer_app)
│   │   ├── wsgi.py                    # WSGI para Gunicorn
│   │   └── asgi.py                    # ASGI opcional
│   │
│   ├── static/                        # Archivos estaticos
│   │   ├── css/styles.css             # Estilos personalizados (~980 lineas, tema claro/oscuro)
│   │   └── js/main.js                 # SPA JavaScript (~1170 lineas, Chart.js)
│   │
│   └── templates/                     # Templates raiz
│       ├── base.html                  # Layout base (Bootstrap, Chart.js, Bootstrap Icons vía CDN)
│       └── includes/navbar.html       # Barra de navegacion
│
└── .venv/                             # Entorno virtual Python (no incluido en git)
```

---

## 4. Descripcion de Archivos

### 4.1 Backend (analizador)

Todas las rutas en esta seccion son relativas a `backend/`.

#### `backend/config.py`

**Proposito**: Contiene todas las constantes de configuracion del sistema y carga las variables de entorno.

**Que espera**:
- Archivo `.env` en la raiz del proyecto con las variables:
  - `HOST`, `DB`, `DB_USER`, `PASS`, `PORT` → conexion a PostgreSQL
  - `SCHEMA` → esquema de base de datos (default: `public`)

**Nota**: Se usa `DB_USER` (no `USER`) para evitar colision con la variable de entorno del sistema Linux `USER`.

**Constantes definidas**:

| Constante | Valor | Proposito |
|-----------|-------|-----------|
| `DB_SCHEMA` | `os.getenv("SCHEMA", "public")` | Esquema de BD donde estan las tablas |
| `DATE_FORMATS` | Lista de 9 formatos de fecha | Formatos probados al parsear fechas |
| `ACTIVE_STATE` | `"3_progress"` | Unico estado considerado "activo" |
| `INACTIVE_STATES` | `{"4_paused", "6_churn", "8_30days"}` | Estados considerados "inactivos" |
| `VALID_REACT_ORIGINS` | `{"4_paused", "6_churn", "8_30days"}` | Origenes validos para reactivacion |
| `AUDIT_REACT_ORIGINS` | `{"6_churn", "8_30days"}` | Origenes considerados en auditoria |
| `CORTE_IMPAGADO_EVENT` | `"corte automatico por factura impaga"` | Texto que identifica cortes en logs |

**Dependencias**: `os`, `dotenv`, `warnings`

---

#### `backend/utils.py`

**Proposito**: Funciones auxiliares de uso general en el sistema.

**Funciones**:

| Funcion | Entrada | Salida | Descripcion |
|---------|---------|--------|-------------|
| `normalize_text(value)` | Cualquier valor | `str` | Normaliza texto: elimina acentos (NFD), convierte a ASCII, minusculas y recorta |
| `parse_date(value)` | Cualquier valor | `Optional[datetime]` | Parsea fechas probando 9 formatos definidos en `config.DATE_FORMATS` |

**Que espera**:
- `normalize_text`: valores `str`, `float`, `None` o `NaN` de pandas
- `parse_date`: strings en formatos como `"2026-04-01"`, `"01/04/2026 14:30:00"`, `"01-04-2026"`

**Dependencias**: `unicodedata`, `datetime`, `numpy`, `pandas`, `backend.config.DATE_FORMATS`

---

#### `backend/models.py`

**Proposito**: Modelos de dominio del negocio.

**Clases**:

| Clase | Descripcion |
|-------|-------------|
| `Periodo` | Dataclass que representa un periodo de analisis con `fecha_inicio` y `fecha_final` |

**Metodos de `Periodo`**:

| Metodo | Descripcion |
|--------|-------------|
| `build(ini_text, fin_text=None)` | Constructor factory. Si solo se da un mes (`YYYY-MM`), calcula el mes completo (1er al ultimo dia). Si se dan dos fechas, usa el rango exacto. |
| `label()` | Retorna etiqueta legible: `"YYYY-MM-DD al YYYY-MM-DD"` |

**Que espera**:
- `build`: texto de fecha en cualquier formato soportado por `parse_date()`
- Lanza `ValueError` si la fecha es invalida

**Ejemplos**:
```python
Periodo.build("2026-04")        # 2026-04-01 al 2026-04-30
Periodo.build("2026-04-15")     # 2026-04-01 al 2026-04-30 (toma el mes)
Periodo.build("2026-04-01", "2026-04-15")  # rango exacto
```

**Dependencias**: `calendar`, `dataclasses`, `datetime`, `backend.utils.parse_date`

---

#### `backend/database.py`

**Proposito**: Manejador de conexiones a PostgreSQL. Proporciona operaciones de lectura/escritura de DataFrames.

**Clases**:

| Clase | Descripcion |
|-------|-------------|
| `DBConnector` | Pool de conexiones PostgreSQL con helpers para pandas |

**Metodos de `DBConnector`**:

| Metodo | Descripcion |
|--------|-------------|
| `__init__()` | Inicializa pool de 1-10 conexiones usando variables de entorno (`HOST`, `DB`, `DB_USER`, `PASS`, `PORT`) |
| `get_connection()` | Context manager que obtiene y devuelve conexion del pool |
| `connect()` | Crea conexion directa (sin pool) |
| `read_table(table_name, columns=None)` | Lee tabla completa como DataFrame. Si `columns` es `None`, lee todas las columnas. |
| `save_historico(df, table_name, periodo, metodo=None)` | Guarda DataFrame en tabla historica. Crea tabla si no existe, agrega columnas faltantes, elimina datos previos del mismo periodo. |
| `copy_dataframe(df, table_name)` | Carga masiva (COPY) de DataFrame a tabla existente usando formato TSV |

**Que espera**:
- Variables de entorno: `HOST`, `DB`, `DB_USER`, `PASS`, `PORT` (default `5432`)
- `read_table`: nombre de tabla existente en el esquema configurado
- `save_historico`: DataFrame con columnas que coincidan o se agreguen a la tabla
- `copy_dataframe`: DataFrame con columnas que coincidan exactamente con la tabla destino

**Comportamiento de `save_historico`**:
1. Si el DataFrame esta vacio, no hace nada
2. Agrega columnas `periodo_reporte` y opcionalmente `metodo_calculo`
3. Normaliza nombres de columnas (minusculas, reemplaza `%` por `pct`, espacios por `_`)
4. Convierte todos los valores a texto
5. Crea la tabla si no existe (todas las columnas como `text`)
6. Agrega columnas faltantes con `ALTER TABLE ADD COLUMN IF NOT EXISTS`
7. Elimina registros previos del mismo `periodo_reporte` (y `metodo_calculo` si aplica)
8. Inserta los nuevos registros

**Dependencias**: `io`, `os`, `re`, `contextlib`, `pandas`, `psycopg2`, `backend.config.DB_SCHEMA`

---

#### `backend/analyzer.py`

**Proposito**: Nucleo del sistema. Implementa el pipeline completo de calculo de churn rate (~1264 lineas).

**Clases**:

| Clase | Descripcion |
|-------|-------------|
| `ChurnRateAnalyzer` | Orquestador del analisis: carga datos, limpia, calcula metricas y guarda resultados |

**Metodos de `ChurnRateAnalyzer`**:

| Metodo | Descripcion |
|--------|-------------|
| `__init__(db, periodo)` | Recibe un `DBConnector` y un `Periodo` |
| `load_data()` | Carga concurrente (3 hilos) de Subscripciones, Subscripciones-logs y Subscripciones-logs-v15 |
| `build_clean_data()` | Normaliza y combina logs v14 + v15 en un solo DataFrame limpio |
| `_apply_log_rules()` | Aplica reglas de anomalias (logs sinteticos para casos 1-6) |
| `get_active_at(target_date, strictly_before)` | Obtiene suscripciones activas en una fecha dada |
| `get_reactivations(act_fin)` | Encuentra reactivaciones en el periodo filtradas por origen valido |
| `get_corte_impagado()` | Extrae eventos de corte por factura impaga |
| `run()` | Ejecuta el pipeline completo y guarda resultados |
| `aggregate_dimensions(...)` | Calcula metricas segmentadas por zona, sucursal, municipio, campana, producto |
| `calculate_lifetime_metrics()` | Calcula dias activo y cancelado por orden |

**Que espera**:
- Tablas existentes en PostgreSQL: `Subscripciones`, `Subscripciones-logs`, `Subscripciones-logs-v15`
- Tabla `Subscripciones` con columnas: `Orden_Producto`, `fecha_inicio`, `Total`
- Tabla `Subscripciones-logs` con columnas: `orden`, `fecha_log`, `log`, `estado`
- Tabla `Subscripciones-logs-v15` con columnas: `orden`, `tipo`, `categoria`, `fecha`

**Pipeline ejecutado por `run()`**:
```
1. Carga de datos (DB a DataFrames)
2. Limpieza y normalizacion
3. Foto de activos al inicio del periodo
4. Foto de activos al final del periodo
5. Identificacion de nuevas suscripciones
6. Inactivos al inicio del periodo
7. Calculo de ARPU
8. Reactivaciones segmentadas por origen
9. Corte por factura impagada
10. Metodo Financiero (balance contable)
11. Metodo Operativo (transiciones en logs)
12. Guardado de tablas historicas
13. Calculo de KPIs (churn neto/bruto, winback, etc.)
14. Analisis por dimensiones
15. Calculo de tiempos de vida (Kaplan-Meier con lifelines)
```

**Dependencias**: `concurrent.futures`, `collections`, `pandas`, `backend.config.*`, `backend.database.DBConnector`, `backend.models.Periodo`, `backend.utils.parse_date`

---

#### `backend/imports.py`

**Proposito**: Logica de importacion y limpieza de archivos CSV de suscripciones y logs.

**Funciones**:

| Funcion | Entrada | Salida | Descripcion |
|---------|---------|--------|-------------|
| `import_subscriptions_csv(csv_path)` | Ruta a CSV | `int` (filas importadas) | Importa, limpia y consolida suscripciones |
| `import_logs_csv(csv_path)` | Ruta a CSV | `int` (filas importadas) | Importa y valida logs de cambios |

**Que espera `import_subscriptions_csv`**:
- CSV con columnas con nombres como `"Lineas de la orden/Referencia de la orden"`, `"Lineas de la orden/Producto"`, etc.
- Archivo `Planes.json` en la raiz del proyecto para validacion de productos
- Tablas `Subscripciones` y `Subscripciones-b` (se crean si no existen)
- Las tablas se TRUNCATE antes de insertar (reemplazo completo)

**Que espera `import_logs_csv`**:
- CSV con columnas: `"Logs de Cambios/Suscripcion"`, `"Logs de Cambios/Fecha de Cambio"`, `"Logs de Cambios/Nota"`, `"Logs de Cambios/Estado Interno de Suscripcion"`
- Tabla `Subscripciones-logs` (se TRUNCATE antes de insertar)
- Lanza `ValueError` si faltan columnas requeridas

**Proceso de `import_subscriptions_csv`**:
1. Lee CSV con pandas
2. Renombra columnas segun `SUBSCRIPTIONS_COLUMN_MAPPING`
3. Elimina filas de encabezados repetidos
4. Filtra solo columnas esperadas
5. Convierte cadenas vacias a NaN
6. Propaga metadatos con ffill por orden (groupby + ffill)
7. Consolida productos usando el primer match en `Planes.json`
8. Convierte nulos a None para PostgreSQL
9. Guarda detalle en `Subscripciones-b` y consolidado en `Subscripciones` via COPY

**Dependencias**: `json`, `pathlib`, `numpy`, `pandas`, `psycopg2`, `backend.config.DB_SCHEMA`, `backend.database.DBConnector`

---

#### `backend/data_api.py`

**Proposito**: Capa de acceso a datos que conecta las vistas web con las tablas de la BD.

**Funciones**:

| Funcion | Descripcion |
|---------|-------------|
| `get_cierre_churn(periodos=None)` | Retorna cierre_churn_historico agrupado por periodo_reporte con todos los metodos |
| `get_dimensiones(periodos=None)` | Retorna master_churn_dimensiones agrupado por periodo_reporte → dimension → valores |
| `get_periodos()` | Lista de periodos disponibles (desde cierre_churn_historico) |
| `get_tiempos_globales(periodos=None)` | Retorna curvas Kaplan-Meier (mediana, P25, P75, curvas CI, cohortes) desde master_tiempo_global |
| `get_dashboard_data()` | Combina cierre_churn + tiempos KM para el dashboard |
| `get_analytics_data(periodos=None)` | Combina cierre_churn + dimensiones + tiempos KM para analytics |

**Dependencias**: `backend.database.DBConnector`

---

### 4.2 App Django

Todas las rutas aqui son relativas a `frontend/analyzer_app/`.

#### `frontend/analyzer_app/forms.py`

**Proposito**: Formularios Django para la interfaz web.

**Clases**:

| Clase | Campos | Widget | Descripcion |
|-------|--------|--------|-------------|
| `MonthForm` | `month` (CharField) | `TextInput` con clase `month-picker` | Selector de mes (YYYY-MM) |
| `CSVUploadForm` | `csv_file` (FileField) | `FileInput` con `accept=.csv` | Subida de archivos CSV |

**Nota**: Los formularios se usan actualmente para validacion en las vistas API, no para renderizado directo (el frontend es SPA).

---

#### `frontend/analyzer_app/views.py`

**Proposito**: Vistas delgadas que conectan el frontend SPA con el backend. Todas retornan `JsonResponse`.

**Funciones**:

| Funcion | Ruta | Metodo | Descripcion |
|---------|------|--------|-------------|
| `dashboard(request)` | `/*` | GET | Sirve el HTML del contenedor SPA (unico template) |
| `api_dashboard_data(request)` | `/api/dashboard-data/` | GET | Datos para graficos del dashboard (cierre + tiempos) |
| `api_analytics_data(request)` | `/api/analytics-data/` | GET | Datos para analytics con filtro multiselect de periodos |
| `api_periods_list(request)` | `/api/periods/` | GET | Lista de periodos disponibles |
| `api_results_list(request)` | `/api/results/` | GET | Historial completo de resultados (plano) |
| `api_results_detail(request, periodo)` | `/api/results/<periodo>/` | GET | Detalle de un periodo (resumen + dimensiones + tiempos) |
| `api_run_analysis(request)` | `/api/run-analysis/` | POST | Ejecuta el analisis de churn, captura stdout/stderr |
| `api_import_subscriptions(request)` | `/api/import-subscriptions/` | POST | Importa CSV de suscripciones |
| `api_import_logs(request)` | `/api/import-logs/` | POST | Importa CSV de logs |

**Flujo de `api_run_analysis` (POST)**:
1. Recibe JSON `{"month": "YYYY-MM"}`
2. Construye `Periodo.build(f"{mes}-01")`
3. Redirige stdout/stderr a un buffer para capturar logs
4. Ejecuta `ChurnRateAnalyzer(DBConnector(), periodo).run()`
5. Restaura stdout/stderr y retorna el log capturado

**Flujo de `api_import_subscriptions` / `api_import_logs`**:
1. Recibe archivo via `request.FILES["csv_file"]`
2. Guarda a archivo temporal
3. Llama a `import_subscriptions_csv()` o `import_logs_csv()`
4. Elimina archivo temporal
5. Retorna JSON con conteo de filas

---

#### `frontend/analyzer_app/urls.py`

**Proposito**: Mapeo de rutas URL a las vistas de la aplicacion.

**Rutas SPA** (todas sirven el mismo template, el router JS decide que mostrar):

| Ruta | Vista | Nombre |
|------|-------|--------|
| `/` | `dashboard` | `dashboard` |
| `/import/subscriptions/` | `dashboard` | `import_subscriptions` |
| `/import/logs/` | `dashboard` | `import_logs` |
| `/analytics/` | `dashboard` | `analytics` |
| `/results/` | `dashboard` | `results_list` |
| `/results/<str:periodo>/` | `dashboard` | `results_detail` |

**Rutas API**:

| Ruta | Vista | Nombre |
|------|-------|--------|
| `GET /api/dashboard-data/` | `api_dashboard_data` | `api_dashboard_data` |
| `POST /api/run-analysis/` | `api_run_analysis` | `api_run_analysis` |
| `GET /api/analytics-data/` | `api_analytics_data` | `api_analytics_data` |
| `GET /api/periods/` | `api_periods_list` | `api_periods_list` |
| `GET /api/results/` | `api_results_list` | `api_results_list` |
| `GET /api/results/<str:periodo>/` | `api_results_detail` | `api_results_detail` |
| `POST /api/import-subscriptions/` | `api_import_subscriptions` | `api_import_subscriptions` |
| `POST /api/import-logs/` | `api_import_logs` | `api_import_logs` |

---

### 4.3 Proyecto Django

Todas las rutas aqui son relativas a `frontend/churn_web/`.

#### `frontend/churn_web/settings.py`

**Proposito**: Configuracion central del proyecto Django.

**Secciones**:

| Seccion | Descripcion |
|---------|-------------|
| Seguridad | `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` desde variables de entorno |
| Apps instaladas | `staticfiles`, `sessions`, `messages`, `analyzer_app` |
| Middleware | Security, Whitenoise, Session, Common, Csrf, Messages, XFrame |
| Base de datos | PostgreSQL usando `DB_USER` (no `USER`) para evitar colision con variable de sistema |
| Estaticos | Whitenoise con `CompressedManifestStaticFilesStorage` para produccion |
| Templates | Directorio `frontend/templates/` + directorios de apps |
| i18n | `es`, `America/Caracas` |

**Que espera**:
- Variables de entorno: `HOST`, `DB`, `DB_USER`, `PASS`, `PORT`, `SCHEMA`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`

---

#### `frontend/churn_web/wsgi.py`

**Proposito**: Punto de entrada WSGI para servidores como Gunicorn.

**Uso**:
```bash
gunicorn frontend.churn_web.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 300
```

---

#### `frontend/churn_web/asgi.py`

**Proposito**: Punto de entrada ASGI para servidores async (uso opcional).

---

#### `manage.py`

**Proposito**: Utilidad de linea de comandos de Django. Permite ejecutar `runserver`, `migrate`, `collectstatic`, etc.

**Uso**:
```bash
python manage.py runserver 0.0.0.0:8000
python manage.py migrate
python manage.py collectstatic
python manage.py check --deploy
```

---

### 4.4 Templates

Todos los templates estan en `frontend/templates/`.

#### `frontend/templates/base.html`

**Proposito**: Layout base de toda la aplicacion. Define la estructura HTML y carga las dependencias via CDN.

**CDN cargadas**:
- Bootstrap 5.3 (CSS + JS Bundle)
- Bootstrap Icons
- Chart.js v3+
- Chart.js Plugin Datalabels
- Google Fonts (Inter)

**Bloques Django**:
| Bloque | Proposito |
|--------|-----------|
| `title` | Titulo de la pestana |
| `extra_head` | CSS adicional por pagina |
| `content` | Contenido principal |
| `extra_js` | JavaScript adicional por pagina |

**Componentes**:
- Loading overlay (`#loading-overlay`) con spinner y texto dinámico
- Status toast (`#status-toast`) de Bootstrap para notificaciones
- Navbar incluido desde `includes/navbar.html`
- Meta tag `csrf-token` para peticiones AJAX

---

#### `frontend/templates/includes/navbar.html`

**Proposito**: Sidebar de navegacion lateral (no superior) con enlaces SPA usando `data-link`.

**Enlaces**:
- Dashboard (`/`)
- Importar Subscripciones (`/import/subscriptions/`)
- Importar Logs (`/import/logs/`)
- Analytics (`/analytics/`)
- Resultados Históricos (`/results/`)

**Funcionamiento**: Usa `data-link` y `data-target` para navegacion SPA via JavaScript (`initSpaRouter()`).

---

#### `frontend/analyzer_app/templates/analyzer/dashboard.html`

**Proposito**: Unico template HTML del SPA. Contiene todas las secciones que se muestran/ocultan segun la ruta:

**Secciones**:
- **Dashboard**: Formulario de mes + boton ejecutar + terminal de logs + tabla de ultimos resultados + graficos (churn, winback, ARPU, aporte, reemplazo, adiciones, curva KM, cortes vs reactivaciones)
- **Importar**: Drag & drop zone + selector de tipo (subscriptions/logs) + barra de progreso
- **Analytics**: Filtro multiselect de periodos + tarjetas KPI + graficos por dimension (doughnut, pie, bar, hbar)
- **Resultados**: Tabla de historial + buscador + modal de detalle con resumen (22 campos) y desglose por dimensiones (18 columnas)

**No recibe variables de contexto del servidor** — todo se carga via fetch a las APIs.

---

### 4.5 Archivos Estaticos

Todos en `frontend/static/`.

#### `frontend/static/css/styles.css`

**Proposito**: Estilos personalizados (~980 lineas) con sistema de tema claro/oscuro mediante variables CSS.

**Sistema de diseño**:
- `:root` define paleta oscura (azul-pizarra) y `.light-mode` sobreescribe con paleta Slate (gris neutro)
- `--surface-*` fondos, `--text-*` colores de texto, `--primary`/`--accent` colores de accion
- `--shadow-*` sombras progresivas, `--radius` borde uniforme de 8px

**Secciones principales**:

| Seccion | Descripcion |
|---------|-------------|
| Layout | Sidebar fijo (280px) + main-content con margen |
| Sidebar | Branding, navegacion con hover/active, footer con toggle de tema |
| Tarjetas | Cards con sombra y hover translateY(-2px) |
| Metricas | `.metric-card` centradas con hover y label en uppercase |
| Tablas | Sticky header con `z-index`, filas pares con fondo sutil |
| Formularios | Inputs/selects con fondo del tema, focus con borde azul |
| Drop zone | Drag & drop con borde dashed y hover |
| Terminal | Consola con fondo fijo `#050b18` (independiente del tema) |
| Overlay de carga | Fixed fullscreen con backdrop-filter blur y spinner |
| Modal | Overrides de Bootstrap (.modal-content, sticky header/col) |
| Tablas modales | `.table-modal-dim` con sticky header + columna, `.table-modal-sum` con separadores |
| Scrollbar | Delgada (6px) con color del borde del tema |
| Responsive | Breakpoints a 992px y 768px (sidebar se reduce) |

**Dependencias**: Bootstrap 5.3, Bootstrap Icons, Chart.js v3+ (todos via CDN)

---

#### `frontend/static/js/main.js`

**Proposito**: SPA JavaScript (~1170 lineas) que maneja toda la interaccion del cliente.

**Funciones principales**:

| Funcion | Descripcion |
|---------|-------------|
| `initSpaRouter()` | Router SPA: captura clicks en `a[data-link]`, maneja `popstate`, navega sin recargar |
| `navigate(path)` | Muestra/oculta pestañas SPA, carga datos via API segun la ruta |
| `initThemeManager()` | Toggle claro/oscuro, persiste en localStorage, refresca graficos |
| `initMonthPicker()` | Selector de mes/ano con dos `<select>` sincronizados |
| `loadDashboardData()` | Fetch a `/api/dashboard-data/` → renderiza graficos + tabla |
| `renderDashboardCharts()` | 9 graficos Chart.js con animaciones (800ms, easeOutQuart) |
| `renderChurnComparativo()` | Promedio de churn coloreado (verde/amarillo/rojo) |
| `makeThresholdPlugin()` | Plugin personalizado de Chart.js para bandas de umbral + linea objetivo |
| `destroyDashboardCharts()` | Destruye todas las instancias de graficos del dashboard |
| `loadAnalyticsData()` | Fetch a `/api/analytics-data/` con filtro multiselect |
| `renderAnalyticsCards()` | 20 tarjetas KPI con colores condicionales |
| `renderDimensionCharts()` | Graficos por dimension con agrupacion "Otros" (<2.5%) |
| `averageDimensionData()` | Promedia datos de multiples periodos para analytics |
| `initAnalysisExecutor()` | POST a `/api/run-analysis/` con captura de terminal en vivo |
| `initCSVImporter()` | Drag & drop + upload con barra de progreso |
| `initResultsDetailsModal()` | Modal de detalle con resumen y dimensiones |
| `renderModalSummaries()` | Tabla de 22 campos por metodo con colores condicionales |
| `renderModalDimensions()` | Tabla de 18 columnas con sticky header/columna |
| `chartOpts()` / `lineOpts()` / `barOpts()` | Helpers de opciones de Chart.js |

**Graficos del Dashboard** (9 en total):
1. `churnLineChart` — Barras de promedios + 4 lineas de churn (segmentadas por color verde/amarillo/rojo)
2. `winbackBarChart` — Barras + linea de tendencia blanca
3. `arpuBarChart` — Barras + linea de tendencia blanca
4. `aporteReactBarChart` — Barras + linea de tendencia amarilla
5. `reemplazoLineChart` — Linea simple
6. `adicionesBarChart` — Barras apiladas netas+brutas
7. `kmSurvivalChart` — Curva Kaplan-Meier (step chart) con:
    - Curva Global con IC 95% (área sombreada)
    - Curvas Financiero/Operativo (líneas punteadas)
    - Cohortes mensuales (toggle, opacidad reducida)
    - Risk table: n_riesgo y supervivencia en tiempos clave
    - Stats row: mediana, P25, P75, n_total, eventos, censurados
    - Radio toggle: "Días Activo" / "Días Cancelado"
8. `cortesReactChart` — Dos lineas con area (roja para cortes, verde para reactivaciones)

**Graficos de Analytics** (por dimension × metrica):
- doughnut: churn_neto, churn_bruto, winback, aporte_react
- pie: prom_dias_activo, prom_dias_cancelado
- bar (vertical): adiciones_netas, adiciones_brutas
- hbar (horizontal): ARPU, corte_impagado
- Todos aplican umbral <2.5% para agrupar en "Otros" (promedio, siempre al final)

**Dependencias**: Bootstrap 5 JS, Chart.js v3+, Chart.js Plugin Datalabels, Bootstrap Icons (todos via CDN)

---

### 4.6 CLI

#### `cli.py`

**Proposito**: Entrypoint de linea de comandos independiente de Django. Permite importar datos y ejecutar analisis directamente desde la terminal.

**Dependencias**: `backend.*` (database, models, analyzer, imports). No carga `.env` — el backend lo hace internamente.

**Comandos**:

| Comando | Descripcion |
|---------|-------------|
| `python cli.py import subs <csv_path>` | Importa suscripciones desde CSV |
| `python cli.py import logs <csv_path>` | Importa logs desde CSV |
| `python cli.py analyze <YYYY-MM>` | Ejecuta analisis de churn para el mes dado |
| `python cli.py run-all <YYYY-MM> <subs_csv> <logs_csv>` | Importa ambos CSVs + ejecuta analisis |

**Ejemplos**:
```bash
python cli.py import subs ./datos/suscripciones.csv
python cli.py import logs ./datos/logs.csv
python cli.py analyze 2026-04
python cli.py run-all 2026-06 ./subs.csv ./logs.csv
```

---

### 4.6 Infraestructura

#### `Dockerfile`

**Proposito**: Construye la imagen Docker del proyecto.

**Etapas**:
1. `FROM python:3.11-slim` — imagen base liviana
2. `WORKDIR /app` — directorio de trabajo
3. `COPY requirements.txt` + `pip install` — cachea dependencias
4. `COPY .` — copia el codigo fuente
5. `RUN collectstatic` — compila archivos estaticos con Whitenoise
6. `EXPOSE 8000` — expone el puerto
7. `CMD gunicorn` — inicia el servidor con timeout de 300s

**Que espera**:
- Archivo `.env` o variables de entorno en el container
- PostgreSQL accesible desde el container

---

#### `requirements.txt`

**Proposito**: Lista de dependencias Python del proyecto.

| Dependencia | Version | Proposito |
|-------------|---------|-----------|
| django | >=5.0.0 | Framework web |
| gunicorn | >=21.2.0 | Servidor WSGI para produccion |
| whitenoise | >=6.0.0 | Servir archivos estaticos en produccion |
| pandas | >=2.0.0 | Manipulacion de datos (DataFrames) |
| numpy | >=1.24.0 | Operaciones numericas |
| psycopg2-binary | >=2.9.0 | Driver PostgreSQL |
| python-dotenv | >=1.0.0 | Carga de variables de entorno desde .env |

---

## 5. Flujo de Datos

### 5.1 Importacion de CSV → Base de Datos

```
Via CLI:                           Via Web:
python cli.py import subs ./a.csv  POST /api/import-subscriptions/ (drag & drop)
python cli.py import logs ./b.csv  POST /api/import-logs/


               CSV
                │
                ▼
         import_subscriptions_csv()  /  import_logs_csv()
                │
                ├──► Lee CSV con pandas
                ├──► Renombra columnas segun mapping
                ├──► Limpia encabezados repetidos / valida columnas
                ├──► Propaga metadatos (ffill por orden) [solo subs]
                ├──► Consolida productos (primer match en Planes.json) [solo subs]
                │
                ├──► Subscripciones / Subscripciones-b ──► PostgreSQL (COPY)
                └──► Subscripciones-logs ──► PostgreSQL (COPY)
```

### 5.2 Ejecucion de Analisis → Resultados

```
Via CLI:                           Via Web:
python cli.py analyze 2026-06     POST /api/run-analysis/ {month:"2026-06"}
                │                               │
                ▼                               ▼
         ChurnRateAnalyzer(DBConnector, periodo).run()
                │
                ├──► load_data()
                │       ├──► read_table("Subscripciones") ──► DataFrame
                │       ├──► read_table("Subscripciones-logs") ──► DataFrame
                │       └──► read_table("Subscripciones-logs-v15") ──► DataFrame
                │
                ├──► build_clean_data()
                │       └──► Normaliza y combina logs v14 + v15
                │
                ├──► get_active_at(inicio) → activos_inicio
                ├──► get_active_at(final)   → activos_final
                ├──► nuevos → suscripciones con f_ini_dt en el periodo
                ├──► get_reactivations(act_fin) → reactivaciones
                ├──► get_corte_impagado()  → cortes
                │
                ├──► Calculo KPI (churn neto/bruto, winback, ARPU, etc.)
                │
                ├──► save_historico → master_activos_cierre
                ├──► save_historico → master_reactivaciones
                ├──► save_historico → master_bajas_detalladas (Financiero y Operativo)
                ├──► save_historico → master_corte_impagado
                ├──► save_historico → cierre_churn_historico (KPI)
                │
                ├──► calculate_lifetime_metrics(bajas_fin_set, bajas_op_set)
                │       ├──► _compute_km() # Kaplan-Meier interno
                │       ├──► save_historico → master_tiempos_vida (detalle por orden)
                │       └──► save_historico → master_tiempo_global (curvas KM + cohortes)
                │
                └──► aggregate_dimensions()
                        └──► save_historico → master_churn_dimensiones

                ▼
         CLI: stdout en terminal
         Web: JSON con log capturado → terminal en el navegador
```

### 5.3 Visualizacion de Resultados (SPA)

```
Navegador (SPA)
       │
       ├──► /  → dashboard
       │       fetch(/api/dashboard-data/) → 9 graficos + tabla
       │
       ├──► /analytics/ → analytics
       │       fetch(/api/analytics-data/?periods=...) → 20 KPI + graficos por dimension
       │
       ├──► /results/ → historial
       │       fetch(/api/results/) → tabla completa + buscador
       │       click en boton → fetch(/api/results/<periodo>/) → modal con:
       │           ├── Resumen (22 campos por metodo, tabla compacta)
       │           └── Dimensiones (18 columnas, sticky header + columna)
       │
       └──► /import/subscriptions|logs → importador
               POST /api/import-subscriptions|logs con FormData → barra de progreso
```

---

## 6. Pipeline de Analisis

### 6.1 Formulas detalladas

| Metrica | Formula | Explicacion |
|---------|---------|-------------|
| **Activos inicio** | Ultimo registro antes de `fecha_inicio` con estado `3_progress` | Foto de cartera al iniciar el periodo |
| **Activos final** | Ultimo registro hasta `fecha_final` con estado `3_progress` | Foto de cartera al cerrar el periodo |
| **Nuevos** | Suscripciones con `fecha_inicio` dentro del periodo | Altas del mes |
| **Bajas netas (Financiero)** | `max(0, activos_inicio + nuevos - activos_final)` | Balance contable simple |
| **Bajas netas (Operativo)** | Transiciones de `3_progress` a `4_paused`/`6_churn` dentro del periodo | Conteo de eventos reales |
| **Bajas brutas** | `bajas_netas + reactivaciones_auditables` | Bajas netas mas reactivaciones que evitan que la baja se refleje |
| **Churn neto** | `(bajas_netas / activos_inicio) * 100` | Porcentaje de perdida neta |
| **Churn bruto** | `(bajas_brutas / activos_inicio) * 100` | Porcentaje de perdida bruta (incluye reactivaciones) |
| **ARPU** | `sum(Total de activos final) / activos_final` | Ingreso promedio por usuario |
| **Tasa Winback** | `(reactivaciones_unicas / inactivos_inicio) * 100` | Porcentaje de inactivos que se reactivan |
| **Tasa Aporte React** | `(react_6_8 / (nuevos + react_6_8)) * 100` | Que porcentaje de las "altas" son reactivaciones |
| **Indice Reemplazo** | `(react_6_8 / bajas_fin_netas) * 100` | Que porcentaje de bajas se compensan con reactivaciones |
| **Adiciones Brutas** | `nuevos - bajas_fin_netas` | Crecimiento neto sin reactivaciones |
| **Adiciones Netas** | `(nuevos + react_6_8) - bajas_fin_netas` | Crecimiento neto incluyendo reactivaciones |
| **Dias activo** | `f_primer_churn - f_inicio` | Tiempo hasta la primera cancelacion |
| **Dias cancelado** | `f_primera_reactivacion - f_churn` | Tiempo hasta la primera reactivacion |

### 6.2 Estados del ciclo de vida

```
3_progress (Activo)
    │
    ├──► 4_paused (Pausado por el cliente)
    ├──► 6_churn (Cancelado / baja definitiva)
    └──► 8_30days (Moroso 30+ dias)

Cualquier inactivo (4, 6, 8) ──► 3_progress = Reactivacion
```

### 6.3 Reactivaciones

Solo se consideran reactivaciones validas si:
1. El log contiene la palabra "reactivacion" (insensible a mayusculas/accentos)
2. Ocurre dentro del periodo de analisis
3. El estado de origen es valido: `4_paused`, `6_churn` o `8_30days`
4. La suscripcion NO es nueva en el mismo periodo
5. La suscripcion esta activa al cierre del periodo

### 6.4 Dimensiones

El analisis se desglosa por las siguientes dimensiones (obtenidas de la tabla `Subscripciones`):
- `zona` — Zona geografica
- `sucursal` — Sucursal comercial
- `municipio` — Municipio
- `campanna` — Campana de marketing
- `producto` — Plan contratado

Para cada dimension se calculan las mismas metricas que en el resumen global.

---

## 7. Base de Datos

### 7.1 Tablas de entrada

| Tabla | Origen | Columnas clave |
|-------|--------|----------------|
| `Subscripciones` | Importacion CSV | `Orden_Producto`, `fecha_inicio`, `Total`, `Zona`, `Sucursal`, `Municipio`, `campanna`, `Producto` |
| `Subscripciones-b` | Importacion CSV | Detalle por linea de orden (mismas columnas + duplicados) |
| `Subscripciones-logs` | Importacion CSV | `orden`, `fecha_log`, `log`, `estado` |
| `Subscripciones-logs-v15` | Importacion CSV | `orden`, `tipo`, `categoria`, `fecha` |

### 7.2 Tablas de salida

| Tabla | Contenido | Actualizacion |
|-------|-----------|---------------|
| `cierre_churn_historico` | KPIs por periodo y metodo | DELETE + INSERT por periodo |
| `master_activos_cierre` | Cartera activa al cierre del periodo | DELETE + INSERT por periodo |
| `master_reactivaciones` | Reactivaciones del periodo | DELETE + INSERT por periodo |
| `master_bajas_detalladas` | Bajas (Financiero y Operativo) | DELETE + INSERT por periodo+metodo |
| `master_corte_impagado` | Cortes por factura impaga | DELETE + INSERT por periodo |
| `master_inactivos_detallados` | Inactivos al inicio del periodo | DELETE + INSERT por periodo |
| `master_tiempos_vida` | Tiempo activo y cancelado por orden (para referencia) | DELETE + INSERT por periodo |
| `master_tiempo_global` | Curvas Kaplan-Meier (mediana, P25, P75, curva_activo_json, curva_cancelado_json, cohortes) por método (Global/Financiero/Operativo) | DELETE + INSERT por periodo |
| `master_churn_dimensiones` | Metricas por dimension | DELETE + INSERT por periodo |

### 7.3 Esquema

Todas las tablas usan columnas de tipo `text` (creadas automaticamente por `save_historico()`). La columna `periodo_reporte` identifica a que periodo pertenece cada fila.

---

## 8. Casos de Prueba

### 8.1 Pruebas unitarias (modulo backend)

#### `test_periodo_build()`

```python
# Proposito: Verificar que Periodo.build() calcula correctamente los rangos
# Dependencia: models.py, utils.py

# Caso 1: Solo mes
p = Periodo.build("2026-04")
assert p.fecha_inicio == datetime(2026, 4, 1, 0, 0, 0)
assert p.fecha_final == datetime(2026, 4, 30, 23, 59, 59)

# Caso 2: Rango completo
p = Periodo.build("2026-04-01", "2026-04-15")
assert p.fecha_inicio == datetime(2026, 4, 1, 0, 0, 0)
assert p.fecha_final == datetime(2026, 4, 15, 23, 59, 59)

# Caso 3: Mes invalido
try:
    Periodo.build("invalido")
    assert False, "Debio lanzar ValueError"
except ValueError:
    pass

# Caso 4: label()
p = Periodo.build("2026-04")
assert p.label() == "2026-04-01 al 2026-04-30"
```

#### `test_normalize_text()`

```python
# Proposito: Verificar normalizacion de texto
# Dependencia: utils.py

assert normalize_text("Corté Automático") == "corte automatico"
assert normalize_text("") == ""
assert normalize_text(None) == ""
assert normalize_text(123) == "123"
assert normalize_text("  HOLA  ") == "hola"
```

#### `test_parse_date()`

```python
# Proposito: Verificar parseo de fechas en multiples formatos
# Dependencia: utils.py, config.py

# Formato ISO
d = parse_date("2026-04-15")
assert d is not None
assert d.month == 4

# Formato DD/MM/YYYY
d = parse_date("15/04/2026")
assert d is not None
assert d.day == 15

# Formato DD-MM-YYYY
d = parse_date("15-04-2026")
assert d is not None

# Fecha invalida
assert parse_date(None) is None
assert parse_date("") is None
```

#### `test_database_connection()`

```python
# Proposito: Verificar conexion a PostgreSQL
# Dependencia: database.py, config.py
# Requiere: PostgreSQL accesible con las env vars configuradas

db = DBConnector()
with db.get_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT 1")
    assert cur.fetchone()[0] == 1
```

#### `test_read_table()`

```python
# Proposito: Verificar lectura de tabla existente
# Dependencia: database.py
# Requiere: Tabla Subscripciones existente en BD

db = DBConnector()
df = db.read_table("Subscripciones")
assert isinstance(df, pd.DataFrame)
assert not df.empty
```

#### `test_import_subscriptions_mapping()`

```python
# Proposito: Verificar que el mapping de columnas cubre todos los casos
# Dependencia: imports.py

expected = {
    "Lineas de la orden/Referencia de la orden",
    "Lineas de la orden/Producto",
    "Lineas de la orden/Producto/Nombre",
    "Lineas de la orden/Cliente",
    "Lineas de la orden/Cliente/CI/RIF",
    "Sucursal", "Zona", "Lineas de la orden/Cliente/Municipio",
    "Tipo de Servicio", "Estado de la Suscripcion", "Campania",
    "Proxima Fecha de Factura", "Fecha de inicio", "Total"
}
assert set(SUBSCRIPTIONS_COLUMN_MAPPING.keys()) == expected
```

### 8.2 Pruebas de integracion

#### `test_analisis_completo()`

```python
# Proposito: Verificar que el pipeline completo se ejecuta sin errores
# Dependencia: analyzer.py, database.py, models.py
# Requiere: Tablas de entrada con datos

db = DBConnector()
periodo = Periodo.build("2026-04")
analyzer = ChurnRateAnalyzer(db, periodo)

# Ejecutar pipeline
analyzer.run()

# Verificar que se guardaron resultados
df = db.read_table("cierre_churn_historico")
assert not df.empty
assert "periodo_reporte" in df.columns
```

### 8.3 Pruebas de API (Django)

#### `test_dashboard_get()`

```python
# Proposito: Verificar que el dashboard carga correctamente
from django.test import Client

client = Client()
response = client.get("/")
assert response.status_code == 200
assert "form" in response.context
```

#### `test_import_subscriptions_get()`

```python
client = Client()
response = client.get("/import/subscriptions/")
assert response.status_code == 200
assert "import_type" in response.context
assert response.context["import_type"] == "Subscripciones"
```

#### `test_import_logs_get()`

```python
client = Client()
response = client.get("/import/logs/")
assert response.status_code == 200
assert response.context["import_type"] == "Logs"
```

#### `test_results_list()`

```python
client = Client()
response = client.get("/results/")
assert response.status_code == 200
```

### 8.4 Pruebas de carga

```python
# Proposito: Verificar que el sistema maneja grandes volumenes
# Escenario: 100,000 suscripciones, 500,000 logs
# Requiere: Datos de prueba masivos en BD

db = DBConnector()
periodo = Periodo.build("2026-04")
analyzer = ChurnRateAnalyzer(db, periodo)

import time
start = time.time()
analyzer.run()
elapsed = time.time() - start
print(f"Analisis completado en {elapsed:.2f}s")

# Verificar timeout
assert elapsed < 300, "El analisis no debe exceder 5 minutos"
```

---

## 9. Ejemplos de Uso

### 9.1 CLI: Importar suscripciones

```bash
python cli.py import subs ./datos/suscripciones.csv
# Output: Importadas 2345 suscripciones
```

### 9.2 CLI: Importar logs

```bash
python cli.py import logs ./datos/logs.csv
# Output: Importados 15678 logs
```

### 9.3 CLI: Ejecutar analisis

```bash
python cli.py analyze 2026-06
# Output: Sincronizando con base de datos...
# ANALISIS COMPLETADO | Periodo: 2026-06-01 al 2026-06-30
# Base Inicio: 1234 | Nuevos: 98 | Base Final: 1289
# ...
```

### 9.4 CLI: Pipeline completo (import + analyze)

```bash
python cli.py run-all 2026-06 ./subs.csv ./logs.csv
```

### 9.5 Web: Ejecutar analisis

```
1. Abrir http://servidor:8000
2. Seleccionar mes y año con los dropdowns (Mes/Año)
3. Hacer clic en "Ejecutar analisis"
4. Ver la consola integrada con el progreso del analisis
5. Al finalizar, ver los 9 graficos del dashboard con animaciones
```

### 9.6 Web: Importar CSVs (drag & drop)

```
1. Ir a "Importar" por el sidebar
2. Seleccionar tipo: Subscripciones o Logs
3. Arrastrar archivo CSV al área de drop o hacer clic en "Buscar archivos"
4. Hacer clic en "Subir e importar"
5. Ver barra de progreso animada
6. Ser redirigido al dashboard automaticamente
```

### 9.7 Web: Ver Analytics

```
1. Ir a "Analytics" por el sidebar
2. Usar el filtro multiselect para seleccionar periodos
3. Ver 20 tarjetas KPI con colores condicionales (verde/amarillo/rojo)
4. Desplazarse para ver graficos por dimension:
   - Doughnut: Churn Neto, Churn Bruto, Winback, Aporte React.
   - Pie: Prom. Días Activo, Prom. Días Cancelado
   - Barras: Adiciones Netas/Brutas
   - Barras horizontales: ARPU, Corte Impago
```

### 9.8 Web: Ver resultados historicos

```
1. Ir a "Resultados" por el sidebar
2. Ver tabla completa con buscador por periodo/metodo
3. Hacer clic en el ojo (👁) de cualquier fila
4. Modal muestra:
   - Resumen por metodo con 22 metricas (Base Inicio, Churn, ARPU, etc.)
   - Desglose por dimensiones con 18 columnas (tabla con scroll horizontal,
     cabecera sticky y primera columna fija)
```

### 9.9 Desplegar actualizacion (servidor)

```bash
cd /ruta/NetOwl-Django
git pull origin master
docker compose build app
docker compose up -d app
```

### 9.10 Acceder a logs del container

```bash
docker compose logs -f app
```

### 9.11 Prueba de conexion a BD

```bash
docker compose exec app python -c "
from backend.database import DBConnector
db = DBConnector()
with db.get_connection() as conn:
    cur = conn.cursor()
    cur.execute('SELECT version()')
    print(cur.fetchone()[0])
"
```

---

## 10. Solucion de Problemas

### 10.1 Error: "No such file or directory: 'Planes.json'"

**Causa**: El path relativo a `Planes.json` no se resuelve correctamente.

**Solucion**: Verificar que `PLANES_PATH` en `imports.py` apunte correctamente:
```python
# Desde analyzer_app/backend/imports.py, 3 niveles parent = raiz del proyecto
PLANES_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "Planes.json"
```

### 10.2 Error: "You cannot add messages without installing django.contrib.messages.middleware.MessageMiddleware"

**Causa**: Falta el middleware de mensajes de Django.

**Solucion**: Verificar `settings.py`:
```python
INSTALLED_APPS = ["django.contrib.sessions", "django.contrib.messages", ...]
MIDDLEWARE = ["django.contrib.sessions.middleware.SessionMiddleware", "django.contrib.messages.middleware.MessageMiddleware", ...]
```

### 10.3 Error: CSS/JS no cargan (404)

**Causa**: `DEBUG=False` pero no se ejecuto `collectstatic`.

**Solucion**: 
```bash
python manage.py collectstatic --noinput
# O en Docker: asegurar que el Dockerfile tiene RUN python manage.py collectstatic --noinput
```

### 10.4 Error: "relation does not exist"

**Causa**: La tabla no existe en el esquema configurado.

**Solucion**: Verificar que `SCHEMA` en `.env` coincide con el esquema donde estan las tablas. Ejecutar primero una importacion para crear las tablas de entrada.

### 10.5 Error: "could not connect to server: Connection refused"

**Causa**: PostgreSQL no accesible desde el container.

**Solucion**:
1. Verificar que ambos containers estan en la misma red Docker
2. Verificar que `HOST` apunta al nombre del servicio PostgreSQL (ej. `db`, no `localhost`)
3. Verificar que el container PostgreSQL esta corriendo

### 10.6 Error: "FATAL: password authentication failed"

**Causa**: Credenciales incorrectas.

**Solucion**: Verificar las variables `DB_USER`, `PASS` en el environment del compose contra las credenciales reales de PostgreSQL. Recordar que se usa `DB_USER` (no `USER`) para evitar colision con la variable de sistema `USER` de Linux.

### 10.7 Error: El analisis tarda mas de 5 minutos

**Causa**: Volumen masivo de datos o PostgreSQL lento.

**Solucion**:
1. Aumentar `--timeout` en el `CMD` del Dockerfile (ej. `--timeout 600`)
2. Agregar indices en las tablas de PostgreSQL en columnas de filtro (`orden`, `fecha_log`, `f_dt`)
3. Verificar recursos del servidor (CPU, RAM, disco)

### 10.8 Error: Flatpickr no se muestra

**Causa**: CDN de Flatpickr bloqueado o error de carga.

**Solucion**:
1. Verificar conexion a Internet
2. Verificar que las URLs de CDN en `base.html` son accesibles
3. Alternativa: descargar Flatpickr localmente y servirlo desde `/static/`

---

***Autor:*** *Angel Flores*
