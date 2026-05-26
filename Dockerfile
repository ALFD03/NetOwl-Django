# ---- Dockerfile para ChurnRateAnalyzer ----
# Imagen base: Python 3.11 en versión slim (reduce tamaño final)
FROM python:3.11-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# ---- Instalación de dependencias Python ----
# Se copia primero requirements.txt para aprovechar la caché de capas
# de Docker: si requirements.txt no cambia, esta capa se reutiliza.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Copia del código fuente ----
# Se copia después de instalar dependencias para no invalidar la caché
# si solo el código cambia (y no los requisitos).
COPY . .

# ---- Recolección de archivos estáticos ----
# Ejecuta collectstatic para reunir todos los archivos estáticos en el
# directorio STATIC_ROOT (staticfiles/), servidos luego por Whitenoise.
RUN python manage.py collectstatic --noinput

# ---- Puerto de exposición ----
# Puerto interno donde Gunicorn escuchará conexiones.
EXPOSE 8000

# ---- Comando de inicio ----
# Gunicorn como servidor WSGI con:
#   - 2 workers (ajustar según CPU disponibles)
#   - Timeout de 300s para análisis largos
#   - Log de accesos en salida estándar (para Docker logs)
CMD ["gunicorn", "churn_web.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "300", \
     "--access-logfile", "-"]
