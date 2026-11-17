"""Minimal local HTTP bridge between pymas and the static PyMAS Studio app.

Usage
-----
::

    import pymas_studio

    pymas_studio.show(model)             # dict, JSON string or path
    pymas_studio.show("model.json", port=8765)

The server runs in a daemon thread, so notebooks remain interactive. From a
plain script keep the process alive (``input()``/``time.sleep``) or pass
``block=True``.
"""

from __future__ import annotations

import json
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional, Tuple, Union

ModelLike = Union[dict, str, Path, Any]

_API_PATH = "/api/model.json"


def _model_to_text(model: ModelLike) -> str:
    """Serialize a model given as dict, JSON text, path or pymas object."""
    if isinstance(model, Path):
        return model.read_text(encoding="utf-8")

    if isinstance(model, str):
        stripped = model.lstrip()
        if stripped.startswith("{") or stripped.startswith("["):
            json.loads(stripped)  # validate early with a clear error
            return stripped
        path = Path(model).expanduser()
        if path.exists():
            return path.read_text(encoding="utf-8")
        raise FileNotFoundError(f"No existe el archivo de modelo: {model}")

    if isinstance(model, dict):
        return json.dumps(model, ensure_ascii=False)

    for attribute in ("to_json", "toJSON", "model_dump_json"):
        serializer = getattr(model, attribute, None)
        if callable(serializer):
            result = serializer()
            if isinstance(result, str):
                return result
            return json.dumps(result, ensure_ascii=False)

    raise TypeError(
        "`show` espera un dict, una ruta/JSON de texto o un objeto con `to_json()`."
    )


def _static_directory() -> Path:
    """Locate the compiled frontend.

    Priority:
      1. ``pymas_studio/static`` (copied during packaging).
      2. ``web/dist`` inside the repository (development checkout).
    """
    package_static = Path(__file__).resolve().parent / "static"
    if (package_static / "index.html").is_file():
        return package_static

    repo_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if (repo_dist / "index.html").is_file():
        return repo_dist

    raise FileNotFoundError(
        "No se encontró el frontend compilado. Ejecuta `cd web && npm run build` "
        "y copia `web/dist/` a `python/pymas_studio/static/`, o instala el paquete "
        "con los datos estáticos incluidos."
    )


def _make_handler(
    directory: Path, model_text: str
) -> type[SimpleHTTPRequestHandler]:
    class StudioHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(directory), **kwargs)

        def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
            if self.path.split("?", 1)[0] == _API_PATH:
                payload = model_text.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(payload)
                return

            # Single-page app: unknown routes fall back to index.html.
            requested = self.translate_path(self.path)
            if not Path(requested).exists() and "." not in Path(self.path).name:
                self.path = "/index.html"
            super().do_GET()

        def log_message(self, format: str, *args: Any) -> None:
            # Keep notebooks and terminals quiet.
            return

    return StudioHandler


def show(
    model: ModelLike,
    port: int = 0,
    open_browser: bool = True,
    host: str = "127.0.0.1",
    block: bool = False,
) -> str:
    """Serve ``model`` locally and open the static viewer.

    Parameters
    ----------
    model:
        Dict, JSON text, path or object exposing ``to_json()``.
    port:
        TCP port; ``0`` lets the operating system choose a free one.
    open_browser:
        Open the viewer with :mod:`webbrowser`.
    host:
        Interface to bind. Keep the default loopback address unless you need
        to expose the viewer on a network.
    block:
        If true, serve in the foreground until interrupted.

    Returns
    -------
    str
        The viewer URL, including ``?model=/api/model.json``.
    """
    model_text = _model_to_text(model)
    directory = _static_directory()
    handler = _make_handler(directory, model_text)
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    actual_port = server.server_address[1]
    url = f"http://{host}:{actual_port}/?model={_API_PATH}"

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


def _resolve_model(model: ModelLike) -> Tuple[str, Path]:
    """Internal helper kept for the CLI entry point."""
    return _model_to_text(model), _static_directory()
