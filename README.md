# Churn Rate Analyzer

Sistema web para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida y análisis por dimensiones (zona, sucursal, municipio, campaña, producto).

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Django 5 + Python 3.11 |
| Base de datos | PostgreSQL 15+ |
| Frontend | Bootstrap 5, CSS propio, Flatpickr |
| Estáticos | Whitenoise (comprimidos y cacheados) |
| Servidor web | Gunicorn (timeout 300s) |
| Contenedor | Docker + Docker Compose |

## Arquitectura

```
ChurnRateAnalyzer/
├── manage.py                     # Entry point Django
├── requirements.txt              # Dependencias Python
├── Dockerfile                    # Imagen Docker para produccion
├── .env.example                  # Template de variables de entorno
│
├── churn_web/                    # Proyecto Django
│   ├── settings.py               # Configuracion (DB, static, middleware)
│   ├── urls.py                   # Rutas raiz
│   └── wsgi.py                   # WSGI para Gunicorn
│
├── analyzer_app/                 # App Django (logica de negocio)
│   ├── backend/                  # Nucleo del analisis (sin cambios)
│   │   ├── config.py             # Constantes y variables de entorno
│   │   ├── utils.py              # normalize_text(), parse_date()
│   │   ├── models.py             # Periodo (dataclass)
│   │   ├── database.py           # DBConnector (pool, read, save, copy)
│   │   ├── analyzer.py           # ChurnRateAnalyzer (pipeline completo)
│   │   └── imports.py            # Importacion y limpieza de CSV
│   ├── forms.py                  # MonthForm, CSVUploadForm
│   ├── views.py                  # Dashboard, import, results
│   └── templates/analyzer/       # Templates HTML
│       ├── dashboard.html
│       ├── import_csv.html
│       ├── results_list.html
│       └── results_detail.html
│
├── templates/                    # Templates raiz
│   ├── base.html                 # Layout principal (Bootstrap + Flatpickr)
│   └── includes/navbar.html      # Navegacion
│
├── static/                       # Archivos estaticos
│   ├── css/styles.css
│   └── js/main.js
│
├── Planes.json                   # Catalogo de planes para validacion
└── Zonas.json                    # Zonas geograficas
```

## Requisitos

- Docker y Docker Compose
- PostgreSQL (en Docker o externo)

## Configuracion

Variables de entorno necesarias (`.env` o en `environment` del compose):

```env
HOST=db                           # Nombre del servicio PostgreSQL
DB=Netcom                         # Nombre de la base de datos
USER=metabase                     # Usuario de base de datos
PASS=tu_password                  # Contrasena
PORT=5432
SCHEMA=public

DJANGO_SECRET_KEY=genera-una-clave-unica
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=*
```

## Quick Start con Docker

Agrega el servicio `app` a tu `docker-compose.yml`:

```yaml
app:
    build: ./ChurnRateAnalyzer/
    container_name: churn_app
    ports:
      - "8000:8000"
    environment:
      - HOST=db
      - DB=Netcom
      - USER=metabase
      - PASS=tu_password
      - PORT=5432
      - SCHEMA=public
      - DJANGO_SECRET_KEY=genera-una-clave-unica
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

# Migraciones de Django (solo primera vez)
docker compose exec app python manage.py migrate

# Acceder en el navegador
# http://localhost:8000
```

## Uso web

### Dashboard (`/`)
- Seleccionar mes y ano con el calendario Flatpickr
- Hacer clic en "Ejecutar analisis"
- Ver metricas resumidas en tarjetas (activos, churn, reactivaciones, ARPU, etc.)
- Tabla "Ultimos resultados" siempre visible al pie

### Importar CSVs (`/import/subscriptions/` y `/import/logs/`)
- Subir archivo CSV de suscripciones o logs
- Se procesa automaticamente (limpieza, consolidacion, carga a DB)

### Resultados (`/results/`)
- Lista historica de todos los periodos analizados
- Detalle por periodo con KPIs y desglose por dimensiones

## Pipeline de analisis (`analyzer_app/backend/analyzer.py`)

```
1.  Carga de datos (DB   DataFrames)
2.  Limpieza y normalizacion de logs
3.  Fotos de cartera (activos inicio / activos final / nuevos)
4.  Inactivos al inicio del periodo
5.  ARPU (facturacion total / activos final)
6.  Reactivaciones segmentadas (solo si resultan activas al cierre)
7.  Corte por factura impagada
8.  Metodo Financiero (balance contable)
9.  Metodo Operativo (transiciones en logs)
10. KPI final (churn neto/bruto, winback, ARPU, adiciones, etc.)
11. Dimensiones (zona, sucursal, municipio, campana, producto)
12. Tiempos de vida (dias activo, dias cancelado)
```

## Tablas de base de datos

### Entrada (se importan desde CSV)

| Tabla | Contenido |
|---|---|
| `Subscripciones` | Suscripciones consolidadas (una fila por orden) |
| `Subscripciones-b` | Datos detallados por linea de orden |
| `Subscripciones-logs` | Historial de cambios de estado |

### Salida (se generan en cada ejecucion)

| Tabla | Columnas principales |
|---|---|
| `cierre_churn_historico` | `periodo`, `metodo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `bajas_brutas_auditoria`, `churn_neto_pct`, `churn_bruto_pct`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `total_inactivos`, `tasa_winback_pct`, `total_billing`, `arpu`, `reactivaciones`, `react_6_8`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_brutas`, `adiciones_netas`, `corte_impagado` |
| `master_activos_cierre` | Cartera de activos al cierre del periodo |
| `master_reactivaciones` | Reactivaciones del periodo |
| `master_bajas_detalladas` | Bajas detalladas (Financiero y Operativo) |
| `master_corte_impagado` | Suscripciones con corte por impago |
| `master_inactivos_detallados` | Suscripciones inactivas al inicio del periodo |
| `master_tiempos_vida` | Detalle por orden: dias activo, dias cancelado |
| `master_tiempo_global` | Promedios globales de tiempos de vida |
| `master_churn_dimensiones` | Metricas desglosadas por dimension (`zona`, `sucursal`, `municipio`, `campanna`, `producto`) |

## Metricas calculadas

| Metrica | Formula |
|---|---|
| **Churn neto (Financiero)** | `max(0, activos_inicio + nuevos - activos_final) / activos_inicio x 100` |
| **Churn bruto (Auditoria)** | `(bajas_netas + react_audit) / activos_inicio x 100` |
| **ARPU** | `sum(Total de activos final) / activos final` |
| **Tasa Winback** | `reactivaciones_unicas / inactivos_inicio x 100` |
| **Tasa Aporte Reactivaciones** | `react_6_8 / (nuevas + react_6_8) x 100` |
| **Indice Reemplazo Reactivaciones** | `react_6_8 / bajas_fin_netas x 100` |
| **Adiciones Brutas** | `nuevas - bajas_fin_netas` |
| **Adiciones Netas** | `(nuevas + react_6_8) - bajas_fin_netas` |
| **Promedio dias activo** | `avg(f_churn - f_ini_dt)` sobre ordenes con churn |
| **Promedio dias cancelado** | `avg(f_react - f_churn)` sobre ordenes con reactivacion |

## Flujo de trabajo Git y deploy

### Ramas recomendadas

```
master        # Produccion (lo que corre en el servidor)
  develop     # Desarrollo local
    feature/* # Cambios especificos
    fix/*     # Correcciones
```

### Desarrollo local

```bash
git checkout develop
git pull origin develop
git checkout -b feature/mi-cambio

# ... codificar, probar en local ...

git add -A
git commit -m "Descripcion del cambio"
git push origin feature/mi-cambio
# Crear Pull Request a develop en GitHub
```

### Despliegue a produccion

```bash
# 1. Merge de develop a master
git checkout master
git merge develop
git push origin master

# 2. En el servidor
ssh usuario@servidor
cd /ruta/ChurnRateAnalyzer
git pull origin master
docker compose build app
docker compose up -d app
docker compose exec app python manage.py migrate   # si hay cambios de DB
```

### Script de deploy (opcional)

Crea `deploy.sh` en el servidor:

```bash
#!/bin/bash
git pull origin master
docker compose build app
docker compose up -d app
docker compose exec app python manage.py migrate
```

```bash
chmod +x deploy.sh
./deploy.sh
```

## Notas importantes

- Reactivaciones solo se cuentan si la suscripcion esta **activa al cierre del periodo**
- `react_6_8` considera solo reactivaciones provenientes de `6_churn` y `8_30days` (excluye `4_paused`)
- El metodo **Financiero** usa formula de balance contable: `activos_inicio - (activos_final - nuevos)`
- El metodo **Operativo** cuenta transiciones reales desde logs (`3_progress - 4_paused/6_churn`)
- Los datos duplicados por periodo se evitan automaticamente via DELETE + INSERT en `save_historico()`
- Los archivos estaticos se sirven con Whitenoise (no requiere nginx para produccion basica)

## Autor

Ing. Angel Flores
