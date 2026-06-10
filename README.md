# NetOwl

Sistema web SPA para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida y análisis por dimensiones (zona, sucursal, municipio, campaña, producto).

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 (pandas, numpy, psycopg2) |
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
│   ├── analyzer.py                    # ChurnRateAnalyzer (pipeline ~1264 líneas)
│   ├── imports.py                     # Importación y limpieza de CSV
│   └── data_api.py                    # Capa de acceso a datos para vistas
│
├── frontend/                          # Aplicación Django
│   ├── analyzer_app/                  # App Django (vistas delgadas, forms, urls)
│   │   ├── views.py                   # Vistas API (JsonResponse)
│   │   ├── forms.py                   # MonthForm, CSVUploadForm
│   │   ├── urls.py                    # Rutas SPA + API
│   │   └── templates/analyzer/
│   │       └── dashboard.html         # Único template SPA
│   │
│   ├── churn_web/                     # Proyecto Django (settings, wsgi)
│   ├── static/
│   │   ├── css/styles.css             # Estilos ~980 líneas (tema claro/oscuro)
│   │   └── js/main.js                 # SPA JavaScript ~1170 líneas (Chart.js)
│   │
│   └── templates/
│       ├── base.html                  # Layout base (CDN: Bootstrap, Chart.js, Icons)
│       └── includes/navbar.html       # Sidebar de navegación
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

### Dashboard (`/`)
- Seleccionar mes/año con los dropdowns
- Hacer clic en "Ejecutar análisis"
- Ver consola integrada con el progreso
- Explorar 9 gráficos animados: churn, winback, ARPU, aporte reactivaciones, índice de reemplazo, adiciones, tiempos promedio, cortes vs reactivaciones

### Analytics (`/analytics/`)
- Filtro multiselect de períodos
- 20 tarjetas KPI con colores condicionales
- Gráficos por dimensión: doughnut (churn, winback, aporte), pie (días activo/cancelado), barras (adiciones), barras horizontales (ARPU, corte impago)
- Umbral <2.5% agrupa en "Otros" (promedio, siempre al final)

### Importar CSVs (`/import/subscriptions/` y `/import/logs/`)
- Drag & drop o seleccionar archivo
- Barra de progreso animada
- Se procesa automáticamente (limpieza, consolidación, carga a DB)

### Resultados (`/results/`)
- Tabla histórica con buscador
- Modal de detalle con:
  - Resumen por método: 22 métricas (Base Inicio, Churn, ARPU, Winback, etc.)
  - Desglose por dimensiones: 18 columnas con sticky header + primera columna fija

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
13. Tiempos de vida (días activo, días cancelado)
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
| `cierre_churn_historico` | `periodo_reporte`, `metodo_calculo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `bajas_brutas_auditoria`, `churn_neto_pct`, `churn_bruto_pct`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `total_inactivos`, `tasa_winback_pct`, `total_billing`, `arpu`, `reactivaciones`, `react_6_8`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_brutas`, `adiciones_netas`, `corte_impagado`, `prom_dias_activo`, `prom_dias_cancelado` |
| `master_activos_cierre` | Cartera de activos al cierre del período |
| `master_reactivaciones` | Reactivaciones del período |
| `master_bajas_detalladas` | Bajas detalladas (Financiero y Operativo) |
| `master_corte_impagado` | Suscripciones con corte por impago |
| `master_inactivos_detallados` | Suscripciones inactivas al inicio del período |
| `master_tiempos_vida` | Detalle por orden: días activo, días cancelado |
| `master_tiempo_global` | Promedios globales de tiempos de vida |
| `master_churn_dimensiones` | Métricas desglosadas por dimensión (`zona`, `sucursal`, `municipio`, `campanna`, `producto`) |

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
| **Promedio días activo** | `avg(f_churn - f_ini_dt)` sobre órdenes con churn |
| **Promedio días cancelado** | `avg(f_react - f_churn)` sobre órdenes con reactivación |

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
