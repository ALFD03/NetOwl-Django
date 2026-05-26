# Documentacion del Sistema - Churn Rate Analyzer

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
   - [4.6 Infraestructura](#46-infraestructura)
5. [Flujo de Datos](#5-flujo-de-datos)
6. [Pipeline de Analisis](#6-pipeline-de-analisis)
7. [Base de Datos](#7-base-de-datos)
8. [Casos de Prueba](#8-casos-de-prueba)
9. [Ejemplos de Uso](#9-ejemplos-de-uso)
10. [Solucion de Problemas](#10-solucion-de-problemas)

---

## 1. Vision General

**Churn Rate Analyzer** es un sistema web para el calculo y analisis de la tasa de cancelacion de suscripciones (churn rate) de un proveedor de servicios de Internet. Permite importar datos desde archivos CSV, ejecutar un pipeline completo de analisis financiero y operativo, y visualizar metricas segmentadas por dimensiones geograficas y comerciales.

### Funcionalidades principales

- **Importacion de CSVs**: Carga y limpia archivos de suscripciones y logs de cambios
- **Analisis mensual**: Calcula churn neto/bruto por metodo financiero y operativo
- **Metricas de reactivacion**: Cuantifica winback, reactivaciones por origen y tasas de aporte
- **Analisis dimensional**: Desglosa metricas por zona, sucursal, municipio, campana y producto
- **Tiempos de vida**: Calcula promedios de dias activo y cancelado por suscripcion
- **Visualizacion web**: Dashboard interactivo con tarjetas de metricas y tablas historicas

### Tecnologias

| Componente | Tecnologia |
|------------|-----------|
| Backend web | Django 5 + Python 3.11 |
| Logica de negocio | Python (pandas, numpy) |
| Base de datos | PostgreSQL 15+ |
| Frontend | Bootstrap 5, Flatpickr, CSS propio |
| Servidor WSGI | Gunicorn |
| Estaticos | Whitenoise |
| Contenedor | Docker + Docker Compose |

---

## 2. Arquitectura del Sistema

```
                     +---------------------+
                     |    Navegador Web     |
                     |  (Bootstrap + JS)   |
                     +----------+----------+
                                |
                           HTTP :8000
                                |
                     +----------+----------+
                     |     Gunicorn         |
                     |   (WSGI Server)      |
                     +----------+----------+
                                |
                     +----------+----------+
                     |      Django          |
                     |   (churn_web/)       |
                     +----------+----------+
                                |
                     +----------+----------+
                     |   analyzer_app/      |
                     |   (Vistas + Forms)   |
                     +----------+----------+
                                |
                     +----------+----------+
                     | analyzer_app/backend/|
                     | (Logica de negocio)  |
                     +----------+----------+
                                |
                     +----------+----------+
                     |     PostgreSQL       |
                     |  (Base de datos)     |
                     +---------------------+
```

### Flujo de una peticion tipica

1. Usuario ingresa mes en el dashboard y hace clic en "Ejecutar analisis"
2. Django recibe el POST en `views.dashboard()`
3. Se construye un objeto `Periodo` con la fecha ingresada
4. Se instancia `ChurnRateAnalyzer` con un `DBConnector` y el `Periodo`
5. `analyzer.run()` ejecuta el pipeline completo:
   - Lee tablas desde PostgreSQL mediante `DBConnector.read_table()`
   - Procesa los DataFrames con pandas
   - Guarda resultados en tablas historicas via `DBConnector.save_historico()`
6. Django consulta `cierre_churn_historico` para obtener las metricas
7. Las metricas se renderizan como tarjetas en el template HTML
8. El navegador muestra el resultado al usuario

---

## 3. Estructura de Directorios

```
ChurnRateAnalyzer/
├── manage.py                          # Entry point de Django
├── requirements.txt                   # Dependencias Python
├── Dockerfile                         # Imagen Docker
├── .env.example                       # Template de variables de entorno
├── .dockerignore                      # Exclusiones para Docker build
├── Planes.json                        # Catalogo de planes de Internet
├── Zonas.json                         # Catalogo de zonas geograficas
├── README.md                          # Guia rapida
├── documentacion.md                   # Este archivo
│
├── churn_web/                         # Proyecto Django
│   ├── __init__.py
│   ├── settings.py                    # Configuracion general
│   ├── urls.py                        # Rutas raiz
│   ├── wsgi.py                        # WSGI para Gunicorn
│   └── asgi.py                        # ASGI opcional
│
├── analyzer_app/                      # App Django principal
│   ├── __init__.py
│   ├── apps.py                        # Configuracion de la app
│   ├── admin.py                       # Admin (vacio)
│   ├── urls.py                        # Rutas de la app
│   ├── views.py                       # Vistas (logica de controladores)
│   ├── forms.py                       # Formularios Django
│   │
│   ├── backend/                       # Logica de negocio (nucleo)
│   │   ├── __init__.py                # Exportaciones del paquete
│   │   ├── config.py                  # Constantes y variables de entorno
│   │   ├── utils.py                   # Funciones auxiliares
│   │   ├── models.py                  # Modelos de dominio (Periodo)
│   │   ├── database.py                # Conexion y operaciones con BD
│   │   ├── analyzer.py                # Pipeline de analisis de churn
│   │   └── imports.py                 # Importacion y limpieza de CSV
│   │
│   └── templates/analyzer/            # Templates HTML
│       ├── dashboard.html             # Pagina principal
│       ├── import_csv.html            # Formulario de subida de CSV
│       ├── results_list.html          # Lista de periodos analizados
│       └── results_detail.html        # Detalle de un periodo
│
├── templates/                         # Templates raiz
│   ├── base.html                      # Layout base (Bootstrap + Flatpickr)
│   └── includes/navbar.html           # Barra de navegacion
│
└── static/                            # Archivos estaticos
    ├── css/styles.css                 # Estilos personalizados
    └── js/main.js                     # JavaScript personalizado
```

---

## 4. Descripcion de Archivos

### 4.1 Backend (analizador)

#### `analyzer_app/backend/config.py`

**Proposito**: Contiene todas las constantes de configuracion del sistema y carga las variables de entorno.

**Que espera**:
- Archivo `.env` en la raiz del proyecto con las variables:
  - `HOST`, `DB`, `USER`, `PASS`, `PORT` → conexion a PostgreSQL
  - `SCHEMA` → esquema de base de datos (default: `public`)

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

#### `analyzer_app/backend/utils.py`

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

#### `analyzer_app/backend/models.py`

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

#### `analyzer_app/backend/database.py`

**Proposito**: Manejador de conexiones a PostgreSQL. Proporciona operaciones de lectura/escritura de DataFrames.

**Clases**:

| Clase | Descripcion |
|-------|-------------|
| `DBConnector` | Pool de conexiones PostgreSQL con helpers para pandas |

**Metodos de `DBConnector`**:

| Metodo | Descripcion |
|--------|-------------|
| `__init__()` | Inicializa pool de 1-10 conexiones usando variables de entorno (`HOST`, `DB`, `USER`, `PASS`, `PORT`) |
| `get_connection()` | Context manager que obtiene y devuelve conexion del pool |
| `connect()` | Crea conexion directa (sin pool) |
| `read_table(table_name, columns=None)` | Lee tabla completa como DataFrame. Si `columns` es `None`, lee todas las columnas. |
| `save_historico(df, table_name, periodo, metodo=None)` | Guarda DataFrame en tabla historica. Crea tabla si no existe, agrega columnas faltantes, elimina datos previos del mismo periodo. |
| `copy_dataframe(df, table_name)` | Carga masiva (COPY) de DataFrame a tabla existente usando formato TSV |

**Que espera**:
- Variables de entorno: `HOST`, `DB`, `USER`, `PASS`, `PORT` (default `5432`)
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

#### `analyzer_app/backend/analyzer.py`

**Proposito**: Nucleo del sistema. Implementa el pipeline completo de calculo de churn rate.

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
15. Calculo de tiempos de vida
```

**Dependencias**: `concurrent.futures`, `collections`, `pandas`, `backend.config.*`, `backend.database.DBConnector`, `backend.models.Periodo`, `backend.utils.parse_date`

---

#### `analyzer_app/backend/imports.py`

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

### 4.2 App Django

#### `analyzer_app/forms.py`

**Proposito**: Formularios Django para la interfaz web.

**Clases**:

| Clase | Campos | Widget | Descripcion |
|-------|--------|--------|-------------|
| `MonthForm` | `month` (CharField) | `TextInput` con clase `month-picker` | Selector de mes con Flatpickr (calendario visual, solo lectura) |
| `CSVUploadForm` | `csv_file` (FileField) | `FileInput` con `accept=.csv` | Subida de archivos CSV |

**Que espera**:
- `MonthForm`: valor en formato `YYYY-MM` (ej. `2026-04`)
- `CSVUploadForm`: archivo con extension `.csv`

**Validacion**:
- `MonthForm`: max_length=7, el resto de la validacion se hace en la vista
- `CSVUploadForm`: solo acepta archivos CSV (por el atributo `accept` en HTML)

---

#### `analyzer_app/views.py`

**Proposito**: Controladores Django que manejan las peticiones HTTP y orquestan la logica.

**Funciones**:

| Funcion | Ruta | Metodos | Descripcion |
|---------|------|---------|-------------|
| `dashboard(request)` | `/` | GET, POST | Muestra formulario de mes, ejecuta analisis, muestra metricas |
| `import_subscriptions(request)` | `/import/subscriptions/` | GET, POST | Sube CSV de suscripciones, lo procesa y redirige al dashboard |
| `import_logs(request)` | `/import/logs/` | GET, POST | Sube CSV de logs, lo procesa y redirige al dashboard |
| `results_list(request)` | `/results/` | GET | Lista todos los periodos analizados |
| `results_detail(request, periodo)` | `/results/<periodo>/` | GET | Muestra metricas detalladas de un periodo |

**Funciones privadas**:

| Funcion | Descripcion |
|---------|-------------|
| `_fetch_recent_results()` | Obtiene los ultimos 10 resultados de `cierre_churn_historico` |
| `_fetch_all_results()` | Obtiene todos los resultados ordenados por periodo descendente |
| `_fetch_summary_for_period(periodo_label)` | Obtiene resumen KPI para un periodo especifico |

**Flujo de `dashboard` (POST)**:
1. Valida el formulario (`MonthForm`)
2. Construye un `Periodo` con la fecha ingresada
3. Redirige stdout/stderr a un buffer para capturar logs del analisis
4. Ejecuta `ChurnRateAnalyzer(DBConnector(), periodo).run()`
5. Captura cualquier excepcion
6. Restaura stdout/stderr original
7. Consulta `cierre_churn_historico` para obtener metricas estructuradas
8. Renderiza el template con las metricas

**Flujo de `import_subscriptions` / `import_logs`**:
1. Valida el formulario (`CSVUploadForm`)
2. Guarda el archivo subido temporalmente en disco
3. Llama a `import_subscriptions_csv()` o `import_logs_csv()` con la ruta temporal
4. Elimina el archivo temporal
5. Redirige al dashboard con mensaje de exito/error

**Que espera**:
- Conexion a PostgreSQL operativa
- Tablas de entrada existentes (Subscripciones, Subscripciones-logs)
- Tablas de salida accesibles (cierre_churn_historico, master_churn_dimensiones)

---

#### `analyzer_app/urls.py`

**Proposito**: Mapeo de rutas URL a las vistas de la aplicacion.

| Ruta | Vista | Nombre |
|------|-------|--------|
| `/` | `dashboard` | `dashboard` |
| `/import/subscriptions/` | `import_subscriptions` | `import_subscriptions` |
| `/import/logs/` | `import_logs` | `import_logs` |
| `/results/` | `results_list` | `results_list` |
| `/results/<str:periodo>/` | `results_detail` | `results_detail` |

---

### 4.3 Proyecto Django

#### `churn_web/settings.py`

**Proposito**: Configuracion central del proyecto Django.

**Secciones**:

| Seccion | Descripcion |
|---------|-------------|
| Seguridad | `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` desde variables de entorno |
| Apps instaladas | `staticfiles`, `sessions`, `messages`, `analyzer_app` |
| Middleware | Security, Whitenoise, Session, Common, Csrf, Messages, XFrame |
| Base de datos | PostgreSQL usando mismas env vars que el backend (`HOST`, `DB`, `USER`, `PASS`, `PORT`) |
| Estaticos | Whitenoise con `CompressedManifestStaticFilesStorage` para produccion |
| Templates | Directorio raiz `templates/` + directorios de apps |
| i18n | `es`, `America/Caracas` |

**Que espera**:
- Variables de entorno: `HOST`, `DB`, `USER`, `PASS`, `PORT`, `SCHEMA`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`
- Directorios `templates/` y `static/` en la raiz del proyecto

---

#### `churn_web/wsgi.py`

**Proposito**: Punto de entrada WSGI para servidores como Gunicorn.

**Uso**:
```bash
gunicorn churn_web.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 300
```

---

#### `churn_web/asgi.py`

**Proposito**: Punto de entrada ASGI para servidores async como Daphne o Uvicorn (uso opcional).

**Uso**:
```bash
daphne churn_web.asgi:application
```

---

#### `manage.py`

**Proposito**: Utilidad de linea de comandos de Django. Permite ejecutar comandos como `runserver`, `migrate`, `collectstatic`, etc.

**Uso**:
```bash
python manage.py runserver 0.0.0.0:8000
python manage.py migrate
python manage.py collectstatic
python manage.py check --deploy
```

---

### 4.4 Templates

#### `templates/base.html`

**Proposito**: Layout base de toda la aplicacion. Define la estructura HTML, carga Bootstrap 5 y Flatpickr via CDN, incluye el navbar y el loading overlay.

**Bloques Django**:
| Bloque | Proposito |
|--------|-----------|
| `title` | Titulo de la pestana |
| `extra_head` | CSS adicional por pagina |
| `content` | Contenido principal |
| `extra_js` | JavaScript adicional por pagina |

**Variables de contexto**: `messages` (django.contrib.messages)

**Componentes**:
- Loading overlay (oculto por defecto, se muestra via JavaScript)
- Navbar incluido desde `includes/navbar.html`
- Mensajes flash de Django

---

#### `templates/includes/navbar.html`

**Proposito**: Barra de navegacion superior con enlaces a Dashboard, Importar (dropdown con Subscripciones/Logs) y Resultados.

**Urls usadas**: `dashboard`, `import_subscriptions`, `import_logs`, `results_list`

---

#### `analyzer_app/templates/analyzer/dashboard.html`

**Proposito**: Pagina principal del sistema. Contiene:
- Formulario para seleccionar mes (Flatpickr)
- Boton "Ejecutar analisis" (con loading overlay)
- Tarjetas de metricas (se muestran despues de ejecutar)
- Tabla "Ultimos resultados" siempre visible al pie

**Variables de contexto esperadas**:
| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `form` | `MonthForm` | Formulario de seleccion de mes |
| `periodo_label` | `str` o `None` | Etiqueta del periodo analizado |
| `summaries` | `list` de `dict` | Lista de resumenes KPI (uno por metodo: Operativo/Financiero) |
| `results` | `list` de `dict` | Ultimos 10 periodos analizados |

**Campos de cada dict en `summaries`**:
`metodo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `churn_neto_pct`, `churn_bruto_pct`, `reactivaciones`, `tasa_aporte_react_pct`, `tasa_winback_pct`, `adiciones_brutas`, `adiciones_netas`, `total_billing`, `arpu`, `corte_impagado`, `indice_reemplazo_react_pct`

---

#### `analyzer_app/templates/analyzer/import_csv.html`

**Proposito**: Pagina de subida de archivos CSV. Usa el mismo template tanto para Subscripciones como para Logs, diferenciando por la variable `import_type`.

**Variables de contexto esperadas**:
| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `form` | `CSVUploadForm` | Formulario de subida de archivo |
| `import_type` | `str` | Tipo de importacion: "Subscripciones" o "Logs" |

---

#### `analyzer_app/templates/analyzer/results_list.html`

**Proposito**: Lista completa de todos los periodos analizados, ordenados del mas reciente al mas antiguo.

**Variables de contexto esperadas**:
| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `periods` | `list` de `dict` | Todos los registros de `cierre_churn_historico` |

**Columnas mostradas**: Periodo, Metodo, Activos inicio/final, Nuevos, Bajas netas, Churn neto/bruto (%), Reactivaciones, Winback (%), ARPU, Detalle (link)

---

#### `analyzer_app/templates/analyzer/results_detail.html`

**Proposito**: Vista detallada de un periodo especifico. Muestra:
- KPIs en formato de 2 columnas por metodo (Operativo/Financiero)
- Tabla desglosada por dimensiones (zona, sucursal, municipio, campana, producto)

**Variables de contexto esperadas**:
| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `periodo` | `str` | Etiqueta del periodo (ej. "2026-04-01 al 2026-04-30") |
| `summaries` | `list` de `dict` | Resumenes KPI del periodo (filtrados por periodo_reporte) |
| `dimensions` | `list` de `dict` | Filas de `master_churn_dimensiones` para el periodo |

---

### 4.5 Archivos Estaticos

#### `static/css/styles.css`

**Proposito**: Estilos personalizados que complementan a Bootstrap 5.

**Secciones**:
| Seccion | Descripcion |
|---------|-------------|
| body | Fondo gris claro (`#f0f4f8`) |
| .navbar.bg-primary | Fondo azul oscuro (`#1565c0`) |
| .btn-primary | Botones principales azules |
| .card | Sin borde (shadow en lugar de border) |
| .card-header | Fondo azul claro con texto azul oscuro |
| .table thead | Cabeceras de tabla con fondo azul claro |
| .metric-card | Tarjetas de metricas centradas con hover |
| .loading-overlay | Overlay de carga con fondo semitransparente y blur |

---

#### `static/js/main.js`

**Proposito**: JavaScript personalizado del lado del cliente.

**Funciones**:

| Funcion | Descripcion |
|---------|-------------|
| `showLoading()` | Muestra el overlay de carga |
| `hideLoading()` | Oculta el overlay de carga |
| `flatpickr_init` | Inicializa Flatpickr en elementos con clase `.month-picker` (modo mes, locale espanol) |
| `form_loading_auto` | Agrega evento `submit` a formularios con atributo `data-loading` para mostrar loading |
| `tooltips_init` | Inicializa tooltips de Bootstrap |

**Que espera**:
- Elemento HTML con `id="loading-overlay"` (definido en `base.html`)
- Elementos con clase `.month-picker` para Flatpickr
- Formularios con atributo `data-loading` (definido en `dashboard.html` e `import_csv.html`)

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
CSV Subscripciones
       │
       ▼
import_subscriptions_csv()
       │
       ├──► Lee CSV con pandas
       ├──► Renombra columnas segun mapping
       ├──► Limpia encabezados repetidos
       ├──► Propaga metadatos (ffill por orden)
       ├──► Consolida productos (primer match en Planes.json)
       │
       ├──► Subscripciones-b (detalle)  ──► PostgreSQL (COPY)
       └──► Subscripciones (consolidado) ──► PostgreSQL (COPY)


CSV Logs
       │
       ▼
import_logs_csv()
       │
       ├──► Lee CSV con pandas
       ├──► Valida columnas requeridas
       ├──► Limpia nulos
       │
       └──► Subscripciones-logs ──► PostgreSQL (COPY)
```

### 5.2 Ejecucion de Analisis → Resultados

```
Dashboard (usuario selecciona mes)
       │
       ▼
views.dashboard()
       │
       ├──► Periodo.build("2026-04")
       │
       ├──► ChurnRateAnalyzer(DBConnector, periodo).run()
       │        │
       │        ├──► load_data()
       │        │       └──► read_table("Subscripciones") ──► DataFrame
       │        │       └──► read_table("Subscripciones-logs") ──► DataFrame
       │        │       └──► read_table("Subscripciones-logs-v15") ──► DataFrame
       │        │
       │        ├──► build_clean_data()
       │        │       └──► Normaliza y combina logs v14 + v15
       │        │
       │        ├──► get_active_at(inicio) → activos_inicio
       │        ├──► get_active_at(final)   → activos_final
       │        ├──► get_reactivations(act_fin) → reactivaciones
       │        ├──► get_corte_impagado()  → cortes
       │        │
       │        ├──► Calculo KPI (churn, winback, ARPU, etc.)
       │        │
       │        ├──► save_historico → master_activos_cierre
       │        ├──► save_historico → master_reactivaciones
       │        ├──► save_historico → master_bajas_detalladas
       │        ├──► save_historico → master_corte_impagado
       │        ├──► save_historico → cierre_churn_historico (KPI)
       │        │
       │        ├──► calculate_lifetime_metrics()
       │        │       └──► save_historico → master_tiempos_vida
       │        │       └──► save_historico → master_tiempo_global
       │        │
       │        └──► aggregate_dimensions()
       │                └──► save_historico → master_churn_dimensiones
       │
       ├──► _fetch_summary_for_period(periodo_label)
       │       └──► read_table("cierre_churn_historico") → summaries
       │
       └──► Render template dashboard.html con summaries
```

### 5.3 Visualizacion de Resultados

```
Dashboard (/)                              Resultados (/results/)
       │                                            │
       ▼                                            ▼
_fetch_recent_results()                    _fetch_all_results()
       │                                            │
       ▼                                            ▼
read_table("cierre_churn_historico")       read_table("cierre_churn_historico")
       │                                            │
       ▼                                            ▼
dashboard.html (tabla ultimos 10)          results_list.html (tabla completa)
       │                                            │
       ▼                                            ▼
(results_detail.html) ─── /results/<periodo>/
                            │
                            ├── read_table("cierre_churn_historico") → KPIs
                            └── read_table("master_churn_dimensiones") → dimensiones
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
| `master_tiempos_vida` | Tiempo activo y cancelado por orden | DELETE + INSERT por periodo |
| `master_tiempo_global` | Promedios globales de tiempos de vida | DELETE + INSERT por periodo |
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

### 9.1 Ejecutar analisis para abril 2026

```
1. Abrir http://servidor:8000
2. Hacer clic en el campo "Mes" → se abre calendario Flatpickr
3. Seleccionar abril 2026
4. Hacer clic en "Ejecutar analisis"
5. Esperar a que el loading overlay desaparezca
6. Ver tarjetas de metricas:
   - Activos inicio: 1,234
   - Activos final: 1,289
   - Nuevos: 98
   - Churn neto (Financiero): 3.32%
   - ARPU: $45.67
   - Reactivaciones: 34
   - Tasa Winback: 8.45%
```

### 9.2 Importar suscripciones

```
1. Ir a "Importar" > "Subscripciones" en el navbar
2. Seleccionar archivo CSV con el boton "Seleccionar archivo"
3. Hacer clic en "Subir e importar"
4. Esperar mensaje de exito: "Subscripciones: 2,345 filas importadas"
5. Ser redirigido al dashboard
```

### 9.3 Importar logs

```
1. Ir a "Importar" > "Logs" en el navbar
2. Seleccionar archivo CSV de logs
3. Hacer clic en "Subir e importar"
4. Esperar mensaje de exito: "Logs: 15,678 filas importadas"
```

### 9.4 Ver resultados historicos

```
1. Ir a "Resultados" en el navbar
2. Ver tabla completa con todos los periodos analizados
3. Hacer clic en "Detalle" de cualquier periodo
4. Ver KPIs detallados y tabla de dimensiones
```

### 9.5 Desplegar actualizacion (servidor)

```bash
# En el servidor
cd /ruta/ChurnRateAnalyzer
git pull origin master
docker compose build app
docker compose up -d app
docker compose exec app python manage.py migrate
```

### 9.6 Acceder a logs del container

```bash
docker compose logs -f app
```

### 9.7 Prueba de conexion a BD desde el container

```bash
docker compose exec app python -c "
from analyzer_app.backend.database import DBConnector
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

**Solucion**: Verificar las variables `USER`, `PASS` en el environment del compose contra las credenciales reales de PostgreSQL.

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
