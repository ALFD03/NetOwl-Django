"""
Configuración de Django para el proyecto churn_web (frontend).

Define todos los parámetros de la aplicación Django que sirve el
frontend del analizador de churn: base de datos, plantillas, archivos
estáticos, middleware, aplicaciones instaladas, etc.

Los valores sensibles se leen de HashiCorp Vault (ver backend/vault.py).
Si Vault no está accesible, la aplicación no arranca.

Dependencias:
    - pathlib (estándar)
    - backend.vault (configuración desde Vault)
"""

import os
import re
from pathlib import Path

from backend.vault import get_config

# Configuración sensible (Django + base de datos) obtenida de Vault
config = get_config()

# Ruta base del proyecto: tres niveles arriba de este archivo
# (frontend/churn_web/settings.py → raíz del repo)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

LOGIN_URL = "/auth/login/"
LOGOUT_REDIRECT_URL = "/auth/login/"

# --- Seguridad ---
# Modo debug: deshabilitar en producción (DJANGOCONFIG.DJANGO_DEBUG=false)
DEBUG = config.django.DEBUG
# Clave secreta de Django
SECRET_KEY = config.django.SECRET_KEY
# Hosts permitidos (en Vault: cadena separada por comas o lista)
ALLOWED_HOSTS = config.django.ALLOWED_HOSTS

# --- Seguridad HTTPS / Headers ---
SECURE_SSL_REDIRECT = config.django.SECURE_SSL
SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT

# 3. Cabecera HSTS (HTTP Strict Transport Security)
# Fuerza a los navegadores a conectarse exclusivamente mediante HTTPS durante un año.
SECURE_HSTS_SECONDS = 31536000 if SECURE_SSL_REDIRECT else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_SSL_REDIRECT
SECURE_HSTS_PRELOAD = SECURE_SSL_REDIRECT

# 4. Cabeceras de protección del navegador
SECURE_CONTENT_TYPE_NOSNIFF = True  # Evita que el navegador adivine el tipo MIME (previene inyección de scripts)
SECURE_BROWSER_XSS_FILTER = True    # Activa el filtro XSS del navegador
X_FRAME_OPTIONS = "DENY"            # Protege contra Clickjacking (impide que el sitio se cargue en <frame> o <iframe> externos)

# 5. Política de Referrer (Referrer Policy)
# Limita la cantidad de información del path que tu servidor envía a enlaces externos.
SECURE_REFERRER_POLICY = "same-origin"

# 6. Orígenes de confianza para CSRF (CRÍTICO en Django 5+)
# En producción con HTTPS, Django 5+ rechaza peticiones POST si el origen no está listado aquí.
# En Vault: cadena separada por comas o lista. Si no se define, se usan
# los orígenes locales por defecto (ver DjangoModel en backend/vault.py).
CSRF_TRUSTED_ORIGINS = config.django.CSRF_TRUSTED_ORIGINS

# Limite de tiempo se sesiones 
SESSION_COOKIE_AGE = 8*60*60

# --- Aislamiento de cookies por entorno ---
# Desarrollo y produccion comparten host (las cookies ignoran el puerto) y
# comparten la tabla django_session del esquema public. Con los nombres de
# cookie por defecto ("sessionid" / "csrftoken") iniciar sesion en un entorno
# sobreescribe las cookies del otro: el otro entorno aparece deslogueado y su
# pagina ya cargada queda con un token CSRF viejo -> 403 al hacer POST.
# Sufijar el nombre de la cookie con el esquema (DB_SCHEMA, unico por entorno)
# le da a cada entorno su propio par de cookies en el navegador.
COOKIE_ENV_SUFFIX = re.sub(r"[^A-Za-z0-9_-]", "_", os.getenv("DB_SCHEMA", "public"))
SESSION_COOKIE_NAME = f"netowl_sessionid_{COOKIE_ENV_SUFFIX}"
CSRF_COOKIE_NAME = f"netowl_csrftoken_{COOKIE_ENV_SUFFIX}"

# --- Límites de subida ---
MAX_UPLOAD_SIZE = 100 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE

# --- Aplicaciones instaladas ---
INSTALLED_APPS = [
    "django.contrib.staticfiles",   # Servir archivos estáticos
    "django.contrib.auth",          # Autenticación de usuarios
    "django.contrib.contenttypes",  # Requerido por auth
    "django.contrib.sessions",      # Soporte de sesiones
    "django.contrib.messages",      # Framework de mensajes (flash)
    "frontend.subscriptions",        # Aplicación principal del frontend
    "frontend.crm",                  # Módulo CRM (clientes, etc.)
    "frontend.config",
    "frontend.imports",
    "frontend.support",
    "inertia",
]

# --- Middleware ---
# Cadena de middleware ejecutado en cada petición/respuesta
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",              # Seguridad (HSTS, etc.)
    "whitenoise.middleware.WhiteNoiseMiddleware",                 # Servir estáticos en producción
    "django.contrib.sessions.middleware.SessionMiddleware",       # Manejo de sesiones
    "django.middleware.common.CommonMiddleware",                  # Varios (URL slashes, etc.)
    "django.middleware.csrf.CsrfViewMiddleware",                  # Protección CSRF
    "django.contrib.auth.middleware.AuthenticationMiddleware",    # Autenticación por sesión
    "django.contrib.messages.middleware.MessageMiddleware",       # Mensajes flash
    "django.middleware.clickjacking.XFrameOptionsMiddleware",     # Protección clickjacking
    "frontend.netowl_web.middleware.RateLimitMiddleware",
    "inertia.middleware.InertiaMiddleware",
    "frontend.netowl_web.middleware.InertiaShareMiddleware", 
]

# módulo raíz de las URLs
ROOT_URLCONF = "frontend.netowl_web.urls"

INERTIA_LAYOUT = "app.html"

# Servir los assets desde el dev-server de Vite en vez del bundle compilado.
# Es una decision de flujo de trabajo, no de seguridad: por eso tiene su propia
# variable y no cuelga de DEBUG (ver context_processors.vite_dev_server).
USE_VITE_DEV_SERVER = os.getenv("VITE_DEV_SERVER", "").lower() in {"1", "true", "yes"} or DEBUG
# Django compara INTERNAL_IPS contra REMOTE_ADDR, asi que solo admite direcciones
# IP: los hostnames que habia aqui nunca llegaron a coincidir. Esta lista decide
# la variable `debug` de las plantillas (ver frontend/templates/app.html).
INTERNAL_IPS = ["127.0.0.1", "::1", "10.3.0.41"]

# --- Configuración de plantillas ---
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Directorio donde se buscan las plantillas (frontend/templates/)
        "DIRS": [BASE_DIR / "frontend" / "templates"],
        # También buscar dentro de las carpetas templates de cada app
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "frontend.netowl_web.context_processors.csrf_cookie_name",
                "frontend.netowl_web.context_processors.vite_dev_server",
            ],
        },
    },
]

# --- Base de datos (PostgreSQL) ---
# Los parámetros de conexión se obtienen de Vault (DBCONFIG)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config.db.DB_NAME,          # Nombre de la base de datos
        "USER": config.db.DB_USER,          # Usuario de BD
        "PASSWORD": config.db.DB_PASSWORD,  # Contraseña
        "HOST": config.db.DB_HOST,          # Host del servidor PostgreSQL
        "PORT": str(config.db.DB_PORT),     # Puerto (por defecto 5432)
        "OPTIONS": {
            "sslmode": config.db.DB_SSLMODE,  # Modo SSL de la conexión
        },
    }
}

# --- Archivos estáticos (CSS, JS, imágenes) ---
# URL base para los archivos estáticos
STATIC_URL = "static/"
# Directorios adicionales donde Django buscará archivos estáticos
STATICFILES_DIRS = [BASE_DIR / "frontend" / "static"]
# Directorio donde se recolectan los estáticos para producción (collectstatic)
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Almacenamiento de archivos ---
STORAGES = {
    # Almacenamiento por defecto (sistema de archivos local)
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    # Almacenamiento para archivos estáticos (usa WhiteNoise con compresión y manifest)
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Aplicación WSGI para servidores compatibles
WSGI_APPLICATION = "frontend.netowl_web.wsgi.application"

# --- Internacionalización y localización ---
LANGUAGE_CODE = "es"               # Idioma español
TIME_ZONE = "America/Caracas"      # Zona horaria de Caracas (UTC-4)
USE_I18N = True                    # Activar internacionalización
USE_TZ = True                      # Usar zona horaria consciente (UTC en BD)

# --- Campos auto-generados ---
# Tipo de campo por defecto para claves primarias auto-generadas
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Logging de requests ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "request_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "requests.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
            "delay": True,
        },
        # Los `logger.exception(...)` de las vistas y del backend no tenian
        # handler propio: sin esto acababan en el logger raiz, que en gunicorn
        # se descarta silenciosamente.
        "app_file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "app.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
            "delay": True,
        },
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "formatters": {
        "verbose": {
            "format": "{asctime} {levelname} {message}",
            "style": "{",
        },
    },
    "loggers": {
        "django.request": {
            "handlers": ["request_file"],
            "level": "INFO",
            "propagate": False,
        },
        # Codigo propio: las apps de `frontend` y el paquete de analitica.
        "frontend": {
            "handlers": ["app_file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "backend": {
            "handlers": ["app_file", "console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
