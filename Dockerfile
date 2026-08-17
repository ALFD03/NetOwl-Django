# --- Etapa 1: Compilación de Frontend (React + TypeScript + Vite) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY frontend/ ./frontend
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js ./
RUN npm run build

# --- Etapa 2: Compilación de Backend (Python) ---
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

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 app \
    && adduser --system --uid 1001 --gid 1001 app

# Copiar paquetes de Python
COPY --from=python-builder /usr/local /usr/local

# 1. Copiar código fuente primero
COPY --chown=app:app . .

# 2. Inyectar el bundle JS/CSS compilado por Vite
COPY --from=frontend-builder --chown=app:app /app/staticfiles/dist ./staticfiles/dist

# Asegurar carpetas de logs, estáticos y permisos de ejecución del entrypoint
RUN mkdir -p /app/logs /app/staticfiles && \
    chmod +x /app/entrypoint.sh && \
    chown -R app:app /app/logs /app/staticfiles /app/entrypoint.sh

USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "frontend.netowl_web.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "5", \
     "--timeout", "300", \
     "--access-logfile", "-"]