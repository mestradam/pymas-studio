# pymas-studio (puente Python)

Este paquete no reimplementa el motor estructural. Sólo levanta un servidor HTTP
local que sirve la aplicación web estática (`web/dist`) y publica el modelo en
`/api/model.json`.

## Uso desde un notebook

```python
import pymas_studio

url = pymas_studio.show(modelo)  # dict, JSON o ruta a .json
print(url)
```

`show()` usa un hilo daemon y abre el navegador automáticamente. La app carga el
modelo mediante `?model=/api/model.json`.

## Uso desde la terminal

```bash
cd web && npm run build
cd ../python
python -m pymas_studio ../fixtures/space_frame.json
```

## Empaquetado

Antes de distribuir el paquete, copia el build web dentro del paquete:

```bash
rm -rf python/pymas_studio/static
cp -r web/dist python/pymas_studio/static
```

La Fase 1 sólo deja el puente preparado; la integración con la API real de
`pymas` y el empaquetado final corresponden a la Fase 5 del plano.
