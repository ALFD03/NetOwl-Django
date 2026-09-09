# Atajos para las tareas del dia a dia. `make` a secas lista lo disponible.

PYTHON ?= $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python)

.DEFAULT_GOAL := help
.PHONY: help dev worker build lint format check migrate makemigrations collectstatic

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev:  ## Levanta Django (:8000), Vite (:5173), el tunel SSH a Redis y el worker
	@./scripts/dev.sh

worker:  ## Ejecuta el worker de Celery (analisis de churn, CRM, soporte y ciclo de vida)
	$(PYTHON) -m celery -A netowl_web worker --loglevel=info

build:  ## Compila el bundle de produccion en web/static/dist
	npm run build

lint:  ## Pasa ruff y eslint
	$(PYTHON) -m ruff check .
	npm run lint

format:  ## Formatea con ruff y prettier (reescribe archivos)
	$(PYTHON) -m ruff format .
	npm run format

check:  ## Comprobaciones sin escribir nada: Django, tipos y lint
	$(PYTHON) manage.py check
	npx tsc --noEmit
	$(MAKE) lint

migrate:  ## Aplica las migraciones versionadas
	$(PYTHON) manage.py migrate

makemigrations:  ## Genera migraciones tras cambiar un modelo (revisa el archivo antes de commitear:
                 ## en services/imports el db_table se calcula, no se escribe fijo)
	$(PYTHON) manage.py makemigrations

collectstatic:  ## Recolecta estaticos (lo hace tambien el entrypoint del contenedor)
	$(PYTHON) manage.py collectstatic --noinput
