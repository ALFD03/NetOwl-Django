"""
Configuración de Django para el proyecto churn_web (frontend).

Define todos los parámetros de la aplicación Django que sirve el
frontend del analizador de churn: base de datos, plantillas, archivos
estáticos, middleware, aplicaciones instaladas, etc.

Los valores sensibles se cargan desde variables de entorno mediante
python-dotenv.

Dependencias:
    - os, pathlib (estándar)
    - python-dotenv (carga de .env)
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

# Cargar variables de entorno desde el archivo .env (si existe)
load_dotenv()

# Ruta base del proyecto: tres niveles arriba de este archivo
# (frontend/churn_web/settings.py → raíz del repo)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# --- Seguridad ---
# Modo debug: deshabilitar en producción (DJANGO_DEBUG=False)
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() in ("true", "1", "yes")
# Clave secreta de Django (definir DJANGO_SECRET_KEY en producción)
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        import warnings
        SECRET_KEY = __import__("secrets").token_urlsafe(50)
        warnings.warn("DJANGO_SECRET_KEY no está definido. Se generó uno temporal para desarrollo.", stacklevel=2)
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in .env for production")
# Hosts permitidos (lista separada por comas, ej: "localhost,ejemplo.com")
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# --- Seguridad HTTPS / Headers ---
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL", "False").lower() in ("true", "1", "yes")
SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
SECURE_HSTS_SECONDS = 31536000 if SECURE_SSL_REDIRECT else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_SSL_REDIRECT
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True

# --- Autenticación ---
LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/subscriptions/dashboard/"
LOGOUT_REDIRECT_URL = "/login/"

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
    "frontend.config",               # Gestión de usuarios y configuración
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
]

# módulo raíz de las URLs
ROOT_URLCONF = "frontend.netowl_web.urls"

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
            ],
        },
    },
]

# --- Base de datos (PostgreSQL) ---
# Los parámetros de conexión se obtienen de variables de entorno
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB"),          # Nombre de la base de datos
        "USER": os.getenv("DB_USER"),      # Usuario de BD
        "PASSWORD": os.getenv("PASS"),     # Contraseña
        "HOST": os.getenv("HOST"),         # Host del servidor PostgreSQL
        "PORT": os.getenv("PORT", "5432"), # Puerto (por defecto 5432)
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
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
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
    },
}
