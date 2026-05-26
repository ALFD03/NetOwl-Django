"""
Configuración global del proyecto Django churn_web.

Define todos los parámetros necesarios para el funcionamiento del
sitio: base de datos, aplicaciones instaladas, middleware, templates,
archivos estáticos, zona horaria, etc.

Las credenciales y valores sensibles se cargan desde variables de
entorno a través de python-dotenv, permitiendo separar configuración
de código.

Dependencias:
    - python-dotenv (para carga de .env)
    - whitenoise (para servir estáticos en producción)
    - psycopg2-binary (driver PostgreSQL)
    - Archivo .env en la raíz del proyecto (o variables del sistema)

Variables de entorno requeridas:
    DJANGO_SECRET_KEY   → Clave secreta de Django
    DB, USER, PASS, HOST, PORT → Credenciales de PostgreSQL
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Carga las variables definidas en el archivo .env (si existe) al entorno
load_dotenv()

# Directorio raíz del proyecto (dos niveles arriba desde este archivo)
BASE_DIR = Path(__file__).resolve().parent.parent

# ---------- Seguridad ----------
# SECRET_KEY: clave criptográfica usada para firmar sesiones, tokens CSRF, etc.
# En producción, generar una clave única y mantenerla en secreto.
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-change-me-in-production")

# DEBUG: modo de depuración. Nunca activar en producción.
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

# ALLOWED_HOSTS: dominios/IPs permitidos para servir la aplicación.
# En producción, reemplazar "*" por los dominios reales separados por comas.
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")

# ---------- Aplicaciones instaladas ----------
# Solo se incluyen las estrictamente necesarias. No se usa admin ni auth
# porque el análisis de churn no requiere autenticación de usuarios.
INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "django.contrib.sessions",
    "django.contrib.messages",
    "analyzer_app",
]

# ---------- Middleware ----------
# Whitenoise se coloca después de SecurityMiddleware para servir archivos
# estáticos comprimidos y cacheados sin necesidad de un servidor web aparte.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ---------- URLs raíz ----------
ROOT_URLCONF = "churn_web.urls"

# ---------- Templates ----------
# Los templates se buscan primero en el directorio global "templates/" y
# luego dentro de cada aplicación (APP_DIRS = True).
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------- Base de datos ----------
# Conexión a PostgreSQL usando valores del archivo .env.
# Se emplea psycopg2-binary como driver.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB"),
        "USER": os.getenv("USER"),
        "PASSWORD": os.getenv("PASS"),
        "HOST": os.getenv("HOST"),
        "PORT": os.getenv("PORT", "5432"),
    }
}

# ---------- Archivos estáticos ----------
# STATICFILES_DIRS: carpetas adicionales donde Django busca estáticos.
# STATIC_ROOT: directorio donde se recolectan con collectstatic para producción.
STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

# Configuración de almacenes: Whitenoise comprime y añade manifiesto
# a los archivos estáticos para servir versiones inmutables.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------- WSGI ----------
WSGI_APPLICATION = "churn_web.wsgi.application"

# ---------- Internacionalización ----------
# Se configura español como idioma por defecto y la zona horaria de
# Caracas para Colombia/Venezuela (UTC -4, sin horario de verano).
LANGUAGE_CODE = "es"
TIME_ZONE = "America/Caracas"
USE_I18N = True
USE_TZ = True

# ---------- Campo auto-incremental por defecto ----------
# BigAutoField permite hasta 9.2×10^18 registros, adecuado para
# tablas con grandes volúmenes de datos históricos.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
