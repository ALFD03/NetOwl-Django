FROM python:3.11-slim
WORKDIR /app

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 --gid 1001 app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=app:app . .
RUN mkdir -p /app/logs && chown app:app /app/logs && \
    DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput

USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "frontend.netowl_web.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "300", \
     "--access-logfile", "-"]
