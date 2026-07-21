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
├── Dockerfile                         # Imagen Docker multi‑stage, usuario no‑root
├── entrypoint.sh                      # collectstatic en runtime + arranque de gunicorn
├── .env.example                       # Template de variables de arranque (VAULT_*)
│
├── backend/                           # Lógica de negocio (independiente de Django)
│   ├── __init__.py                    # Exportaciones del paquete
│   ├── vault.py                       # Configuración y secretos desde HashiCorp Vault
│   ├── config.py                      # Constantes + TableNames
│   ├── utils.py                       # parse_date()
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
| **CRM Analytics** | Nuevo módulo completo: pipeline Odoo → JSONB → API REST con 6 métricas + 7 dimensiones |
| **Persistencia JSONB** | ~10 tablas intermedias reemplazadas por 2 tablas con columnas JSONB (`crm_metricas_globales`, `crm_dimensiones_historico`) |
| **Per‑metric APIs** | 14 nuevos endpoints (`/crm/api/metricas/*` y `/crm/api/dimensiones/*`) |
| **Autenticación** | `django.contrib.auth` habilitado; todas las vistas requieren login |
| **App `config`** | Nueva app Django para login, setup inicial, decoradores de permisos |
| **Seguridad** | Cabeceras HTTP seguras, SSL redirect configurable, logging rotativo de requests |
| **Docker** | Usuario no‑root, `entrypoint.sh` con `collectstatic` en runtime, `sslmode` en conexión BD |
| **Secretos** | Credenciales de BD y `SECRET_KEY` en HashiCorp Vault (KV v2 + AppRole); el `.env` solo guarda las variables `VAULT_*` |
| **Rate limiting** | `django-ratelimit` en endpoints de importación y análisis (10 req/min/IP) |
| **Archivos eliminados** | `asgi.py`, `admin.py`, `forms.py`, `cleaner.py` (CRM), `metrics.py` (monolítico) |

## Configuración de Entorno

- Docker y Docker Compose
- PostgreSQL (en Docker o externo)
- Acceso a un servidor HashiCorp Vault (motor KV v2 + AppRole)

## Configuración

Los secretos (credenciales de PostgreSQL y `SECRET_KEY` de Django) **no se
guardan en archivos**: viven en Vault y se leen al arrancar la aplicación
(`backend/vault.py`). El `.env` solo contiene los datos de arranque para
autenticarse contra Vault — copiar `.env.example` y completar:

```env
VAULT_URL=https://vault.ejemplo.com
VAULT_ROLE_ID=<role_id>
VAULT_SECRET_ID=<secret_id>
VAULT_MOUNT_PATH=kv
VAULT_PATH=netowl/config
DB_SCHEMA=public
```

> El `.env` debe tener permisos `600` y nunca se versiona (está en `.gitignore`).

`DB_SCHEMA` no es un secreto y cambia entre entornos, por eso vive aquí y no
en Vault: cambiar de producción a pruebas es cuestión de ajustar `VAULT_PATH`
y `DB_SCHEMA`. Si se omite, se usa `public`.

### Secreto en Vault

En la ruta `VAULT_MOUNT_PATH/VAULT_PATH` debe existir un secreto KV v2 con
esta estructura:

```json
{
  "DJANGOCONFIG": {
    "DJANGO_SECRET_KEY": "clave-única-de-50+-caracteres",
    "DJANGO_DEBUG": false,
    "DJANGO_SECURE_SSL": false,
    "ALLOWED_HOSTS": "localhost,127.0.0.1",
    "CSRF_TRUSTED_ORIGINS": "http://localhost:8000"
  },
  "DBCONFIG": {
    "DB_NAME": "Netcom",
    "DB_USER": "metabase",
    "DB_PASSWORD": "tu_password",
    "DB_HOST": "db",
    "DB_PORT": 5432,
    "DB_SSLMODE": "prefer"
  }
}
```

El AppRole de la aplicación debe tener una política de **solo lectura** sobre
`VAULT_MOUNT_PATH/data/VAULT_PATH`. Si Vault no está accesible o el secreto no
tiene esta estructura, la aplicación falla al arrancar con un `VaultConfigError`
descriptivo (no arranca con valores por defecto inseguros).

El despliegue separa la aplicación en una red interna y expone únicamente el puerto web gestionado por Nginx:

```yaml
app:
    build: ./
    container_name: netowl_app
    ports:
      - "8000:8000"
    env_file:
      - .env          # solo las variables VAULT_*
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
