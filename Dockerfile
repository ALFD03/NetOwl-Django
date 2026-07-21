# --- Etapa 1: Compilación ---
FROM python:3.11-slim AS builder
WORKDIR /app

# Instalar dependencias del sistema necesarias para compilar psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Instalar dependencias a nivel de sistema para la etapa de compilación
RUN pip install --no-cache-dir -r requirements.txt


# --- Etapa 2: Ejecución de Producción ---
FROM python:3.11-slim AS runner
WORKDIR /app

# Instalar únicamente la librería de tiempo de ejecución para Postgres
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --gid 1001 app

# Copiar todas las librerías de Python compiladas a nivel de sistema
COPY --from=builder /usr/local /usr/local

# Copiar el código fuente con los permisos para el usuario app
COPY --chown=app:app . .
# collectstatic se ejecuta en entrypoint.sh (runtime), no aquí: settings.py
# lee los secretos de Vault al importarse y Vault no está disponible en build.
RUN mkdir -p /app/logs /app/staticfiles && chown app:app /app/logs /app/staticfiles

USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "frontend.netowl_web.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "5", \
     "--timeout", "300", \
     "--access-logfile", "-"]