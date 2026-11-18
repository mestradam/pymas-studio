"""Puente HTTP local entre `pymas` y la aplicación estática PyMAS Studio.

Uso
---
::

    import pymas_studio

    pymas_studio.show(modelo)                  # dict de Python
    pymas_studio.show("modelo.json")           # ruta a un export de pymas
    pymas_studio.show(modelo, port=8765)       # puerto fijo

El servidor corre en un hilo daemon para no bloquear notebooks. Desde un script
normal mantén el proceso vivo (``input()``/``time.sleep``) o usa
``block=True`` desde la línea de comandos.
"""

from __future__ import annotations

import json
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Union
from urllib.parse import urlsplit

ModelLike = Union[dict, str, Path, Any]

# La app resuelve `?model=model.json` como un ejemplo (`samples/model.json`);
# el servidor expone el modelo en las tres rutas para que funcione tanto el
# enlace amigable como los clientes que usan la API explícita.
_MODEL_PATHS = frozenset({"/model.json", "/samples/model.json", "/api/model.json"})
_VIEWER_URL_PATH = "/?model=model.json"


def _json_text(value: Any) -> str:
    """Serializa a JSON validando el resultado antes de servirlo."""
    text = json.dumps(value, ensure_ascii=False)
    json.loads(text)
    return text


def _model_to_text(source: ModelLike) -> str:
    """Convierte una ruta, dict, texto JSON u objeto de pymas a texto JSON."""
    if isinstance(source, Path):
        return source.expanduser().read_text(encoding="utf-8")

    if isinstance(source, (bytes, bytearray)):
        return source.decode("utf-8")

    if isinstance(source, str):
        stripped = source.lstrip("\ufeff \t\r\n")
        if stripped.startswith("{") or stripped.startswith("["):
            json.loads(stripped)  # valida temprano con un error claro
            return stripped
        path = Path(source).expanduser()
        if path.is_file():
            return path.read_text(encoding="utf-8")
        raise FileNotFoundError(
            f"No existe el archivo de modelo: {source}. "
            "Pasa una ruta .json, un dict o un objeto con .to_dict()/.export_json()."
        )

    if isinstance(source, dict):
        return _json_text(source)

    # Objetos de pymas: acepta el contrato documentado y variantes habituales.
    for attribute in (
        "to_dict",
        "model_dump",
        "to_json",
        "toJSON",
        "model_dump_json",
        "export_json",
    ):
        serializer = getattr(source, attribute, None)
        if not callable(serializer):
            continue
        try:
            result = serializer()
        except TypeError:
            # Algunos exportadores sólo aceptan una ruta obligatoria.
            continue
        if isinstance(result, str):
            json.loads(result)
            return result
        return _json_text(result)

    raise TypeError(
        "`show` espera una ruta .json, un dict de Python o un objeto que "
        "exponga `.to_dict()` o `.export_json()`."
    )


def _static_directory() -> Path:
    """Localiza el frontend compilado.

    Prioridad:
      1. ``pymas_studio/static`` (copiado durante el empaquetado).
      2. ``web/dist`` dentro del repositorio (checkout de desarrollo).
    """
    package_static = Path(__file__).resolve().parent / "static"
    if (package_static / "index.html").is_file():
        return package_static

    repo_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if (repo_dist / "index.html").is_file():
        return repo_dist

    raise FileNotFoundError(
        "No se encontró el frontend compilado. Ejecuta `cd web && npm run build` "
        "y luego `npm run build:python` (o `make python-static`)."
    )


def _make_handler(
    directory: Path, model_text: str
) -> type[SimpleHTTPRequestHandler]:
    class StudioHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(directory), **kwargs)

        def do_GET(self) -> None:  # noqa: N802 (nombre de la stdlib)
            path = urlsplit(self.path).path

            if path in _MODEL_PATHS:
                payload = model_text.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(payload)
                return

            # Single-page app: las rutas sin extensión caen a index.html.
            requested = Path(self.translate_path(self.path))
            if not requested.exists() and "." not in Path(path).name:
                self.path = "/index.html"
            super().do_GET()

        def end_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def log_message(self, format: str, *args: Any) -> None:
            # Mantiene silenciosos los notebooks y la terminal.
            return

    return StudioHandler


def show(
    source: ModelLike,
    port: int = 0,
    open_browser: bool = True,
    host: str = "127.0.0.1",
    block: bool = False,
) -> str:
    """Sirve ``source`` en un servidor local y abre el visor estático.

    Parámetros
    ----------
    source:
        Ruta a un ``.json``, ``dict`` de Python, texto JSON o cualquier objeto
        que exponga ``.to_dict()`` o ``.export_json()``.
    port:
        Puerto TCP; ``0`` delega al sistema operativo la elección de uno libre.
    open_browser:
        Abre el visor con :mod:`webbrowser`.
    host:
        Interfaz de escucha. Se mantiene en loopback por seguridad.
    block:
        Si es ``True``, sirve en primer plano hasta interrumpir con Ctrl+C.

    Devuelve
    --------
    str
        URL del visor, con ``?model=model.json``.
    """
    model_text = _model_to_text(source)
    directory = _static_directory()
    handler = _make_handler(directory, model_text)
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    actual_port = server.server_address[1]
    display_host = "127.0.0.1" if host in ("", "0.0.0.0", "::") else host
    url = f"http://{display_host}:{actual_port}{_VIEWER_URL_PATH}"

    if block:
        if open_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return url

    thread = threading.Thread(
        target=server.serve_forever,
        name="pymas-studio-http",
        daemon=True,
    )
    thread.start()

    if open_browser:
        webbrowser.open(url)

    return url
