# pymas-studio (puente Python)

Este paquete no reimplementa el motor estructural. Sólo levanta un servidor HTTP
local con la biblioteca estándar que sirve la aplicación web estática (el build
de `web/dist/`, copiado a `pymas_studio/static/` al empaquetar) y publica el
modelo en `/model.json`.

## Uso desde un notebook o script

```python
import pymas_studio

# Ruta a una exportación .json de pymas
pymas_studio.show("fixtures/space_frame.json")

# Diccionario de Python con el esquema pymas
pymas_studio.show(modelo_dict)

# Objeto de pymas con .to_dict() o .export_json()
pymas_studio.show(modelo)

# Puerto fijo y sin abrir el navegador (devuelve la URL)
url = pymas_studio.show(modelo, port=8765, open_browser=False)
print(url)  # http://127.0.0.1:8765/?model=model.json
```

`show()` usa un hilo daemon, elige un puerto libre cuando `port=0` y abre el
navegador automáticamente. La app carga el modelo mediante `?model=model.json`;
el servidor responde en `/model.json`, `/samples/model.json` y `/api/model.json`
para que el enlace funcione igual en local y en GitHub Pages.

## Uso desde la terminal

```bash
python3 -m pymas_studio fixtures/space_frame.json
pymas-studio fixtures/space_frame.json --port 8765 --no-browser
```

## Construcción y empaquetado

Los estáticos se generan desde `web/dist/` y se copian al paquete. Desde la raíz
del repositorio:

```bash
# Opción recomendada: compila, copia estáticos e instala editable
make install-python

# Alternativa sin make
cd web
npm ci
npm run build
npm run build:python      # copia web/dist -> python/pymas_studio/static
cd ..
python3 -m pip install -e ./python
```

`npm run package:python` ejecuta el build y la copia en un solo paso. Los
archivos generados de `python/pymas_studio/static/` no se versionan; sólo se
conserva `README.md` como marcador del directorio.

## Pruebas

```bash
make test-python
# o
PYTHONPATH=python python3 -m unittest discover -s python/tests -v
```
