# Atajos para las tareas del dia a dia. `make` a secas lista lo disponible.
# Los comandos de Python corren en backend/ y los de Node en frontend/.

PYTHON ?= $(shell [ -x .venv/bin/python ] && echo $(CURDIR)/.venv/bin/python || echo python)
BACKEND := cd backend &&
FRONTEND := cd frontend &&

.DEFAULT_GOAL := help
.PHONY: help dev worker build lint format check migrate makemigrations collectstatic

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev:  ## Levanta Django (:8000), Vite (:5173), el tunel SSH a Redis y el worker
	@./scripts/dev.sh

worker:  ## Ejecuta el worker de Celery
	$(BACKEND) $(PYTHON) -m celery -A netowl_web worker --loglevel=info

build:  ## Compila el bundle de produccion en frontend/static/dist
	$(FRONTEND) npm run build

lint:  ## Pasa ruff y eslint
	$(BACKEND) $(PYTHON) -m ruff check .
	$(FRONTEND) npm run lint

format:  ## Formatea con ruff y prettier (reescribe archivos)
	$(BACKEND) $(PYTHON) -m ruff format .
	$(FRONTEND) npm run format

check:  ## Comprobaciones sin escribir nada: Django, tipos y lint
	$(BACKEND) $(PYTHON) manage.py check
	$(FRONTEND) npx tsc --noEmit
	$(MAKE) lint

migrate:  ## Aplica las migraciones versionadas
	$(BACKEND) $(PYTHON) manage.py migrate

makemigrations:  ## Genera migraciones (revisalas antes de commitear)
	$(BACKEND) $(PYTHON) manage.py makemigrations

collectstatic:  ## Recolecta estaticos (lo hace tambien el entrypoint del contenedor)
	$(BACKEND) $(PYTHON) manage.py collectstatic --noinput
