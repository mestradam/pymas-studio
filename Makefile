PYTHON ?= python3
NPM ?= npm

.PHONY: help install test test-python build python-static install-python clean

help:
	@echo "PyMAS Studio 3D"
	@echo ""
	@echo "  make install         Instala dependencias de web/ (npm ci)."
	@echo "  make test            Ejecuta la suite de Vitest."
	@echo "  make test-python     Ejecuta las pruebas del puente Python."
	@echo "  make build           Compila el visor en web/dist."
	@echo "  make python-static   Copia web/dist dentro del paquete Python."
	@echo "  make install-python  Compila, copia estáticos e instala pymas-studio editable."
	@echo ""
	@echo "Uso rápido del paquete: python -c \"import pymas_studio; pymas_studio.show('fixtures/space_frame.json')\""

install:
	cd web && $(NPM) ci

test:
	cd web && $(NPM) test

test-python:
	PYTHONPATH=python $(PYTHON) -m unittest discover -s python/tests -v

build:
	cd web && $(NPM) run build

python-static: build
	cd web && $(NPM) run build:python

install-python: python-static
	$(PYTHON) -m pip install -e ./python

clean:
	rm -rf web/dist python/build python/dist python/*.egg-info
	find python/pymas_studio/static -mindepth 1 ! -name README.md -depth -delete
