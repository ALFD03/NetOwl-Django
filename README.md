# NetOwl

Sistema web para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida (Kaplan-Meier), análisis por dimensiones, reportes jerárquicos de ventas y **CRM Analytics** con pipeline Odoo → JSONB → API REST.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 (pandas, numpy, psycopg2, lifelines) |
| Backend web | Django 5 |
| Base de datos | PostgreSQL 15+ (con soporte SSL) |
| Servidor web | Gunicorn + Nginx (Proxy inverso de seguridad) |
| Frontend | Bootstrap 5, Chart.js v3+, Bootstrap Icons, CSS propio |
| Estáticos | Whitenoise (comprimidos y cacheados) |
| Contenedor | Docker + Docker Compose (Multi-stage, usuario no‑root) |

## Arquitectura

```
NetOwl-Django/
├── cli.py                             # Entrypoint CLI (import + analyze)
├── manage.py                          # Entrypoint Django
├── requirements.txt                   # Dependencias Python
├── Dockerfile                         # Imagen Docker multi‑stage (builder y runner)
├── nginx.conf                         # Configuración del proxy inverso Nginx
├── docker-compose.yml                 # Orquestación de servicios en producción
├── entrypoint.sh                      # Generación automática de SECRET_KEY si falta
├── .env.example                       # Template de variables de entorno
│
├── backend/                           # Lógica de negocio (independiente de Django)
│   ├── __init__.py                    # Exportaciones del paquete
│   ├── config.py                      # Constantes + carga de .env + TableNames
│   ├── utils.py                       # parse_date() y validaciones estructurales de CSV
│   ├── models.py                      # Periodo (dataclass)
│   ├── database.py                    # DBConnector (pool con sslmode, read, save, copy, schema cache)
│   │
│   ├── subscriptions/                 # Módulo: subscriptions (churn, reactivaciones, ARPU, KM)
│   │   ├── __init__.py
│   │   ├── imports.py                 # Importación y limpieza de CSV
│   │   ├── data_api.py                # Capa de acceso a datos para vistas y reportes regionales
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
│       ├── config.py                  # ETAPA_MAP, EFECTIVIDAD_REGLAS, ETAPA8_ATRIBUCION, etc.
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
│   │   ├── settings.py                # Seguridad SSL, cabeceras seguras y orígenes de confianza
│   │   ├── urls.py                    # Rutas de navegación principales
│   │   ├── middleware.py              # Manejo elegante de respuestas JSON para Rate Limiting (429)
│   │   └── wsgi.py
│   │
│   ├── config/                        # App Django: autenticación y seguridad basada en roles
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── views.py                   # login_view, setup_view, user_management_view, APIs
│   │   ├── urls.py                    # Rutas de configuración y administración de usuarios
│   │   ├── decorators.py              # @admin_required, @analyst_or_admin_required
                     # models.py                  # Profile (vínculo Uno a Uno con User para roles)
│   │   ├── templates/                 # Templates de login, setup inicial y gestión
│   │   └── migrations/
│   │
│   ├── subscriptions/                 # App Django (vistas, urls, templates, static)
│   │   ├── views.py                   # Vistas por página + API con login_required y rate-limit
│   │   ├── urls.py                    # Rutas por página + API
│   │   ├── apps.py
│   │   │
│   │   ├── templates/subscriptions/   # Templates por página
│   │   │   ├── dashboard.html
│   │   │   ├── analytics.html
│   │   │   ├── imports.html
│   │   │   ├── results.html
│   │   │   ├── lifetime.html
│   │   │   ├── sales_report.html      # Reporte de ventas regional jerárquico
│   │   │   └── partials/
│   │   │       ├── header.html
│   │   │       └── sidebar.html
│   │   │
│   │   └── static/subscriptions/js/
│   │       ├── dashboard.js
│   │       ├── analytics.js
│   │       ├── imports.js
│   │       ├── results.js
│   │       ├── lifetime.js
│   │       └── sales_report.js        # Manejo de renderizado multinivel con subtotales
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
│   │   ├── components.css             # Cards, botones, tablas, formularios, terminal de consola
│   │   └── subscriptions.css          # Estilos específicos
│   └── js/
│       ├── core.js                    # Utilidades comunes, tema, toast, loading
│       ├── theme.js                   # Toggle claro/oscuro, persistencia
│       └── sidebar.js                 # Interacción del sidebar
│
└── templates/                         # Templates raíz
    └── base.html                      # Layout base (Bootstrap, Chart.js, Icons)
```

## Cambios y Mejoras Recientes

| Módulo | Detalle |
|---|---|
| **Seguridad de Despliegue** | Incorporación de **Nginx** como proxy inverso de red. Se aísla el contenedor de Gunicorn para que no reciba tráfico directo desde el exterior del host. |
| **Optimización de Docker** | Estructura de `Dockerfile` en formato **Multi-stage** (etapa de compilación y etapa de producción limpia). Compilación de `psycopg2` nativo desde las fuentes, dejando la imagen final libre de compiladores y herramientas vulnerables. |
| **Control de Accesos (RBAC)** | Autenticación nativa habilitada. Soporte para 3 niveles de rol: **Administrador**, **Analista** y **Visualizador (Solo Lectura)**. |
| **Gestión de Permisos** | Panel de administración dinámico en `/auth/users/` (protegido con rol `admin`). Permite crear usuarios, alternar roles mediante selectores bloqueables con guardado seguro y eliminar cuentas mediante ventanas modales integradas. |
| **Reporte de Ventas Jerárquico** | Reporte regional (`/subscriptions/sales-report/`) reestructurado en tres niveles jerárquicos: **Site → Tecnología (Type) → Nodos**. Suma valores absolutos y recalcula los indicadores porcentuales de crecimiento, ARPU y Churn para garantizar la precisión matemática del subtotal. |
| **Validación Avanzada de CSV** | Validación estructural rápida de cabeceras en el backend antes de escribir o procesar los archivos en memoria para mitigar inyecciones o consumo excesivo de recursos. |
| **Manejo de Excepciones** | Implementación de `RateLimitMiddleware` para interceptar la saturación de peticiones por IP y retornar respuestas estructuradas en JSON con código `429 Too Many Requests`. |

## Configuración de Entorno

Variables de entorno necesarias (`.env` o sección `environment` del compose):

```env
# Conexión a Base de Datos
HOST=                            # Nombre del servicio PostgreSQL en Docker Compose
DB=                              # Nombre de la base de datos
DB_USER=                         # Usuario de base de datos
PASS=                            # Contraseña
PORT=
SCHEMA=

# Configuración de Django
DJANGO_SECRET_KEY=tu_clave_criptografica_segura
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,tu_ip_privada_o_dominio
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://tu_ip_privada:8000
```

## Quick Start en Producción (Docker Compose)

El despliegue separa la aplicación en una red interna y expone únicamente el puerto web gestionado por Nginx:

```yaml
version: '3.8'

services:
  db:
    image: postgres:latest
    container_name: netowl_db
    environment:
      - POSTGRES_DB=
      - POSTGRES_USER=m
      - POSTGRES_PASSWORD=
    volumes:
      - pg_data:/var/lib/postgresql/data
    restart: always

  netowl:
    build: .
    container_name: netowl_app
    env_file: .env
    expose:
      - "8000"  # Expuesto solo de forma interna para Nginx
    depends_on:
      - db
    restart: always

  nginx:
    image: nginx:alpine
    container_name: netowl_nginx
    ports:
      - "80:80"  # Puerto HTTP público gestionado por el proxy inverso
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - netowl
    restart: always

volumes:
  pg_data:
```

### Comandos de inicialización:

```bash
# 1. Construir las imágenes e iniciar los contenedores
docker compose up --build -d

# 2. Generar y aplicar las migraciones de base de datos
docker compose exec netowl python manage.py makemigrations config
docker compose exec netowl python manage.py migrate

# 3. Acceder en el navegador
# Abre http://localhost/ o la IP de tu servidor.
# Al no haber cuentas registradas, el sistema te redirigirá automáticamente
# al instalador inicial (/auth/setup/) para crear el primer Administrador.
