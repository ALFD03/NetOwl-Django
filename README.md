# NetOwl

Sistema web para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida y análisis por dimensiones (zona, sucursal, municipio, campaña, producto).

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 (pandas, numpy, psycopg2, lifelines) |
| Backend web | Django 5 |
| Base de datos | PostgreSQL 15+ |
| Frontend | Bootstrap 5, Chart.js v3+, Bootstrap Icons, CSS propio |
| Estáticos | Whitenoise (comprimidos y cacheados) |
| Servidor web | Gunicorn (timeout 300s) |
| Contenedor | Docker + Docker Compose |

## Arquitectura

```
NetOwl-Django/
├── cli.py                             # Entrypoint CLI (import + analyze)
├── manage.py                          # Entrypoint Django
├── requirements.txt                   # Dependencias Python
├── Dockerfile                         # Imagen Docker para producción
├── .env.example                       # Template de variables de entorno
│
├── backend/                           # Lógica de negocio (independiente de Django)
│   ├── __init__.py                    # Exportaciones del paquete
│   ├── config.py                      # Constantes + carga de .env
│   ├── utils.py                       # normalize_text(), parse_date()
│   ├── models.py                      # Periodo (dataclass)
│   ├── database.py                    # DBConnector (pool, read, save, copy)
│   │
│   └── subscriptions/                 # Módulo: subscriptions
│       ├── __init__.py                # Exporta MetricsAnalyzer, data_api, imports
│       ├── imports.py                 # Importación y limpieza de CSV
│       ├── data_api.py                # Capa de acceso a datos para vistas
│       │
│       ├── analyzer/                  # Churn analysis
│       │   ├── __init__.py
│       │   ├── analyzer.py            # MetricsAnalyzer (orquestador)
│       │   ├── cleaner.py             # Limpieza y normalización de logs
│       │   ├── dimensions.py          # Análisis por dimensiones
│       │   ├── loader.py              # Carga de datos BD → DataFrames
│       │   ├── metrics_calc.py        # Cálculo de KPIs y métricas
│       │   └── rules.py               # Reglas de anomalías (logs sintéticos)
│       │
│       └── lifetime/                  # Lifecycle analysis (Kaplan-Meier)
│           ├── __init__.py
│           ├── analyzer.py            # LifecycleAnalyzer
│           ├── dimensions.py          # Análisis dimensional de tiempos de vida
│           ├── km_utils.py            # Funciones auxiliares Kaplan-Meier
│           ├── lifecycle.py           # Cálculo de métricas de ciclo de vida
│           ├── loader.py              # Carga de datos BD → DataFrames
│           ├── queries.py             # Consultas SQL específicas
│           └── runner.py              # Orquestador del pipeline
│
├── frontend/                          # Aplicación Django
│   ├── __init__.py
│   ├── netowl_web/                    # Proyecto Django (settings, wsgi, asgi, urls raíz)
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   ├── asgi.py
│   │   └── __init__.py
│   │
│   ├── subscriptions/                 # App Django (vistas, urls, forms, templates, static)
│   │   ├── views.py                   # Vistas por página + API (JsonResponse)
│   │   ├── urls.py                    # Rutas por página + API
│   │   ├── forms.py                   # MonthForm, CSVUploadForm
│   │   ├── apps.py
│   │   ├── admin.py
│   │   │
│   │   ├── templates/subscriptions/   # Templates por página
│   │   │   ├── dashboard.html
│   │   │   ├── analytics.html
│   │   │   ├── imports.html
│   │   │   ├── results.html
│   │   │   ├── lifetime.html
│   │   │   └── partials/
│   │   │       ├── header.html        # Header sticky por módulo
│   │   │       ├── sidebar.html       # Sidebar de navegación
│   │   │       ├── results_table.html
│   │   │       └── results_detail_modal.html
│   │   │
│   │   └── static/subscriptions/js/   # JavaScript por página
│   │       ├── dashboard.js           # Dashboard (charts + tabla)
│   │       ├── analytics.js           # Analytics (KPI + charts)
│   │       ├── imports.js             # Importación CSV
│   │       ├── results.js             # Resultados históricos
│   │       └── lifetime.js            # Curvas Kaplan-Meier
│   │
│   ├── static/                        # Archivos estáticos globales
│   │   ├── css/
│   │   │   ├── base.css               # Variables CSS, tema claro/oscuro, reset
│   │   │   ├── sidebar.css            # Estilos del sidebar
│   │   │   ├── components.css         # Cards, botones, tablas, formularios
│   │   │   └── subscriptions.css      # Estilos específicos del módulo
│   │   └── js/
│   │       ├── core.js                # Utilidades comunes, tema, toast, loading
│   │       ├── theme.js               # Toggle claro/oscuro, persistencia
│   │       └── sidebar.js             # Interacción del sidebar
│   │
│   └── templates/                     # Templates raíz
│       └── base.html                  # Layout base (CDN: Bootstrap, Chart.js, Icons)
│
├── _legacy/                           # Archivos legacy (versión SPA anterior)
│   ├── main.js
│   └── styles.css
│
├── Planes.json                        # Catálogo de planes para validación
└── Zonas.json                         # Zonas geográficas
```

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

DJANGO_SECRET_KEY=genera-una-clave-única
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=*
```

> **Nota**: Se usa `DB_USER` (no `USER`) para evitar colisión con la variable de entorno `USER` del sistema Linux.

## Quick Start con Docker

```yaml
app:
    build: ./
    container_name: churn_app
    ports:
      - "8000:8000"
    environment:
      - HOST=db
      - DB=Netcom
      - DB_USER=metabase
      - PASS=tu_password
      - PORT=5432
      - SCHEMA=public
      - DJANGO_SECRET_KEY=genera-una-clave-única
      - DJANGO_DEBUG=False
      - DJANGO_ALLOWED_HOSTS=*
    depends_on:
      - db
    restart: always
```

```bash
# Construir la imagen
docker compose build app

# Levantar el servicio
docker compose up -d app

# Acceder en el navegador
# http://localhost:8000
```

## Uso CLI

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

### Dashboard (`/subscriptions/dashboard/`)
- Seleccionar mes/año con los dropdowns
- Hacer clic en "Ejecutar análisis"
- Ver consola integrada con el progreso
- Explorar gráficos animados: churn, activos inicio/final, winback, ARPU, aporte reactivaciones, índice de reemplazo, adiciones, cortes vs reactivaciones, curva KM
- **Curva Kaplan-Meier**: supervivencia con IC 95%, curvas por método (Financiero/Operativo), toggle de cohortes mensuales, risk table y estadísticas (mediana, P25, P75)

### Analytics (`/subscriptions/analytics/`)
- Filtro multiselect de períodos
- 20 tarjetas KPI con colores condicionales
- Gráficos por dimensión: doughnut (churn, winback, aporte), pie (mediana días activo/cancelado), barras (adiciones), barras horizontales (ARPU, corte impago)
- Umbral <2.5% agrupa en "Otros" (promedio, siempre al final)

### Importar CSVs (`/subscriptions/import/`)
- Drag & drop o seleccionar archivo (tipo: subscripciones o logs)
- Barra de progreso animada
- Se procesa automáticamente (limpieza, consolidación, carga a DB)

### Resultados (`/subscriptions/results/`)
- Tabla histórica con buscador
- Modal de detalle con:
  - Resumen por método: 24 métricas (Base Inicio, Churn, ARPU, Winback, Mediana/P25/P75 días activo, etc.)
  - Desglose por dimensiones: 22 columnas con sticky header + primera columna fija

### Tiempos de Vida (`/subscriptions/lifetime/`)
- Curvas Kaplan-Meier de cartera activa y cancelada
- Tabla de órdenes con tiempos de vida

## Pipeline de análisis (`backend/analyzer.py`)

```
1.  Carga de datos (DB → DataFrames en 3 hilos)
2.  Limpieza y normalización de logs
3.  Reglas de anomalías (logs sintéticos: casos 1-6)
4.  Fotos de cartera (activos inicio / activos final / nuevos)
5.  Inactivos al inicio del período
6.  ARPU (facturación total / activos final)
7.  Reactivaciones segmentadas por origen (solo si resultan activas al cierre)
8.  Corte por factura impagada
9.  Método Financiero (balance contable)
10. Método Operativo (transiciones en logs)
11. KPI final (churn neto/bruto, winback, ARPU, adiciones, etc.)
12. Dimensiones (zona, sucursal, municipio, campaña, producto)
13. Kaplan-Meier (mediana/P25/P75 vida activo y cancelado, curvas por método y cohorte)
```

## Tablas de base de datos

### Entrada (se importan desde CSV)

| Tabla | Contenido |
|---|---|
| `Subscripciones` | Suscripciones consolidadas (una fila por orden) |
| `Subscripciones-b` | Datos detallados por línea de orden |
| `Subscripciones-logs` | Historial de cambios de estado |
| `Subscripciones-logs-v15` | Logs versión 15 (con tipo/categoría) |

### Salida (se generan en cada ejecución)

| Tabla | Columnas principales |
|---|---|
| `cierre_churn_historico` | `periodo_reporte`, `metodo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `bajas_brutas_auditoria`, `churn_neto_pct`, `churn_bruto_pct`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `total_inactivos`, `tasa_winback_pct`, `total_billing`, `arpu`, `reactivaciones`, `react_6_8`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_brutas`, `adiciones_netas`, `corte_impagado` |
| `master_activos_cierre` | Cartera de activos al cierre del período |
| `master_reactivaciones` | Reactivaciones del período |
| `master_bajas_detalladas` | Bajas detalladas (Financiero y Operativo) |
| `master_corte_impagado` | Suscripciones con corte por impago |
| `master_inactivos_detallados` | Suscripciones inactivas al inicio del período |
| `master_tiempos_vida` | Detalle por orden: días activo, días cancelado |
| `master_tiempo_global` | Curvas Kaplan-Meier por método (Global/Financiero/Operativo): `mediana_activo`, `p25_activo`, `p75_activo`, `mediana_cancelado`, `p25_cancelado`, `p75_cancelado`, `curva_activo_json`, `curva_cancelado_json`, `cohortes_activo_json`, `cohortes_cancelado_json` |
| `master_churn_dimensiones` | Métricas desglosadas por dimensión (`zona`, `sucursal`, `municipio`, `campanna`, `producto`) — incluye medianas KM: `mediana_activo`, `p25_activo`, `p75_activo`, `mediana_cancelado`, `p25_cancelado`, `p75_cancelado` |

## Métricas calculadas

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
| **Vida mediana activo** | `S(t) ≤ 0.50` (Kaplan-Meier, censura por órdenes activas) |
| **P25 / P75 activo** | `S(t) ≤ 0.75` / `S(t) ≤ 0.25` (percentiles KM) |
| **Vida mediana cancelado** | `S(t) ≤ 0.50` sobre días desde churn hasta reactivación |
| **Intervalo confianza 95 %** | Fórmula de Greenwood (`lifelines.KaplanMeierFitter`) |

## Interpretación de Kaplan-Meier

- La **vida mediana** (P50) es el día donde el 50 % de las órdenes ha churnado. Es la métrica central de retención.
- **P25**: el 25 % de las órdenes churnea antes de este día.
- **P75**: el 75 % de las órdenes churnea antes de este día (el 25 % sobrevive más allá).
- La **censura** corrige el sesgo de las órdenes que siguen activas al cierre del período (no han churnado aún).
- Las curvas por **método** (Financiero/Operativo) usan definiciones distintas de "baja" como evento.
- Las curvas por **cohorte mensual** muestran si la retención mejora o empeora entre lotes de suscripciones.

## Notas importantes

- Reactivaciones solo se cuentan si la suscripción está **activa al cierre del período**
- `react_6_8` considera solo reactivaciones provenientes de `6_churn` y `8_30days` (excluye `4_paused`)
- El método **Financiero** usa fórmula de balance contable: `activos_inicio - (activos_final - nuevos)`
- El método **Operativo** cuenta transiciones reales desde logs (`3_progress → 4_paused/6_churn`)
- Los datos duplicados por período se evitan automáticamente vía DELETE + INSERT en `save_historico()`
- Se usa `DB_USER` (no `USER`) como variable de entorno para evitar colisión con la variable de sistema Linux
- Los archivos estáticos se sirven con Whitenoise (no requiere nginx para producción básica)
- Todos los gráficos Chart.js usan animación `{duration: 800, easing: "easeOutQuart"}`
- El tema claro/oscuro se persiste en `localStorage` y se aplica con variables CSS

## Autor

Ing. Ángel Flores
