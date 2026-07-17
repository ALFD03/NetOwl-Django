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

LOGIN_URL = "/auth/login/"
LOGOUT_REDIRECT_URL = "/auth/login/"

# --- Seguridad ---
# Modo debug: deshabilitar en producción (DJANGO_DEBUG=False)
DEBUG = False
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
allowed_hosts_env = os.getenv("DJANGO_ALLOWED_HOSTS")
if allowed_hosts_env:
    ALLOWED_HOSTS = [host.strip() for host in allowed_hosts_env.split(",") if host.strip()]
else:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", "10.3.0.43"]

# --- Seguridad HTTPS / Headers ---
SECURE_SSL_REDIRECT = False # Cambiar a True solo con  HTTPS habilitado

# 1. Encabezado de Proxy SSL (CRÍTICO para producción)
# Informa a Django que la petición original es HTTPS cuando corre detrás de un Proxy 
# (como Nginx, Traefik o balanceadores de carga). Evita bucles infinitos de redirección.
if SECURE_SSL_REDIRECT:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# 2. Cookies seguras
# Las cookies de sesión y CSRF solo se transmitirán por conexiones HTTPS cifradas.
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
csrf_origins_env = os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS")
if csrf_origins_env:
    CSRF_TRUSTED_ORIGINS = [
        origin.strip()
        for origin in csrf_origins_env.split(",")
        if origin.strip()
    ]
else:
    CSRF_TRUSTED_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"]

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
# Se añade soporte explícito para SSL y límite de tiempo de conexión (seguridad y estabilidad)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("PASS"),
        "HOST": os.getenv("HOST"),
        "PORT": os.getenv("PORT", "5432"),
        "OPTIONS": {
            "sslmode": os.getenv("DB_SSLMODE", "prefer"),
            "connect_timeout": 10,  # Timeout de 10 segundos para evitar colgar hilos de Gunicorn si la BD no responde
        }
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
