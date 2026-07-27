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
