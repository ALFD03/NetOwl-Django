# Atajos para las tareas del dia a dia. `make` a secas lista lo disponible.

PYTHON ?= $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python)

.DEFAULT_GOAL := help
.PHONY: help dev build lint format check migrate collectstatic

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev:  ## Levanta Django (:8000) y Vite (:5173) juntos
	@./scripts/dev.sh

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

migrate:  ## Genera y aplica migraciones
	$(PYTHON) manage.py makemigrations
	$(PYTHON) manage.py migrate

collectstatic:  ## Recolecta estaticos (lo hace tambien el entrypoint del contenedor)
	$(PYTHON) manage.py collectstatic --noinput
