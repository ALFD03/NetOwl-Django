# --- Etapa 1: Compilación de Frontend (React + TypeScript + Vite) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY web/ ./web
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js ./
RUN npm run build

# --- Etapa 2: Dependencias de Python ---
FROM python:3.11-slim AS python-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Etapa 3: Contenedor Final de Ejecución ---
FROM python:3.11-slim AS runner
WORKDIR /app
ENV HOME=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --gid 1001 --home /app app

# Copiar paquetes de Python
COPY --from=python-builder /usr/local /usr/local

# 1. Copiar código fuente
COPY --chown=app:app . .

# 2. Inyectar el bundle JS/CSS compilado en web/static/dist
COPY --from=frontend-builder --chown=app:app /app/web/static/dist ./web/static/dist

# Asegurar carpetas de logs, estáticos y .gunicorn con permisos de app
RUN mkdir -p /app/logs /app/staticfiles /app/.gunicorn && \
    chmod +x /app/entrypoint.sh && \
    chown -R app:app /app

USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
# --forwarded-allow-ips: sin esto gunicorn solo acepta X-Forwarded-* de
#   127.0.0.1, y Nginx no es 127.0.0.1 en la red del compose, asi que descarta
#   la cabecera de la que depende SECURE_PROXY_SSL_HEADER (ver settings.py) y
#   la redireccion a HTTPS entra en bucle. "*" es correcto aqui porque el
#   contenedor no esta publicado: el unico que le habla es el proxy.
# --timeout 60: los 300s eran para los analisis sincronos, que ya corren en
#   Celery (ver netowl_web/celery.py). Un minuto sobra para una peticion web.
# --max-requests: recicla los workers cada tantas peticiones. pandas y numpy
#   retienen memoria entre analisis y el proceso solo crecia.
CMD ["gunicorn", "netowl_web.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "5", \
     "--timeout", "60", \
     "--forwarded-allow-ips", "*", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--access-logfile", "-"]